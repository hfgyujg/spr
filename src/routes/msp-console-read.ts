import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { clients, passports } from '../db/schema.ts';
import { requireAuth, requireRole, rateLimiter, AuthenticatedRequest } from '../middleware/security.ts';

export function createMspConsoleReadRouter() {
  const router = Router();
  router.use(requireAuth, rateLimiter, requireRole(['Owner', 'Admin', 'Technician']));

  router.get('/clients', async (req: AuthenticatedRequest, res) => {
    const rows = await db.select({ id: clients.id, name: clients.name, domain: clients.domain, trustScore: clients.trustScore, riskLevel: clients.riskLevel, passportCount: clients.passportCount, criticalRisksCount: clients.criticalRisksCount }).from(clients).where(eq(clients.tenantId, req.user!.tenantId)).orderBy(desc(clients.name)).limit(500);
    res.json({ entity: req.user!.tenantId, trustState: rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), clients: rows });
  });

  router.get('/policies', async (req: AuthenticatedRequest, res) => {
    const rows = await db.execute(sql`SELECT p.id, p.name, p.scope_type, p.scope_id, p.active_version, p.created_at, p.updated_at, v.definition FROM msp_policies p JOIN msp_policy_versions v ON v.policy_id=p.id AND v.version=p.active_version WHERE p.tenant_id=${req.user!.tenantId} ORDER BY p.updated_at DESC LIMIT 500`);
    res.json({ entity: req.user!.tenantId, trustState: rows.rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), policies: rows.rows });
  });

  router.get('/passports', async (req: AuthenticatedRequest, res) => {
    const rows = await db.select({ id: passports.id, name: passports.name, version: passports.version, publisher: passports.publisher, overallScore: passports.overallScore, securityScore: passports.securityScore, complianceScore: passports.complianceScore, clientId: passports.clientId }).from(passports).where(eq(passports.tenantId, req.user!.tenantId)).orderBy(desc(passports.name)).limit(500);
    res.json({ entity: req.user!.tenantId, trustState: rows.length ? 'REVIEW' : 'UNKNOWN', timestamp: new Date().toISOString(), passports: rows });
  });

  return router;
}
