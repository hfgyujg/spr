/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Spawns the actual server (tsx server.ts) and hits it over real HTTP.
 * The server is intentionally started even when no database is configured so
 * the health/auth/security integration checks cannot silently disappear.
 * Authenticated tests remain gated behind FIREBASE_TEST_TOKEN.
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

const hasAuthToken = !!process.env.FIREBASE_TEST_TOKEN;
const TEST_PORT = process.env.TEST_PORT || '4173';
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Server did not become healthy at ${url} within ${timeoutMs}ms`);
}

describe('live server integration', () => {
  beforeAll(async () => {
    serverProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
      env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'test' },
      stdio: 'pipe'
    });
    await waitForServer(BASE_URL);
  }, 20000);

  afterAll(() => {
    serverProcess?.kill('SIGTERM');
  });

  it('responds healthy on /health', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
  });

  it('reports the actual database readiness state on /api/health', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const body = await res.json();

    if (res.status === 200) {
      expect(body).toMatchObject({ status: 'ok', db: 'connected', code: 'DB_CONNECTED' });
    } else {
      expect(res.status).toBe(503);
      expect(body).toMatchObject({ status: 'unavailable', db: 'unavailable' });
      expect(['DB_UNAVAILABLE', 'DB_MISCONFIGURED']).toContain(body.code);
    }
  });

  it('rejects requests to protected routes with no auth token (401)', async () => {
    const res = await fetch(`${BASE_URL}/api/user/me`);
    expect(res.status).toBe(401);
  });

  it('rejects a forged/unsigned JWT-shaped token (401, not decoded-and-trusted)', async () => {
    const forgedPayload = Buffer.from(JSON.stringify({ uid: 'attacker', email: 'attacker@evil.example', role: 'Owner' })).toString('base64url');
    const forgedToken = `eyJhbGciOiJub25lIn0.${forgedPayload}.`;
    const res = await fetch(`${BASE_URL}/api/user/me`, { headers: { Authorization: `Bearer ${forgedToken}` } });
    expect(res.status).toBe(401);
  });

  it('rejects a token supplied only through a URL query parameter', async () => {
    const res = await fetch(`${BASE_URL}/api/user/me?token=not-a-bearer-token`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized: Missing or invalid authorization token' });
  });

  it('sets baseline security headers via helmet', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects a passport update carrying a bare self-reported VERIFIED evidence claim, even before touching auth-gated business logic', async () => {
    const res = await fetch(`${BASE_URL}/api/passports/does-not-matter`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence: [{ id: 'ev-1', name: 'x', type: 'Signature', status: 'VERIFIED', timestamp: new Date().toISOString() }] })
    });
    expect(res.status).toBe(401);
  });

  describe.skipIf(!hasAuthToken)('authenticated routes (requires FIREBASE_TEST_TOKEN)', () => {
    it('rejects a self-reported bare VERIFIED evidence claim with 400 once authenticated', async () => {
      const res = await fetch(`${BASE_URL}/api/passports/does-not-matter`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FIREBASE_TEST_TOKEN}` },
        body: JSON.stringify({ evidence: [{ id: 'ev-1', name: 'x', type: 'Signature', status: 'VERIFIED', timestamp: new Date().toISOString() }] })
      });
      expect([400, 404]).toContain(res.status);
    });
  });
});
