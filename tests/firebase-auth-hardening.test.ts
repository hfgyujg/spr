import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..');
const apiClient = readFileSync(path.join(root, 'src/utils/apiClient.ts'), 'utf8');
const loginView = readFileSync(path.join(root, 'src/components/LoginView.tsx'), 'utf8');
const firebaseAdmin = readFileSync(path.join(root, 'src/lib/firebase-admin.ts'), 'utf8');
const security = readFileSync(path.join(root, 'src/middleware/security.ts'), 'utf8');


describe('Firebase authentication hardening guards', () => {
  it('uses forced token refresh when tenant/RBAC claims were just synchronized', () => {
    expect(apiClient).toContain("getIdToken(true)");
    expect(apiClient).toContain("TOKEN_CLAIMS_REFRESH_REQUIRED");
    expect(apiClient).toMatch(/return await fetch\(input, \{\s*\.\.\.init,/s);
  });

  it('does not pass the raw Firebase ID token through LoginView success state', () => {
    expect(loginView).not.toMatch(/onLoginSuccess\(\{[\s\S]*?token,/m);
    expect(loginView).toContain('await user.getIdToken(true)');
  });

  it('fails closed when production Firebase Admin credentials are unavailable or invalid', () => {
    expect(firebaseAdmin).toMatch(/if \(config\.isProduction\)\s*throw new Error\('Firebase Admin credentials are required in production\.'\);/);
    expect(firebaseAdmin).toContain("Invalid FIREBASE_SERVICE_ACCOUNT_KEY configuration.");
  });

  it('does not expose raw Firebase verification errors to API clients', () => {
    expect(security).not.toContain("message: err?.message || 'Token verification failed'");
    expect(security).toContain("error: 'Unauthorized: Invalid or expired security token'");
  });

  it('keeps workspace access behind explicit email verification except limited verification endpoints', () => {
    expect(security).toContain("code: 'EMAIL_NOT_VERIFIED'");
    expect(security).toContain("req.path === '/api/user/me'");
    expect(security).toContain("req.path === '/api/auth/resend-verification'");
    expect(security).toContain("req.path === '/api/auth/verify-status'");
  });
});
