import type { DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities/index.js';
import { ALL_MIGRATIONS } from './migrations/index.js';

type Env = Record<string, string | undefined>;

/** Shared by the Nest app, the TypeORM CLI, the seed script and the e2e tests. */
export function buildDataSourceOptions(env: Env): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DATABASE_HOST,
    port: Number(env.DATABASE_PORT ?? 5432),
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    entities: ALL_ENTITIES,
    migrations: ALL_MIGRATIONS,
    // The schema only ever changes through migrations.
    synchronize: false,
    // gen_random_uuid() is built into PostgreSQL 13+, no extension needed.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}

/** Loads `.env` for scripts that run outside Nest. Real environment variables win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
