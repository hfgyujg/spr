import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DATABASE_URL regression tests', () => {
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

  it('parses DATABASE_URL correctly and marks database configured', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/testdb';

    const { config } = await import('../src/config.ts');

    expect(config.database.connectionString).toBe('postgres://user:password@localhost:5432/testdb');
    expect(config.database.isConfigured).toBe(true);
  });

  it('falls back to SQL_* settings when DATABASE_URL is absent', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.SQL_HOST = 'localhost';
    process.env.SQL_USER = 'postgres';
    process.env.SQL_PASSWORD = 'postgres';
    process.env.SQL_DB_NAME = 'testdb';

    const { config } = await import('../src/config.ts');

    expect(config.database.connectionString).toBeUndefined();
    expect(config.database.host).toBe('localhost');
    expect(config.database.user).toBe('postgres');
    expect(config.database.password).toBe('postgres');
    expect(config.database.name).toBe('testdb');
    expect(config.database.isConfigured).toBe(true);
  });

  it('prefers DATABASE_URL when both it and SQL_* settings are present', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgres://other:secret@127.0.0.1:5432/otherdb';
    process.env.SQL_HOST = 'localhost';
    process.env.SQL_USER = 'postgres';
    process.env.SQL_PASSWORD = 'postgres';
    process.env.SQL_DB_NAME = 'testdb';

    const { config } = await import('../src/config.ts');

    expect(config.database.connectionString).toBe('postgres://other:secret@127.0.0.1:5432/otherdb');
    expect(config.database.host).toBe('localhost');
    expect(config.database.name).toBe('testdb');
    expect(config.database.isConfigured).toBe(true);
  });

  it('createPool uses DATABASE_URL when provided', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/testdb';

    const { createPool } = await import('../src/db/index.ts');

    const pool = createPool();
    expect((pool as any).options.connectionString).toBe('postgres://user:password@localhost:5432/testdb');
    await pool.end();
  });

  it('createPool still supports SQL_* fallback when DATABASE_URL is absent', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.SQL_HOST = 'localhost';
    process.env.SQL_USER = 'postgres';
    process.env.SQL_PASSWORD = 'postgres';
    process.env.SQL_DB_NAME = 'testdb';

    const { createPool } = await import('../src/db/index.ts');

    const pool = createPool();
    expect((pool as any).options.host).toBe('localhost');
    expect((pool as any).options.user).toBe('postgres');
    expect((pool as any).options.database).toBe('testdb');
    await pool.end();
  });
});
