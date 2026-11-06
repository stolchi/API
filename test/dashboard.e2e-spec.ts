import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { tashkentDate } from '../src/common/dates.js';
import { Role } from '../src/common/enums.js';
import { Order } from '../src/database/entities/index.js';
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

describe('Dashboard (e2e)', () => {
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

  async function order(
    token: string,
    items: { productId: string; quantity: number }[],
    tableId?: string,
  ) {
    const { body } = await send(token, 'post', '/orders')
      .send({
        type: tableId ? 'DINE_IN' : 'TAKEAWAY',
        ...(tableId && { tableId }),
        items,
      })
      .expect(201);
    return body as { id: string; total: number };
  }

  async function closeOrder(token: string, id: string, total: number) {
    for (const status of ['COOKING', 'READY', 'SERVED']) {
      await send(token, 'patch', `/orders/${id}/status`)
        .send({ status })
        .expect(200);
    }
    await send(token, 'post', `/orders/${id}/payments`)
      .send({ method: 'CASH', amount: total })
      .expect(201);
    await send(token, 'post', `/orders/${id}/close`).expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    b = await createCatalog(app, cafeB.token);
  });
  afterAll(() => app.close());

  it('is all zeros for a new cafe', async () => {
    const { body } = await send(cafeA.token, 'get', '/dashboard').expect(200);
    expect(body).toEqual({
      date: tashkentDate(),
      revenue: 0,
      orderCount: 0,
      activeTables: 0,
      topProducts: [],
    });
  });

  it('adds up revenue, orders, active tables and top products', async () => {
    // Closed: counts towards revenue, and its table is free again.
    const paid = await order(
      cafeA.token,
      [{ productId: a.osh.id, quantity: 2 }],
      a.tableId,
    );
    await closeOrder(cafeA.token, paid.id, paid.total);

    // In progress: no revenue yet, its table is active.
    const { body: table2 } = await send(cafeA.token, 'post', '/tables')
      .send({ name: 'Stol 2' })
      .expect(201);
    await order(
      cafeA.token,
      [{ productId: a.choy.id, quantity: 5 }],
      table2.id,
    );
    await order(
      cafeA.token,
      [{ productId: a.choy.id, quantity: 1 }],
      table2.id,
    );

    // Cancelled: must count for nothing.
    const cancelled = await order(cafeA.token, [
      { productId: a.osh.id, quantity: 100 },
    ]);
    await send(cafeA.token, 'post', `/orders/${cancelled.id}/cancel`).expect(
      200,
    );

    const { body } = await send(cafeA.token, 'get', '/dashboard').expect(200);
    expect(body).toMatchObject({
      revenue: 90000,
      orderCount: 3,
      activeTables: 1,
    });
    expect(body.topProducts).toEqual([
      { productId: a.choy.id, name: 'Choy', quantity: 6 },
      { productId: a.osh.id, name: 'Osh', quantity: 2 },
    ]);
  });

  it('shows at most 5 top products', async () => {
    const items = [];
    for (let n = 0; n < 7; n++) {
      const { body } = await send(cafeA.token, 'post', '/products')
        .send({ categoryId: a.categoryId, name: `P${n}`, price: 1 })
        .expect(201);
      items.push({ productId: body.id, quantity: n + 1 });
    }
    await order(cafeA.token, items);
    const { body } = await send(cafeA.token, 'get', '/dashboard').expect(200);
    expect(body.topProducts.map((p: { name: string }) => p.name)).toEqual([
      'P6',
      'P5',
      'P4',
      'P3',
      'P2',
    ]);
  });

  it("ignores previous days' orders for today's numbers", async () => {
    const old = await order(cafeA.token, [
      { productId: a.osh.id, quantity: 1 },
    ]);
    await closeOrder(cafeA.token, old.id, old.total);
    await app
      .get(DataSource)
      .manager.update(Order, { id: old.id }, { businessDate: '2001-01-01' });

    const { body } = await send(cafeA.token, 'get', '/dashboard').expect(200);
    expect(body).toMatchObject({ revenue: 0, orderCount: 0, topProducts: [] });
  });

  it("never includes another cafe's numbers", async () => {
    const theirs = await order(
      cafeB.token,
      [{ productId: b.osh.id, quantity: 3 }],
      b.tableId,
    );
    await order(
      cafeB.token,
      [{ productId: b.choy.id, quantity: 1 }],
      b.tableId,
    );
    await closeOrder(cafeB.token, theirs.id, theirs.total);

    const { body } = await send(cafeA.token, 'get', '/dashboard').expect(200);
    expect(body).toMatchObject({
      revenue: 0,
      orderCount: 0,
      activeTables: 0,
      topProducts: [],
    });
  });

  it('is for owners and cashiers', async () => {
    const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
    await send(cashier, 'get', '/dashboard').expect(200);
    for (const role of [Role.WAITER, Role.COOK]) {
      const token = await loginAs(app, role, cafeA.cafeId);
      await send(token, 'get', '/dashboard').expect(403);
    }
  });
});
