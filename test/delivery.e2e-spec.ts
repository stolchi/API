import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { OrderSource, OrderType, Role } from '../src/common/enums.js';
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

describe('Delivery (e2e)', () => {
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
  const staff = (method: 'post' | 'patch' | 'get' | 'put', path: string) =>
    send(cafeA.token, method, path);

  const delivery = (extra: object = {}) =>
    staff('post', '/orders').send({
      type: 'DELIVERY',
      customerPhone: '+998901112233',
      customerName: 'Ali',
      address: 'Chilonzor 9, 12-uy, mo‘ljal: maktab',
      items: [{ productId: a.osh.id, quantity: 1 }],
      ...extra,
    });

  /** What a Telegram order will be: waiting for someone to call and accept it. */
  const fromTelegram = () =>
    app.get(OrdersService).create(cafeA.cafeId, {
      source: OrderSource.TELEGRAM,
      type: OrderType.DELIVERY,
      customerPhone: '+998901112233',
      address: 'Yunusobod 4',
      items: [{ productId: a.osh.id, quantity: 1 }],
    });

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    slug = (await staff('get', '/cafes/current')).body.slug;
    await staff('patch', '/cafes/current')
      .send({
        orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
        packagingFee: 2000,
        deliveryFee: 15000,
      })
      .expect(200);
  });
  afterAll(() => app.close());

  it('takes a phoned-in delivery, already agreed, with its address and fees', async () => {
    const { body } = await delivery().expect(201);
    expect(body).toMatchObject({
      status: 'ACCEPTED',
      displayNumber: '1',
      address: 'Chilonzor 9, 12-uy, mo‘ljal: maktab',
      customerName: 'Ali',
      itemsTotal: 45000,
      packagingFee: 2000,
      deliveryFee: 15000,
      total: 62000,
    });
  });

  it('needs a phone and an address, and keeps addresses to deliveries', async () => {
    await delivery({ address: '' }).expect(400);
    await delivery({ address: '   ' }).expect(400);
    await delivery({ customerPhone: undefined }).expect(400);
    const { body } = await staff('post', '/orders')
      .send({
        type: 'TAKEAWAY',
        address: 'Somewhere',
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(201);
    expect(body.address).toBeNull();
  });

  it('lets staff correct the contact details, but not empty them', async () => {
    const { body: order } = await delivery().expect(201);
    const { body } = await staff('patch', `/orders/${order.id}/customer`)
      .send({ address: 'Chilonzor 9, 14-uy', customerName: null })
      .expect(200);
    expect(body).toMatchObject({
      address: 'Chilonzor 9, 14-uy',
      customerName: null,
      customerPhone: '+998901112233',
    });
    await staff('patch', `/orders/${order.id}/customer`)
      .send({ address: null })
      .expect(400);
    await staff('patch', `/orders/${order.id}/customer`)
      .send({ customerPhone: '123' })
      .expect(400);

    const { body: takeaway } = await staff('post', '/orders')
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 1 }] })
      .expect(201);
    await staff('patch', `/orders/${takeaway.id}/customer`)
      .send({ address: 'X' })
      .expect(400);
    await staff('patch', `/orders/${takeaway.id}/customer`)
      .send({ customerPhone: '+998901112233' })
      .expect(200);

    // Another cafe's order is not there to change.
    await send(cafeB.token, 'patch', `/orders/${order.id}/customer`)
      .send({ address: 'Boshqa' })
      .expect(404);
  });

  it('keeps the point on the map, for deliveries only', async () => {
    const location = { latitude: 41.311081, longitude: 69.240562 };
    const { body } = await delivery({ location }).expect(201);
    expect(body.location).toEqual(location);

    await delivery({ location: { latitude: 91, longitude: 69 } }).expect(400);
    await delivery({ location: { latitude: 41.3 } }).expect(400);

    const { body: moved } = await staff('patch', `/orders/${body.id}/customer`)
      .send({ location: { latitude: 41.35, longitude: 69.28 } })
      .expect(200);
    expect(moved.location).toEqual({ latitude: 41.35, longitude: 69.28 });
    const { body: cleared } = await staff(
      'patch',
      `/orders/${body.id}/customer`,
    )
      .send({ location: null })
      .expect(200);
    expect(cleared.location).toBeNull();

    // Another change leaves the point where it is.
    await staff('patch', `/orders/${body.id}/customer`)
      .send({ location })
      .expect(200);
    const { body: renamed } = await staff(
      'patch',
      `/orders/${body.id}/customer`,
    )
      .send({ customerName: 'Vali' })
      .expect(200);
    expect(renamed.location).toEqual(location);

    const { body: takeaway } = await staff('post', '/orders')
      .send({
        type: 'TAKEAWAY',
        location,
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(201);
    expect(takeaway.location).toBeNull();
    await staff('patch', `/orders/${takeaway.id}/customer`)
      .send({ location })
      .expect(400);
  });

  it('only lets staff who edit orders change the details', async () => {
    const { body: order } = await delivery().expect(201);
    const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
    await send(cook, 'patch', `/orders/${order.id}/customer`)
      .send({ address: 'X' })
      .expect(403);
  });

  it('holds a Telegram order until it is accepted, and its changes before that', async () => {
    const order = await fromTelegram();
    expect(order.status).toBe('NEW');

    const { body: list } = await staff('get', '/orders?active=true');
    const line = list.items[0].items[0];
    // Agreed on the phone: two portions instead of one.
    const { body: changed } = await staff('put', `/orders/${order.id}/items`)
      .send({ items: [{ id: line.id, quantity: 2 }] })
      .expect(200);
    expect(changed).toMatchObject({ status: 'NEW', total: 2 * 45000 + 17000 });

    const { body: accepted } = await staff(
      'patch',
      `/orders/${order.id}/status`,
    )
      .send({ status: 'ACCEPTED' })
      .expect(200);
    expect(accepted.displayNumber).toBe(`D-${order.number}`);
  });

  it('cancels with a reason the customer can read', async () => {
    const order = await fromTelegram();
    const { body } = await staff('post', `/orders/${order.id}/cancel`)
      .send({ reason: '  Osh tugagan  ' })
      .expect(200);
    expect(body).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Osh tugagan',
    });

    const status = await request(app.getHttpServer())
      .get(`${API}/public/orders/${order.publicToken}`)
      .expect(200);
    expect(status.body).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Osh tugagan',
    });
    expect(status.body).not.toHaveProperty('address');
    expect(status.body).not.toHaveProperty('customerPhone');

    // A reason is not required.
    const { body: plain } = await delivery().expect(201);
    const { body: cancelled } = await staff(
      'post',
      `/orders/${plain.id}/cancel`,
    ).expect(200);
    expect(cancelled.cancelReason).toBeNull();
  });

  it('keeps deliveries and unaccepted orders off the customer screen', async () => {
    await fromTelegram();
    await delivery().expect(201);
    const { body: takeaway } = await staff('post', '/orders')
      .send({ type: 'TAKEAWAY', items: [{ productId: a.osh.id, quantity: 1 }] })
      .expect(201);
    const { body } = await request(app.getHttpServer())
      .get(`${API}/public/cafes/${slug}/screen`)
      .expect(200);
    expect(body.preparing).toEqual([takeaway.displayNumber]);
  });
});
