import crypto from 'node:crypto';
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { requireAuth, requireRole, rateLimiter, AuthenticatedRequest } from '../middleware/security.ts';

const relationshipSchema = z.object({
  fromEntityId: z.string().min(1).max(200),
  toEntityId: z.string().min(1).max(200),
  relationType: z.enum(['CLIENT_SOFTWARE', 'SOFTWARE_VENDOR', 'SOFTWARE_DEPENDENCY', 'DEPENDENCY_COMPONENT', 'SOFTWARE_AI', 'SOFTWARE_API', 'SOFTWARE_DATA', 'SOFTWARE_INFRASTRUCTURE', 'AFFECTS_CLIENT', 'AFFECTS_ASSET']),
  evidenceIds: z.array(z.string().min(1).max(200)).max(100).min(1),
  confidenceBasisPoints: z.number().int().min(0).max(10000),
}).strict();

const responsibilitySchema = z.object({
  riskEntityId: z.string().min(1).max(200),
  responsibility: z.enum(['VENDOR', 'MSP', 'CLIENT', 'SHARED', 'UNKNOWN']),
  evidenceIds: z.array(z.string().min(1).max(200)).max(100),
  confidenceBasisPoints: z.number().int().min(0).max(10000),
}).strict();

export function createMspGraphWriteRouter() {
  const router = Router();
  router.use(requireAuth, rateLimiter, requireRole(['Owner', 'Admin', 'Technician']));

  router.post('/relationships', async (req: AuthenticatedRequest, res) => {
    const parsed = relationshipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    const body = parsed.data;
    const entities = await db.execute(sql`SELECT id FROM msp_entities WHERE tenant_id=${req.user!.tenantId} AND id IN (${body.fromEntityId}, ${body.toEntityId})`);
    if (entities.rows.length !== 2) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const id = `msp-rel-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_relationships (id, tenant_id, from_entity_id, to_entity_id, relation_type, evidence_ids, confidence_basis_points) VALUES (${id}, ${req.user!.tenantId}, ${body.fromEntityId}, ${body.toEntityId}, ${body.relationType}, ${JSON.stringify(body.evidenceIds)}, ${body.confidenceBasisPoints}) ON CONFLICT (tenant_id, from_entity_id, to_entity_id, relation_type) DO UPDATE SET evidence_ids=EXCLUDED.evidence_ids, confidence_basis_points=EXCLUDED.confidence_basis_points`);
    res.status(201).json({ id, ...body, trustState: 'VERIFIED', timestamp: new Date().toISOString() });
  });

  router.post('/responsibility', async (req: AuthenticatedRequest, res) => {
    const parsed = responsibilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    const body = parsed.data;
    const entity = await db.execute(sql`SELECT id FROM msp_entities WHERE id=${body.riskEntityId} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    const id = `msp-responsibility-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_responsibilities (id, tenant_id, risk_entity_id, responsibility, evidence_ids, rule_version, confidence_basis_points) VALUES (${id}, ${req.user!.tenantId}, ${body.riskEntityId}, ${body.responsibility}, ${JSON.stringify(body.evidenceIds)}, 'spr.responsibility.v1', ${body.confidenceBasisPoints})`);
    res.status(201).json({ id, ...body, timestamp: new Date().toISOString() });
  });

  return router;
}
