import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity.js';
import { permissionsOf } from '../permissions.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { IS_PUBLIC_KEY } from './decorators.js';

export interface AccessTokenPayload {
  sub: string;
  cafeId: string | null;
}

/** Global guard: every route requires a valid access token unless marked `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    // Read on every request, not put in the token: taking a permission away or
    // deactivating someone must not wait for their token to expire.
    const user = await this.users.findOne({
      where: { id: payload.sub, isActive: true },
      relations: { role: true },
    });
    if (!user) throw new UnauthorizedException();

    request.user = {
      id: user.id,
      cafeId: user.cafeId,
      permissions: permissionsOf(user.role),
    };
    return true;
  }
}
