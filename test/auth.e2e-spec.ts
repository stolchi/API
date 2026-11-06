import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Cafe } from '../src/database/entities/index.js';
import {
  API,
  createTestApp,
  nextPhone,
  PASSWORD,
  refreshCookieOf,
  registerCafe,
  resetDatabase,
} from './utils.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const login = (phone: string, password = PASSWORD) =>
    http().post(`${API}/auth/login`).send({ phone, password });
  const refresh = (cookie: string) =>
    http().post(`${API}/auth/refresh`).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDatabase(app));
  afterAll(() => app.close());

  describe('register', () => {
    it('creates the cafe and its owner and signs them in', async () => {
      const phone = nextPhone();
      const response = await http()
        .post(`${API}/auth/register`)
        .send({
          cafeName: "O'zbek Oshxonasi",
          ownerName: 'Aziz',
          phone,
          password: PASSWORD,
        })
        .expect(201);

      expect(response.body.user).toMatchObject({
        name: 'Aziz',
        phone,
        role: { systemKey: 'OWNER' },
      });
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      const cafe = await http()
        .get(`${API}/cafes/current`)
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
      expect(cafe.body).toMatchObject({
        id: response.body.user.cafeId,
        name: "O'zbek Oshxonasi",
        slug: 'ozbek-oshxonasi',
        currency: 'UZS',
      });
    });

    it('sets the refresh token as an httpOnly cookie on the auth path', async () => {
      const response = await http()
        .post(`${API}/auth/register`)
        .send({
          cafeName: 'Cookie Kafe',
          ownerName: 'A',
          phone: nextPhone(),
          password: PASSWORD,
        })
        .expect(201);
      const cookie = refreshCookieOf(response);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toMatch(/Max-Age=2592000/);
    });

    it('refuses a phone number that is already registered', async () => {
      const { phone } = await registerCafe(app, 'First');
      const { body } = await http()
        .post(`${API}/auth/register`)
        .send({
          cafeName: 'Second',
          ownerName: 'B',
          phone,
          password: PASSWORD,
        })
        .expect(409);
      expect(body.message).toMatch(/phone/);
      // The failed attempt must not leave an orphan cafe behind.
      expect(
        await app.get(DataSource).manager.existsBy(Cafe, { name: 'Second' }),
      ).toBe(false);
    });

    it('gives same-named cafes different slugs', async () => {
      const slugOf = async (token: string) =>
        (
          await http()
            .get(`${API}/cafes/current`)
            .set('Authorization', `Bearer ${token}`)
        ).body.slug;
      const a = await registerCafe(app, 'Same Name');
      const b = await registerCafe(app, 'Same Name');
      expect(await slugOf(a.token)).toBe('same-name');
      expect(await slugOf(b.token)).toBe('same-name-2');
    });

    it('refuses an explicit slug that is taken', async () => {
      await registerCafe(app, 'Taken');
      const { body } = await http()
        .post(`${API}/auth/register`)
        .send({
          cafeName: 'Other',
          slug: 'taken',
          ownerName: 'B',
          phone: nextPhone(),
          password: PASSWORD,
        })
        .expect(409);
      expect(body.message).toMatch(/slug/);
    });

    it('refuses a short password', async () => {
      await http()
        .post(`${API}/auth/register`)
        .send({
          cafeName: 'X',
          ownerName: 'B',
          phone: nextPhone(),
          password: 'short',
        })
        .expect(400);
    });

    it('does not let a client choose its role or cafe', async () => {
      await http()
        .post(`${API}/auth/register`)
        .send({
          cafeName: 'X',
          ownerName: 'B',
          phone: nextPhone(),
          password: PASSWORD,
          role: 'SUPER_ADMIN',
        })
        .expect(400);
    });
  });

  describe('login', () => {
    it('signs in with the right password', async () => {
      const { phone } = await registerCafe(app, 'Kafe');
      const response = await login(phone).expect(200);
      expect(response.body.user.phone).toBe(phone);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      refreshCookieOf(response);
    });

    it('gives the same answer for a wrong password and an unknown phone', async () => {
      const { phone } = await registerCafe(app, 'Kafe');
      const wrong = await login(phone, 'wrong-password').expect(401);
      const unknown = await login(nextPhone()).expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('refuses users of a deactivated cafe', async () => {
      const { phone, cafeId } = await registerCafe(app, 'Kafe');
      await app
        .get(DataSource)
        .manager.update(Cafe, { id: cafeId }, { isActive: false });
      await login(phone).expect(401);
    });
  });

  describe('me', () => {
    it('returns the signed-in user', async () => {
      const { token, userId } = await registerCafe(app, 'Kafe');
      const { body } = await http()
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(body).toMatchObject({
        id: userId,
        role: { systemKey: 'OWNER' },
      });
      expect(body.permissions).toContain('STAFF_MANAGE');
      expect(body).not.toHaveProperty('passwordHash');
    });

    it.each([
      ['no header', undefined],
      ['a garbage token', 'Bearer garbage'],
      ['the wrong scheme', 'Basic abc'],
    ])('refuses %s', async (_name, header) => {
      const req = http().get(`${API}/auth/me`);
      if (header) req.set('Authorization', header);
      await req.expect(401);
    });
  });

  describe('refresh', () => {
    it('issues a working access token and rotates the cookie', async () => {
      const { cookie } = await registerCafe(app, 'Kafe');
      const response = await refresh(cookie).expect(200);
      const next = refreshCookieOf(response).split(';')[0];
      expect(next).not.toBe(cookie);
      await http()
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('treats replay of a used token as theft and ends the login', async () => {
      const { cookie } = await registerCafe(app, 'Kafe');
      const next = refreshCookieOf(await refresh(cookie).expect(200)).split(
        ';',
      )[0];

      await refresh(cookie).expect(401);
      // The newest token of the same login is now dead too.
      await refresh(next).expect(401);
    });

    it('lets only one of two concurrent uses of a token through', async () => {
      const { cookie } = await registerCafe(app, 'Kafe');
      const results = await Promise.all([refresh(cookie), refresh(cookie)]);
      const ok = results.filter((r) => r.status === 200);
      expect(ok.length).toBeLessThanOrEqual(1);
    });

    it('refuses a missing or unknown cookie', async () => {
      await http().post(`${API}/auth/refresh`).expect(401);
      await refresh('stolchi_refresh=unknown').expect(401);
    });

    it('stops working once the cafe is deactivated', async () => {
      const { cookie, cafeId } = await registerCafe(app, 'Kafe');
      await app
        .get(DataSource)
        .manager.update(Cafe, { id: cafeId }, { isActive: false });
      await refresh(cookie).expect(401);
    });
  });

  describe('logout', () => {
    it('kills the refresh token and clears the cookie', async () => {
      const { cookie } = await registerCafe(app, 'Kafe');
      const response = await http()
        .post(`${API}/auth/logout`)
        .set('Cookie', cookie)
        .expect(204);
      expect(refreshCookieOf(response)).toMatch(/^stolchi_refresh=;/);
      await refresh(cookie).expect(401);
    });

    it('does not end other logins of the same user', async () => {
      const { cookie, phone } = await registerCafe(app, 'Kafe');
      const other = refreshCookieOf(await login(phone).expect(200)).split(
        ';',
      )[0];
      await http().post(`${API}/auth/logout`).set('Cookie', cookie).expect(204);
      await refresh(other).expect(200);
    });

    it('succeeds without a cookie', async () => {
      await http().post(`${API}/auth/logout`).expect(204);
    });
  });
});
