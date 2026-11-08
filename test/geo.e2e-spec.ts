import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Role } from '../src/common/enums.js';
import { Nominatim } from '../src/geo/nominatim.js';
import type { FakeNominatim } from './fake-nominatim.js';
import {
  API,
  createTestApp,
  loginAs,
  registerCafe,
  resetDatabase,
  type RegisteredCafe,
} from './utils.js';

describe('Place search (e2e)', () => {
  let app: NestExpressApplication;
  let fake: FakeNominatim;
  let cafe: RegisteredCafe;

  const search = (token: string, query: string) =>
    request(app.getHttpServer())
      .get(`${API}/geo/search?${query}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    fake = app.get(Nominatim) as unknown as FakeNominatim;
  });
  beforeEach(async () => {
    await resetDatabase(app);
    fake.calls = [];
    cafe = await registerCafe(app, 'Cafe A');
  });
  afterAll(() => app.close());

  it('finds places near a point, and asks OpenStreetMap only once per place', async () => {
    const { body } = await search(
      cafe.token,
      `q=${encodeURIComponent("Farg'ona")}&latitude=40.38&longitude=71.78`,
    ).expect(200);
    expect(body).toEqual([
      { name: "Farg'ona, O'zbekiston", latitude: 40.38, longitude: 71.78 },
    ]);
    expect(fake.calls).toEqual([
      { query: "Farg'ona", near: { latitude: 40.38, longitude: 71.78 } },
    ]);

    await search(
      cafe.token,
      `q=${encodeURIComponent("  farg'ona ")}&latitude=40.381&longitude=71.779`,
    ).expect(200);
    expect(fake.calls).toHaveLength(1);
  });

  it('needs a few letters, and someone who takes orders', async () => {
    await search(cafe.token, 'q=ab').expect(400);
    await search(cafe.token, 'q=Chilonzor&latitude=95&longitude=69').expect(
      400,
    );
    const cook = await loginAs(app, Role.COOK, cafe.cafeId);
    await search(cook, 'q=Chilonzor').expect(403);
    await request(app.getHttpServer())
      .get(`${API}/geo/search?q=Chilonzor`)
      .expect(401);
  });
});
