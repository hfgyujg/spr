import crypto from 'node:crypto';
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { requireAuth, requireRole, rateLimiter, AuthenticatedRequest } from '../middleware/security.ts';

const entityIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/);
const evidenceIdsSchema = z.array(entityIdSchema).max(100).min(1);

const relationshipSchema = z.object({
  fromEntityId: entityIdSchema,
  toEntityId: entityIdSchema,
  relationType: z.enum(['CLIENT_SOFTWARE', 'SOFTWARE_VENDOR', 'SOFTWARE_DEPENDENCY', 'DEPENDENCY_COMPONENT', 'SOFTWARE_AI', 'SOFTWARE_API', 'SOFTWARE_DATA', 'SOFTWARE_INFRASTRUCTURE', 'AFFECTS_CLIENT', 'AFFECTS_ASSET']),
  evidenceIds: evidenceIdsSchema,
  confidenceBasisPoints: z.number().int().min(1).max(10000),
}).strict();

const responsibilitySchema = z.object({
  riskEntityId: entityIdSchema,
  responsibility: z.enum(['VENDOR', 'MSP', 'CLIENT', 'SHARED', 'UNKNOWN']),
  evidenceIds: z.array(entityIdSchema).max(100),
  confidenceBasisPoints: z.number().int().min(0).max(10000),
}).strict();

async function sameTenantEvidence(tenantId: string, evidenceIds: string[]) {
  if (!evidenceIds.length) return false;
  const result = await db.execute(sql`
    SELECT id
    FROM evidence_items
    WHERE tenant_id=${tenantId}
      AND id = ANY(${evidenceIds}::text[])
  `);
  return result.rows.length === new Set(evidenceIds).size;
}

export function createMspGraphWriteRouter() {
  const router = Router();
  router.use(requireAuth, rateLimiter, requireRole(['Owner', 'Admin', 'Technician']));

  router.post('/relationships', async (req: AuthenticatedRequest, res) => {
    const parsed = relationshipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    const body = parsed.data;
    const entities = await db.execute(sql`SELECT id FROM msp_entities WHERE tenant_id=${req.user!.tenantId} AND id IN (${body.fromEntityId}, ${body.toEntityId})`);
    if (entities.rows.length !== 2) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    if (!(await sameTenantEvidence(req.user!.tenantId, body.evidenceIds))) {
      return res.status(403).json({ error: 'EVIDENCE_REFERENCE_OUT_OF_SCOPE' });
    }
    const id = `msp-rel-${crypto.randomUUID()}`;
    try {
      await db.execute(sql`INSERT INTO msp_relationships (id, tenant_id, from_entity_id, to_entity_id, relation_type, evidence_ids, confidence_basis_points) VALUES (${id}, ${req.user!.tenantId}, ${body.fromEntityId}, ${body.toEntityId}, ${body.relationType}, ${JSON.stringify(body.evidenceIds)}, ${body.confidenceBasisPoints})`);
    } catch (error: any) {
      if (error?.code === '23505') return res.status(409).json({ error: 'RELATIONSHIP_EXISTS' });
      throw error;
    }
    res.status(201).json({ id, ...body, trustState: 'VERIFIED', timestamp: new Date().toISOString() });
  });

  router.post('/responsibility', async (req: AuthenticatedRequest, res) => {
    const parsed = responsibilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
    const body = parsed.data;
    const entity = await db.execute(sql`SELECT id FROM msp_entities WHERE id=${body.riskEntityId} AND tenant_id=${req.user!.tenantId}`);
    if (!entity.rows.length) return res.status(404).json({ error: 'ENTITY_NOT_FOUND' });
    if (body.responsibility !== 'UNKNOWN' && !(await sameTenantEvidence(req.user!.tenantId, body.evidenceIds))) {
      return res.status(403).json({ error: 'EVIDENCE_REQUIRED_FOR_ASSERTED_RESPONSIBILITY' });
    }
    const id = `msp-responsibility-${crypto.randomUUID()}`;
    await db.execute(sql`INSERT INTO msp_responsibilities (id, tenant_id, risk_entity_id, responsibility, evidence_ids, rule_version, confidence_basis_points) VALUES (${id}, ${req.user!.tenantId}, ${body.riskEntityId}, ${body.responsibility}, ${JSON.stringify(body.evidenceIds)}, 'spr.responsibility.v2', ${body.confidenceBasisPoints})`);
    res.status(201).json({ id, ...body, timestamp: new Date().toISOString() });
  });

  return router;
}
