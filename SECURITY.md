# Security Policy

## Supported release

The `main` branch is the supported release line.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a suspected security vulnerability. Report it privately to the repository owner through GitHub's private vulnerability reporting/security advisory mechanism when available.

Include:

- affected component or URL
- reproduction steps or proof of concept
- impact and realistic attack conditions
- relevant logs, request examples, or screenshots with secrets and personal data removed

Do not include passwords, API keys, service-account JSON, private keys, webhook secrets, or other credentials in a report.

## Security expectations

SPR follows these rules:

- Secrets are server-side only and must never be committed to the repository or exposed to the browser.
- Authentication, authorization, billing, integrity, and trust decisions are enforced server-side and fail closed.
- Evidence marked verified must be backed by real server-side integrity validation.
- Security-sensitive failures must be observable and must not silently fall back to success.
- Public client configuration is not treated as a secret; server credentials are.

## Credential exposure

If a credential may have been committed or exposed, revoke/rotate it immediately at the issuing provider before investigating further. Removing a secret from the latest commit does not make an exposed credential safe.
