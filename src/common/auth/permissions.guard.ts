import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../permissions.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { PERMISSIONS_KEY } from './decorators.js';

/** Global guard enforcing `@RequireAny()`. Runs after `JwtAuthGuard`. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return (
      user !== undefined &&
      required.some((permission) => user.permissions.includes(permission))
    );
  }
}
