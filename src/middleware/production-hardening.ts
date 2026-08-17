import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Defense-in-depth middleware loaded before application routes.
 * It does not replace authentication, authorization, CORS, Helmet, or rate limiting.
 */
export function productionHardeningMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);

  // Never cache authenticated/API responses or error responses at intermediary/browser layers.
  if (req.path.startsWith('/api') || req.headers.authorization) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  }

  // Additional defense-in-depth headers not dependent on application route behavior.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Reject malformed/ambiguous HTTP methods before they reach application routes.
  const method = req.method.toUpperCase();
  const allowed = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
  if (!allowed.has(method)) {
    res.setHeader('Allow', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed', requestId });
  }

  // Reject obviously malformed authorization headers rather than letting downstream
  // middleware interpret ambiguous input.
  const authorization = req.headers.authorization;
  if (authorization && !/^Bearer\s+[^\s]+$/.test(authorization)) {
    return res.status(400).json({ error: 'Malformed Authorization header', requestId });
  }

  return next();
}
