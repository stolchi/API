import type { Request } from 'express';
import { Role } from '../enums.js';

/** Claims carried by the access token. This is the only trusted source of `cafeId`. */
export interface AuthUser {
  id: string;
  cafeId: string | null;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
