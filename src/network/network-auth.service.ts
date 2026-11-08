import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { REFRESH_TOKEN_TTL_MS } from '../auth/auth.service.js';
import { isUniqueViolation } from '../common/validation.js';
import { NetworkCourierSession } from '../database/entities/network-courier-session.entity.js';
import { NetworkCourier } from '../database/entities/network-courier.entity.js';
import type {
  NetworkAuthResponseDto,
  NetworkCourierDto,
  NetworkLoginDto,
  NetworkRefreshResponseDto,
  NetworkRegisterDto,
} from './network.dto.js';

/** Marks a token as a network courier's: no staff route accepts it, nor this one theirs. */
export const NETWORK_TOKEN_KIND = 'network-courier';

export interface NetworkTokenPayload {
  sub: string;
  kind: typeof NETWORK_TOKEN_KIND;
}

interface Session<T> {
  body: T;
  refreshToken: string;
}

export const toNetworkCourierDto = (
  courier: NetworkCourier,
): NetworkCourierDto => ({
  id: courier.id,
  name: courier.name,
  phone: courier.phone,
  vehicle: courier.vehicle,
});

/** Signing up and in for network couriers, with the same rotation as staff sessions. */
@Injectable()
export class NetworkAuthService {
  /** Compared against when the phone is unknown, so timing does not tell who is signed up. */
  private readonly dummyHash = argon2.hash(randomBytes(32));

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(NetworkCourier)
    private readonly couriers: Repository<NetworkCourier>,
    @InjectRepository(NetworkCourierSession)
    private readonly sessions: Repository<NetworkCourierSession>,
  ) {}

  async register(
    dto: NetworkRegisterDto,
  ): Promise<Session<NetworkAuthResponseDto>> {
    try {
      const courier = await this.couriers.save(
        this.couriers.create({
          name: dto.name,
          phone: dto.phone,
          vehicle: dto.vehicle,
          passwordHash: await argon2.hash(dto.password),
        }),
      );
      return this.start(courier);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('This phone number is already registered');
      }
      throw error;
    }
  }

  async login(dto: NetworkLoginDto): Promise<Session<NetworkAuthResponseDto>> {
    const courier = await this.couriers.findOneBy({ phone: dto.phone });
    const passwordOk = await argon2.verify(
      courier?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!courier || !passwordOk || !courier.isActive) {
      throw new UnauthorizedException('Invalid phone number or password');
    }
    return this.start(courier);
  }

  /** Rotates the refresh token. Replaying an old one ends the whole sign-in. */
  async refresh(raw?: string): Promise<Session<NetworkRefreshResponseDto>> {
    if (!raw) throw new UnauthorizedException();
    const session = await this.sessions.findOne({
      where: { tokenHash: this.hash(raw) },
      relations: { courier: true },
    });
    if (!session?.courier) throw new UnauthorizedException();
    if (session.revokedAt) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException();
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }
    const { affected } = await this.sessions.update(
      { id: session.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (affected !== 1) {
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException();
    }
    if (!session.courier.isActive) throw new UnauthorizedException();
    return {
      body: { accessToken: await this.sign(session.courier) },
      refreshToken: await this.createSession(
        session.courier.id,
        session.familyId,
      ),
    };
  }

  async logout(raw?: string): Promise<void> {
    if (!raw) return;
    const session = await this.sessions.findOneBy({
      tokenHash: this.hash(raw),
    });
    if (session) await this.revokeFamily(session.familyId);
  }

  async me(courierId: string): Promise<NetworkCourierDto> {
    const courier = await this.couriers.findOneBy({ id: courierId });
    if (!courier) throw new UnauthorizedException();
    return toNetworkCourierDto(courier);
  }

  private async start(
    courier: NetworkCourier,
  ): Promise<Session<NetworkAuthResponseDto>> {
    return {
      body: {
        accessToken: await this.sign(courier),
        courier: toNetworkCourierDto(courier),
      },
      refreshToken: await this.createSession(courier.id, randomUUID()),
    };
  }

  private sign(courier: NetworkCourier): Promise<string> {
    const payload: NetworkTokenPayload = {
      sub: courier.id,
      kind: NETWORK_TOKEN_KIND,
    };
    return this.jwt.signAsync(payload);
  }

  private async createSession(
    courierId: string,
    familyId: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.sessions.insert({
      courierId,
      familyId,
      tokenHash: this.hash(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return raw;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.sessions.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
