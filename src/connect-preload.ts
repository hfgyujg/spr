import express from 'express';
import { createConnectRouter } from './routes/connect.ts';
import { createPublicConnectRouter } from './routes/public-connect.ts';
import { createMspDigitalTrustRouter } from './routes/msp-digital-trust.ts';
import { productionHardeningMiddleware } from './middleware/production-hardening.ts';

const originalUse = express.application.use;
let mounted = false;
let hardened = false;

express.application.use = function patchedUse(this: any, ...args: any[]) {
  const result = originalUse.apply(this, args as any);

  if (!hardened) {
    hardened = true;
    // Install immediately after the first application middleware. This preload runs
    // before server.ts registers API routes, so the defense applies to every route.
    originalUse.call(this, productionHardeningMiddleware);
  }

  const path = typeof args[0] === 'string' ? args[0] : null;
  if (!mounted && path === '/api') {
    const candidate = args[1];
    const looksLikeRouter = typeof candidate === 'function' && candidate.stack;
    if (looksLikeRouter) {
      mounted = true;
      this.use('/api/msp', createMspDigitalTrustRouter());
      this.use('/api', createPublicConnectRouter());
      this.use('/api', createConnectRouter());
    }
  }
  return result;
};
