import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/common/enums.js';
import { TenantRepository } from '../src/common/tenancy/tenant-repository.js';
import { Category } from '../src/database/entities/index.js';
import {
  API,
  createTestApp,
  loginAs,
  registerCafe,
  resetDatabase,
  type RegisteredCafe,
} from './utils.js';

describe('Multi-tenancy (e2e)', () => {
  let app: INestApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;
  let categoryA: Category;
  let categoryB: Category;

  const http = () => request(app.getHttpServer());
  const asCafe = (cafe: RegisteredCafe, path: string) =>
    http().get(`${API}${path}`).set('Authorization', `Bearer ${cafe.token}`);
  const categories = () => app.get(DataSource).getRepository(Category);
  const tenant = () => new TenantRepository(categories());

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
    categoryA = await tenant()
      .forCafe(cafeA.cafeId)
      .create({ name: 'Category of A' });
    categoryB = await tenant()
      .forCafe(cafeB.cafeId)
      .create({ name: 'Category of B' });
  });
  afterAll(() => app.close());

  describe('over HTTP', () => {
    it('lists only the categories of the signed-in cafe', async () => {
      const { body } = await asCafe(cafeA, '/categories').expect(200);
      expect(body.map((c: Category) => c.id)).toEqual([categoryA.id]);
    });

    it('can read its own category by id', async () => {
      const { body } = await asCafe(
        cafeA,
        `/categories/${categoryA.id}`,
      ).expect(200);
      expect(body.name).toBe('Category of A');
    });

    it("answers 404 for another cafe's category, exactly as for a missing one", async () => {
      const other = await asCafe(cafeA, `/categories/${categoryB.id}`).expect(
        404,
      );
      const missing = await asCafe(
        cafeA,
        '/categories/00000000-0000-4000-8000-000000000000',
      ).expect(404);
      expect(other.body.message).toBe(missing.body.message);
      expect(JSON.stringify(other.body)).not.toContain('Category of B');
    });

    it('ignores a cafeId in the query string', async () => {
      const { body } = await asCafe(
        cafeA,
        `/categories?cafeId=${cafeB.cafeId}`,
      ).expect(200);
      expect(body.map((c: Category) => c.id)).toEqual([categoryA.id]);
    });

    it('takes the current cafe from the token', async () => {
      const a = await asCafe(cafeA, '/cafes/current').expect(200);
      const b = await asCafe(cafeB, '/cafes/current').expect(200);
      expect(a.body.id).toBe(cafeA.cafeId);
      expect(b.body.id).toBe(cafeB.cafeId);
    });

    it('requires a token', async () => {
      await http().get(`${API}/categories`).expect(401);
      await http().get(`${API}/cafes/current`).expect(401);
    });
  });

  describe('roles', () => {
    it('lets a cashier of the cafe in', async () => {
      const token = await loginAs(app, Role.CASHIER, cafeA.cafeId);
      const { body } = await http()
        .get(`${API}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(body.map((c: Category) => c.id)).toEqual([categoryA.id]);
    });

    it('keeps a cook out of a route not meant for the kitchen', async () => {
      const token = await loginAs(app, Role.COOK, cafeA.cafeId);
      await http()
        .get(`${API}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('refuses cafe-scoped routes to a super admin, who has no cafe', async () => {
      const token = await loginAs(app, 'SUPER_ADMIN', null);
      await http()
        .get(`${API}/cafes/current`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // The write endpoints arrive in Phase 2; these prove the layer they will be built on.
  describe('in the data layer', () => {
    it("cannot update another cafe's row", async () => {
      const result = await tenant()
        .forCafe(cafeA.cafeId)
        .update({ id: categoryB.id }, { name: 'Hacked' });
      expect(result.affected).toBe(0);
      const row = await categories().findOneByOrFail({ id: categoryB.id });
      expect(row.name).toBe('Category of B');
    });

    it("cannot delete another cafe's row", async () => {
      const result = await tenant()
        .forCafe(cafeA.cafeId)
        .delete({ id: categoryB.id });
      expect(result.affected).toBe(0);
      expect(await categories().existsBy({ id: categoryB.id })).toBe(true);
    });

    it('cannot move its own row into another cafe', async () => {
      await tenant()
        .forCafe(cafeA.cafeId)
        .update(
          { id: categoryA.id },
          { name: 'Renamed', cafeId: cafeB.cafeId },
        );
      const row = await categories().findOneByOrFail({ id: categoryA.id });
      expect(row.name).toBe('Renamed');
      expect(row.cafeId).toBe(cafeA.cafeId);
    });

    it('cannot create a row in another cafe', async () => {
      const row = await tenant()
        .forCafe(cafeA.cafeId)
        .create({ name: 'Sneaky', cafeId: cafeB.cafeId });
      expect(row.cafeId).toBe(cafeA.cafeId);
    });
  });
});
