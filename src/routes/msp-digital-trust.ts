import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { passports, trustObservations, trustObservationChanges, evidenceItems } from '../db/schema.ts';
import { requireAuth, requireRole, rateLimiter, AuthenticatedRequest } from '../middleware/security.ts';
import {
  calculateClientImpact, calculateRoi, detectEvidenceConflict, evaluateAiDecision,
  evaluatePolicy, freshness, mapResponsibility, sha256, validateExternalUrl,
  sanitizeExternalEvidence,
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

function requestId(res: any) {
  const id = crypto.randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

async function ownedPassport(tenantId: string, passportId: string) {
  return db.select({ id: passports.id, clientId: passports.clientId, name: passports.name, version: passports.version, publisher: passports.publisher })
    .from(passports).where(and(eq(passports.id, passportId), eq(passports.tenantId, tenantId))).then(r => r[0] || null);
}

async function ensureEntity(tenantId: string, type: string, externalId: string, name: string) {
  const entityId = `msp-entity-${crypto.createHash('sha256').update(`${tenantId}:${type}:${externalId}`).digest('hex').slice(0, 32)}`;
  await db.execute(sql`INSERT INTO msp_entities (id, tenant_id, entity_type, external_id, name) VALUES (${entityId}, ${tenantId}, ${type}, ${externalId}, ${name}) ON CONFLICT (tenant_id, entity_type, external_id) DO UPDATE SET name = EXCLUDED.name`);
  return entityId;
}

async function audit(tenantId: string, actor: string, action: string, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  await db.execute(sql`INSERT INTO audit_trail (tenant_id, action, timestamp, actor, payload, previous_hash, current_hash)
    VALUES (${tenantId}, ${`MSP_${action}`}, ${now}, ${actor}, ${JSON.stringify(payload)}, 'msp-digital-trust', ${sha256({ tenantId, actor, action, payload, now })})`);
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
    const entityId = await ensureEntity(req.user!.tenantId, 'PASSPORT', passport.id, passport.name);
    const [observation] = await db.select().from(trustObservations).where(and(eq(trustObservations.tenantId, req.user!.tenantId), eq(trustObservations.passportId, passport.id))).orderBy(desc(trustObservations.observationVersion)).limit(1);
    const state = observation ? (observation.unknownDimensionCount > 0 ? 'UNKNOWN' : 'VERIFIED') : 'UNKNOWN';
    res.json({ entity: { id: entityId, type: 'PASSPORT', passportId: passport.id }, trustState: state, evidenceFreshness: observation ? { generatedAt: observation.generatedAt, staleDimensions: observation.staleDimensionCount, expiredDimensions: observation.expiredDimensionCount } : { state: 'UNKNOWN' }, confidence: observation ? observation.completeness / 100 : null, timestamp: observation?.generatedAt ?? null, passport: { id: passport.id, version: passport.version }, decision: state === 'VERIFIED' ? 'REVIEW' : 'UNKNOWN', evidenceReferences: observation ? JSON.parse(observation.evidenceIds || '[]') : [], observationId: observation?.id ?? null });
  });

  router.get('/trust-state/:id', async (req: AuthenticatedRequest, res) => {
    const passport = await ownedPassport(req.user!.tenantId, req.params.id);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const observations = await db.select().from(trustObservations).where(and(eq(trustObservations.tenantId, req.user!.tenantId), eq(trustObservations.passportId, passport.id))).orderBy(desc(trustObservations.observationVersion)).limit(2);
    const current = observations[0];
    const previous = observations[1];
    res.json({ entity: passport.id, trustState: current ? (current.unknownDimensionCount > 0 ? 'UNKNOWN' : current.expiredDimensionCount > 0 ? 'EXPIRED' : 'VERIFIED') : 'UNKNOWN', evidenceFreshness: current ? { stale: current.staleDimensionCount, expired: current.expiredDimensionCount } : null, confidence: current ? current.completeness / 100 : null, timestamp: current?.generatedAt ?? null, passportVersion: passport.version, decision: current && current.unknownDimensionCount === 0 ? 'REVIEW' : 'UNKNOWN', evidenceReferences: current ? JSON.parse(current.evidenceIds || '[]') : [], previousObservationId: previous?.id ?? null });
  });

  router.get('/evidence/:passportId', async (req: AuthenticatedRequest, res) => {
    const passport = await ownedPassport(req.user!.tenantId, req.params.passportId);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const rows = await db.select().from(evidenceItems).where(and(eq(evidenceItems.tenantId, req.user!.tenantId), eq(evidenceItems.assetId, passport.id))).limit(500);
    const now = new Date();
    const evidence = rows.map(row => ({ id: row.id, entity: passport.id, source: { type: row.type, signer: row.signer, engine: row.engineId }, observedAt: row.timestamp, freshness: freshness(row.timestamp, now), confidence: row.verified ? 1 : 0, hash: row.hash, status: row.status, provenance: { tenantId: row.tenantId, assetId: row.assetId }, integrity: verifyEvidenceIntegrity(row as any) }));
    const conflict = detectEvidenceConflict(evidence.map(e => ({ ...e, confidenceBasisPoints: Math.round(e.confidence * 10000), payload: e.id, hash: e.hash, observedAt: e.observedAt, status: e.status as any })));
    res.json({ entity: passport.id, trustState: conflict ? 'CONFLICT' : evidence.length ? 'VERIFIED' : 'UNKNOWN', evidenceFreshness: evidence.map(e => ({ id: e.id, state: e.freshness })), confidence: evidence.length ? evidence.reduce((s, e) => s + e.confidence, 0) / evidence.length : null, timestamp: new Date().toISOString(), passportVersion: passport.version, decision: conflict ? 'REVIEW' : evidence.length ? 'REVIEW' : 'UNKNOWN', evidenceReferences: evidence.map(e => e.id), evidence, conflict });
  });

  router.get('/changes/:passportId', async (req: AuthenticatedRequest, res) => {
    const passport = await ownedPassport(req.user!.tenantId, req.params.passportId);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const rows = await db.select().from(trustObservationChanges).where(and(eq(trustObservationChanges.tenantId, req.user!.tenantId), eq(trustObservationChanges.passportId, passport.id))).orderBy(desc(trustObservationChanges.createdAt)).limit(500);
    const changes = rows.map(row => ({ id: row.id, whatChanged: row.subject, when: row.createdAt, affectedEntity: passport.id, severity: row.severity, evidence: JSON.parse(row.evidenceIds || '[]'), previousState: JSON.parse(row.previousValue || 'null'), currentState: JSON.parse(row.currentValue || 'null'), clientImpact: 'UNKNOWN', recommendedAction: 'Review the recorded evidence and affected client before acting.', confidence: null }));
    res.json({ entity: passport.id, trustState: changes.length ? 'REVIEW' : 'UNKNOWN', evidenceFreshness: null, confidence: null, timestamp: new Date().toISOString(), passportVersion: passport.version, decision: changes.some(c => c.severity === 'high') ? 'REVIEW' : 'UNKNOWN', evidenceReferences: changes.flatMap(c => c.evidence), changes });
  });

  router.get('/graph/:passportId', async (req: AuthenticatedRequest, res) => {
    const passport = await ownedPassport(req.user!.tenantId, req.params.passportId);
    if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const entityId = await ensureEntity(req.user!.tenantId, 'PASSPORT', passport.id, passport.name);
    const [claims, evidence, decisions] = await Promise.all([
      db.execute(sql`SELECT * FROM msp_claims WHERE tenant_id = ${req.user!.tenantId} AND entity_id = ${entityId} ORDER BY observed_at DESC LIMIT 500`),
      db.execute(sql`SELECT e.* FROM msp_evidence e JOIN msp_claim_evidence ce ON ce.evidence_id=e.id JOIN msp_claims c ON c.id=ce.claim_id WHERE e.tenant_id=${req.user!.tenantId} AND c.entity_id=${entityId} ORDER BY e.observed_at DESC LIMIT 500`),
      db.execute(sql`SELECT * FROM msp_decisions WHERE tenant_id=${req.user!.tenantId} AND entity_id=${entityId} ORDER BY decided_at DESC LIMIT 100`),
    ]);
    res.json({ entity: entityId, trustState: claims.rows.length ? 'REVIEW' : 'UNKNOWN', nodes: { entity: { id: entityId, type: 'PASSPORT', name: passport.name }, claims: claims.rows, evidence: evidence.rows, decisions: decisions.rows }, edges: { claimEvidence: evidence.rows.map((e: any) => ({ evidenceId: e.id })), claimDecision: decisions.rows.map((d: any) => ({ decisionId: d.id })) } });
  });

  router.get('/decision/:entityId', async (req: AuthenticatedRequest, res) => {
    const entity = await db.execute(sql`SELECT * FROM msp_entities WHERE id=${req.params.entityId} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const decisions = await db.execute(sql`SELECT * FROM msp_decisions WHERE tenant_id=${req.user!.tenantId} AND entity_id=${req.params.entityId} ORDER BY decided_at DESC LIMIT 50`);
    res.json({ entity: req.params.entityId, trustState: decisions.rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), decisions: decisions.rows.map((d: any) => ({ ...d, evidenceReferences: d.evidence_ids, why: d.explanation })) });
  });

  router.get('/dependencies/:entityId', async (req: AuthenticatedRequest, res) => {
    const entity = await db.execute(sql`SELECT * FROM msp_entities WHERE id=${req.params.entityId} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const rows = await db.execute(sql`SELECT r.*, f.name AS from_name, t.name AS to_name FROM msp_relationships r JOIN msp_entities f ON f.id=r.from_entity_id JOIN msp_entities t ON t.id=r.to_entity_id WHERE r.tenant_id=${req.user!.tenantId} AND (r.from_entity_id=${req.params.entityId} OR r.to_entity_id=${req.params.entityId}) ORDER BY r.created_at DESC LIMIT 1000`);
    res.json({ entity: req.params.entityId, trustState: rows.rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), dependencies: rows.rows });
  });

  router.get('/impact/:entityId', async (req: AuthenticatedRequest, res) => {
    const entity = await db.execute(sql`SELECT * FROM msp_entities WHERE id=${req.params.entityId} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const rows = await db.execute(sql`SELECT r.*, t.name AS affected_name, t.entity_type AS affected_type FROM msp_relationships r JOIN msp_entities t ON t.id=r.to_entity_id WHERE r.tenant_id=${req.user!.tenantId} AND r.from_entity_id=${req.params.entityId} ORDER BY r.created_at DESC LIMIT 1000`);
    const impact = rows.rows.map((r: any) => ({ ...r, clientImpact: calculateClientImpact({ severity: 'medium', affectedAssetCount: 1, evidenceBacked: Array.isArray(r.evidence_ids) && r.evidence_ids.length > 0 }) }));
    res.json({ entity: req.params.entityId, trustState: impact.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), affectedClients: impact });
  });

  router.post('/policies', requireRole(['Owner', 'Admin']), async (req: AuthenticatedRequest, res) => {
    const body = parse(policySchema, req.body, res); if (!body) return;
    const policyId = `msp-policy-${crypto.randomUUID()}`;
    const versionId = `${policyId}-v1`;
    await db.execute(sql`INSERT INTO msp_policies (id, tenant_id, scope_type, scope_id, name) VALUES (${policyId}, ${req.user!.tenantId}, ${body.scopeType}, ${body.scopeId ?? null}, ${body.name})`);
    await db.execute(sql`INSERT INTO msp_policy_versions (id, policy_id, version, definition, created_by) VALUES (${versionId}, ${policyId}, 1, ${JSON.stringify(body.definition)}, ${req.user!.uid})`);
    await audit(req.user!.tenantId, req.user!.uid, 'POLICY_CREATED', { policyId, versionId });
    res.status(201).json({ id: policyId, version: 1, definition: body.definition, outcome: 'UNKNOWN' });
  });

  router.post('/policies/:id/evaluate', requireRole(['Owner', 'Admin', 'Technician']), async (req: AuthenticatedRequest, res) => {
    const policy = await db.execute(sql`SELECT p.*, v.id AS version_id, v.version, v.definition FROM msp_policies p JOIN msp_policy_versions v ON v.policy_id=p.id AND v.version=p.active_version WHERE p.id=${req.params.id} AND p.tenant_id=${req.user!.tenantId}`);
    if (!policy.rows.length) return res.status(404).json({ error: 'POLICY_NOT_FOUND' });
    const body = z.record(z.unknown()).safeParse(req.body); if (!body.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
    const result = evaluatePolicy(body.data as any);
    const entityId = typeof body.data.entityId === 'string' ? body.data.entityId : null;
    if (!entityId) return res.status(400).json({ error: 'ENTITY_ID_REQUIRED' });
    const entity = await db.execute(sql`SELECT id FROM msp_entities WHERE id=${entityId} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const resultId = `msp-policy-result-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_policy_results (id, tenant_id, policy_id, policy_version_id, entity_id, outcome, evidence_ids, violations) VALUES (${resultId}, ${req.user!.tenantId}, ${req.params.id}, ${(policy.rows[0] as any).version_id}, ${entityId}, ${result.outcome}, ${JSON.stringify(Array.isArray(body.data.evidenceIds) ? body.data.evidenceIds : [])}, ${JSON.stringify(result.violations)})`);
    await audit(req.user!.tenantId, req.user!.uid, 'POLICY_EVALUATED', { policyId: req.params.id, resultId, outcome: result.outcome });
    res.json({ entity: entityId, trustState: result.outcome, policy: req.params.id, policyVersion: (policy.rows[0] as any).version, outcome: result.outcome, violations: result.violations, timestamp: new Date().toISOString(), evidenceReferences: body.data.evidenceIds || [] });
  });

  router.post('/ai/passport', requireRole(['Owner', 'Admin', 'Technician']), async (req: AuthenticatedRequest, res) => {
    const body = parse(aiSchema, req.body, res); if (!body) return;
    const passport = await ownedPassport(req.user!.tenantId, body.passportId); if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const entityId = await ensureEntity(req.user!.tenantId, 'AI_ASSET', body.passportId, passport.name);
    const attrs = body.attributes as Record<string, any>;
    const decision = evaluateAiDecision({ identity: attrs.identityVerified, provenance: attrs.provenanceVerified, permissionsKnown: attrs.permissionsKnown, sensitiveDataAccessKnown: attrs.sensitiveDataAccessKnown, humanApprovalKnown: attrs.humanApprovalKnown, monitoringKnown: attrs.monitoringKnown, criticalRisk: attrs.criticalRisk, evidenceAvailable: body.evidenceIds.length > 0 });
    const id = `msp-ai-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_ai_assets (id, tenant_id, entity_id, ai_type, provider, model_version, attributes, evidence_ids) VALUES (${id}, ${req.user!.tenantId}, ${entityId}, ${body.aiType}, ${body.provider ?? null}, ${body.modelVersion ?? null}, ${JSON.stringify(sanitizeExternalEvidence(body.attributes).content)}, ${JSON.stringify(body.evidenceIds)})`);
    const decisionId = `msp-ai-decision-${crypto.randomUUID()}`;
    const ruleId = 'spr.ai.trust.v1';
    await db.execute(sql`INSERT INTO msp_rules (id, tenant_id, rule_version, rule_type, definition) VALUES (${ruleId}, ${req.user!.tenantId}, '1', 'AI_TRUST', ${JSON.stringify({ deterministic: true })}) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO msp_decisions (id, tenant_id, entity_id, decision_type, outcome, rule_id, rule_version, confidence_basis_points, evidence_ids, explanation) VALUES (${decisionId}, ${req.user!.tenantId}, ${entityId}, 'AI_TRUST', ${decision.decision}, ${ruleId}, '1', ${body.evidenceIds.length ? 5000 : 0}, ${JSON.stringify(body.evidenceIds)}, ${JSON.stringify({ reasons: decision.reasons })})`);
    await audit(req.user!.tenantId, req.user!.uid, 'AI_PASSPORT_EVALUATED', { entityId, decision: decision.decision, evidenceCount: body.evidenceIds.length });
    res.status(201).json({ entity: entityId, trustState: decision.decision, decision: decision.decision, reasons: decision.reasons, evidenceReferences: body.evidenceIds, timestamp: new Date().toISOString(), passportVersion: passport.version });
  });

  router.post('/roi/calculate', async (req: AuthenticatedRequest, res) => {
    const body = parse(roiSchema, req.body, res); if (!body) return;
    const result = calculateRoi(body);
    const id = `msp-roi-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_roi_records (id, tenant_id, client_id, manual_minutes, assisted_minutes, assessments_per_month, labor_cost_per_hour, client_price, spr_cost, value_status, inputs_provenance) VALUES (${id}, ${req.user!.tenantId}, ${body.clientId}, ${body.manualMinutes}, ${body.assistedMinutes}, ${body.assessmentsPerMonth}, ${body.laborCostPerHour}, ${body.clientPrice}, ${body.sprCost}, ${result.status}, ${JSON.stringify(body.provenance ?? {})})`);
    res.json({ id, ...result, units: { time: 'minutes/hours', currency: 'user-provided' } });
  });

  router.post('/services', requireRole(['Owner', 'Admin']), async (req: AuthenticatedRequest, res) => {
    const body = parse(serviceSchema, req.body, res); if (!body) return;
    const id = `msp-service-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_service_packages (id, tenant_id, name, description, included_checks, monitoring_frequency, report_schedule, deliverables, pricing_metadata, billing_metadata, white_label) VALUES (${id}, ${req.user!.tenantId}, ${body.name}, ${body.description}, ${JSON.stringify(body.includedChecks)}, ${body.monitoringFrequency ?? null}, ${body.reportSchedule ?? null}, ${JSON.stringify(body.deliverables)}, ${JSON.stringify(body.pricingMetadata)}, ${JSON.stringify(body.billingMetadata)}, ${JSON.stringify(body.whiteLabel)})`);
    await audit(req.user!.tenantId, req.user!.uid, 'SERVICE_CREATED', { id });
    res.status(201).json({ id, ...body });
  });

  router.get('/services', async (req: AuthenticatedRequest, res) => {
    const rows = await db.execute(sql`SELECT * FROM msp_service_packages WHERE tenant_id=${req.user!.tenantId} AND active=true ORDER BY created_at DESC`);
    res.json(rows.rows);
  });

  router.get('/roi/:clientId', async (req: AuthenticatedRequest, res) => {
    const rows = await db.execute(sql`SELECT * FROM msp_roi_records WHERE tenant_id=${req.user!.tenantId} AND client_id=${req.params.clientId} ORDER BY created_at DESC LIMIT 100`);
    res.json(rows.rows);
  });

  router.get('/reports/:clientId', async (req: AuthenticatedRequest, res) => {
    const rows = await db.execute(sql`SELECT id, client_id, passport_id, report_reference, brand_config, generated_at FROM msp_reports WHERE tenant_id=${req.user!.tenantId} AND client_id=${req.params.clientId} ORDER BY generated_at DESC LIMIT 100`);
    res.json(rows.rows);
  });

  router.post('/reports', requireRole(['Owner', 'Admin', 'Technician']), async (req: AuthenticatedRequest, res) => {
    const body = z.object({ clientId: idSchema, passportId: idSchema, brandConfig: z.record(z.unknown()).default({}) }).strict().safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
    const passport = await ownedPassport(req.user!.tenantId, body.data.passportId); if (!passport) return res.status(404).json({ error: 'PASSPORT_NOT_FOUND' });
    const [observation] = await db.select().from(trustObservations).where(and(eq(trustObservations.tenantId, req.user!.tenantId), eq(trustObservations.passportId, passport.id))).orderBy(desc(trustObservations.observationVersion)).limit(1);
    const [changes] = await db.select().from(trustObservationChanges).where(and(eq(trustObservationChanges.tenantId, req.user!.tenantId), eq(trustObservationChanges.passportId, passport.id))).orderBy(desc(trustObservationChanges.createdAt)).limit(20);
    const reportReference = `SPR-${new Date().toISOString().slice(0,10).replaceAll('-', '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const snapshot = { clientId: body.data.clientId, passport: { id: passport.id, name: passport.name, version: passport.version, publisher: passport.publisher }, trustState: observation && observation.unknownDimensionCount === 0 ? 'VERIFIED' : 'UNKNOWN', decision: 'REVIEW', evidenceCoverage: observation?.completeness ?? null, changes: changes ? [changes] : [], responsibilities: 'UNKNOWN', clientImpact: 'UNKNOWN', recommendations: 'Review recorded evidence before action.', evidenceTimestamp: observation?.generatedAt ?? null, confidence: observation ? observation.completeness : null, generatedAt: new Date().toISOString() };
    const id = `msp-report-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_reports (id, tenant_id, client_id, passport_id, report_reference, brand_config, snapshot) VALUES (${id}, ${req.user!.tenantId}, ${body.data.clientId}, ${passport.id}, ${reportReference}, ${JSON.stringify(body.data.brandConfig)}, ${JSON.stringify(snapshot)})`);
    await audit(req.user!.tenantId, req.user!.uid, 'REPORT_GENERATED', { id, reportReference, passportId: passport.id });
    res.status(201).json({ id, reportReference, snapshot });
  });

  router.post('/validate-url', (req: AuthenticatedRequest, res) => {
    const body = z.object({ url: z.string().max(2048) }).strict().safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'VALIDATION_ERROR' });
    const result = validateExternalUrl(body.data.url);
    res.json({ ok: result.ok, reason: result.reason ?? null, normalized: result.url?.toString() ?? null });
  });

  router.get('/responsibility/:entityId', async (req: AuthenticatedRequest, res) => {
    const rows = await db.execute(sql`SELECT * FROM msp_responsibilities WHERE tenant_id=${req.user!.tenantId} AND risk_entity_id=${req.params.entityId} ORDER BY created_at DESC LIMIT 50`);
    const responsibility = rows.rows[0] ? (rows.rows[0] as any).responsibility : mapResponsibility({});
    res.json({ entity: req.params.entityId, responsibility, confidence: rows.rows[0] ? (rows.rows[0] as any).confidence_basis_points : 0, evidenceReferences: rows.rows[0] ? (rows.rows[0] as any).evidence_ids : [], timestamp: new Date().toISOString() });
  });

  return router;
}
