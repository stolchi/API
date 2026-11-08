import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { TelegramApi } from '../src/telegram/telegram-api.js';
import { FakeTelegramApi } from './fake-telegram.js';
import { Nominatim } from '../src/geo/nominatim.js';
import { FakeNominatim } from './fake-nominatim.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Role } from '../src/common/enums.js';
import { loadEnvFile } from '../src/database/database.config.js';
import { StaffRole, User } from '../src/database/entities/index.js';

export const API = '/api/v1';
export const PASSWORD = 'correct-horse-battery';

export async function createTestApp(): Promise<NestExpressApplication> {
  loadEnvFile();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Tests never reach the real Telegram.
    .overrideProvider(TelegramApi)
    .useValue(new FakeTelegramApi())
    // Nor OpenStreetMap.
    .overrideProvider(Nominatim)
    .useValue(new FakeNominatim())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
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

/** Creates a staff user directly and signs them in. */
export async function loginAs(
  app: INestApplication,
  role: Role | 'SUPER_ADMIN',
  cafeId: string | null,
): Promise<string> {
  const phone = nextPhone();
  const { manager } = app.get(DataSource);
  const staffRole =
    role === 'SUPER_ADMIN'
      ? null
      : await manager.findOneByOrFail(StaffRole, {
          cafeId: cafeId as string,
          systemKey: role,
        });
  await manager.insert(User, {
    cafeId,
    name: role,
    phone,
    isSuperAdmin: role === 'SUPER_ADMIN',
    roleId: staffRole?.id ?? null,
    passwordHash: await argon2.hash(PASSWORD),
  });
  const { body } = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .send({ phone, password: PASSWORD })
    .expect(200);
  return body.accessToken;
}

export interface Catalog {
  categoryId: string;
  osh: { id: string; name: string; price: number };
  choy: { id: string; name: string; price: number };
  tableId: string;
  qrToken: string;
}

/** One category with two products, and one table. */
export async function createCatalog(
  app: INestApplication,
  token: string,
): Promise<Catalog> {
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`${API}${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

  const category = await post('/categories', { name: 'Taomlar' });
  const product = async (name: string, price: number) =>
    (await post('/products', { categoryId: category.body.id, name, price }))
      .body;
  const osh = await product('Osh', 45000);
  const choy = await product('Choy', 5000);
  const table = await post('/tables', { name: 'Stol 1' });

  return {
    categoryId: category.body.id,
    osh,
    choy,
    tableId: table.body.id,
    qrToken: table.body.qrToken,
  };
}
