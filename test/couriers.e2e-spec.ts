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

describe('Couriers (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let a: Catalog;

  const send = (
    token: string,
    method: 'post' | 'patch' | 'get',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${token}`);
  const owner = (method: 'post' | 'patch' | 'get', path: string) =>
    send(cafeA.token, method, path);

  /** A courier's token and id, as the owner sees them in the list. */
  async function courier() {
    const token = await loginAs(app, Role.COURIER, cafeA.cafeId);
    const { body: me } = await send(token, 'get', '/auth/me').expect(200);
    return { token, id: me.id as string };
  }

  async function delivery() {
    const { body } = await owner('post', '/orders')
      .send({
        type: 'DELIVERY',
        customerPhone: '+998901112233',
        address: 'Chilonzor 9',
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(201);
    return body;
  }

  async function ready(id: string) {
    for (const status of ['COOKING', 'READY']) {
      await owner('patch', `/orders/${id}/status`).send({ status }).expect(200);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    await owner('patch', '/cafes/current')
      .send({
        orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
        deliveryFee: 15000,
      })
      .expect(200);
  });
  afterAll(() => app.close());

  it('gives every cafe a courier role', async () => {
    const { body } = await owner('get', '/staff/roles').expect(200);
    expect(body).toContainEqual(
      expect.objectContaining({
        systemKey: 'COURIER',
        name: 'Kuryer',
        permissions: ['DELIVERY_COURIER'],
      }),
    );
  });

  it('lists the couriers with what they carry, and gives them deliveries', async () => {
    const ali = await courier();
    const order = await delivery();
    const { body: list } = await owner('get', '/couriers').expect(200);
    expect(list).toEqual([
      { id: ali.id, name: 'COURIER', activeDeliveries: 0 },
    ]);

    const { body: given } = await owner('patch', `/orders/${order.id}/courier`)
      .send({ courierId: ali.id })
      .expect(200);
    expect(given.courier).toEqual({ id: ali.id, name: 'COURIER' });
    const { body: after } = await owner('get', '/couriers');
    expect(after[0].activeDeliveries).toBe(1);

    const { body: back } = await owner('patch', `/orders/${order.id}/courier`)
      .send({ courierId: null })
      .expect(200);
    expect(back.courier).toBeNull();
  });

  it('only gives deliveries, and only to couriers who work here', async () => {
    const ali = await courier();
    const { body: takeaway } = await owner('post', '/orders')
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 1 }] })
      .expect(201);
    await owner('patch', `/orders/${takeaway.id}/courier`)
      .send({ courierId: ali.id })
      .expect(409);

    const order = await delivery();
    const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
    const { body: cashierMe } = await send(cashier, 'get', '/auth/me');
    await owner('patch', `/orders/${order.id}/courier`)
      .send({ courierId: cashierMe.id })
      .expect(400);

    const otherCafeCourier = await loginAs(app, Role.COURIER, cafeB.cafeId);
    const { body: theirs } = await send(otherCafeCourier, 'get', '/auth/me');
    await owner('patch', `/orders/${order.id}/courier`)
      .send({ courierId: theirs.id })
      .expect(400);
    await send(cafeB.token, 'patch', `/orders/${order.id}/courier`)
      .send({ courierId: theirs.id })
      .expect(404);
  });

  it('lets a courier see and work only their own deliveries', async () => {
    const ali = await courier();
    const vali = await courier();
    const mine = await delivery();
    const theirs = await delivery();
    await owner('patch', `/orders/${mine.id}/courier`)
      .send({ courierId: ali.id })
      .expect(200);
    await owner('patch', `/orders/${theirs.id}/courier`)
      .send({ courierId: vali.id })
      .expect(200);

    const { body: list } = await send(
      ali.token,
      'get',
      '/courier/orders',
    ).expect(200);
    expect(list.map((o: { id: string }) => o.id)).toEqual([mine.id]);
    expect(list[0]).toMatchObject({
      address: 'Chilonzor 9',
      customerPhone: '+998901112233',
      total: 60000,
    });

    // Nothing else of the cafe's is theirs to see.
    await send(ali.token, 'get', '/orders').expect(403);
    await send(ali.token, 'get', `/orders/${mine.id}`).expect(403);
    await ready(theirs.id);
    await send(ali.token, 'post', `/courier/orders/${theirs.id}/pick-up`)
      .send({ etaMinutes: 20 })
      .expect(404);
  });

  it('takes it when ready, then delivers it and takes the money', async () => {
    const ali = await courier();
    const order = await delivery();
    await owner('patch', `/orders/${order.id}/courier`)
      .send({ courierId: ali.id })
      .expect(200);

    // Not cooked yet.
    await send(ali.token, 'post', `/courier/orders/${order.id}/pick-up`)
      .send({ etaMinutes: 20 })
      .expect(409);
    await ready(order.id);
    const { body: onTheWay } = await send(
      ali.token,
      'post',
      `/courier/orders/${order.id}/pick-up`,
    )
      .send({ etaMinutes: 25 })
      .expect(200);
    expect(onTheWay.status).toBe('SERVED');
    const eta = new Date(onTheWay.deliveryEta).getTime() - Date.now();
    expect(eta).toBeGreaterThan(24 * 60_000);
    expect(eta).toBeLessThan(26 * 60_000);
    const status = await request(app.getHttpServer())
      .get(`${API}/public/orders/${order.publicToken}`)
      .expect(200);
    expect(status.body.deliveryEta).toBe(onTheWay.deliveryEta);

    await send(ali.token, 'post', `/courier/orders/${order.id}/deliver`)
      .send({ method: 'CLICK' })
      .expect(400);
    const { body: done } = await send(
      ali.token,
      'post',
      `/courier/orders/${order.id}/deliver`,
    )
      .send({ method: 'CASH' })
      .expect(200);
    expect(done).toMatchObject({ status: 'PAID', paidAmount: 60000 });
    expect(done.payments).toEqual([
      expect.objectContaining({ method: 'CASH', amount: 60000 }),
    ]);

    const { body: left } = await send(ali.token, 'get', '/courier/orders');
    expect(left).toEqual([]);
  });

  it('takes only what is still owed when part was paid before', async () => {
    const ali = await courier();
    const order = await delivery();
    await owner('post', `/orders/${order.id}/payments`)
      .send({ method: 'CARD', amount: 20000 })
      .expect(201);
    await owner('patch', `/orders/${order.id}/courier`)
      .send({ courierId: ali.id })
      .expect(200);
    await ready(order.id);
    await send(ali.token, 'post', `/courier/orders/${order.id}/pick-up`)
      .send({ etaMinutes: 20 })
      .expect(200);
    const { body } = await send(
      ali.token,
      'post',
      `/courier/orders/${order.id}/deliver`,
    )
      .send({ method: 'CASH' })
      .expect(200);
    expect(body.payments.map((p: { amount: number }) => p.amount)).toEqual([
      20000, 40000,
    ]);
  });

  it('lets couriers take agreed deliveries themselves, first come first served', async () => {
    const ali = await courier();
    const vali = await courier();
    const order = await delivery();
    const { body: takeaway } = await owner('post', '/orders')
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 1 }] })
      .expect(201);

    const { body: open } = await send(
      ali.token,
      'get',
      '/courier/orders/available',
    ).expect(200);
    expect(open.map((o: { id: string }) => o.id)).toEqual([order.id]);

    const { body: taken } = await send(
      ali.token,
      'post',
      `/courier/orders/${order.id}/claim`,
    ).expect(200);
    expect(taken.courier).toEqual({ id: ali.id, name: 'COURIER' });
    await send(vali.token, 'post', `/courier/orders/${order.id}/claim`).expect(
      409,
    );
    await send(
      ali.token,
      'post',
      `/courier/orders/${takeaway.id}/claim`,
    ).expect(404);
    const { body: none } = await send(
      vali.token,
      'get',
      '/courier/orders/available',
    );
    expect(none).toEqual([]);
  });

  it('lets a courier give a delivery back until they leave with it', async () => {
    const ali = await courier();
    const vali = await courier();
    const order = await delivery();
    await send(ali.token, 'post', `/courier/orders/${order.id}/claim`).expect(
      200,
    );
    await send(
      vali.token,
      'post',
      `/courier/orders/${order.id}/release`,
    ).expect(404);
    const { body: back } = await send(
      ali.token,
      'post',
      `/courier/orders/${order.id}/release`,
    ).expect(200);
    expect(back.courier).toBeNull();

    await send(vali.token, 'post', `/courier/orders/${order.id}/claim`).expect(
      200,
    );
    await ready(order.id);
    await send(vali.token, 'post', `/courier/orders/${order.id}/pick-up`)
      .send({ etaMinutes: 30 })
      .expect(200);
    await send(
      vali.token,
      'post',
      `/courier/orders/${order.id}/release`,
    ).expect(409);
  });

  it('needs a sensible time to arrive', async () => {
    const ali = await courier();
    const order = await delivery();
    await send(ali.token, 'post', `/courier/orders/${order.id}/claim`).expect(
      200,
    );
    await ready(order.id);
    for (const etaMinutes of [undefined, 2, 500, 'soon']) {
      await send(ali.token, 'post', `/courier/orders/${order.id}/pick-up`)
        .send({ etaMinutes })
        .expect(400);
    }
  });

  it('cannot take a delivery nobody has agreed to yet', async () => {
    const ali = await courier();
    const { OrdersService } = await import('../src/orders/orders.service.js');
    const { OrderSource, OrderType } = await import('../src/common/enums.js');
    const order = await app.get(OrdersService).create(cafeA.cafeId, {
      source: OrderSource.TELEGRAM,
      type: OrderType.DELIVERY,
      customerPhone: '+998901112233',
      address: 'Yunusobod 4',
      items: [{ productId: a.osh.id, quantity: 1 }],
    });
    const { body } = await send(ali.token, 'get', '/courier/orders/available');
    expect(body).toEqual([]);
    await send(ali.token, 'post', `/courier/orders/${order.id}/claim`).expect(
      409,
    );
  });

  it('keeps couriers to their own page', async () => {
    const ali = await courier();
    await send(ali.token, 'get', '/couriers').expect(403);
    const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
    await send(cashier, 'get', '/courier/orders').expect(403);
  });
});
