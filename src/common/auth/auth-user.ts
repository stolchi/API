import type { Request } from 'express';
import type { Permission } from '../permissions.js';

/** Who is calling. `cafeId` comes from the access token, the rest fresh from the database. */
export interface AuthUser {
  id: string;
  cafeId: string | null;
  permissions: Permission[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
