# SPRK2 Production Trust Report

## Security Status

The production deployment uses runtime-managed credentials and does not require Firebase configuration files in the repository or container image.

### Current hardening

- Firebase Admin credentials are supplied through runtime configuration only.
- Firebase client configuration is supplied through `VITE_FIREBASE_*` build environment variables only.
- The Firebase config artifact previously stored in the repository has been removed.
- The Docker runtime image no longer copies Firebase configuration into the image.
- Local credential files are excluded by `.gitignore`.
- Production database credentials remain intended for Secret Manager injection rather than source control.

## Remaining Production Hardening

1. Replace the Cloud Run runtime service account's broad `roles/editor` permission with least-privilege roles.
2. Restrict Cloud SQL public exposure and prefer private connectivity where practical.
3. Ensure Firebase, Stripe, Sentry, Redis, and AI-provider credentials are configured through deployment secret management rather than source files.
4. Review Git history for previously committed secrets and rotate any credential that was ever exposed.
5. Keep security CI enabled on pushes and pull requests.

## Important Note

Firebase client API keys are not treated as server secrets, but the Firebase project configuration should still be controlled through deployment configuration and Firebase Authentication/Firestore/Storage security rules. Server-side service-account credentials must never be committed.
