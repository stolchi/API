import type { MigrationInterface } from 'typeorm';
import { InitialSchema1793910636671 } from './1793910636671-InitialSchema.js';
import { StaffRoles1793990000000 } from './1793990000000-StaffRoles.js';
import { OrderSettings1794000000000 } from './1794000000000-OrderSettings.js';
import { ProductUnits1794100000000 } from './1794100000000-ProductUnits.js';

/** Listed explicitly: glob loading does not work under both `dist` and Vitest. */
export const ALL_MIGRATIONS: (new () => MigrationInterface)[] = [
  InitialSchema1793910636671,
  StaffRoles1793990000000,
  OrderSettings1794000000000,
  ProductUnits1794100000000,
];
