# @sprtrust/sdk

Server-side SDK for connecting an existing application to SPR Connect.

## Install from the repository

```bash
npm install github:hfgyujg/spr#feature/spr-connect-infrastructure --save
```

For production npm publishing, the package can be published from `packages/sdk` once the public package name is finalized.

## Server-side usage

Never expose an SPR Connect API key in browser code.

```js
import { SPRClient } from '@sprtrust/sdk';

const spr = new SPRClient({
  baseUrl: process.env.SPR_BASE_URL,
  apiKey: process.env.SPR_API_KEY
});

const software = await spr.software.register({
  name: 'My Application',
  version: '2.4.1',
  repository: 'https://github.com/example/app'
});

const trust = await spr.passports.trust(software.passportId);
```

## Browser-safe public access

```js
import { SPRPublicClient } from '@sprtrust/sdk';

const spr = new SPRPublicClient({ baseUrl: 'https://your-spr-host.example' });
const passport = await spr.getPassport('spr-...');
```

## Embeddable badge

```html
<script src="https://your-spr-host.example/spr-connect.js" defer></script>
<div data-spr-passport="spr-..."></div>
```

The badge uses an iframe-backed public endpoint, so the embedding site does not need to expose an API key or configure client-side CORS for the badge itself.
