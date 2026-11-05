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

const PNG = Buffer.from('89504e470d0a1a0a0000', 'hex');

describe('Categories, products and tables (e2e)', () => {
  let app: NestExpressApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let catalogA: Catalog;
  let catalogB: Catalog;

  const as = (token: string) => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    catalogA = await createCatalog(app, cafeA.token);
    catalogB = await createCatalog(app, cafeB.token);
  });
  afterAll(() => app.close());

  describe('categories', () => {
    it('supports the full CRUD for an owner', async () => {
      const owner = as(cafeA.token);
      const { body: created } = await owner
        .post('/categories')
        .send({ name: 'Salatlar', sortOrder: 5 })
        .expect(201);
      const { body: updated } = await owner
        .patch(`/categories/${created.id}`)
        .send({ name: 'Salat', isActive: false })
        .expect(200);
      expect(updated).toMatchObject({
        name: 'Salat',
        sortOrder: 5,
        isActive: false,
      });
      await owner.delete(`/categories/${created.id}`).expect(204);
      await owner.get(`/categories/${created.id}`).expect(404);
    });

    it('accepts an empty update', async () => {
      const { body } = await as(cafeA.token)
        .patch(`/categories/${catalogA.categoryId}`)
        .send({})
        .expect(200);
      expect(body.name).toBe('Taomlar');
    });

    it('answers 400, not 500, when a required field is set to null', async () => {
      await as(cafeA.token)
        .patch(`/categories/${catalogA.categoryId}`)
        .send({ name: null })
        .expect(400);
    });

    it('refuses to delete a category that still has products', async () => {
      await as(cafeA.token)
        .delete(`/categories/${catalogA.categoryId}`)
        .expect(409);
    });

    it('lets only an owner change them', async () => {
      const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
      await as(cashier).post('/categories').send({ name: 'X' }).expect(403);
      await as(cashier).get('/categories').expect(200);
    });

    it("cannot touch another cafe's category", async () => {
      const owner = as(cafeA.token);
      const path = `/categories/${catalogB.categoryId}`;
      await owner.patch(path).send({ name: 'Hacked' }).expect(404);
      await owner.delete(path).expect(404);
      const { body } = await as(cafeB.token).get(path).expect(200);
      expect(body.name).toBe('Taomlar');
    });
  });

  describe('products', () => {
    it('creates, filters, updates and deletes', async () => {
      const owner = as(cafeA.token);
      const { body: category } = await owner
        .post('/categories')
        .send({ name: 'Ichimlik' })
        .expect(201);
      const { body: product } = await owner
        .post('/products')
        .send({ categoryId: category.id, name: 'Kofe', price: 18000 })
        .expect(201);

      const { body: filtered } = await owner
        .get(`/products?categoryId=${category.id}`)
        .expect(200);
      expect(filtered.map((p: { id: string }) => p.id)).toEqual([product.id]);

      const { body: updated } = await owner
        .patch(`/products/${product.id}`)
        .send({ price: 20000 })
        .expect(200);
      expect(updated.price).toBe(20000);

      await owner.delete(`/products/${product.id}`).expect(204);
      await owner.get(`/products/${product.id}`).expect(404);
    });

    it.each([
      ['a fractional price', 100.5],
      ['a negative price', -1],
      ['a text price', '100'],
    ])('refuses %s', async (_name, price) => {
      await as(cafeA.token)
        .post('/products')
        .send({ categoryId: catalogA.categoryId, name: 'X', price })
        .expect(400);
    });

    it("cannot be attached to another cafe's category", async () => {
      const owner = as(cafeA.token);
      await owner
        .post('/products')
        .send({ categoryId: catalogB.categoryId, name: 'X', price: 1 })
        .expect(400);
      await owner
        .patch(`/products/${catalogA.osh.id}`)
        .send({ categoryId: catalogB.categoryId })
        .expect(400);
    });

    it("cannot touch another cafe's product", async () => {
      const owner = as(cafeA.token);
      const path = `/products/${catalogB.osh.id}`;
      await owner.get(path).expect(404);
      await owner.patch(path).send({ price: 1 }).expect(404);
      await owner
        .patch(`${path}/availability`)
        .send({ isAvailable: false })
        .expect(404);
      await owner
        .post(`${path}/image`)
        .attach('file', PNG, 'a.png')
        .expect(404);
      await owner.delete(path).expect(404);

      const { body } = await as(cafeB.token).get(path).expect(200);
      expect(body).toMatchObject({ price: 45000, isAvailable: true });
    });

    it('lets a cashier toggle availability but nothing else', async () => {
      const cashier = as(await loginAs(app, Role.CASHIER, cafeA.cafeId));
      const path = `/products/${catalogA.osh.id}`;
      const { body } = await cashier
        .patch(`${path}/availability`)
        .send({ isAvailable: false })
        .expect(200);
      expect(body.isAvailable).toBe(false);
      await cashier.patch(path).send({ price: 1 }).expect(403);
    });

    it('keeps a cook away from availability', async () => {
      const cook = as(await loginAs(app, Role.COOK, cafeA.cafeId));
      await cook
        .patch(`/products/${catalogA.osh.id}/availability`)
        .send({ isAvailable: false })
        .expect(403);
    });

    describe('image upload', () => {
      const upload = (content: Buffer, name: string, type: string) =>
        as(cafeA.token)
          .post(`/products/${catalogA.osh.id}/image`)
          .attach('file', content, { filename: name, contentType: type });

      it('stores an image, serves it, and replaces it', async () => {
        const { body: first } = await upload(PNG, 'a.png', 'image/png').expect(
          200,
        );
        expect(first.imageUrl).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);

        const served = await request(app.getHttpServer())
          .get(first.imageUrl)
          .expect(200);
        expect(served.headers['x-content-type-options']).toBe('nosniff');

        const { body: second } = await upload(PNG, 'b.png', 'image/png').expect(
          200,
        );
        expect(second.imageUrl).not.toBe(first.imageUrl);
        await request(app.getHttpServer()).get(first.imageUrl).expect(404);
      });

      it('judges the file by its content, not its claimed type', async () => {
        await upload(
          Buffer.from('<svg onload="alert(1)"/>'),
          'evil.png',
          'image/png',
        ).expect(400);
      });

      it('refuses a file over 5 MB', async () => {
        const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
        await upload(big, 'big.png', 'image/png').expect(413);
      });

      it('requires a file', async () => {
        await as(cafeA.token)
          .post(`/products/${catalogA.osh.id}/image`)
          .expect(400);
      });

      it('is for owners only', async () => {
        const cashier = await loginAs(app, Role.CASHIER, cafeA.cafeId);
        await as(cashier)
          .post(`/products/${catalogA.osh.id}/image`)
          .attach('file', PNG, 'a.png')
          .expect(403);
      });
    });
  });

  describe('tables', () => {
    it('generates a unique token and the menu address for each table', async () => {
      const owner = as(cafeA.token);
      const { body: one } = await owner
        .post('/tables')
        .send({ name: 'A', zone: 'Terrasa' })
        .expect(201);
      const { body: two } = await owner
        .post('/tables')
        .send({ name: 'B' })
        .expect(201);
      expect(one.qrToken).toMatch(/^[0-9a-f]{32}$/);
      expect(one.qrToken).not.toBe(two.qrToken);
      expect(one.menuUrl).toMatch(
        new RegExp(`/cafe-a\\?table=${one.qrToken}$`),
      );
    });

    it('does not let a client choose the token', async () => {
      await as(cafeA.token)
        .post('/tables')
        .send({ name: 'A', qrToken: 'chosen' })
        .expect(400);
    });

    it('refuses a duplicate name within a cafe, but not across cafes', async () => {
      await as(cafeA.token)
        .post('/tables')
        .send({ name: 'Stol 1' })
        .expect(409);
      await as(cafeA.token)
        .post('/tables')
        .send({ name: 'Stol 2' })
        .expect(201);
      await as(cafeB.token)
        .post('/tables')
        .send({ name: 'Stol 2' })
        .expect(201);
    });

    it('gives a conflict when renaming onto an existing name', async () => {
      const { body } = await as(cafeA.token)
        .post('/tables')
        .send({ name: 'Stol 2' })
        .expect(201);
      await as(cafeA.token)
        .patch(`/tables/${body.id}`)
        .send({ name: 'Stol 1' })
        .expect(409);
    });

    it('serves the QR code as PNG by default', async () => {
      const response = await as(cafeA.token)
        .get(`/tables/${catalogA.tableId}/qr`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect((response.body as Buffer).subarray(0, 8).toString('hex')).toBe(
        '89504e470d0a1a0a',
      );
    });

    it('serves the QR code as SVG on request', async () => {
      const response = await as(cafeA.token)
        .get(`/tables/${catalogA.tableId}/qr?format=svg`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(response.headers['content-type']).toContain('image/svg+xml');
      expect((response.body as Buffer).toString()).toContain('<svg');
    });

    it('refuses an unknown QR format', async () => {
      await as(cafeA.token)
        .get(`/tables/${catalogA.tableId}/qr?format=gif`)
        .expect(400);
    });

    it('prints all tables of the cafe into one PDF, across pages', async () => {
      const owner = as(cafeA.token);
      for (let n = 2; n <= 7; n++) {
        await owner
          .post('/tables')
          .send({ name: `Stol ${n}` })
          .expect(201);
      }
      const response = await owner
        .get('/tables/qr.pdf')
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      const pdf = response.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      // 7 tables at 6 cards per page.
      expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
    });

    it("cannot reach another cafe's table or its QR code", async () => {
      const owner = as(cafeA.token);
      const path = `/tables/${catalogB.tableId}`;
      await owner.get(path).expect(404);
      await owner.get(`${path}/qr`).expect(404);
      await owner.patch(path).send({ name: 'Hacked' }).expect(404);
      await owner.delete(path).expect(404);
    });

    it('keeps QR downloads and changes to owners', async () => {
      const cashier = as(await loginAs(app, Role.CASHIER, cafeA.cafeId));
      await cashier.get('/tables').expect(200);
      await cashier.get(`/tables/${catalogA.tableId}/qr`).expect(403);
      await cashier.get('/tables/qr.pdf').expect(403);
      await cashier.post('/tables').send({ name: 'X' }).expect(403);
    });
  });
});

function binaryParser(
  response: request.Response,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  // At this point supertest hands over the raw response stream.
  const res = response as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
