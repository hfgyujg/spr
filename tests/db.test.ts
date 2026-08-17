import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('database configuration and pool creation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = '';
    process.env.SKIP_DOTENV = 'true';
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('marks database misconfigured when required SQL environment variables are missing', async () => {
    delete process.env.SQL_HOST;
    delete process.env.SQL_USER;
    delete process.env.SQL_PASSWORD;
    delete process.env.SQL_DB_NAME;

    const { isDatabaseConfigured } = await import('../src/db/index.ts');
    expect(isDatabaseConfigured).toBe(false);
  });

  it('creates a pool with configured query timeout and pool size values', async () => {
    process.env.SQL_HOST = 'localhost';
    process.env.SQL_USER = 'postgres';
    process.env.SQL_PASSWORD = 'postgres';
    process.env.SQL_DB_NAME = 'testdb';
    process.env.SQL_POOL_MAX = '5';
    process.env.SQL_QUERY_TIMEOUT_MS = '2500';

    const { createPool, isDatabaseConfigured } = await import('../src/db/index.ts');
    expect(isDatabaseConfigured).toBe(true);

    const pool = createPool();
    expect(pool.options.max).toBe(5);
    expect(pool.options.query_timeout).toBe(2500);
    await pool.end();
  });
});
