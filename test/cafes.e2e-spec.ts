import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Role } from '../src/common/enums.js';
import {
  API,
  createCatalog,
  createTestApp,
  loginAs,
  registerCafe,
  resetDatabase,
  type RegisteredCafe,
} from './utils.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const BOT_TOKEN = '123456789:AAFabcdefghijklmnopqrstuvwxyz012345';

describe('Cafe settings (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;

  const as = (token: string) => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    put: (path: string) =>
      request(app.getHttpServer())
        .put(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
  });

  it('updates only the signed-in cafe, and keeps the QR slug', async () => {
    const before = await as(cafeA.token).get('/cafes/current').expect(200);
    const hours = { mon: { open: '09:00', close: '22:00' } };
    const { body } = await as(cafeA.token)
      .patch('/cafes/current')
      .send({
        name: 'New name',
        phone: '+998901112233',
        address: 'Toshkent',
        primaryColor: '#B4532A',
        workingHours: hours,
      })
      .expect(200);
    expect(body).toMatchObject({
      name: 'New name',
      slug: before.body.slug,
      phone: '+998901112233',
      primaryColor: '#B4532A',
      workingHours: hours,
    });
    const other = await as(cafeB.token).get('/cafes/current').expect(200);
    expect(other.body.name).toBe('Cafe B');
  });

  it('clears optional fields with null', async () => {
    await as(cafeA.token)
      .patch('/cafes/current')
      .send({
        phone: '+998901112233',
        workingHours: { sun: { open: '10:00', close: '11:00' } },
      })
      .expect(200);
    const { body } = await as(cafeA.token)
      .patch('/cafes/current')
      .send({ phone: null, workingHours: null })
      .expect(200);
    expect(body).toMatchObject({ phone: null, workingHours: null });
  });

  it.each([
    { name: '' },
    { name: null },
    { phone: '12345' },
    { primaryColor: 'red' },
    { workingHours: { mon: { open: '25:00', close: '22:00' } } },
    { workingHours: { someday: { open: '09:00', close: '22:00' } } },
    { slug: 'hijack' },
    { isActive: false },
  ])('refuses %j', async (dto) => {
    await as(cafeA.token).patch('/cafes/current').send(dto).expect(400);
  });

  it('lets only the owner change settings', async () => {
    for (const role of [Role.CASHIER, Role.WAITER, Role.COOK]) {
      const token = await loginAs(app, role, cafeA.cafeId);
      await as(token).get('/cafes/current').expect(200);
      await as(token).patch('/cafes/current').send({ name: 'x' }).expect(403);
      await as(token)
        .put('/cafes/current/telegram-bot')
        .send({ token: BOT_TOKEN })
        .expect(403);
      await as(token)
        .post('/cafes/current/logo')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(403);
    }
  });

  it('stores a logo and refuses a file that is not an image', async () => {
    const { body } = await as(cafeA.token)
      .post('/cafes/current/logo')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    expect(body.logoUrl).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    await request(app.getHttpServer()).get(body.logoUrl).expect(200);

    await as(cafeA.token)
      .post('/cafes/current/logo')
      .attach('file', Buffer.from('<svg/>'), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('lets the kitchen read table names, but not change tables', async () => {
    const catalog = await createCatalog(app, cafeA.token);
    const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
    const { body } = await as(cook).get('/tables').expect(200);
    expect(body.map((t: { id: string }) => t.id)).toContain(catalog.tableId);
    await as(cook)
      .patch(`/tables/${catalog.tableId}`)
      .send({ name: 'x' })
      .expect(403);
  });

  it('tells orders in progress from finished ones with active', async () => {
    const catalog = await createCatalog(app, cafeA.token);
    const create = async () =>
      (
        await as(cafeA.token)
          .post('/orders')
          .send({
            type: 'TAKEAWAY',
            items: [{ productId: catalog.osh.id, quantity: 1 }],
          })
          .expect(201)
      ).body as { id: string };
    const open = await create();
    const cancelled = await create();
    await as(cafeA.token).post(`/orders/${cancelled.id}/cancel`).expect(200);

    const active = await as(cafeA.token).get('/orders?active=true').expect(200);
    expect(active.body.items.map((o: { id: string }) => o.id)).toEqual([
      open.id,
    ]);
    const finished = await as(cafeA.token)
      .get('/orders?active=false')
      .expect(200);
    expect(finished.body.items.map((o: { id: string }) => o.id)).toEqual([
      cancelled.id,
    ]);
    const all = await as(cafeA.token).get('/orders').expect(200);
    expect(all.body.total).toBe(2);
    await as(cafeA.token).get('/orders?active=maybe').expect(400);

    const other = await as(cafeB.token).get('/orders?active=true').expect(200);
    expect(other.body.total).toBe(0);
  });
});
