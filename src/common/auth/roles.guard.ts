import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { ROLES_KEY } from './decorators.js';

/** Global guard enforcing `@Roles()`. Runs after `JwtAuthGuard`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return user !== undefined && roles.includes(user.role);
  }
}
