# SPR Connect

SPR Connect is the machine-to-machine integration layer for Software Passport Registry. It lets an existing application keep its own UI, database, authentication, and workflows while consuming SPR software identity, Passport, trust, evidence, risk, history, and webhook capabilities.

## API base

The API is mounted under `/api/v1` on the SPR service.

## Authentication

Create a key from an authenticated SPR session:

```http
POST /api/v1/api-keys
Content-Type: application/json

{"name":"my-app","scopes":["read","write","webhooks"]}
```

The response returns the secret once. Store it server-side. Send it as:

```http
Authorization: Bearer spr_live_...
```

Never put a secret API key in browser JavaScript.

## Register existing software

```http
POST /api/v1/software
Authorization: Bearer spr_live_...
Content-Type: application/json

{
  "name": "Example App",
  "version": "2.4.1",
  "publisher": "Example Inc",
  "sourceType": "repository",
  "sourceUrl": "https://github.com/example/app",
  "externalId": "example-app-prod"
}
```

SPR returns an asset ID and Passport ID. Store both IDs in the existing application's database.

## Read trust

```http
GET /api/v1/passports/{passportId}/trust
Authorization: Bearer spr_live_...
```

The response includes the current score, evidence coverage when a trust observation exists, and the observation metadata. A missing observation is represented as missing rather than fabricated verification.

## Read evidence, risks and history

```text
GET /api/v1/passports/{passportId}/evidence
GET /api/v1/passports/{passportId}/risks
GET /api/v1/passports/{passportId}/history
```

## Public embeds

Public trust widgets do not require a secret API key:

```text
GET /api/public/v1/passports/{passportId}/trust
```

For a framework-free badge, serve `packages/spr-widget/spr-widget.js` and add:

```html
<div data-spr-passport="passport_xxx" data-spr-widget="badge"></div>
<script src="https://YOUR-SPR-HOST/packages/spr-widget/spr-widget.js" data-spr-api="https://YOUR-SPR-HOST"></script>
```

For an existing application with a different public Passport URL, add `data-spr-href` to the element.

## Webhooks

Webhooks can be registered with the `webhooks` scope. Supported default events include:

- `passport.updated`
- `trust.changed`
- `risk.created`
- `risk.resolved`
- `evidence.updated`
- `verification.completed`
- `verification.expired`

Webhook signing secrets are returned once at creation and stored hashed by SPR.

## TypeScript SDK

The repository includes `packages/spr-sdk` as the source for `@sprtrust/sdk` and `packages/spr-react` for React widgets.

Example:

```ts
import { SPR } from '@sprtrust/sdk';

const spr = new SPR({
  apiKey: process.env.SPR_API_KEY!
});

const passport = await spr.passports.get('passport_xxx');
const trust = await spr.passports.trust('passport_xxx');
```

For React embeds:

```tsx
<SPRTrustBadge passportId="passport_xxx" />
```

The React badge uses the public trust endpoint and does not require a secret key.
