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
  type Catalog,
  type RegisteredCafe,
} from './utils.js';

describe('Moving orders and adding many tables (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let a: Catalog;
  let b: Catalog;

  const send = (
    token: string,
    method: 'post' | 'patch' | 'get',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${token}`);

  const newTable = async (token: string, name: string) =>
    (await send(token, 'post', '/tables').send({ name }).expect(201)).body
      .id as string;

  const dineIn = async (token: string, catalog: Catalog) =>
    (
      await send(token, 'post', '/orders')
        .send({
          type: 'DINE_IN',
          tableId: catalog.tableId,
          items: [{ productId: catalog.osh.id, quantity: 1 }],
        })
        .expect(201)
    ).body as { id: string; total: number };

  const move = (token: string, orderId: string, tableId: string) =>
    send(token, 'patch', `/orders/${orderId}/table`).send({ tableId });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    b = await createCatalog(app, cafeB.token);
  });

  describe('moving an order', () => {
    it('moves it, keeping everything else, also onto a busy table', async () => {
      const order = await dineIn(cafeA.token, a);
      const target = await newTable(cafeA.token, 'Stol 9');
      await dineIn(cafeA.token, { ...a, tableId: target });

      const { body } = await move(cafeA.token, order.id, target).expect(200);
      expect(body).toMatchObject({
        id: order.id,
        tableId: target,
        total: order.total,
        status: 'ACCEPTED',
      });
    });

    it('lets a waiter and a cashier move it, but not a cook', async () => {
      const order = await dineIn(cafeA.token, a);
      const target = await newTable(cafeA.token, 'Stol 9');
      for (const role of [Role.WAITER, Role.CASHIER]) {
        const token = await loginAs(app, role, cafeA.cafeId);
        await move(token, order.id, target).expect(200);
      }
      const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
      await move(cook, order.id, a.tableId).expect(403);
    });

    it('refuses a table of another cafe, and another cafe touching the order', async () => {
      const order = await dineIn(cafeA.token, a);
      await move(cafeA.token, order.id, b.tableId).expect(400);
      await move(cafeB.token, order.id, b.tableId).expect(404);
      const { body } = await send(
        cafeA.token,
        'get',
        `/orders/${order.id}`,
      ).expect(200);
      expect(body.tableId).toBe(a.tableId);
    });

    it('refuses a finished order and a takeaway', async () => {
      const target = await newTable(cafeA.token, 'Stol 9');
      const finished = await dineIn(cafeA.token, a);
      await send(cafeA.token, 'post', `/orders/${finished.id}/cancel`).expect(
        200,
      );
      await move(cafeA.token, finished.id, target).expect(409);

      const { body: takeaway } = await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: a.osh.id, quantity: 1 }],
        })
        .expect(201);
      await move(cafeA.token, takeaway.id, target).expect(409);
    });
  });

  describe('adding many tables', () => {
    it('creates numbered tables, each with its own QR token', async () => {
      const { body } = await send(cafeA.token, 'post', '/tables/bulk')
        .send({ prefix: 'Stol', from: 11, count: 3, zone: '2-qavat' })
        .expect(201);
      expect(body.map((table: { name: string }) => table.name)).toEqual([
        'Stol 11',
        'Stol 12',
        'Stol 13',
      ]);
      expect(body[0].zone).toBe('2-qavat');
      const tokens = body.map((table: { qrToken: string }) => table.qrToken);
      expect(new Set(tokens).size).toBe(3);
    });

    it('creates nothing when one of the names is taken', async () => {
      await newTable(cafeA.token, 'Stol 12');
      const before = await send(cafeA.token, 'get', '/tables').expect(200);
      await send(cafeA.token, 'post', '/tables/bulk')
        .send({ prefix: 'Stol', from: 11, count: 3 })
        .expect(409);
      const after = await send(cafeA.token, 'get', '/tables').expect(200);
      expect(after.body).toHaveLength(before.body.length);
    });

    it('stays within the cafe, and allows the same names in another', async () => {
      await send(cafeA.token, 'post', '/tables/bulk')
        .send({ prefix: 'Zal', from: 1, count: 2 })
        .expect(201);
      const other = await send(cafeB.token, 'get', '/tables').expect(200);
      expect(other.body.map((t: { name: string }) => t.name)).not.toContain(
        'Zal 1',
      );
      await send(cafeB.token, 'post', '/tables/bulk')
        .send({ prefix: 'Zal', from: 1, count: 2 })
        .expect(201);
    });

    it.each([
      { prefix: '', from: 1, count: 1 },
      { prefix: 'Stol', from: 0, count: 1 },
      { prefix: 'Stol', from: 1, count: 0 },
      { prefix: 'Stol', from: 1, count: 101 },
      { prefix: 'Stol', from: 1.5, count: 1 },
    ])('refuses %j', async (dto) => {
      await send(cafeA.token, 'post', '/tables/bulk').send(dto).expect(400);
    });

    it('is for the owner only', async () => {
      const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
      await send(cashier, 'post', '/tables/bulk')
        .send({ prefix: 'Stol', from: 1, count: 1 })
        .expect(403);
    });
  });
});
