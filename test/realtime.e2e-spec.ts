import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
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

/** Long enough for an event that was (wrongly) sent to arrive. */
const SILENCE_MS = 200;

describe('Realtime (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let a: Catalog;
  const sockets: Socket[] = [];

  function connect(auth: Record<string, string>): Promise<Socket> {
    const socket = io(url, { auth, transports: ['websocket'] });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  /** Records every event a socket receives. */
  function record(socket: Socket) {
    const events: { name: string; data: Record<string, unknown> }[] = [];
    socket.onAny((name: string, data: Record<string, unknown>) =>
      events.push({ name, data }),
    );
    return events;
  }

  const next = (socket: Socket, event: string) =>
    new Promise<Record<string, unknown>>((resolve) =>
      socket.once(event, resolve),
    );
  const silence = () => new Promise((r) => setTimeout(r, SILENCE_MS));

  const staff = (method: 'post' | 'patch', path: string, token = cafeA.token) =>
    request(app.getHttpServer())
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${token}`);
  const createOrder = () =>
    staff('post', '/orders')
      .send({
        type: 'TAKEAWAY',
        customerPhone: '+998901234567',
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(201);

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    await createCatalog(app, cafeB.token);
  });
  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });
  afterAll(() => app.close());

  describe('connecting', () => {
    it.each([
      ['no credentials', {}],
      ['a garbage token', { token: 'garbage' }],
      ['a malformed order token', { orderToken: 'nope' }],
      [
        'an unknown order token',
        { orderToken: '00000000-0000-4000-8000-000000000000' },
      ],
    ])('refuses %s', async (_name, auth) => {
      await expect(connect(auth as Record<string, string>)).rejects.toThrow(
        'Unauthorized',
      );
    });

    it('refuses a super admin, who has no cafe', async () => {
      const token = await loginAs(app, Role.SUPER_ADMIN, null);
      await expect(connect({ token })).rejects.toThrow('Unauthorized');
    });
  });

  describe('staff', () => {
    it('hears about new orders, once each', async () => {
      const socket = await connect({ token: cafeA.token });
      const events = record(socket);
      const created = next(socket, 'order.created');
      const { body: order } = await createOrder();

      expect(await created).toMatchObject({ id: order.id, number: 1 });
      await silence();
      expect(events.filter((e) => e.name === 'order.created')).toHaveLength(1);
    });

    it('hears about QR orders too', async () => {
      const socket = await connect({ token: cafeA.token });
      const created = next(socket, 'order.created');
      await request(app.getHttpServer())
        .post(`${API}/public/cafes/cafe-a/orders`)
        .send({
          type: 'DINE_IN',
          qrToken: a.qrToken,
          items: [{ productId: a.choy.id, quantity: 1 }],
        })
        .expect(201);
      expect(await created).toMatchObject({ source: 'QR', tableId: a.tableId });
    });

    it('hears about status changes and payments', async () => {
      const { body: order } = await createOrder();
      const socket = await connect({ token: cafeA.token });

      const changed = next(socket, 'order.status_changed');
      await staff('patch', `/orders/${order.id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      expect(await changed).toMatchObject({
        id: order.id,
        status: 'ACCEPTED',
      });

      const updated = next(socket, 'order.updated');
      await staff('post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: 1000 })
        .expect(201);
      expect(await updated).toMatchObject({ id: order.id, paidAmount: 1000 });
    });

    it('hears when a product runs out', async () => {
      const socket = await connect({ token: cafeA.token });
      const changed = next(socket, 'product.availability_changed');
      await staff('patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      expect(await changed).toEqual({ id: a.osh.id, isAvailable: false });
    });

    it('puts a cook in the kitchen room, which still gets orders', async () => {
      const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
      const socket = await connect({ token: cook });
      const created = next(socket, 'order.created');
      await createOrder();
      expect(await created).toHaveProperty('items');
    });

    it("never hears about another cafe's activity", async () => {
      const socket = await connect({ token: cafeB.token });
      const events = record(socket);
      const { body: order } = await createOrder();
      await staff('patch', `/orders/${order.id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      await staff('patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      await silence();
      expect(events).toEqual([]);
    });

    it('does not announce an order that failed', async () => {
      const socket = await connect({ token: cafeA.token });
      const events = record(socket);
      await staff('patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      await createOrder.call(null).catch(() => undefined);
      await silence();
      expect(events.map((e) => e.name)).toEqual([
        'product.availability_changed',
      ]);
    });
  });

  describe('customers', () => {
    it('hear the status of their own order, with no private data', async () => {
      const { body: order } = await createOrder();
      const socket = await connect({ orderToken: order.publicToken });

      const changed = next(socket, 'order.status_changed');
      await staff('patch', `/orders/${order.id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      expect(await changed).toEqual({
        id: order.id,
        number: 1,
        status: 'ACCEPTED',
      });
    });

    it('hear nothing about other orders or other staff events', async () => {
      const { body: mine } = await createOrder();
      const { body: other } = await createOrder();
      const socket = await connect({ orderToken: mine.publicToken });
      const events = record(socket);

      await staff('patch', `/orders/${other.id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      await staff('post', `/orders/${mine.id}/payments`)
        .send({ method: 'CASH', amount: 1000 })
        .expect(201);
      await createOrder();
      await staff('patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);

      await silence();
      expect(events).toEqual([]);
    });

    it('cannot join other rooms by asking', async () => {
      const { body: mine } = await createOrder();
      const socket = await connect({ orderToken: mine.publicToken });
      const events = record(socket);

      socket.emit('join', `cafe:${cafeA.cafeId}`);
      socket.emit('subscribe', { room: `cafe:${cafeA.cafeId}` });
      await silence();
      await createOrder();
      await silence();
      expect(events).toEqual([]);
    });
  });
});
