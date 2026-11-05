import { Client } from 'pg';
import { DataSource } from 'typeorm';
import 'reflect-metadata';
import {
  buildDataSourceOptions,
  loadEnvFile,
} from '../src/database/database.config.js';

const TEST_DATABASE = 'stolchi_test';

/** Rebuilds the test database from the real migrations, so they get tested too. */
export default async function setup(): Promise<void> {
  loadEnvFile();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_NAME: TEST_DATABASE,
  };

  const admin = new Client({
    host: env.DATABASE_HOST,
    port: Number(env.DATABASE_PORT ?? 5432),
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: 'postgres',
  });
  await admin.connect();
  const { rowCount } = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [TEST_DATABASE],
  );
  if (!rowCount) await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  await admin.end();

  const dataSource = await new DataSource(
    buildDataSourceOptions(env),
  ).initialize();
  await dataSource.query('DROP SCHEMA public CASCADE');
  await dataSource.query('CREATE SCHEMA public');
  await dataSource.runMigrations();
  await dataSource.destroy();
}
