import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '../enums.js';
import type { AuthenticatedRequest, AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opts a route out of the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Limits a route to the given roles. Without it, any signed-in user may call the route. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

function userOf(context: ExecutionContext): AuthUser {
  const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!user) throw new UnauthorizedException();
  return user;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => userOf(context),
);

/**
 * The id of the signed-in user's cafe, taken from the access token and never from
 * the request. Users without a cafe (SUPER_ADMIN) are refused.
 */
export const CurrentCafe = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { cafeId } = userOf(context);
    if (!cafeId)
      throw new ForbiddenException('This route requires a cafe user');
    return cafeId;
  },
);
