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

describe('Order settings and charges (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let a: Catalog;
  let slug: string;

  const send = (
    token: string,
    method: 'post' | 'patch' | 'get' | 'put',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${token}`);

  const settle = (body: object, token = cafeA.token) =>
    send(token, 'patch', '/cafes/current').send(body);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    slug = (await send(cafeA.token, 'get', '/cafes/current')).body.slug;
  });
  afterAll(() => app.close());

  it('starts a cafe with table service, dine-in and takeaway, and no charges', async () => {
    const { body } = await send(cafeA.token, 'get', '/cafes/current').expect(
      200,
    );
    expect(body).toMatchObject({
      serviceMode: 'TABLE_SERVICE',
      orderTypes: ['DINE_IN', 'TAKEAWAY'],
      serviceChargePercent: 0,
      packagingFee: 0,
      deliveryFee: 0,
    });
  });

  it('saves the settings, and checks them', async () => {
    const { body } = await settle({
      serviceMode: 'SELF_SERVICE',
      orderTypes: ['TAKEAWAY', 'DELIVERY'],
      serviceChargePercent: 12,
      packagingFee: 2000,
      deliveryFee: 15000,
    }).expect(200);
    expect(body).toMatchObject({
      serviceMode: 'SELF_SERVICE',
      orderTypes: ['TAKEAWAY', 'DELIVERY'],
      serviceChargePercent: 12,
      packagingFee: 2000,
      deliveryFee: 15000,
    });

    await settle({ orderTypes: [] }).expect(400);
    await settle({ orderTypes: ['DINE_IN', 'DINE_IN'] }).expect(400);
    await settle({ orderTypes: ['PICKUP'] }).expect(400);
    await settle({ serviceChargePercent: 51 }).expect(400);
    await settle({ serviceChargePercent: 2.5 }).expect(400);
    await settle({ packagingFee: -1 }).expect(400);
    await settle({ serviceMode: 'BUFFET' }).expect(400);

    // Cafe B is untouched.
    const other = await send(cafeB.token, 'get', '/cafes/current').expect(200);
    expect(other.body).toMatchObject({ serviceChargePercent: 0 });
  });

  it('lets only someone who manages settings change them', async () => {
    const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
    await settle({ serviceChargePercent: 10 }, cashier).expect(403);
  });

  it('adds the service charge to dine-in orders and follows the food', async () => {
    await settle({ serviceChargePercent: 10, packagingFee: 2000 }).expect(200);
    const { body: order } = await send(cafeA.token, 'post', '/orders')
      .send({
        type: 'DINE_IN',
        tableId: a.tableId,
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(201);
    expect(order).toMatchObject({
      itemsTotal: 45000,
      serviceChargePercent: 10,
      serviceCharge: 4500,
      packagingFee: 0,
      deliveryFee: 0,
      total: 49500,
    });

    // The cafe's later change of rate leaves this order alone.
    await settle({ serviceChargePercent: 20 }).expect(200);
    const { body: changed } = await send(
      cafeA.token,
      'put',
      `/orders/${order.id}/items`,
    )
      .send({
        items: [
          { id: order.items[0].id, quantity: 1 },
          { productId: a.choy.id, quantity: 1 },
        ],
      })
      .expect(200);
    expect(changed).toMatchObject({
      itemsTotal: 50000,
      serviceChargePercent: 10,
      serviceCharge: 5000,
      total: 55000,
    });

    // The whole total, charge included, is what must be paid.
    await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
      .send({ method: 'CASH', amount: 55001 })
      .expect(400);
    await send(cafeA.token, 'post', `/orders/${order.id}/payments`)
      .send({ method: 'CASH', amount: 55000 })
      .expect(201);
  });

  it('adds packaging to takeaway, and delivery on top for delivery', async () => {
    await settle({
      orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      serviceChargePercent: 10,
      packagingFee: 2000,
      deliveryFee: 15000,
    }).expect(200);

    const { body: takeaway } = await send(cafeA.token, 'post', '/orders')
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 2 }] })
      .expect(201);
    expect(takeaway).toMatchObject({
      itemsTotal: 90000,
      serviceCharge: 0,
      packagingFee: 2000,
      deliveryFee: 0,
      total: 92000,
    });

    const { body: delivery } = await send(cafeA.token, 'post', '/orders')
      .send({
        type: 'DELIVERY',
        customerPhone: '+998901112233',
        items: [{ productId: a.choy.id, quantity: 1 }],
      })
      .expect(201);
    expect(delivery).toMatchObject({
      itemsTotal: 5000,
      packagingFee: 2000,
      deliveryFee: 15000,
      total: 22000,
    });
  });

  it('refuses kinds of order the cafe has turned off, from staff and from QR', async () => {
    await settle({ orderTypes: ['DINE_IN'] }).expect(200);
    await send(cafeA.token, 'post', '/orders')
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 1 }] })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${API}/public/cafes/${slug}/orders`)
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 1 }] })
      .expect(409);
    // Delivery is off until a cafe turns it on.
    await settle({ orderTypes: ['DINE_IN', 'TAKEAWAY'] }).expect(200);
    await send(cafeA.token, 'post', '/orders')
      .send({
        type: 'DELIVERY',
        customerPhone: '+998901112233',
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(409);
  });

  it('shows customers what the cafe takes and charges, and the charges of their order', async () => {
    await settle({ serviceChargePercent: 10, packagingFee: 2000 }).expect(200);
    const menu = await request(app.getHttpServer())
      .get(`${API}/public/cafes/${slug}/menu`)
      .expect(200);
    expect(menu.body.cafe).toMatchObject({
      orderTypes: ['DINE_IN', 'TAKEAWAY'],
      serviceChargePercent: 10,
      packagingFee: 2000,
    });

    const { body } = await request(app.getHttpServer())
      .post(`${API}/public/cafes/${slug}/orders`)
      .send({
        type: 'DINE_IN',
        qrToken: a.qrToken,
        items: [{ productId: a.osh.id, quantity: 2 }],
      })
      .expect(201);
    expect(body).toMatchObject({
      itemsTotal: 90000,
      serviceCharge: 9000,
      total: 99000,
    });
    const status = await request(app.getHttpServer())
      .get(`${API}/public/orders/${body.publicToken}`)
      .expect(200);
    expect(status.body).toMatchObject({ serviceCharge: 9000, total: 99000 });
  });
});
