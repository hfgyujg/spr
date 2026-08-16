/**
 * SPR Connect — machine-to-machine trust integration API.
 *
 * Server-to-server callers use SPR_CONNECT_API_KEY + SPR_CONNECT_TENANT_ID.
 * Public Passport reads are limited to non-sensitive trust metadata.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { agentJobs, evidenceItems, passports, scanFindings, trustObservations } from '../db/schema.ts';
import { calculateAndStoreTrustScore, runComprehensiveScan } from '../utils/scanner.ts';

const registerSchema = z.object({
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(100).default('unknown'),
  publisher: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(120).default('Software'),
  repository: z.string().url().max(2048).optional(),
  url: z.string().url().max(2048).optional(),
  licenseType: z.string().min(1).max(120).default('UNKNOWN'),
}).strict();

function configuredApiKey() { return process.env.SPR_CONNECT_API_KEY?.trim() || ''; }
function configuredTenantId() { return process.env.SPR_CONNECT_TENANT_ID?.trim() || ''; }
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function integrationAuth(req: any, res: any, next: any) {
  const expected = configuredApiKey();
  const tenantId = configuredTenantId();
  const supplied = typeof req.headers['x-spr-api-key'] === 'string' ? req.headers['x-spr-api-key'].trim() : '';
  if (!expected || !tenantId || !supplied || !safeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'SPR_CONNECT_UNAUTHORIZED', message: 'A valid SPR Connect API key is required.' });
  }
  res.locals.sprTenantId = tenantId;
  next();
}
function parseJson(value: string | null | undefined, fallback: unknown = []) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function passportResponse(row: typeof passports.$inferSelect) {
  return {
    id: row.id, name: row.name, version: row.version, publisher: row.publisher, category: row.category,
    trust: { overall: row.overallScore, security: row.securityScore, compliance: row.complianceScore, vendorReputation: row.vendorReputationScore },
    releaseDate: row.releaseDate, licenseType: row.licenseType,
    fileHash: row.fileHash === 'pending' ? null : row.fileHash,
    evidence: parseJson(row.evidence), vulnerabilities: parseJson(row.vulnerabilities), timeline: parseJson(row.timeline),
  };
}

export function createIntegrationRouter() {
  const router = Router();
  router.get('/health', (_req, res) => res.json({ service: 'spr-connect', version: 'v1', status: 'ok' }));

  router.get('/public/passports/:id', async (req, res, next) => {
    try {
      const row = await db.select().from(passports).where(eq(passports.id, req.params.id)).then(rows => rows[0]);
      if (!row) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
      const timeline = parseJson(row.timeline) as Array<{ date?: string }>;
      res.json({
        id: row.id, name: row.name, version: row.version, publisher: row.publisher, category: row.category,
        trust: { overall: row.overallScore, security: row.securityScore, compliance: row.complianceScore, vendorReputation: row.vendorReputationScore },
        licenseType: row.licenseType, hasEvidence: parseJson(row.evidence).length > 0,
        lastUpdated: timeline.at(-1)?.date ?? null,
      });
    } catch (error) { next(error); }
  });

  router.get('/public/passports/:id/badge', async (req, res, next) => {
    try {
      const row = await db.select().from(passports).where(eq(passports.id, req.params.id)).then(rows => rows[0]);
      if (!row) return res.status(404).type('html').send('<!doctype html><p>SPR Passport not found.</p>');
      const evidenceCount = parseJson(row.evidence).length;
      const state = evidenceCount > 0 ? 'Evidence observed' : 'Evidence pending';
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'none'");
      res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/spr-badge.css"></head><body><a class="badge" target="_blank" rel="noopener noreferrer" href="/api/v1/public/passports/${encodeURIComponent(row.id)}"><span class="mark">SPR</span><span class="copy"><span class="name">${escapeHtml(row.name)}</span><br><span class="meta">${escapeHtml(state)}</span></span><span class="score">${row.overallScore}/100</span></a></body></html>`);
    } catch (error) { next(error); }
  });

  router.use(integrationAuth);

  router.get('/software/:id', async (req, res, next) => {
    try {
      const row = await db.select().from(passports).where(and(eq(passports.id, req.params.id), eq(passports.tenantId, res.locals.sprTenantId))).then(rows => rows[0]);
      if (!row) return res.status(404).json({ error: 'SOFTWARE_NOT_FOUND' });
      res.json(passportResponse(row));
    } catch (error) { next(error); }
  });

  router.post('/software', async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
      const body = parsed.data;
      const id = `spr-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const [created] = await db.insert(passports).values({
        id, tenantId: res.locals.sprTenantId, name: body.name, version: body.version,
        publisher: body.publisher || 'Unknown', category: body.category,
        overallScore: 0, securityScore: 0, complianceScore: 0, vendorReputationScore: 0,
        releaseDate: now.slice(0, 10), fileHash: 'pending', licenseType: body.licenseType,
        aiSummary: 'Pending analysis.', sbom: '[]',
        evidence: JSON.stringify([{ id: `source-${crypto.randomUUID()}`, type: 'Source Reference', status: 'DECLARED', repository: body.repository ?? null, url: body.url ?? null, observedAt: now }]),
        vulnerabilities: '[]',
        timeline: JSON.stringify([{ date: now.slice(0, 10), event: 'Software Registered', user: 'SPR Connect', details: 'Registration received through the SPR Connect API.' }]),
      }).returning();
      res.status(201).json({ softwareId: created.id, passportId: created.id, status: 'registered' });
    } catch (error) { next(error); }
  });

  router.get('/passports/:id', async (req, res, next) => {
    try {
      const row = await db.select().from(passports).where(and(eq(passports.id, req.params.id), eq(passports.tenantId, res.locals.sprTenantId))).then(rows => rows[0]);
      if (!row) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
      res.json(passportResponse(row));
    } catch (error) { next(error); }
  });

  router.get('/passports/:id/trust', async (req, res, next) => {
    try {
      const row = await db.select().from(passports).where(and(eq(passports.id, req.params.id), eq(passports.tenantId, res.locals.sprTenantId))).then(rows => rows[0]);
      if (!row) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
      const evidence = await db.select().from(evidenceItems).where(and(eq(evidenceItems.assetId, row.id), eq(evidenceItems.tenantId, res.locals.sprTenantId)));
      const verifiedEvidence = evidence.filter(item => item.verified === 1).length;
      res.json({ passportId: row.id, score: row.overallScore, dimensions: { security: row.securityScore, compliance: row.complianceScore, vendorReputation: row.vendorReputationScore }, evidence: { total: evidence.length, verified: verifiedEvidence }, state: verifiedEvidence > 0 ? 'observed' : 'pending_evidence' });
    } catch (error) { next(error); }
  });

  router.get('/passports/:id/evidence', async (req, res, next) => {
    try {
      const rows = await db.select().from(evidenceItems).where(and(eq(evidenceItems.assetId, req.params.id), eq(evidenceItems.tenantId, res.locals.sprTenantId))).orderBy(desc(evidenceItems.timestamp));
      res.json(rows.map(row => ({ id: row.id, name: row.name, type: row.type, status: row.status, verified: row.verified === 1, signer: row.signer, timestamp: row.timestamp, hash: row.hash, engineId: row.engineId, verificationFailureReason: row.verificationFailureReason })));
    } catch (error) { next(error); }
  });

  router.get('/passports/:id/risks', async (req, res, next) => {
    try {
      const rows = await db.select().from(scanFindings).where(and(eq(scanFindings.assetId, req.params.id), eq(scanFindings.tenantId, res.locals.sprTenantId))).orderBy(desc(scanFindings.detectedAt));
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get('/passports/:id/history', async (req, res, next) => {
    try {
      const rows = await db.select().from(trustObservations).where(and(eq(trustObservations.passportId, req.params.id), eq(trustObservations.tenantId, res.locals.sprTenantId))).orderBy(desc(trustObservations.generatedAt));
      res.json(rows.map(row => ({ id: row.id, version: row.observationVersion, generatedAt: row.generatedAt, completeness: row.completeness, canonicalPayloadHash: row.canonicalPayloadHash, generationReason: row.generationReason })));
    } catch (error) { next(error); }
  });

  router.post('/passports/:id/scan', async (req, res, next) => {
    try {
      const passport = await db.select().from(passports).where(and(eq(passports.id, req.params.id), eq(passports.tenantId, res.locals.sprTenantId))).then(rows => rows[0]);
      if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
      const jobId = `integration-scan-${crypto.randomUUID()}`;
      await db.insert(agentJobs).values({ id: jobId, tenantId: res.locals.sprTenantId, agentId: 'spr-connect', passportId: passport.id, jobType: 'integration_scan', status: 'Pending', progress: 0, attemptCount: 0, maxAttempts: 1 });
      void runComprehensiveScan(passport.id, res.locals.sprTenantId, jobId, 'SPR Connect').catch(async error => {
        console.error('[SPR Connect] Scan failed:', error);
        await db.update(agentJobs).set({ status: 'Failed', error: error instanceof Error ? error.message : 'SCAN_FAILED', completedAt: new Date() }).where(eq(agentJobs.id, jobId));
      });
      res.status(202).json({ passportId: passport.id, jobId, status: 'queued' });
    } catch (error) { next(error); }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await db.select().from(agentJobs).where(and(eq(agentJobs.id, req.params.id), eq(agentJobs.tenantId, res.locals.sprTenantId))).then(rows => rows[0]);
      if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
      res.json(job);
    } catch (error) { next(error); }
  });

  router.post('/passports/:id/recalculate-trust', async (req, res, next) => {
    try {
      const passport = await db.select({ id: passports.id }).from(passports).where(and(eq(passports.id, req.params.id), eq(passports.tenantId, res.locals.sprTenantId))).then(rows => rows[0]);
      if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
      const result = await calculateAndStoreTrustScore(passport.id, res.locals.sprTenantId);
      res.json({ passportId: passport.id, ...result });
    } catch (error) { next(error); }
  });

  return router;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[character] || character));
}
