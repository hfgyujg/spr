import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('configuration validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = '';
    process.env.SKIP_DOTENV = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  const setProductionSecurityDefaults = () => {
    process.env.APP_ALLOWED_ORIGINS = 'https://example.com';
    process.env.ENFORCE_HTTPS = 'true';
    process.env.TRUST_PROXY = 'true';
    process.env.SQL_SSL = 'true';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/test-service-account.json';
  };

  const setProductionDatabase = () => {
    process.env.SQL_HOST = 'localhost';
    process.env.SQL_USER = 'postgres';
    process.env.SQL_PASSWORD = 'postgres';
    process.env.SQL_DB_NAME = 'testdb';
  };

  it('parses development configuration and applies defaults', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://localhost:3000';
    setProductionDatabase();
    process.env.GEMINI_API_KEY = 'test-key';

    const { config, validateConfiguration } = await import('../src/config.ts');

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.appUrl).toBe('http://localhost:3000');
    expect(config.database.isConfigured).toBe(true);
    expect(config.gemini.apiKey).toBe('test-key');
    expect(config.redis.url).toBeUndefined();
    expect(() => validateConfiguration()).not.toThrow();
  });

  it('fails validation in production when APP_URL is missing', async () => {
    process.env.NODE_ENV = 'production';
    setProductionSecurityDefaults();
    setProductionDatabase();
    const { validateConfiguration } = await import('../src/config.ts');

    expect(() => validateConfiguration()).toThrow(/APP_URL/);
  });

  it('uses the Railway public domain when APP_URL is blank', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = '   ';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'spr-app-production.up.railway.app';
    setProductionSecurityDefaults();
    setProductionDatabase();
    process.env.APP_ALLOWED_ORIGINS = 'https://spr-app-production.up.railway.app';

    const { config, validateConfiguration } = await import('../src/config.ts');

    expect(config.appUrl).toBe('https://spr-app-production.up.railway.app');
    expect(() => validateConfiguration()).not.toThrow();
  });

  it('uses the Railway public domain when APP_URL is malformed', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'not-a-valid-url';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'spr-app-production.up.railway.app';
    setProductionSecurityDefaults();
    setProductionDatabase();
    process.env.APP_ALLOWED_ORIGINS = 'https://spr-app-production.up.railway.app';

    const { config, validateConfiguration } = await import('../src/config.ts');

    expect(config.appUrl).toBe('https://spr-app-production.up.railway.app');
    expect(() => validateConfiguration()).not.toThrow();
  });

  it('fails validation in production when database configuration is incomplete', async () => {
    process.env.NODE_ENV = 'production';
    setProductionSecurityDefaults();
    process.env.APP_URL = 'https://example.com';
    process.env.SQL_HOST = 'localhost';
    delete process.env.SQL_USER;
    delete process.env.SQL_PASSWORD;
    delete process.env.SQL_DB_NAME;
    const { validateConfiguration } = await import('../src/config.ts');

    expect(() => validateConfiguration()).toThrow(/DATABASE_URL or SQL_HOST\/SQL_USER\/SQL_PASSWORD\/SQL_DB_NAME/);
  });

  it('treats an invalid optional APP_URL as absent instead of crashing config parsing', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'not-a-url';

    const { config, validateConfiguration } = await import('../src/config.ts');

    expect(config.appUrl).toBeUndefined();
    expect(() => validateConfiguration()).not.toThrow();
  });

  it('does not require optional feature settings for production validation', async () => {
    process.env.NODE_ENV = 'production';
    setProductionSecurityDefaults();
    setProductionDatabase();
    process.env.APP_URL = 'https://example.com';

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { validateConfiguration } = await import('../src/config.ts');

    expect(() => validateConfiguration()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
