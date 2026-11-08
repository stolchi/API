import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Role } from '../src/common/enums.js';
import {
  API,
  createCatalog,
  createTestApp,
  loginAs,
  nextPhone,
  registerCafe,
  resetDatabase,
  type Catalog,
  type RegisteredCafe,
} from './utils.js';

/** The cafe in Chilonzor, a customer about 2.5 km away. */
const CAFE_POINT = { latitude: 41.2856, longitude: 69.2034 };
const CUSTOMER_POINT = { latitude: 41.3, longitude: 69.23 };
const NEAR_CAFE = 'latitude=41.29&longitude=69.21';
const FAR_AWAY = 'latitude=40.38&longitude=71.78';

describe('Courier network (e2e)', () => {
  let app: NestExpressApplication;
  let cafe: RegisteredCafe;
  let a: Catalog;

  const http = () => request(app.getHttpServer());
  const staff = (method: 'post' | 'patch' | 'get', path: string) =>
    http()
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${cafe.token}`);
  const as = (token: string, method: 'post' | 'get', path: string) =>
    http()[method](`${API}${path}`).set('Authorization', `Bearer ${token}`);

  async function signUp(name = 'Aziz') {
    const phone = nextPhone();
    const response = await http()
      .post(`${API}/network/auth/register`)
      .send({ name, phone, password: 'parol12345', vehicle: 'CAR' })
      .expect(201);
    return {
      token: response.body.accessToken as string,
      id: response.body.courier.id as string,
      phone,
      cookie: (response.get('Set-Cookie') ?? [])[0]?.split(';')[0] ?? '',
    };
  }

  async function useNetwork(mode: 'NETWORK' | 'BOTH') {
    await staff('patch', '/cafes/current')
      .send({
        orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
        deliveryFee: 15000,
        deliveryMode: mode,
        location: CAFE_POINT,
      })
      .expect(200);
  }

  async function delivery() {
    const { body } = await staff('post', '/orders')
      .send({
        type: 'DELIVERY',
        customerName: 'Vali',
        customerPhone: '+998901112233',
        address: 'Chilonzor 1, 5-uy',
        location: CUSTOMER_POINT,
        items: [{ productId: a.osh.id, quantity: 1 }],
      })
      .expect(201);
    return body;
  }

  async function ready(id: string) {
    for (const status of ['COOKING', 'READY']) {
      await staff('patch', `/orders/${id}/status`).send({ status }).expect(200);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafe = await registerCafe(app, 'Cafe A');
    a = await createCatalog(app, cafe.token);
  });
  afterAll(() => app.close());

  describe('accounts', () => {
    it('lets anyone sign up, sign in and stay signed in', async () => {
      const aziz = await signUp();
      const { body: me } = await as(
        aziz.token,
        'get',
        '/network/auth/me',
      ).expect(200);
      expect(me).toMatchObject({
        name: 'Aziz',
        phone: aziz.phone,
        vehicle: 'CAR',
      });

      await http()
        .post(`${API}/network/auth/register`)
        .send({
          name: 'Boshqa',
          phone: aziz.phone,
          password: 'parol12345',
          vehicle: 'FOOT',
        })
        .expect(409);
      await http()
        .post(`${API}/network/auth/login`)
        .send({ phone: aziz.phone, password: 'wrong-password' })
        .expect(401);
      await http()
        .post(`${API}/network/auth/login`)
        .send({ phone: aziz.phone, password: 'parol12345' })
        .expect(200);

      const refreshed = await http()
        .post(`${API}/network/auth/refresh`)
        .set('Cookie', aziz.cookie)
        .expect(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      // The old cookie is spent: using it again ends the sign-in.
      await http()
        .post(`${API}/network/auth/refresh`)
        .set('Cookie', aziz.cookie)
        .expect(401);
    });

    it('keeps courier and staff tokens apart', async () => {
      const aziz = await signUp();
      await as(aziz.token, 'get', '/orders').expect(401);
      await as(aziz.token, 'get', '/cafes/current').expect(401);
      await as(cafe.token, 'get', '/network/orders/nearby').expect(401);
      await http().get(`${API}/network/orders/nearby`).expect(401);
    });
  });

  describe('cafe settings', () => {
    it('needs the cafe on the map to use the network', async () => {
      await staff('patch', '/cafes/current')
        .send({ deliveryMode: 'NETWORK' })
        .expect(400);
      const { body } = await staff('patch', '/cafes/current')
        .send({ deliveryMode: 'BOTH', location: CAFE_POINT })
        .expect(200);
      expect(body).toMatchObject({
        deliveryMode: 'BOTH',
        location: CAFE_POINT,
      });
      await staff('patch', '/cafes/current')
        .send({ location: null })
        .expect(400);
    });
  });

  describe('offers', () => {
    it('offers agreed deliveries at once to nearby couriers, without private details', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      expect(order.offeredAt).not.toBeNull();
      const aziz = await signUp();

      const { body: near } = await as(
        aziz.token,
        'get',
        `/network/orders/nearby?${NEAR_CAFE}`,
      ).expect(200);
      expect(near).toHaveLength(1);
      expect(near[0]).toMatchObject({
        id: order.id,
        cafe: { name: 'Cafe A', location: CAFE_POINT },
        money: {
          deliveryFee: 15000,
          collectFromCustomer: 60000,
          settlement: 45000,
        },
      });
      expect(near[0].toCafeKm).toBeLessThan(1.5);
      expect(near[0].tripKm).toBeGreaterThan(2);
      expect(JSON.stringify(near[0])).not.toContain('+998901112233');
      expect(JSON.stringify(near[0])).not.toContain('Chilonzor 1');

      const { body: far } = await as(
        aziz.token,
        'get',
        `/network/orders/nearby?${FAR_AWAY}`,
      );
      expect(far).toEqual([]);
    });

    it('lets a cafe using both offer by hand, and take back an untaken offer', async () => {
      await useNetwork('BOTH');
      const order = await delivery();
      expect(order.offeredAt).toBeNull();
      const aziz = await signUp();
      const { body: none } = await as(
        aziz.token,
        'get',
        '/network/orders/nearby',
      );
      expect(none).toEqual([]);

      await staff('patch', `/orders/${order.id}/offer`)
        .send({ offered: true })
        .expect(200);
      const { body: one } = await as(
        aziz.token,
        'get',
        '/network/orders/nearby',
      );
      expect(one).toHaveLength(1);

      await staff('patch', `/orders/${order.id}/offer`)
        .send({ offered: false })
        .expect(200);
      const { body: back } = await as(
        aziz.token,
        'get',
        '/network/orders/nearby',
      );
      expect(back).toEqual([]);
    });

    it('offers nothing for a cafe that keeps to its own couriers', async () => {
      await staff('patch', '/cafes/current')
        .send({ orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] })
        .expect(200);
      const order = await delivery();
      await staff('patch', `/orders/${order.id}/offer`)
        .send({ offered: true })
        .expect(409);
    });
  });

  describe('taking a delivery', () => {
    it('gives it to the first courier, then shows them everything', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      const aziz = await signUp('Aziz');
      const bobur = await signUp('Bobur');

      const { body: taken } = await as(
        aziz.token,
        'post',
        `/network/orders/${order.id}/claim`,
      ).expect(200);
      expect(taken).toMatchObject({
        customerPhone: '+998901112233',
        address: 'Chilonzor 1, 5-uy',
        dropoff: CUSTOMER_POINT,
      });
      await as(bobur.token, 'post', `/network/orders/${order.id}/claim`).expect(
        409,
      );
      const { body: gone } = await as(
        bobur.token,
        'get',
        '/network/orders/nearby',
      );
      expect(gone).toEqual([]);

      // The cafe sees who is coming, and its own couriers cannot take it now.
      const { body: seen } = await staff('get', `/orders/${order.id}`);
      expect(seen.networkCourier).toMatchObject({
        name: 'Aziz',
        phone: aziz.phone,
        vehicle: 'CAR',
      });
      const own = await loginAs(app, Role.COURIER, cafe.cafeId);
      await as(own, 'post', `/courier/orders/${order.id}/claim`).expect(409);
      await staff('patch', `/orders/${order.id}/offer`)
        .send({ offered: false })
        .expect(409);
    });

    it('lets a courier give it back until they have it in hand', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      const aziz = await signUp();
      await as(aziz.token, 'post', `/network/orders/${order.id}/claim`).expect(
        200,
      );
      await as(
        aziz.token,
        'post',
        `/network/orders/${order.id}/release`,
      ).expect(204);
      const { body } = await as(aziz.token, 'get', '/network/orders/nearby');
      expect(body).toHaveLength(1);
    });

    it('limits how many deliveries one courier carries', async () => {
      await useNetwork('NETWORK');
      const aziz = await signUp();
      for (let i = 0; i < 3; i++) {
        const order = await delivery();
        await as(
          aziz.token,
          'post',
          `/network/orders/${order.id}/claim`,
        ).expect(200);
      }
      const fourth = await delivery();
      await as(aziz.token, 'post', `/network/orders/${fourth.id}/claim`).expect(
        400,
      );
    });
  });

  describe('handing over and delivering', () => {
    it('takes the food money from the courier, who keeps the delivery fee', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      const aziz = await signUp();
      await as(aziz.token, 'post', `/network/orders/${order.id}/claim`).expect(
        200,
      );
      // Not ready yet: nothing to hand over.
      await staff('post', `/orders/${order.id}/hand-over`).expect(409);
      await ready(order.id);

      const { body: handed } = await staff(
        'post',
        `/orders/${order.id}/hand-over`,
      ).expect(200);
      expect(handed).toMatchObject({ status: 'SERVED', paidAmount: 45000 });

      const { body: onTheWay } = await as(
        aziz.token,
        'post',
        `/network/orders/${order.id}/eta`,
      )
        .send({ etaMinutes: 20 })
        .expect(200);
      expect(onTheWay.deliveryEta).not.toBeNull();
      // The 45 000 the courier paid is theirs to get back from the customer, with the fee.
      expect(onTheWay.money).toEqual({
        deliveryFee: 15000,
        collectFromCustomer: 60000,
        settlement: 45000,
      });

      await as(
        aziz.token,
        'post',
        `/network/orders/${order.id}/deliver`,
      ).expect(204);
      const { body: closed } = await staff('get', `/orders/${order.id}`);
      expect(closed.status).toBe('PAID');

      // The cafe's takings leave out what was the courier's.
      const { body: today } = await staff('get', '/dashboard');
      expect(today.revenue).toBe(45000);
    });

    it('pays the courier their fee when the customer paid ahead', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      await staff('post', `/orders/${order.id}/payments`)
        .send({ method: 'CARD', amount: 60000 })
        .expect(201);
      const aziz = await signUp();
      const { body: offer } = await as(
        aziz.token,
        'get',
        `/network/orders/nearby?${NEAR_CAFE}`,
      );
      expect(offer[0].money).toEqual({
        deliveryFee: 15000,
        collectFromCustomer: 0,
        settlement: -15000,
      });
      await as(aziz.token, 'post', `/network/orders/${order.id}/claim`).expect(
        200,
      );
      await ready(order.id);
      const { body: handed } = await staff(
        'post',
        `/orders/${order.id}/hand-over`,
      ).expect(200);
      expect(handed.paidAmount).toBe(60000);
      const { body: mine } = await as(
        aziz.token,
        'get',
        '/network/orders/mine',
      );
      expect(mine[0].money).toEqual({
        deliveryFee: 15000,
        collectFromCustomer: 0,
        settlement: -15000,
      });
      await as(
        aziz.token,
        'post',
        `/network/orders/${order.id}/deliver`,
      ).expect(204);
      const { body: closed } = await staff('get', `/orders/${order.id}`);
      expect(closed.status).toBe('PAID');
    });

    it('needs someone who handles money to take the courier’s', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      const aziz = await signUp();
      await as(aziz.token, 'post', `/network/orders/${order.id}/claim`).expect(
        200,
      );
      await ready(order.id);
      const waiter = await loginAs(app, Role.WAITER, cafe.cafeId);
      await as(waiter, 'post', `/orders/${order.id}/hand-over`).expect(403);
    });

    it('lets only the courier who has it deliver it', async () => {
      await useNetwork('NETWORK');
      const order = await delivery();
      const aziz = await signUp();
      const bobur = await signUp('Bobur');
      await as(aziz.token, 'post', `/network/orders/${order.id}/claim`).expect(
        200,
      );
      await ready(order.id);
      await staff('post', `/orders/${order.id}/hand-over`).expect(200);
      await as(
        bobur.token,
        'post',
        `/network/orders/${order.id}/deliver`,
      ).expect(404);
      await as(bobur.token, 'post', `/network/orders/${order.id}/eta`)
        .send({ etaMinutes: 20 })
        .expect(404);
    });
  });
});
