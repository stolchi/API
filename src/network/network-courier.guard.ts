import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { NetworkCourier } from '../database/entities/network-courier.entity.js';
import {
  NETWORK_TOKEN_KIND,
  type NetworkTokenPayload,
} from './network-auth.service.js';

interface NetworkRequest extends Request {
  networkCourier?: NetworkCourier;
}

/**
 * For routes of network couriers, which are `@Public()` to the staff guard. Only a
 * courier token passes; the courier is read each time, so a blocked one stops at once.
 */
@Injectable()
export class NetworkCourierGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(NetworkCourier)
    private readonly couriers: Repository<NetworkCourier>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<NetworkRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    let payload: Partial<NetworkTokenPayload>;
    try {
      payload = await this.jwt.verifyAsync<NetworkTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.kind !== NETWORK_TOKEN_KIND || !payload.sub) {
      throw new UnauthorizedException();
    }
    const courier = await this.couriers.findOneBy({
      id: payload.sub,
      isActive: true,
    });
    if (!courier) throw new UnauthorizedException();
    request.networkCourier = courier;
    return true;
  }
}

/** The network courier the guard let in. */
export const CurrentNetworkCourier = createParamDecorator(
  (_data: unknown, context: ExecutionContext): NetworkCourier => {
    const courier = context
      .switchToHttp()
      .getRequest<NetworkRequest>().networkCourier;
    if (!courier) throw new UnauthorizedException();
    return courier;
  },
);
