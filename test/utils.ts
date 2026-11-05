import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { loadEnvFile } from '../src/database/database.config.js';

export const API = '/api/v1';
export const PASSWORD = 'correct-horse-battery';

export async function createTestApp(): Promise<INestApplication> {
  loadEnvFile();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  // Tests truncate tables: make certain that can only ever hit the test database.
  const { database } = app.get(DataSource).options;
  if (database !== 'stolchi_test') {
    throw new Error(`Refusing to run e2e tests against "${String(database)}"`);
  }
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  await app.get(DataSource).query('TRUNCATE TABLE "cafes", "users" CASCADE');
}

let phoneCounter = 0;

export function nextPhone(): string {
  phoneCounter += 1;
  return `+99891${String(phoneCounter).padStart(7, '0')}`;
}

export interface RegisteredCafe {
  token: string;
  cookie: string;
  phone: string;
  cafeId: string;
  userId: string;
}

export function refreshCookieOf(response: request.Response): string {
  const cookies = response.get('Set-Cookie') ?? [];
  const cookie = cookies.find((value) => value.startsWith('stolchi_refresh='));
  if (!cookie) throw new Error('Response has no refresh cookie');
  return cookie;
}

export async function registerCafe(
  app: INestApplication,
  cafeName: string,
): Promise<RegisteredCafe> {
  const phone = nextPhone();
  const response = await request(app.getHttpServer())
    .post(`${API}/auth/register`)
    .send({ cafeName, ownerName: 'Owner', phone, password: PASSWORD })
    .expect(201);
  return {
    token: response.body.accessToken,
    cookie: refreshCookieOf(response).split(';')[0],
    phone,
    cafeId: response.body.user.cafeId,
    userId: response.body.user.id,
  };
}
