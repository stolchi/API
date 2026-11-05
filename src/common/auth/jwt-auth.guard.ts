import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from './auth-user.js';
import { Role } from '../enums.js';
import { IS_PUBLIC_KEY } from './decorators.js';

export interface AccessTokenPayload {
  sub: string;
  cafeId: string | null;
  role: Role;
}

/** Global guard: every route requires a valid access token unless marked `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
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

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = {
        id: payload.sub,
        cafeId: payload.cafeId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
