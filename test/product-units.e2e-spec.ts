import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  API,
  createCatalog,
  createTestApp,
  registerCafe,
  resetDatabase,
  type Catalog,
  type RegisteredCafe,
} from './utils.js';

describe('Sizes, weights and the kitchen (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
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

  const product = async (body: object) =>
    (
      await staff('post', '/products')
        .send({ categoryId: a.categoryId, ...body })
        .expect(201)
    ).body;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    a = await createCatalog(app, cafeA.token);
    slug = (await staff('get', '/cafes/current')).body.slug;
  });
  afterAll(() => app.close());

  describe('sizes', () => {
    it('keeps the cheapest size as the price, and ids across edits', async () => {
      const osh = await product({
        name: 'Osh',
        price: 1,
        variants: [
          { name: '1 porsiya', price: 45000 },
          { name: '0,7 porsiya', price: 35000 },
        ],
      });
      expect(osh).toMatchObject({ price: 35000, unit: 'PIECE' });
      expect(osh.variants).toHaveLength(2);

      const [full, small] = osh.variants;
      const { body } = await staff('patch', `/products/${osh.id}`)
        .send({
          variants: [
            { id: full.id, name: '1 porsiya', price: 50000 },
            { id: small.id, name: '0,7 porsiya', price: 38000 },
          ],
        })
        .expect(200);
      expect(body.price).toBe(38000);
      expect(body.variants.map((v: { id: string }) => v.id)).toEqual([
        full.id,
        small.id,
      ]);

      await staff('patch', `/products/${osh.id}`)
        .send({ variants: [{ id: a.osh.id, name: 'X', price: 1 }] })
        .expect(400);
    });

    it('needs a size chosen, and names the line after it', async () => {
      const osh = await product({
        name: 'Osh',
        price: 0,
        variants: [
          { name: '1 porsiya', price: 45000 },
          { name: '0,7 porsiya', price: 35000 },
        ],
      });
      const takeaway = (item: object) =>
        staff('post', '/orders').send({ type: 'TAKEAWAY', items: [item] });

      await takeaway({ productId: osh.id, quantity: 1 }).expect(400);
      await takeaway({
        productId: osh.id,
        variantId: a.osh.id,
        quantity: 1,
      }).expect(400);
      await takeaway({
        productId: a.choy.id,
        variantId: osh.variants[0].id,
        quantity: 1,
      }).expect(400);

      const { body } = await takeaway({
        productId: osh.id,
        variantId: osh.variants[1].id,
        quantity: 2,
      }).expect(201);
      expect(body.items[0]).toMatchObject({
        name: 'Osh (0,7 porsiya)',
        price: 35000,
        variantId: osh.variants[1].id,
      });
      expect(body.itemsTotal).toBe(70000);
    });
  });

  describe('weight', () => {
    it('prices by the kilogram and refuses sizes on it', async () => {
      await staff('post', '/products')
        .send({
          categoryId: a.categoryId,
          name: 'Baliq',
          price: 120000,
          unit: 'KG',
          variants: [{ name: 'Katta', price: 1 }],
        })
        .expect(400);
      const fish = await product({ name: 'Baliq', price: 120000, unit: 'KG' });

      const { body } = await staff('post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: fish.id, quantity: 1250 }],
        })
        .expect(201);
      expect(body.items[0]).toMatchObject({
        unit: 'KG',
        quantity: 1250,
        weighed: true,
      });
      expect(body.itemsTotal).toBe(150000);

      await staff('post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: a.osh.id, quantity: 1000 }],
        })
        .expect(400);
    });

    it("holds a customer's guess until staff weigh it", async () => {
      const fish = await product({ name: 'Baliq', price: 120000, unit: 'KG' });
      const { body: placed } = await request(app.getHttpServer())
        .post(`${API}/public/cafes/${slug}/orders`)
        .send({
          type: 'DINE_IN',
          qrToken: a.qrToken,
          items: [
            { productId: fish.id, quantity: 1000 },
            { productId: a.choy.id, quantity: 1 },
          ],
        })
        .expect(201);
      expect(placed.items[0]).toMatchObject({ unit: 'KG', weighed: false });
      expect(placed.total).toBe(125000);

      const { body: orders } = await staff('get', '/orders?active=true');
      const order = orders.items[0];
      const fishLine = order.items.find(
        (item: { unit: string }) => item.unit === 'KG',
      );
      const choyLine = order.items.find(
        (item: { unit: string }) => item.unit === 'PIECE',
      );

      await staff('post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: 1000 })
        .expect(409);

      // Changing another line does not weigh the fish.
      await staff('put', `/orders/${order.id}/items`)
        .send({
          items: [
            { id: fishLine.id, quantity: 1000 },
            { id: choyLine.id, quantity: 2 },
          ],
        })
        .expect(200);
      await staff('post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: 1000 })
        .expect(409);

      const { body: weighed } = await staff('put', `/orders/${order.id}/items`)
        .send({
          items: [
            { id: fishLine.id, quantity: 1340 },
            { id: choyLine.id, quantity: 2 },
          ],
        })
        .expect(200);
      expect(weighed.items[0]).toMatchObject({ quantity: 1340, weighed: true });
      expect(weighed.itemsTotal).toBe(160800 + 10000);
      await staff('post', `/orders/${order.id}/payments`)
        .send({ method: 'CASH', amount: 1000 })
        .expect(201);
    });

    it('lets staff confirm a guessed weight as it is', async () => {
      const fish = await product({ name: 'Baliq', price: 120000, unit: 'KG' });
      await request(app.getHttpServer())
        .post(`${API}/public/cafes/${slug}/orders`)
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: fish.id, quantity: 500 }],
        })
        .expect(201);
      const { body: orders } = await staff('get', '/orders?active=true');
      const order = orders.items[0];
      const { body } = await staff('put', `/orders/${order.id}/items`)
        .send({
          items: [{ id: order.items[0].id, quantity: 500, weighed: true }],
        })
        .expect(200);
      expect(body.items[0].weighed).toBe(true);
    });
  });

  describe('the kitchen', () => {
    it('skips the kitchen when nothing needs cooking', async () => {
      const cola = await product({
        name: 'Kola',
        price: 10000,
        sendsToKitchen: false,
      });
      const { body: drinks } = await staff('post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [{ productId: cola.id, quantity: 2 }],
        })
        .expect(201);
      expect(drinks.status).toBe('READY');
      expect(drinks.items[0].sendsToKitchen).toBe(false);

      // More drinks leave it ready; food sends it to the kitchen.
      const { body: more } = await staff('put', `/orders/${drinks.id}/items`)
        .send({ items: [{ id: drinks.items[0].id, quantity: 3 }] })
        .expect(200);
      expect(more.status).toBe('READY');
      const { body: food } = await staff('put', `/orders/${drinks.id}/items`)
        .send({
          items: [
            { id: drinks.items[0].id, quantity: 3 },
            { productId: a.osh.id, quantity: 1 },
          ],
        })
        .expect(200);
      expect(food.status).toBe('COOKING');

      const { body: mixed } = await staff('post', '/orders')
        .send({
          type: 'TAKEAWAY',
          items: [
            { productId: cola.id, quantity: 1 },
            { productId: a.osh.id, quantity: 1 },
          ],
        })
        .expect(201);
      expect(mixed.status).toBe('ACCEPTED');
    });
  });

  it('shows customers sizes and units on the menu', async () => {
    await product({ name: 'Baliq', price: 120000, unit: 'KG' });
    await product({
      name: 'Pitsa',
      price: 0,
      variants: [{ name: 'Katta', price: 90000 }],
    });
    const { body } = await request(app.getHttpServer())
      .get(`${API}/public/cafes/${slug}/menu`)
      .expect(200);
    const products = body.categories[0].products;
    expect(
      products.find((p: { name: string }) => p.name === 'Baliq'),
    ).toMatchObject({
      unit: 'KG',
      variants: [],
    });
    expect(
      products.find((p: { name: string }) => p.name === 'Pitsa').variants[0],
    ).toMatchObject({ name: 'Katta', price: 90000 });
  });
});
