import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('auth storage hardening', () => {
  it('does not allow Firebase bearer tokens to remain in persisted msp_user state', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/utils/auth-storage-hardening.ts'), 'utf8');
    expect(source).toContain("delete parsed.token");
    expect(source).toContain("delete parsed.idToken");
    expect(source).toContain("delete parsed.accessToken");
    expect(source).toContain("delete parsed.refreshToken");
    expect(source).toContain("const SESSION_KEY = 'msp_user'");
  });
});
