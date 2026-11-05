import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { tashkentDate } from '../src/common/dates.js';
import { PaymentMethod, Role } from '../src/common/enums.js';
import { OrdersService } from '../src/orders/orders.service.js';
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

const FLOW = ['ACCEPTED', 'COOKING', 'READY', 'SERVED'];

describe('Orders (e2e)', () => {
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

  const takeaway = (token: string, catalog: Catalog, quantity = 2) =>
    send(token, 'post', '/orders').send({
      type: 'TAKEAWAY',
      items: [{ productId: catalog.osh.id, quantity }],
    });

  const setStatus = (token: string, id: string, status: string) =>
    send(token, 'patch', `/orders/${id}/status`).send({ status });

  async function serve(token: string, id: string): Promise<void> {
    for (const status of FLOW) await setStatus(token, id, status).expect(200);
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

  describe('creating', () => {
    it('prices from the database and records who and what', async () => {
      const { body } = await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'DINE_IN',
          tableId: a.tableId,
          note: 'Tez',
          items: [
            { productId: a.osh.id, quantity: 2, note: 'Achchiq' },
            { productId: a.choy.id, quantity: 1 },
          ],
        })
        .expect(201);

      expect(body).toMatchObject({
        number: 1,
        businessDate: tashkentDate(),
        source: 'POS',
        type: 'DINE_IN',
        status: 'NEW',
        tableId: a.tableId,
        total: 2 * 45000 + 5000,
        paidAmount: 0,
        note: 'Tez',
        createdById: cafeA.userId,
      });
      expect(body.items).toHaveLength(2);
      expect(body.items).toContainEqual(
        expect.objectContaining({
          productId: a.osh.id,
          name: 'Osh',
          price: 45000,
          quantity: 2,
          note: 'Achchiq',
        }),
      );
    });

    it('refuses a client-supplied price, total or source', async () => {
      for (const extra of [
        { total: 1 },
        { source: 'QR' },
        { status: 'PAID' },
      ]) {
        await send(cafeA.token, 'post', '/orders')
          .send({
            type: 'TAKEAWAY',
            items: [{ productId: a.osh.id, quantity: 1 }],
            ...extra,
          })
          .expect(400);
      }
      await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: a.osh.id, quantity: 1, price: 1 }],
        })
        .expect(400);
    });

    it('keeps old orders unchanged when the menu changes', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await send(cafeA.token, 'patch', `/products/${a.osh.id}`)
        .send({ name: 'Palov', price: 99000 })
        .expect(200);

      const { body } = await send(
        cafeA.token,
        'get',
        `/orders/${order.id}`,
      ).expect(200);
      expect(body.items[0]).toMatchObject({ name: 'Osh', price: 45000 });
      expect(body.total).toBe(90000);
    });

    it('numbers orders per cafe', async () => {
      const first = await takeaway(cafeA.token, a).expect(201);
      const second = await takeaway(cafeA.token, a).expect(201);
      const other = await takeaway(cafeB.token, b).expect(201);
      expect(first.body.number).toBe(1);
      expect(second.body.number).toBe(2);
      expect(other.body.number).toBe(1);
    });

    it('gives concurrent orders different numbers', async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => takeaway(cafeA.token, a)),
      );
      const numbers = responses.map((r) => r.body.number as number);
      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect([...numbers].sort((x, y) => x - y)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
    });

    it.each<[string, { type: string; useTable?: boolean }]>([
      ['DINE_IN without a table', { type: 'DINE_IN' }],
      ['TAKEAWAY with a table', { type: 'TAKEAWAY', useTable: true }],
      ['DELIVERY without a phone', { type: 'DELIVERY' }],
    ])('refuses %s', async (_name, { type, useTable }) => {
      await send(cafeA.token, 'post', '/orders')
        .send({
          type,
          ...(useTable && { tableId: a.tableId }),
          items: [{ productId: a.osh.id, quantity: 1 }],
        })
        .expect(400);
    });

    it.each([
      ['no items', []],
      ['a zero quantity', [{ quantity: 0 }]],
      ['a huge quantity', [{ quantity: 1000 }]],
    ])('refuses %s', async (_name, items) => {
      await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: (items as { quantity: number }[]).map((item) => ({
            productId: a.osh.id,
            ...item,
          })),
        })
        .expect(400);
    });

    it('refuses an order that would overflow the total', async () => {
      const { body: pricey } = await send(cafeA.token, 'post', '/products')
        .send({ categoryId: a.categoryId, name: 'Oltin', price: 2_000_000_000 })
        .expect(201);
      await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: pricey.id, quantity: 2 }],
        })
        .expect(400);
    });

    it('refuses an unavailable product, and rolls everything back', async () => {
      await send(cafeA.token, 'patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      const { body } = await takeaway(cafeA.token, a).expect(409);
      expect(body.message).toContain('Osh');

      const { body: page } = await send(cafeA.token, 'get', '/orders').expect(
        200,
      );
      expect(page.total).toBe(0);
    });

    it('refuses a product of an inactive category', async () => {
      await send(cafeA.token, 'patch', `/categories/${a.categoryId}`)
        .send({ isActive: false })
        .expect(200);
      await takeaway(cafeA.token, a).expect(409);
    });

    it("cannot use another cafe's product or table", async () => {
      await takeaway(cafeA.token, b).expect(400);
      await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'DINE_IN',
          tableId: b.tableId,
          items: [{ productId: a.osh.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('is not allowed for a cook', async () => {
      const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
      await takeaway(cook, a).expect(403);
    });
  });

  describe('listing', () => {
    it('filters by status, source, table and date', async () => {
      const { body: dineIn } = await send(cafeA.token, 'post', '/orders')
        .send({
          type: 'DINE_IN',
          tableId: a.tableId,
          items: [{ productId: a.choy.id, quantity: 1 }],
        })
        .expect(201);
      const { body: other } = await takeaway(cafeA.token, a).expect(201);
      await setStatus(cafeA.token, other.id, 'ACCEPTED').expect(200);

      const ids = async (query: string) => {
        const { body } = await send(
          cafeA.token,
          'get',
          `/orders?${query}`,
        ).expect(200);
        return body.items.map((o: { id: string }) => o.id);
      };

      expect(await ids(`tableId=${a.tableId}`)).toEqual([dineIn.id]);
      expect(await ids('status=ACCEPTED')).toEqual([other.id]);
      expect(await ids('source=QR')).toEqual([]);
      expect(await ids(`date=${tashkentDate()}`)).toHaveLength(2);
      expect(await ids('date=2001-01-01')).toEqual([]);
    });

    it('pages through results, newest first', async () => {
      for (let n = 0; n < 3; n++) await takeaway(cafeA.token, a).expect(201);
      const { body } = await send(
        cafeA.token,
        'get',
        '/orders?page=2&limit=2',
      ).expect(200);
      expect(body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(body.items.map((o: { number: number }) => o.number)).toEqual([1]);
    });

    it.each(['date=2026-02-30', 'date=tomorrow', 'status=NOPE', 'limit=101'])(
      'refuses the bad filter %s',
      async (query) => {
        await send(cafeA.token, 'get', `/orders?${query}`).expect(400);
      },
    );
  });

  describe('status transitions', () => {
    it('walks the whole flow to PAID', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await serve(cafeA.token, order.id);
      await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: order.total })
        .expect(201);
      const { body } = await send(
        cafeA.token,
        'post',
        `/orders/${order.id}/close`,
      ).expect(200);
      expect(body.status).toBe('PAID');
    });

    it.each(['COOKING', 'READY', 'SERVED', 'PAID', 'NEW'])(
      'refuses to jump from NEW to %s',
      async (status) => {
        const { body: order } = await takeaway(cafeA.token, a).expect(201);
        await setStatus(cafeA.token, order.id, status).expect(409);
      },
    );

    it('refuses to go backwards', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await setStatus(cafeA.token, order.id, 'ACCEPTED').expect(200);
      await setStatus(cafeA.token, order.id, 'NEW').expect(409);
    });

    it('refuses an unknown status', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await setStatus(cafeA.token, order.id, 'NOPE').expect(400);
    });

    it('can cancel at any point before PAID, then nothing more', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await serve(cafeA.token, order.id);
      const { body } = await send(
        cafeA.token,
        'post',
        `/orders/${order.id}/cancel`,
      ).expect(200);
      expect(body.status).toBe('CANCELLED');
      await setStatus(cafeA.token, order.id, 'ACCEPTED').expect(409);
      await send(cafeA.token, 'post', `/orders/${order.id}/cancel`).expect(409);
      await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: 1 })
        .expect(409);
    });

    it('cannot cancel a paid order', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await serve(cafeA.token, order.id);
      await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CARD', amount: order.total })
        .expect(201);
      await send(cafeA.token, 'post', `/orders/${order.id}/close`).expect(200);
      await send(cafeA.token, 'post', `/orders/${order.id}/cancel`).expect(409);
    });

    it('lets a cook do kitchen steps only', async () => {
      const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await setStatus(cook, order.id, 'ACCEPTED').expect(200);
      await setStatus(cook, order.id, 'COOKING').expect(200);
      await setStatus(cook, order.id, 'READY').expect(200);
      await setStatus(cook, order.id, 'SERVED').expect(403);
      await setStatus(cook, order.id, 'CANCELLED').expect(403);
      await send(cook, 'post', `/orders/${order.id}/cancel`).expect(403);
    });

    it('keeps a waiter from cancelling or taking money', async () => {
      const waiter = await loginAs(app, Role.WAITER, cafeA.cafeId);
      const { body: order } = await takeaway(waiter, a).expect(201);
      await setStatus(waiter, order.id, 'CANCELLED').expect(403);
      await send(waiter, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: 1 })
        .expect(403);
    });
  });

  describe('payments', () => {
    it('takes partial payments and only closes when fully paid', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await serve(cafeA.token, order.id);

      const pay = (method: string, amount: number) =>
        send(cafeA.token, 'post', `/orders/${order.id}/payments`).send({
          method,
          amount,
        });

      const { body: partial } = await pay('CASH', 40000).expect(201);
      expect(partial.paidAmount).toBe(40000);
      await send(cafeA.token, 'post', `/orders/${order.id}/close`).expect(409);

      await pay('CARD', 50000).expect(201);
      const { body } = await send(
        cafeA.token,
        'post',
        `/orders/${order.id}/close`,
      ).expect(200);
      expect(body.status).toBe('PAID');
      expect(body.paidAmount).toBe(90000);
      expect(body.payments.map((p: { method: string }) => p.method)).toEqual([
        'CASH',
        'CARD',
      ]);
    });

    it('does not reach PAID through the status route without the money', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await serve(cafeA.token, order.id);
      await setStatus(cafeA.token, order.id, 'PAID').expect(409);
    });

    it('refuses to close before the order is served', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: order.total })
        .expect(201);
      await send(cafeA.token, 'post', `/orders/${order.id}/close`).expect(409);
    });

    it('refuses to take more than is owed', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: order.total + 1 })
        .expect(400);
    });

    it('does not overcharge when many cashiers pay at once', async () => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      const service = app.get(OrdersService);
      // Straight to the service: HTTP overhead hides the race this guards against.
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          service.addPayment(
            cafeA.cafeId,
            order.id,
            PaymentMethod.CASH,
            order.total,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const { body } = await send(
        cafeA.token,
        'get',
        `/orders/${order.id}`,
      ).expect(200);
      expect(body.paidAmount).toBe(order.total);
    });

    it.each([0, -5, 1.5])('refuses the amount %s', async (amount) => {
      const { body: order } = await takeaway(cafeA.token, a).expect(201);
      await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount })
        .expect(400);
    });
  });

  describe("another cafe's order", () => {
    it('is invisible to every route', async () => {
      const { body: order } = await takeaway(cafeB.token, b).expect(201);
      const path = `/orders/${order.id}`;

      await send(cafeA.token, 'get', path).expect(404);
      await setStatus(cafeA.token, order.id, 'ACCEPTED').expect(404);
      await send(cafeA.token, 'post', `${path}/cancel`).expect(404);
      await send(cafeA.token, 'post', `${path}/close`).expect(404);
      await send(cafeA.token, 'post', `${path}/payments`)
        .send({ method: 'CASH', amount: 1 })
        .expect(404);

      const { body: list } = await send(cafeA.token, 'get', '/orders').expect(
        200,
      );
      expect(list.total).toBe(0);

      const { body } = await send(cafeB.token, 'get', path).expect(200);
      expect(body).toMatchObject({ status: 'NEW', paidAmount: 0 });
    });
  });
});
