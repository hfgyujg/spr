/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { adminAuth, setUserCustomClaims } from '../lib/firebase-admin.ts';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthenticatedRequest extends Request {
  user?: { id: number; uid: string; email: string; tenantId: string; role: string; emailVerified: boolean };
}

let rateLimitWindowMs = 60 * 1000;
let maxRequestsPerWindow = 100;
const isTestMode = () => process.env.NODE_ENV !== 'production';

export function setRateLimiterConfig(opts: { windowMs?: number; maxRequests?: number }) {
  if (!isTestMode()) throw new Error('setRateLimiterConfig is only available in test mode');
  if (typeof opts.windowMs === 'number') rateLimitWindowMs = opts.windowMs;
  if (typeof opts.maxRequests === 'number') maxRequestsPerWindow = opts.maxRequests;
}

interface RateLimitRecord { count: number; resetAt: number; }
interface RateLimitStore {
  incr(key: string, windowMs: number, limit: number): Promise<RateLimitRecord>;
  get?(key: string): Promise<RateLimitRecord | undefined | null>;
}

class InMemoryStore implements RateLimitStore {
  private map = new Map<string, { count: number; resetAt: number }>();
  async incr(key: string, windowMs: number) {
    const now = Date.now();
    const rec = this.map.get(key);
    if (!rec || now > rec.resetAt) {
      const next = { count: 1, resetAt: now + windowMs };
      this.map.set(key, next);
      return next;
    }
    rec.count += 1;
    return rec;
  }
  async get(key: string) { return this.map.get(key); }
}

interface AtomicRateLimitClient {
  increment(script: string, key: string, windowMs: number, limit: number): Promise<unknown>;
}

export class IORedisAtomicClient implements AtomicRateLimitClient {
  constructor(private readonly client: { eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown> }) {}
  increment(script: string, key: string, windowMs: number, limit: number) {
    return this.client.eval(script, 1, key, String(windowMs), String(limit));
  }
}

export function createAtomicRateLimitClient(provider: 'ioredis', client: any): AtomicRateLimitClient {
  if (provider === 'ioredis') {
    if (!client || typeof client.eval !== 'function') throw new Error('Invalid ioredis client; expected eval(script, numKeys, ...args)');
    return new IORedisAtomicClient(client);
  }
  throw new Error(`Unsupported rate limit provider: ${provider}`);
}

export class RedisStore implements RateLimitStore {
  private readonly lua =
    `local count = redis.call("INCR", KEYS[1])\n` +
    `local ttl = redis.call("PTTL", KEYS[1])\n` +
    `if count == 1 or ttl < 0 then\n` +
    `  redis.call("PEXPIRE", KEYS[1], ARGV[1])\n` +
    `  ttl = tonumber(ARGV[1])\n` +
    `end\n` +
    `return {count, ttl}`;

  constructor(
    private readonly atomicClient: AtomicRateLimitClient,
    private readonly rawClient?: { get?: (key: string) => Promise<unknown>; pttl?: (key: string) => Promise<unknown> },
    private readonly failOpen: boolean = false
  ) {}

  async incr(key: string, windowMs: number, limit: number) {
    const now = Date.now();
    try {
      const res = await this.atomicClient.increment(this.lua, key, windowMs, limit);
      if (!Array.isArray(res) || res.length < 2) throw new Error('Unexpected redis eval response');
      const count = Number(res[0]);
      const ttl = Number(res[1]);
      if (!Number.isFinite(count) || count < 0) throw new Error('Unexpected redis eval response');
      if (!Number.isFinite(ttl) || ttl <= 0) throw new Error('Unexpected redis eval response');
      return { count, resetAt: now + ttl };
    } catch (err) {
      if (this.failOpen) return new InMemoryStore().incr(key, windowMs);
      throw err;
    }
  }

  async get(key: string) {
    if (!this.rawClient) return undefined;
    try {
      const val = this.rawClient.get ? await this.rawClient.get(key) : null;
      if (val == null) return undefined;
      const count = Number(val);
      if (!Number.isFinite(count)) return undefined;
      let ttl = -1;
      if (typeof this.rawClient.pttl === 'function') ttl = Number(await this.rawClient.pttl(key));
      if (!Number.isFinite(ttl) || ttl < 0) ttl = 0;
      return { count, resetAt: Date.now() + ttl };
    } catch {
      return undefined;
    }
  }
}

let sharedStore: RateLimitStore = new InMemoryStore();
let hasIoredis = false;
let IORedis: any = null;
try {
  const req: any = require;
  try { IORedis = req('ioredis'); hasIoredis = true; } catch {}
} catch {}

export function createSharedRateLimitStoreFromEnv(): RateLimitStore {
  if (!config.isProduction) return new InMemoryStore();
  const redisUrl = config.redis.url;
  if (!redisUrl) throw new Error('Production requires REDIS_URL for shared rate limiting; refusing to start without it.');
  if (!hasIoredis || !IORedis) throw new Error('Production requires ioredis for shared rate limiting; refusing to start without it.');

  const client = new IORedis(redisUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    reconnectOnError: (err: Error) => { console.warn('[RateLimiter] Redis reconnect requested:', err?.message || err); return true; },
  });
  client.on?.('error', (err: Error) => console.error('[RateLimiter] Redis client error; rate limiting remains fail-closed:', err?.message || err));
  client.on?.('end', () => console.error('[RateLimiter] Redis connection ended; rate limiting remains fail-closed until Redis recovers.'));
  client.on?.('connect', () => console.info('[RateLimiter] Redis client connecting'));
  client.on?.('ready', () => console.info('[RateLimiter] Redis client ready'));
  void client.connect().catch((err: Error) => console.error('[RateLimiter] Redis startup connection failed; requests will fail closed until Redis recovers:', err?.message || err));

  return new RedisStore(createAtomicRateLimitClient('ioredis', client), client);
}

if (config.isProduction) sharedStore = createSharedRateLimitStoreFromEnv();

export function setRateLimiterStore(s: RateLimitStore) {
  if (!isTestMode()) throw new Error('setRateLimiterStore is only available in test mode');
  sharedStore = s;
}

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const tenantId = (req as AuthenticatedRequest).user?.tenantId;
  const key = tenantId ? `rl:tenant:${tenantId}:ip:${ip}` : `rl:ip:${ip}`;
  try {
    const counter = await sharedStore.incr(key, rateLimitWindowMs, maxRequestsPerWindow);
    if (!counter || !Number.isFinite(counter.count) || !Number.isFinite(counter.resetAt)) throw new Error('Malformed shared store response');
    const remaining = Math.max(0, maxRequestsPerWindow - counter.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequestsPerWindow));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(counter.resetAt / 1000)));
    if (counter.count > maxRequestsPerWindow) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((counter.resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Too Many Requests' });
    }
    return next();
  } catch (err) {
    const requestId = randomUUID();
    console.error('[RateLimiter] Shared store error:', requestId, err instanceof Error ? err.message : 'unknown');
    return res.status(503).json({ error: { code: 'RATE_LIMIT_STORE_UNAVAILABLE', message: 'This operation is temporarily unavailable.', requestId } });
  }
};

function isObviouslyInvalidBearerToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return true;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { alg?: unknown; typ?: unknown };
    if (header.alg === 'none') return true;
    if (header.typ !== undefined && typeof header.typ !== 'string') return true;
  } catch {
    return true;
  }
  return false;
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization token' });
  if (isObviouslyInvalidBearerToken(token)) return res.status(401).json({ error: 'Unauthorized: Invalid or expired security token' });

  try {
    let decodedToken: any;
    try { decodedToken = await adminAuth.verifyIdToken(token, true); }
    catch (err: any) { console.warn('[Security Auth Middleware] Token verification failed:', err?.code || 'TOKEN_VERIFY_FAILED'); return res.status(401).json({ error: 'Unauthorized: Invalid or expired security token' }); }

    const uid = decodedToken.uid;
    const email = decodedToken.email || `${uid}@user.local`;
    const emailVerified = !!decodedToken.email_verified;
    const isVerificationExemptPath = req.path === '/api/user/me' || req.path === '/api/auth/resend-verification' || req.path === '/api/auth/verify-status';
    if (!emailVerified && !isVerificationExemptPath) return res.status(403).json({ error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED', message: 'Your email address must be verified before accessing workspace resources.' });

    const domain = email.split('@')[1] || 'generic';
    const isPublicDomain = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'].includes(domain.toLowerCase());
    const defaultTenantId = isPublicDomain ? `tenant-${uid}` : `tenant-${domain}`;
    let dbUser = await db.select().from(users).where(eq(users.uid, uid)).then(rows => rows[0]);

    if (!dbUser) {
      dbUser = await db.select().from(users).where(eq(users.email, email)).then(rows => rows[0]);
      if (dbUser) {
        const previousUid = dbUser.uid;
        const previousOnboarded = dbUser.onboarded;
        const updated = await db.update(users).set({ uid, onboarded: 1 }).where(eq(users.id, dbUser.id)).returning();
        dbUser = updated[0];
        const claimRes1 = await setUserCustomClaims(uid, { workspaceId: dbUser.tenantId, role: dbUser.role });
        if (!claimRes1.success) {
          await db.update(users).set({ uid: previousUid, onboarded: previousOnboarded }).where(eq(users.id, dbUser.id));
          return res.status(403).json({ error: 'Forbidden: Security claim assignment failed' });
        }
      } else {
        const inserted = await db.insert(users).values({ uid, email, tenantId: defaultTenantId, role: 'Viewer', onboarded: 0 }).onConflictDoUpdate({ target: users.uid, set: { email } }).returning();
        dbUser = inserted[0];
        const claimRes2 = await setUserCustomClaims(uid, { workspaceId: dbUser.tenantId, role: dbUser.role });
        if (!claimRes2.success) {
          await db.delete(users).where(eq(users.id, dbUser.id));
          return res.status(403).json({ error: 'Forbidden: Security claim assignment failed' });
        }
      }
    } else {
      const claimRole = decodedToken.role;
      const claimWorkspace = decodedToken.workspaceId || decodedToken.tenantId;
      if (!claimRole || !claimWorkspace) {
        const claimResult = await setUserCustomClaims(uid, { workspaceId: dbUser.tenantId, role: dbUser.role });
        if (!claimResult.success) return res.status(403).json({ error: 'Forbidden: Required tenant or role claim is missing', code: 'TOKEN_CLAIMS_MISSING' });
        return res.status(403).json({ error: 'Forbidden: Authentication claims were refreshed; obtain a new token', code: 'TOKEN_CLAIMS_REFRESH_REQUIRED' });
      }
      if (claimRole !== dbUser.role || claimWorkspace !== dbUser.tenantId) {
        const claimRes3 = await setUserCustomClaims(uid, { workspaceId: dbUser.tenantId, role: dbUser.role });
        if (!claimRes3.success) return res.status(403).json({ error: 'Forbidden: Security claim sync failed', code: 'CLAIMS_SYNC_FAILED' });
        return res.status(403).json({ error: 'Forbidden: Authentication claims changed; obtain a new token', code: 'TOKEN_CLAIMS_REFRESH_REQUIRED' });
      }
    }

    req.user = { id: dbUser.id, uid: dbUser.uid, email: dbUser.email, tenantId: dbUser.tenantId, role: dbUser.role, emailVerified };
    return next();
  } catch (error: any) {
    const requestId = randomUUID();
    console.error('[Security Auth Middleware Error]:', requestId, error?.code || error?.message || 'AUTH_ERROR');
    return res.status(503).json({ error: 'Authentication service unavailable', requestId });
  }
};

const ROLE_HIERARCHY = ['Viewer', 'Technician', 'Admin', 'Owner'] as const;
type Role = typeof ROLE_HIERARCHY[number] | 'Auditor';

function resolveEffectiveRoles(allowedRoles: string[]): Set<string> {
  const effective = new Set<string>(allowedRoles);
  for (const role of allowedRoles) {
    if (role === 'Auditor') { effective.add('Admin'); effective.add('Owner'); continue; }
    const rank = ROLE_HIERARCHY.indexOf(role as typeof ROLE_HIERARCHY[number]);
    if (rank === -1) continue;
    for (let i = rank + 1; i < ROLE_HIERARCHY.length; i++) effective.add(ROLE_HIERARCHY[i]);
    if (ROLE_HIERARCHY[rank] === 'Viewer') effective.add('Auditor');
  }
  return effective;
}

export const requireRole = (allowedRoles: string[]) => {
  const effectiveRoles = resolveEffectiveRoles(allowedRoles);
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    const userRole = req.user.role;
    if (!effectiveRoles.has(userRole)) return res.status(403).json({ error: 'Forbidden: Insufficient privileges', message: `Your role (${userRole}) does not have permission to access this resource. Allowed roles: ${allowedRoles.join(', ')}` });
    next();
  };
};
