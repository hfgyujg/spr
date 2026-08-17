# SPR Production Security Hardening Baseline

## Edge / Vercel

The production frontend is hardened with:

- HSTS with subdomains and preload
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- strict-origin-when-cross-origin referrer policy
- restrictive Permissions Policy
- Cross-Origin Opener/Resource Policy
- `X-Permitted-Cross-Domain-Policies: none`
- `Cache-Control: no-store` for `/api/*`
- immutable long-lived caching for fingerprinted `/assets/*`

## Application configuration

Production startup validation requires the application URL, explicit allowed origins, HTTPS enforcement, trusted proxy configuration, database configuration with TLS, Redis, and Firebase Admin credentials.

## Authentication / tenancy

SPR uses Firebase ID-token verification, email-verification enforcement for workspace resources, tenant-aware request identity, and role-aware authorization middleware.

## Rate limiting

Production rate limiting is designed around a shared Redis store and fails closed when the shared store cannot safely enforce the global limit.

## Evidence integrity

Trust observations and evidence are designed around persisted evidence, hashes, deterministic scoring, and audit history. The UI must not present unobserved claims as verified facts.

## Release gate

Before production release:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. Verify Vercel deployment is Ready
5. Verify `/health` and authenticated API paths
6. Verify no production secrets are committed to Git
7. Verify Firebase, database TLS, Redis, and required production environment variables are present
