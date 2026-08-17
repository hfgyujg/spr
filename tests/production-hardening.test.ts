import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { productionHardeningMiddleware } from '../src/middleware/production-hardening.ts';

describe('production hardening middleware', () => {
  function createApp() {
    const app = express();
    app.use(productionHardeningMiddleware);
    app.get('/api/test', (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('adds request id and restrictive response headers', async () => {
    const response = await request(createApp()).get('/api/test');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers['cache-control']).toBe('no-store, max-age=0');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('rejects malformed authorization headers before route handling', async () => {
    const response = await request(createApp())
      .get('/api/test')
      .set('Authorization', 'Basic credentials');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Malformed Authorization header');
    expect(response.body.requestId).toBeTruthy();
  });

  it('rejects unsupported HTTP methods', async () => {
    const response = await request(createApp()).options('/api/test');
    expect(response.status).not.toBe(405);
  });
});
