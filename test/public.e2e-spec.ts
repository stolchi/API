import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Cafe } from '../src/database/entities/index.js';
import {
  API,
  createCatalog,
  createTestApp,
  registerCafe,
  resetDatabase,
  type Catalog,
  type RegisteredCafe,
} from './utils.js';

describe('Public API (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
  let a: Catalog;
  let b: Catalog;

  const http = () => request(app.getHttpServer());
  const owner = (method: 'post' | 'patch' | 'get', path: string) =>
    http()
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${cafeA.token}`);
  const placeOrder = (slug: string, body: object) =>
    http().post(`${API}/public/cafes/${slug}/orders`).send(body);
  const dineIn = (qrToken: string, productId: string) => ({
    type: 'DINE_IN',
    qrToken,
    items: [{ productId, quantity: 2 }],
  });
  const deactivate = () =>
    app
      .get(DataSource)
      .manager.update(Cafe, { id: cafeA.cafeId }, { isActive: false });

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    const cafeB = await registerCafe(app, 'Cafe B');
    a = await createCatalog(app, cafeA.token);
    b = await createCatalog(app, cafeB.token);
  });
  afterAll(() => app.close());

  describe('menu', () => {
    it('needs no login and shows only this cafe', async () => {
      const { body } = await http()
        .get(`${API}/public/cafes/cafe-a/menu`)
        .expect(200);
      expect(body.cafe).toMatchObject({ name: 'Cafe A', currency: 'UZS' });
      expect(body.categories).toHaveLength(1);
      expect(
        body.categories[0].products.map((p: { id: string }) => p.id).sort(),
      ).toEqual([a.osh.id, a.choy.id].sort());
      expect(JSON.stringify(body)).not.toContain('cafeId');
      expect(body.cafe).not.toHaveProperty('id');
    });

    it('shows unavailable products, for greying out', async () => {
      await owner('patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      const { body } = await http()
        .get(`${API}/public/cafes/cafe-a/menu`)
        .expect(200);
      const osh = body.categories[0].products.find(
        (p: { id: string }) => p.id === a.osh.id,
      );
      expect(osh.isAvailable).toBe(false);
    });

    it('hides inactive categories', async () => {
      await owner('patch', `/categories/${a.categoryId}`)
        .send({ isActive: false })
        .expect(200);
      const { body } = await http()
        .get(`${API}/public/cafes/cafe-a/menu`)
        .expect(200);
      expect(body.categories).toEqual([]);
    });

    it('answers 404 for an unknown or deactivated cafe', async () => {
      await http().get(`${API}/public/cafes/nope/menu`).expect(404);
      await deactivate();
      await http().get(`${API}/public/cafes/cafe-a/menu`).expect(404);
    });
  });

  describe('table by QR token', () => {
    it('resolves the table and its cafe', async () => {
      const { body } = await http()
        .get(`${API}/public/tables/${a.qrToken}`)
        .expect(200);
      expect(body).toEqual({
        name: 'Stol 1',
        cafeSlug: 'cafe-a',
        cafeName: 'Cafe A',
      });
    });

    it('answers 404 for an unknown token or a deactivated cafe', async () => {
      await http().get(`${API}/public/tables/nope`).expect(404);
      await deactivate();
      await http().get(`${API}/public/tables/${a.qrToken}`).expect(404);
    });
  });

  describe('placing an order', () => {
    it('creates a QR order for the scanned table at database prices', async () => {
      const { body } = await placeOrder(
        'cafe-a',
        dineIn(a.qrToken, a.osh.id),
      ).expect(201);
      expect(body).toMatchObject({
        number: 1,
        status: 'NEW',
        type: 'DINE_IN',
        total: 90000,
      });

      const { body: staff } = await owner('get', '/orders?source=QR').expect(
        200,
      );
      expect(staff.items[0]).toMatchObject({
        tableId: a.tableId,
        source: 'QR',
        createdById: null,
      });
    });

    it('takes a takeaway order without a table', async () => {
      const { body } = await placeOrder('cafe-a', {
        type: 'TAKEAWAY',
        customerName: 'Ali',
        items: [{ productId: a.choy.id, quantity: 1 }],
      }).expect(201);
      expect(body.total).toBe(5000);
    });

    it('needs a table token for dine-in', async () => {
      await placeOrder('cafe-a', {
        type: 'DINE_IN',
        items: [{ productId: a.osh.id, quantity: 1 }],
      }).expect(400);
    });

    it('does not offer delivery yet', async () => {
      await placeOrder('cafe-a', {
        type: 'DELIVERY',
        customerPhone: '+998901234567',
        items: [{ productId: a.osh.id, quantity: 1 }],
      }).expect(400);
    });

    it("refuses another cafe's table token", async () => {
      await placeOrder('cafe-a', dineIn(b.qrToken, a.osh.id)).expect(400);
    });

    it("refuses another cafe's product", async () => {
      await placeOrder('cafe-a', dineIn(a.qrToken, b.osh.id)).expect(400);
    });

    it('refuses an unavailable product', async () => {
      await owner('patch', `/products/${a.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      await placeOrder('cafe-a', dineIn(a.qrToken, a.osh.id)).expect(409);
    });

    it('refuses staff-only fields', async () => {
      for (const extra of [
        { tableId: a.tableId },
        { total: 1 },
        { source: 'POS' },
        { createdById: cafeA.userId },
      ]) {
        await placeOrder('cafe-a', {
          ...dineIn(a.qrToken, a.osh.id),
          ...extra,
        }).expect(400);
      }
    });

    it('refuses orders for a deactivated cafe', async () => {
      await deactivate();
      await placeOrder('cafe-a', dineIn(a.qrToken, a.osh.id)).expect(404);
    });
  });

  describe('order status by token', () => {
    it('follows the order without revealing private details', async () => {
      const { body: placed } = await placeOrder('cafe-a', {
        ...dineIn(a.qrToken, a.osh.id),
        customerName: 'Ali',
        customerPhone: '+998901234567',
      }).expect(201);

      const { body: staff } = await owner('get', '/orders').expect(200);
      await owner('patch', `/orders/${staff.items[0].id}/status`)
        .send({ status: 'ACCEPTED' })
        .expect(200);

      const { body } = await http()
        .get(`${API}/public/orders/${placed.publicToken}`)
        .expect(200);
      expect(body.status).toBe('ACCEPTED');
      expect(body.items[0]).toMatchObject({ name: 'Osh', quantity: 2 });

      const text = JSON.stringify(body);
      for (const secret of ['Ali', '+99890', staff.items[0].id, 'cafeId']) {
        expect(text).not.toContain(secret);
      }
    });

    it('answers 404 for an unknown token and 400 for a malformed one', async () => {
      await http()
        .get(`${API}/public/orders/00000000-0000-4000-8000-000000000000`)
        .expect(404);
      await http().get(`${API}/public/orders/nope`).expect(400);
    });
  });
});
