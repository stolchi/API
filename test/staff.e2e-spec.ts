import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '../src/common/enums.js';
import {
  API,
  PASSWORD,
  createTestApp,
  loginAs,
  nextPhone,
  refreshCookieOf,
  registerCafe,
  resetDatabase,
  type RegisteredCafe,
} from './utils.js';

interface RoleRow {
  id: string;
  name: string;
  systemKey: string | null;
  permissions: string[];
  staffCount: number;
}

describe('Staff and roles', () => {
  let app: INestApplication;
  let cafeA: RegisteredCafe;
  let cafeB: RegisteredCafe;

  const call = (
    token: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`${API}${path}`)
      .set('Authorization', `Bearer ${token}`);

  const rolesOf = async (token: string): Promise<RoleRow[]> =>
    (await call(token, 'get', '/staff/roles').expect(200)).body;
  const roleOf = async (token: string, key: string) => {
    const role = (await rolesOf(token)).find((r) => r.systemKey === key);
    if (!role) throw new Error(`No ${key} role`);
    return role;
  };
  const login = async (phone: string) =>
    request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ phone, password: PASSWORD });

  /** Creates a member through the API and signs them in. */
  const hire = async (roleId: string, token = cafeA.token) => {
    const phone = nextPhone();
    const { body } = await call(token, 'post', '/staff')
      .send({ name: 'Ali', phone, password: PASSWORD, roleId })
      .expect(201);
    const session = await login(phone);
    expect(session.status).toBe(200);
    return { id: body.id as string, phone, token: session.body.accessToken };
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    cafeA = await registerCafe(app, 'Cafe A');
    cafeB = await registerCafe(app, 'Cafe B');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('default roles', () => {
    it('come with every new cafe', async () => {
      const roles = await rolesOf(cafeA.token);
      expect(roles.map((role) => role.systemKey).sort()).toEqual(
        ['CASHIER', 'COOK', 'OWNER', 'WAITER'].sort(),
      );
    });

    it('give a waiter orders only', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      expect([...waiter.permissions].sort()).toEqual(
        ['ORDERS_CANCEL', 'ORDERS_CREATE', 'ORDERS_EDIT', 'ORDERS_VIEW'].sort(),
      );
    });

    it('cannot be renamed or deleted, and the owner cannot be edited', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const owner = await roleOf(cafeA.token, 'OWNER');
      await call(cafeA.token, 'patch', `/staff/roles/${waiter.id}`)
        .send({ name: 'Boshqa' })
        .expect(409);
      await call(cafeA.token, 'delete', `/staff/roles/${waiter.id}`).expect(
        409,
      );
      await call(cafeA.token, 'patch', `/staff/roles/${owner.id}`)
        .send({ permissions: [] })
        .expect(409);
    });

    it('can have their permissions changed by the owner', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const { body } = await call(
        cafeA.token,
        'patch',
        `/staff/roles/${waiter.id}`,
      )
        .send({ permissions: ['ORDERS_VIEW', 'ORDERS_SERVE'] })
        .expect(200);
      expect(body.permissions).toEqual(['ORDERS_VIEW', 'ORDERS_SERVE']);
    });
  });

  describe('custom roles', () => {
    it('decide what a member can do', async () => {
      const { body: role } = await call(cafeA.token, 'post', '/staff/roles')
        .send({ name: 'Menyu boshqaruvchi', permissions: ['MENU_MANAGE'] })
        .expect(201);
      const member = await hire(role.id);

      await call(member.token, 'post', '/categories')
        .send({ name: 'Yangi' })
        .expect(201);
      await call(member.token, 'get', '/orders').expect(403);
      await call(member.token, 'get', '/staff').expect(403);
    });

    it('add seeing orders to any work with orders', async () => {
      const { body } = await call(cafeA.token, 'post', '/staff/roles')
        .send({ name: 'Qabul', permissions: ['ORDERS_CREATE'] })
        .expect(201);
      expect(body.permissions).toContain('ORDERS_VIEW');
    });

    it('apply a permission change at once, without a new token', async () => {
      const { body: role } = await call(cafeA.token, 'post', '/staff/roles')
        .send({ name: 'Vaqtincha', permissions: ['MENU_MANAGE'] })
        .expect(201);
      const member = await hire(role.id);
      await call(member.token, 'get', '/categories').expect(200);

      await call(cafeA.token, 'patch', `/staff/roles/${role.id}`)
        .send({ permissions: [] })
        .expect(200);
      await call(member.token, 'get', '/categories').expect(403);
    });

    it('refuse a duplicate name and an unknown permission', async () => {
      const create = (name: string, permissions: string[]) =>
        call(cafeA.token, 'post', '/staff/roles').send({ name, permissions });
      await create('Bir xil', []).expect(201);
      await create('Bir xil', []).expect(409);
      await create('Boshqa', ['EVERYTHING']).expect(400);
    });

    it('can be deleted only without staff', async () => {
      const { body: role } = await call(cafeA.token, 'post', '/staff/roles')
        .send({ name: 'Tez orada', permissions: [] })
        .expect(201);
      const member = await hire(role.id);
      const path = `/staff/roles/${role.id}`;
      await call(cafeA.token, 'delete', path).expect(409);

      const waiter = await roleOf(cafeA.token, 'WAITER');
      await call(cafeA.token, 'patch', `/staff/${member.id}`)
        .send({ roleId: waiter.id })
        .expect(200);
      await call(cafeA.token, 'delete', path).expect(204);
    });
  });

  describe('members', () => {
    it('sign in with what the owner gave them', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const member = await hire(waiter.id);
      const { body } = await call(member.token, 'get', '/auth/me').expect(200);
      expect(body.cafeId).toBe(cafeA.cafeId);
      expect(body.role.systemKey).toBe('WAITER');
      expect(body.permissions).toEqual(waiter.permissions);
    });

    it('never expose a password', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      await hire(waiter.id);
      const { body } = await call(cafeA.token, 'get', '/staff').expect(200);
      expect(JSON.stringify(body)).not.toMatch(/password/i);
    });

    it('cannot take a phone that is in use', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      await call(cafeA.token, 'post', '/staff')
        .send({
          name: 'Ali',
          phone: cafeB.phone,
          password: PASSWORD,
          roleId: waiter.id,
        })
        .expect(409);
    });

    it('stop working the moment they are deactivated', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const phone = nextPhone();
      const { body: member } = await call(cafeA.token, 'post', '/staff')
        .send({ name: 'Ali', phone, password: PASSWORD, roleId: waiter.id })
        .expect(201);
      const session = await login(phone);
      const token = session.body.accessToken;
      await call(token, 'get', '/orders').expect(200);

      await call(cafeA.token, 'patch', `/staff/${member.id}`)
        .send({ isActive: false })
        .expect(200);
      await call(token, 'get', '/orders').expect(401);
      expect((await login(phone)).status).toBe(401);
      await request(app.getHttpServer())
        .post(`${API}/auth/refresh`)
        .set('Cookie', refreshCookieOf(session).split(';')[0])
        .expect(401);

      await call(cafeA.token, 'patch', `/staff/${member.id}`)
        .send({ isActive: true })
        .expect(200);
      expect((await login(phone)).status).toBe(200);
    });

    it('lose old sessions when their password is reset', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const phone = nextPhone();
      const { body: member } = await call(cafeA.token, 'post', '/staff')
        .send({ name: 'Ali', phone, password: PASSWORD, roleId: waiter.id })
        .expect(201);
      const session = await login(phone);

      await call(cafeA.token, 'patch', `/staff/${member.id}`)
        .send({ password: 'a-whole-new-password' })
        .expect(200);
      expect((await login(phone)).status).toBe(401);
      await request(app.getHttpServer())
        .post(`${API}/auth/refresh`)
        .set('Cookie', refreshCookieOf(session).split(';')[0])
        .expect(401);
    });
  });

  describe('the owner', () => {
    it('cannot deactivate or demote themselves', async () => {
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const path = `/staff/${cafeA.userId}`;
      await call(cafeA.token, 'patch', path)
        .send({ isActive: false })
        .expect(409);
      await call(cafeA.token, 'patch', path)
        .send({ roleId: waiter.id })
        .expect(409);
    });

    it('can be replaced, but a cafe always keeps one', async () => {
      const owner = await roleOf(cafeA.token, 'OWNER');
      const waiter = await roleOf(cafeA.token, 'WAITER');
      const second = await hire(owner.id);

      // The second owner demotes the first: allowed, as they themselves remain.
      await call(second.token, 'patch', `/staff/${cafeA.userId}`)
        .send({ roleId: waiter.id })
        .expect(200);
      await call(cafeA.token, 'get', '/staff').expect(403);
    });

    it('is never left out, even by someone with every permission', async () => {
      const { permissions } = await roleOf(cafeA.token, 'OWNER');
      const { body: role } = await call(cafeA.token, 'post', '/staff/roles')
        .send({ name: 'Hammasi', permissions })
        .expect(201);
      const deputy = await hire(role.id);
      await call(deputy.token, 'patch', `/staff/${cafeA.userId}`)
        .send({ isActive: false })
        .expect(409);
    });
  });

  describe('someone allowed to manage staff', () => {
    const managerWith = async (permissions: string[]) => {
      const { body: role } = await call(cafeA.token, 'post', '/staff/roles')
        .send({ name: 'Menejer', permissions })
        .expect(201);
      return hire(role.id);
    };

    it('manages staff within their own permissions', async () => {
      const manager = await managerWith(['STAFF_MANAGE', 'KITCHEN_WORK']);
      const cook = await roleOf(cafeA.token, 'COOK');
      await hire(cook.id, manager.token);
    });

    it('cannot hand out a role above their own', async () => {
      const manager = await managerWith(['STAFF_MANAGE']);
      const owner = await roleOf(cafeA.token, 'OWNER');
      await call(manager.token, 'post', '/staff')
        .send({
          name: 'Dost',
          phone: nextPhone(),
          password: PASSWORD,
          roleId: owner.id,
        })
        .expect(403);
    });

    it('cannot raise their own role or create a stronger one', async () => {
      const manager = await managerWith(['STAFF_MANAGE']);
      const { body: me } = await call(manager.token, 'get', '/auth/me');
      await call(manager.token, 'patch', `/staff/roles/${me.role.id}`)
        .send({ permissions: ['STAFF_MANAGE', 'ORDERS_PAYMENT'] })
        .expect(403);
      await call(manager.token, 'post', '/staff/roles')
        .send({ name: 'Kuchli', permissions: ['ORDERS_PAYMENT'] })
        .expect(403);
    });

    it('cannot touch someone above them', async () => {
      const manager = await managerWith(['STAFF_MANAGE']);
      await call(manager.token, 'patch', `/staff/${cafeA.userId}`)
        .send({ password: 'taking-over-the-cafe' })
        .expect(403);
      await call(manager.token, 'patch', `/staff/${cafeA.userId}`)
        .send({ isActive: false })
        .expect(403);
    });
  });

  describe('between cafes', () => {
    it("cannot see another cafe's staff or roles", async () => {
      const { body } = await call(cafeB.token, 'get', '/staff').expect(200);
      expect(body.map((user: { id: string }) => user.id)).toEqual([
        cafeB.userId,
      ]);
      const ids = (await rolesOf(cafeB.token)).map((role) => role.id);
      const waiterA = await roleOf(cafeA.token, 'WAITER');
      expect(ids).not.toContain(waiterA.id);
    });

    it("cannot change another cafe's staff or roles", async () => {
      const waiterA = await roleOf(cafeA.token, 'WAITER');
      const member = await hire(waiterA.id);
      await call(cafeB.token, 'patch', `/staff/${member.id}`)
        .send({ isActive: false })
        .expect(404);
      await call(cafeB.token, 'patch', `/staff/roles/${waiterA.id}`)
        .send({ permissions: [] })
        .expect(404);
      await call(cafeB.token, 'delete', `/staff/roles/${waiterA.id}`).expect(
        404,
      );
    });

    it('cannot give someone a role of another cafe', async () => {
      const waiterA = await roleOf(cafeA.token, 'WAITER');
      await call(cafeB.token, 'post', '/staff')
        .send({
          name: 'Ali',
          phone: nextPhone(),
          password: PASSWORD,
          roleId: waiterA.id,
        })
        .expect(400);
    });
  });

  it('keeps roles without staff access away, cook included', async () => {
    const cook = await loginAs(app, Role.COOK, cafeA.cafeId);
    await call(cook, 'get', '/staff').expect(403);
    await call(cook, 'get', '/staff/roles').expect(403);
  });
});
