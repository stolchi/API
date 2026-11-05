import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, createTestApp } from './utils.js';

describe('Global setup (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('serves health under the /api/v1 prefix only', async () => {
    await request(app.getHttpServer())
      .get(`${API}/health`)
      .expect(200, { status: 'ok' });
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('serves Swagger at /api/docs and documents the auth routes', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    const { body } = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        `${API}/auth/register`,
        `${API}/auth/login`,
        `${API}/auth/refresh`,
        `${API}/auth/logout`,
        `${API}/auth/me`,
      ]),
    );
  });

  it('uses one error format for validation errors', async () => {
    const { body } = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ phone: 'nope', password: 'x', extra: true })
      .expect(400);
    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: `${API}/auth/login`,
    });
    expect(body.message).toEqual(
      expect.arrayContaining(['property extra should not exist']),
    );
    expect(typeof body.timestamp).toBe('string');
  });

  it('uses the same format for unknown routes', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`${API}/nope`)
      .expect(404);
    expect(body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('allows configured frontends through CORS and no one else', async () => {
    const allowed = await request(app.getHttpServer())
      .get(`${API}/health`)
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .get(`${API}/health`)
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
