import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { passports, trustObservations, trustObservationChanges, evidenceItems } from '../db/schema.ts';
import { requireAuth, requireRole, rateLimiter, AuthenticatedRequest } from '../middleware/security.ts';
import {
  calculateClientImpact, calculateRoi, detectEvidenceConflict, evaluateAiDecision,
  evaluatePolicy, freshness, validateExternalUrl,
} from '../utils/msp-digital-trust.ts';
import { verifyEvidenceIntegrity } from '../utils/evidence-integrity.ts';

const idSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
const policySchema = z.object({
  name: z.string().min(1).max(200),
  scopeType: z.enum(['MSP', 'CLIENT', 'ASSET']),
  scopeId: z.string().max(200).optional().nullable(),
  definition: z.record(z.unknown()).default({}),
}).strict();
const aiSchema = z.object({
  passportId: idSchema,
  aiType: z.enum(['AI MODEL', 'AI APPLICATION', 'AI AGENT', 'AI TOOL', 'PLUGIN', 'API', 'DATA SOURCE', 'VECTOR DATABASE', 'EXTERNAL SERVICE']),
  provider: z.string().max(200).optional().nullable(),
  modelVersion: z.string().max(200).optional().nullable(),
  attributes: z.record(z.unknown()).default({}),
  evidenceIds: z.array(idSchema).max(100).default([]),
}).strict();
const roiSchema = z.object({
  clientId: idSchema,
  manualMinutes: z.number().finite().nonnegative().nullable(),
  assistedMinutes: z.number().finite().nonnegative().nullable(),
  assessmentsPerMonth: z.number().finite().nonnegative().nullable(),
  laborCostPerHour: z.number().finite().nonnegative().nullable(),
  clientPrice: z.number().finite().nonnegative().nullable(),
  sprCost: z.number().finite().nonnegative().nullable(),
  provenance: z.record(z.enum(['MEASURED', 'ESTIMATED', 'USER-PROVIDED', 'UNVERIFIED'])).optional(),
}).strict();
const serviceSchema = z.object({
  name: z.string().min(1).max(200), description: z.string().max(4000).default(''),
  includedChecks: z.array(z.string().max(200)).max(100).default([]),
  monitoringFrequency: z.string().max(100).optional().nullable(), reportSchedule: z.string().max(100).optional().nullable(),
  deliverables: z.array(z.string().max(200)).max(100).default([]),
  pricingMetadata: z.record(z.unknown()).default({}), billingMetadata: z.record(z.unknown()).default({}), whiteLabel: z.record(z.unknown()).default({}),
}).strict();

function parse(schema: z.ZodTypeAny, body: unknown, res: any) {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', issues: result.error.issues.map(i => ({ path: i.path, message: i.message })) } });
    return null;
  }
  return result.data;
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function ownedPassport(tenantId: string, passportId: string) {
  return db.select({ id: passports.id, clientId: passports.clientId, name: passports.name, version: passports.version, publisher: passports.publisher })
    .from(passports).where(and(eq(passports.id, passportId), eq(passports.tenantId, tenantId))).then(r => r[0] || null);
}

async function findEntity(tenantId: string, type: string, externalId: string) {
  return db.execute(sql`SELECT id, entity_type, external_id, name, created_at FROM msp_entities WHERE tenant_id=${tenantId} AND entity_type=${type} AND external_id=${externalId} LIMIT 1`)
    .then(result => result.rows[0] ?? null);
}

async function ensureEntity(tenantId: string, type: string, externalId: string, name: string) {
  const entityId = `msp-entity-${crypto.createHash('sha256').update(`${tenantId}:${type}:${externalId}`).digest('hex').slice(0, 32)}`;
  await db.execute(sql`INSERT INTO msp_entities (id, tenant_id, entity_type, external_id, name) VALUES (${entityId}, ${tenantId}, ${type}, ${externalId}, ${name}) ON CONFLICT (tenant_id, entity_type, external_id) DO NOTHING`);
  return entityId;
}

async function audit(tenantId: string, actor: string, action: string, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const previous = await db.execute(sql`SELECT current_hash FROM audit_trail WHERE tenant_id=${tenantId} ORDER BY id DESC LIMIT 1`);
  const previousHash = previous.rows.length ? String((previous.rows[0] as any).current_hash) : 'GENESIS';
  const inserted = await db.execute(sql`INSERT INTO audit_trail (tenant_id, action, timestamp, actor, payload, previous_hash, current_hash)
    VALUES (${tenantId}, ${`MSP_${action}`}, ${now}, ${actor}, ${JSON.stringify(payload)}, ${previousHash}, 'pending')
    RETURNING current_hash`);
  return inserted.rows.length ? String((inserted.rows[0] as any).current_hash) : null;
}

export function createMspDigitalTrustRouter() {
  const router = Router();
  router.use(requireAuth);
  router.use(rateLimiter);
  router.use(requireRole(['Owner', 'Admin', 'Technician']));

  router.get('/passport/:id', async (req: AuthenticatedRequest, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'INVALID_ID' });
    const passport = await ownedPassport(req.user!.tenantId, id.data);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const entity = await findEntity(req.user!.tenantId, 'PASSPORT', passport.id);
    const [observation] = await db.select().from(trustObservations).where(and(eq(trustObservations.tenantId, req.user!.tenantId), eq(trustObservations.passportId, passport.id))).orderBy(desc(trustObservations.observationVersion)).limit(1);
    const evidenceIds = safeJson<string[]>(observation?.evidenceIds, []);
    const state = observation
      ? (observation.unknownDimensionCount > 0 ? 'UNKNOWN' : observation.expiredDimensionCount > 0 ? 'EXPIRED' : observation.staleDimensionCount > 0 ? 'STALE' : 'VERIFIED')
      : 'UNKNOWN';
    res.json({ entity: entity ? { id: entity.id, type: 'PASSPORT', passportId: passport.id } : { id: null, type: 'PASSPORT', passportId: passport.id }, trustState: state, evidenceFreshness: observation ? { generatedAt: observation.generatedAt, staleDimensions: observation.staleDimensionCount, expiredDimensions: observation.expiredDimensionCount } : { state: 'UNKNOWN' }, confidence: observation ? observation.completeness / 10000 : null, timestamp: observation?.generatedAt ?? null, passport: { id: passport.id, version: passport.version }, decision: state === 'VERIFIED' ? 'REVIEW' : 'UNKNOWN', evidenceReferences: evidenceIds, observationId: observation?.id ?? null });
  });

  router.get('/trust-state/:id', async (req: AuthenticatedRequest, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'INVALID_ID' });
    const passport = await ownedPassport(req.user!.tenantId, id.data);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const observations = await db.select().from(trustObservations).where(and(eq(trustObservations.tenantId, req.user!.tenantId), eq(trustObservations.passportId, passport.id))).orderBy(desc(trustObservations.observationVersion)).limit(2);
    const current = observations[0];
    const previous = observations[1];
    const state = current ? (current.unknownDimensionCount > 0 ? 'UNKNOWN' : current.expiredDimensionCount > 0 ? 'EXPIRED' : current.staleDimensionCount > 0 ? 'STALE' : 'VERIFIED') : 'UNKNOWN';
    res.json({ entity: passport.id, trustState: state, evidenceFreshness: current ? { stale: current.staleDimensionCount, expired: current.expiredDimensionCount } : null, confidence: current ? current.completeness / 10000 : null, timestamp: current?.generatedAt ?? null, passportVersion: passport.version, decision: state === 'VERIFIED' ? 'REVIEW' : 'UNKNOWN', evidenceReferences: current ? safeJson<string[]>(current.evidenceIds, []) : [], previousObservationId: previous?.id ?? null });
  });

  router.get('/evidence/:passportId', async (req: AuthenticatedRequest, res) => {
    const passportId = idSchema.safeParse(req.params.passportId);
    if (!passportId.success) return res.status(400).json({ error: 'INVALID_ID' });
    const passport = await ownedPassport(req.user!.tenantId, passportId.data);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const rows = await db.select().from(evidenceItems).where(and(eq(evidenceItems.tenantId, req.user!.tenantId), eq(evidenceItems.assetId, passport.id))).limit(500);
    const now = new Date();
    const evidence = rows.map(row => {
      const rawContent = row.rawContent || '';
      const integrity = verifyEvidenceIntegrity(rawContent, row.hash);
      const state = integrity.verified ? freshness(row.timestamp, now) : 'UNVERIFIED';
      return { id: row.id, entity: passport.id, source: { type: row.type, signer: row.signer, engine: row.engineId }, observedAt: row.timestamp, freshness: state, confidence: row.verified && integrity.verified ? 1 : 0, hash: row.hash, status: integrity.verified ? row.status : 'UNVERIFIED', provenance: { tenantId: row.tenantId, assetId: row.assetId }, integrity };
    });
    const conflict = detectEvidenceConflict(evidence.map(e => ({ id: e.id, status: e.status as any, observedAt: e.observedAt, confidenceBasisPoints: Math.round(e.confidence * 10000), hash: e.hash, payload: e.id })));
    const verifiedCount = evidence.filter(e => e.integrity.verified && ['OBSERVED', 'VERIFIED'].includes(e.status)).length;
    res.json({ entity: passport.id, trustState: conflict ? 'CONFLICT' : verifiedCount ? 'REVIEW' : 'UNKNOWN', evidenceFreshness: evidence.map(e => ({ id: e.id, state: e.freshness })), confidence: evidence.length ? evidence.reduce((s, e) => s + e.confidence, 0) / evidence.length : null, timestamp: new Date().toISOString(), passportVersion: passport.version, decision: conflict ? 'REVIEW' : verifiedCount ? 'REVIEW' : 'UNKNOWN', evidenceReferences: evidence.map(e => e.id), evidence, conflict });
  });

  router.get('/changes/:passportId', async (req: AuthenticatedRequest, res) => {
    const passportId = idSchema.safeParse(req.params.passportId);
    if (!passportId.success) return res.status(400).json({ error: 'INVALID_ID' });
    const passport = await ownedPassport(req.user!.tenantId, passportId.data);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const rows = await db.select().from(trustObservationChanges).where(and(eq(trustObservationChanges.tenantId, req.user!.tenantId), eq(trustObservationChanges.passportId, passport.id))).orderBy(desc(trustObservationChanges.createdAt)).limit(500);
    const changes = rows.map(row => ({ id: row.id, whatChanged: row.subject, when: row.createdAt, affectedEntity: passport.id, severity: row.severity, evidence: safeJson<string[]>(row.evidenceIds, []), previousState: safeJson(row.previousValue, null), currentState: safeJson(row.currentValue, null), clientImpact: 'UNKNOWN', recommendedAction: 'Review the recorded evidence and affected client before acting.', confidence: null }));
    res.json({ entity: passport.id, trustState: changes.length ? 'REVIEW' : 'UNKNOWN', evidenceFreshness: null, confidence: null, timestamp: new Date().toISOString(), passportVersion: passport.version, decision: changes.some(c => c.severity === 'high') ? 'REVIEW' : 'UNKNOWN', evidenceReferences: changes.flatMap(c => c.evidence), changes });
  });

  router.get('/graph/:passportId', async (req: AuthenticatedRequest, res) => {
    const passportId = idSchema.safeParse(req.params.passportId);
    if (!passportId.success) return res.status(400).json({ error: 'INVALID_ID' });
    const passport = await ownedPassport(req.user!.tenantId, passportId.data);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const entity = await findEntity(req.user!.tenantId, 'PASSPORT', passport.id);
    if (!entity) return res.json({ entity: null, trustState: 'UNKNOWN', nodes: { entity: null, claims: [], evidence: [], decisions: [] }, edges: { claimEvidence: [], claimDecision: [] } });
    const entityId = String((entity as any).id);
    const [claims, evidence, decisions] = await Promise.all([
      db.execute(sql`SELECT * FROM msp_claims WHERE tenant_id = ${req.user!.tenantId} AND entity_id = ${entityId} ORDER BY observed_at DESC LIMIT 500`),
      db.execute(sql`SELECT e.* FROM msp_evidence e JOIN msp_claim_evidence ce ON ce.evidence_id=e.id JOIN msp_claims c ON c.id=ce.claim_id WHERE e.tenant_id=${req.user!.tenantId} AND c.tenant_id=${req.user!.tenantId} AND c.entity_id=${entityId} ORDER BY e.observed_at DESC LIMIT 500`),
      db.execute(sql`SELECT * FROM msp_decisions WHERE tenant_id=${req.user!.tenantId} AND entity_id=${entityId} ORDER BY decided_at DESC LIMIT 100`),
    ]);
    res.json({ entity: entityId, trustState: claims.rows.length ? 'REVIEW' : 'UNKNOWN', nodes: { entity: { id: entityId, type: 'PASSPORT', name: passport.name }, claims: claims.rows, evidence: evidence.rows, decisions: decisions.rows }, edges: { claimEvidence: evidence.rows.map((e: any) => ({ evidenceId: e.id })), claimDecision: decisions.rows.map((d: any) => ({ decisionId: d.id })) } });
  });

  router.get('/decision/:entityId', async (req: AuthenticatedRequest, res) => {
    const id = idSchema.safeParse(req.params.entityId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_ID' });
    const entity = await db.execute(sql`SELECT * FROM msp_entities WHERE id=${id.data} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const decisions = await db.execute(sql`SELECT * FROM msp_decisions WHERE tenant_id=${req.user!.tenantId} AND entity_id=${id.data} ORDER BY decided_at DESC LIMIT 50`);
    res.json({ entity: id.data, trustState: decisions.rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), decisions: decisions.rows.map((d: any) => ({ ...d, evidenceReferences: d.evidence_ids, why: d.explanation })) });
  });

  router.get('/dependencies/:entityId', async (req: AuthenticatedRequest, res) => {
    const id = idSchema.safeParse(req.params.entityId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_ID' });
    const entity = await db.execute(sql`SELECT * FROM msp_entities WHERE id=${id.data} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const rows = await db.execute(sql`SELECT r.*, f.name AS from_name, t.name AS to_name FROM msp_relationships r JOIN msp_entities f ON f.id=r.from_entity_id JOIN msp_entities t ON t.id=r.to_entity_id WHERE r.tenant_id=${req.user!.tenantId} AND f.tenant_id=${req.user!.tenantId} AND t.tenant_id=${req.user!.tenantId} AND (r.from_entity_id=${id.data} OR r.to_entity_id=${id.data}) ORDER BY r.created_at DESC LIMIT 1000`);
    res.json({ entity: id.data, trustState: rows.rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), dependencies: rows.rows });
  });

  router.get('/impact/:entityId', async (req: AuthenticatedRequest, res) => {
    const id = idSchema.safeParse(req.params.entityId);
    if (!id.success) return res.status(400).json({ error: 'INVALID_ID' });
    const entity = await db.execute(sql`SELECT * FROM msp_entities WHERE id=${id.data} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const rows = await db.execute(sql`SELECT r.*, t.name AS affected_name, t.entity_type AS affected_type FROM msp_relationships r JOIN msp_entities t ON t.id=r.to_entity_id WHERE r.tenant_id=${req.user!.tenantId} AND t.tenant_id=${req.user!.tenantId} AND r.from_entity_id=${id.data} ORDER BY r.created_at DESC LIMIT 1000`);
    const impact = rows.rows.map((r: any) => ({ ...r, clientImpact: calculateClientImpact({ severity: 'medium', affectedAssetCount: 1, evidenceBacked: Array.isArray(r.evidence_ids) && r.evidence_ids.length > 0 }) }));
    res.json({ entity: id.data, trustState: impact.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), affectedClients: impact });
  });

  router.post('/policies', requireRole(['Owner', 'Admin']), async (req: AuthenticatedRequest, res) => {
    const body = parse(policySchema, req.body, res); if (!body) return;
    if (body.scopeType !== 'MSP' && !body.scopeId) return res.status(400).json({ error: 'SCOPE_ID_REQUIRED' });
    const policyId = `msp-policy-${crypto.randomUUID()}`;
    const versionId = `${policyId}-v1`;
    await db.execute(sql`INSERT INTO msp_policies (id, tenant_id, scope_type, scope_id, name) VALUES (${policyId}, ${req.user!.tenantId}, ${body.scopeType}, ${body.scopeId ?? null}, ${body.name})`);
    await db.execute(sql`INSERT INTO msp_policy_versions (id, policy_id, version, definition, created_by) VALUES (${versionId}, ${policyId}, 1, ${JSON.stringify(body.definition)}, ${req.user!.uid})`);
    const auditHash = await audit(req.user!.tenantId, req.user!.uid, 'POLICY_CREATED', { policyId, versionId });
    res.status(201).json({ id: policyId, version: 1, definition: body.definition, outcome: 'UNKNOWN', auditHash, timestamp: new Date().toISOString() });
  });

  router.post('/ai/passport', async (req: AuthenticatedRequest, res) => {
    const body = parse(aiSchema, req.body, res); if (!body) return;
    const passport = await ownedPassport(req.user!.tenantId, body.passportId);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    if (body.evidenceIds.length) {
      const found = await db.execute(sql`SELECT id FROM evidence_items WHERE tenant_id=${req.user!.tenantId} AND asset_id=${passport.id} AND id = ANY(${body.evidenceIds}::text[])`);
      if (found.rows.length !== body.evidenceIds.length) return res.status(400).json({ error: 'EVIDENCE_REFERENCE_OUT_OF_SCOPE' });
    }
    const entityId = await ensureEntity(req.user!.tenantId, 'AI', body.passportId, `${passport.name} AI`);
    const decision = evaluateAiDecision({
      identity: body.attributes.identityVerified === true ? true : body.attributes.identityVerified === false ? false : undefined,
      provenance: body.attributes.provenanceKnown === true ? true : body.attributes.provenanceKnown === false ? false : undefined,
      permissionsKnown: body.attributes.permissionsKnown === true ? true : body.attributes.permissionsKnown === false ? false : undefined,
      sensitiveDataAccessKnown: body.attributes.sensitiveDataAccessKnown === true ? true : body.attributes.sensitiveDataAccessKnown === false ? false : undefined,
      humanApprovalKnown: body.attributes.humanApprovalKnown === true ? true : body.attributes.humanApprovalKnown === false ? false : undefined,
      monitoringKnown: body.attributes.monitoringKnown === true ? true : body.attributes.monitoringKnown === false ? false : undefined,
      criticalRisk: body.attributes.criticalRisk === true ? true : body.attributes.criticalRisk === false ? false : undefined,
      evidenceAvailable: body.evidenceIds.length > 0,
    });
    const id = `msp-ai-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_ai_assets (id, tenant_id, entity_id, ai_type, provider, model_version, attributes, evidence_ids) VALUES (${id}, ${req.user!.tenantId}, ${entityId}, ${body.aiType}, ${body.provider ?? null}, ${body.modelVersion ?? null}, ${JSON.stringify(body.attributes)}, ${JSON.stringify(body.evidenceIds)})`);
    const auditHash = await audit(req.user!.tenantId, req.user!.uid, 'AI_PASSPORT_CREATED', { id, entityId, decision });
    res.status(201).json({ id, entity: entityId, decision: decision.decision, reasons: decision.reasons, evidenceReferences: body.evidenceIds, auditHash, timestamp: new Date().toISOString() });
  });

  router.post('/roi/calculate', requireRole(['Owner', 'Admin', 'Technician']), async (req: AuthenticatedRequest, res) => {
    const body = parse(roiSchema, req.body, res); if (!body) return;
    const client = await db.execute(sql`SELECT id FROM clients WHERE id=${body.clientId} AND tenant_id=${req.user!.tenantId}`);
    if (!client.rows.length) return res.status(404).json({ error: 'CLIENT_NOT_FOUND' });
    const result = calculateRoi(body);
    const id = `msp-roi-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_roi_records (id, tenant_id, client_id, manual_minutes, assisted_minutes, assessments_per_month, labor_cost_per_hour, client_price, spr_cost, value_status, inputs_provenance) VALUES (${id}, ${req.user!.tenantId}, ${body.clientId}, ${body.manualMinutes}, ${body.assistedMinutes}, ${body.assessmentsPerMonth}, ${body.laborCostPerHour}, ${body.clientPrice}, ${body.sprCost}, ${result.status}, ${JSON.stringify(body.provenance ?? {})})`);
    const auditHash = await audit(req.user!.tenantId, req.user!.uid, 'ROI_CALCULATED', { id, clientId: body.clientId, status: result.status });
    res.status(201).json({ id, ...result, clientId: body.clientId, auditHash });
  });

  router.post('/services', requireRole(['Owner', 'Admin']), async (req: AuthenticatedRequest, res) => {
    const body = parse(serviceSchema, req.body, res); if (!body) return;
    const id = `msp-service-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_service_packages (id, tenant_id, name, description, included_checks, monitoring_frequency, report_schedule, deliverables, pricing_metadata, billing_metadata, white_label) VALUES (${id}, ${req.user!.tenantId}, ${body.name}, ${body.description}, ${JSON.stringify(body.includedChecks)}, ${body.monitoringFrequency ?? null}, ${body.reportSchedule ?? null}, ${JSON.stringify(body.deliverables)}, ${JSON.stringify(body.pricingMetadata)}, ${JSON.stringify(body.billingMetadata)}, ${JSON.stringify(body.whiteLabel)})`);
    const auditHash = await audit(req.user!.tenantId, req.user!.uid, 'SERVICE_CREATED', { id });
    res.status(201).json({ id, ...body, auditHash, timestamp: new Date().toISOString() });
  });

  router.post('/reports', requireRole(['Owner', 'Admin']), async (req: AuthenticatedRequest, res) => {
    const schema = z.object({ clientId: idSchema, passportId: idSchema, brandConfig: z.record(z.unknown()).default({}), snapshot: z.record(z.unknown()) }).strict();
    const body = parse(schema, req.body, res); if (!body) return;
    const passport = await ownedPassport(req.user!.tenantId, body.passportId);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const client = await db.execute(sql`SELECT id FROM clients WHERE id=${body.clientId} AND tenant_id=${req.user!.tenantId}`);
    if (!client.rows.length || passport.clientId !== body.clientId) return res.status(404).json({ error: 'CLIENT_PASSPORT_NOT_FOUND' });
    const id = `msp-report-${crypto.randomUUID()}`;
    const reportReference = `SPR-${crypto.randomUUID()}`;
    const snapshot = { ...body.snapshot, passportId: passport.id, passportVersion: passport.version, generatedAt: new Date().toISOString() };
    await db.execute(sql`INSERT INTO msp_reports (id, tenant_id, client_id, passport_id, report_reference, brand_config, snapshot) VALUES (${id}, ${req.user!.tenantId}, ${body.clientId}, ${passport.id}, ${reportReference}, ${JSON.stringify(body.brandConfig)}, ${JSON.stringify(snapshot)})`);
    const auditHash = await audit(req.user!.tenantId, req.user!.uid, 'REPORT_CREATED', { id, reportReference, passportId: passport.id, clientId: body.clientId });
    res.status(201).json({ id, reportReference, entity: passport.id, trustState: 'UNKNOWN', decision: 'UNKNOWN', evidenceReferences: [], auditHash, timestamp: snapshot.generatedAt });
  });

  router.post('/validate-url', requireRole(['Owner', 'Admin', 'Technician']), async (req: AuthenticatedRequest, res) => {
    const parsed = z.object({ url: z.string().max(2048) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
    const result = validateExternalUrl(parsed.data.url);
    res.status(result.ok ? 200 : 400).json({ ok: result.ok, reason: result.reason, url: result.ok ? result.url?.toString() : undefined });
  });

  return router;
}
