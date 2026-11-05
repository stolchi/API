import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { AccessTokenPayload } from '../common/auth/jwt-auth.guard.js';
import { Role } from '../common/enums.js';
import { slugify } from '../common/slug.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { RefreshToken } from '../database/entities/refresh-token.entity.js';
import { User } from '../database/entities/user.entity.js';
import type {
  AuthResponseDto,
  LoginDto,
  RefreshResponseDto,
  RegisterDto,
  UserDto,
} from './dto/auth.dto.js';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = '23505';

export interface AuthSession<T> {
  body: T;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  /** Verified when the phone is unknown, so both failures take the same time. */
  private readonly dummyHash = argon2.hash(randomBytes(32));

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession<AuthResponseDto>> {
    if (await this.users.existsBy({ phone: dto.phone })) {
      throw new ConflictException('This phone number is already registered');
    }
    const passwordHash = await argon2.hash(dto.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const cafe = await manager.save(
          manager.create(Cafe, {
            name: dto.cafeName,
            slug: dto.slug ?? (await this.uniqueSlug(manager, dto.cafeName)),
          }),
        );
        const user = await manager.save(
          manager.create(User, {
            cafeId: cafe.id,
            name: dto.ownerName,
            phone: dto.phone,
            passwordHash,
            role: Role.OWNER,
          }),
        );
        return this.startSession(user, manager);
      });
    } catch (error) {
      throw this.toConflict(error);
    }
  }

  async login(dto: LoginDto): Promise<AuthSession<AuthResponseDto>> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.cafe', 'cafe')
      .where('user.phone = :phone', { phone: dto.phone })
      .getOne();

    const passwordOk = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!user || !passwordOk || !this.canSignIn(user)) {
      throw new UnauthorizedException('Invalid phone number or password');
    }
    return this.startSession(user, this.dataSource.manager);
  }

  /** Rotates the refresh token. Replaying an old one revokes the whole login. */
  async refresh(rawToken?: string): Promise<AuthSession<RefreshResponseDto>> {
    if (!rawToken) throw new UnauthorizedException();

    const token = await this.refreshTokens.findOne({
      where: { tokenHash: this.hash(rawToken) },
      relations: { user: { cafe: true } },
    });
    if (!token?.user) throw new UnauthorizedException();

    if (token.revokedAt) {
      await this.revokeFamily(token.familyId);
      throw new UnauthorizedException();
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    // Conditional update: of two concurrent uses of one token, only one can win.
    const { affected } = await this.refreshTokens.update(
      { id: token.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (affected !== 1) {
      await this.revokeFamily(token.familyId);
      throw new UnauthorizedException();
    }
    if (!this.canSignIn(token.user)) throw new UnauthorizedException();

    const refreshToken = await this.createRefreshToken(
      token.user.id,
      token.familyId,
      this.dataSource.manager,
    );
    return {
      body: { accessToken: await this.signAccessToken(token.user) },
      refreshToken,
    };
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    const token = await this.refreshTokens.findOneBy({
      tokenHash: this.hash(rawToken),
    });
    if (token) await this.revokeFamily(token.familyId);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException();
    return this.toUserDto(user);
  }

  private canSignIn(user: User): boolean {
    return user.cafeId === null || user.cafe?.isActive === true;
  }

  private async startSession(
    user: User,
    manager: EntityManager,
  ): Promise<AuthSession<AuthResponseDto>> {
    const refreshToken = await this.createRefreshToken(
      user.id,
      randomUUID(),
      manager,
    );
    return {
      body: {
        accessToken: await this.signAccessToken(user),
        user: this.toUserDto(user),
      },
      refreshToken,
    };
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      cafeId: user.cafeId,
      role: user.role,
    };
    return this.jwt.signAsync(payload);
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    manager: EntityManager,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');
    await manager.insert(RefreshToken, {
      userId,
      familyId,
      tokenHash: this.hash(rawToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return rawToken;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      cafeId: user.cafeId,
      name: user.name,
      phone: user.phone,
      role: user.role,
    };
  }

  private async uniqueSlug(
    manager: EntityManager,
    cafeName: string,
  ): Promise<string> {
    // Names without Latin letters (e.g. Cyrillic) leave nothing to build a slug from.
    const base = slugify(cafeName) || `cafe-${randomBytes(3).toString('hex')}`;
    let slug = base;
    for (let n = 2; await manager.existsBy(Cafe, { slug }); n++) {
      slug = `${base}-${n}`;
    }
    return slug;
  }

  private toConflict(error: unknown): unknown {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
    ) {
      const { detail } = error.driverError as { detail?: string };
      return new ConflictException(
        detail?.includes('(phone)')
          ? 'This phone number is already registered'
          : 'This cafe address (slug) is already taken',
      );
    }
    return error;
  }
}
