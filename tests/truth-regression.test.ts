import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPassportSchema } from '../src/middleware/validation.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('production truth regressions', () => {
  it('does not inject hardcoded infrastructure assets when no assets are supplied', () => {
    const source = read('src/components/AssetsView.tsx');
    expect(source).toMatch(/const systemAssets = assets \?\? \[\]/);
    expect(source).not.toMatch(/db-prod-primary\.node\.internal/);
  });

  it('does not publish invented extension signature values', () => {
    const source = read('src/data/extensionsData.ts');
    expect(source).not.toMatch(/SHA-256 Verified:/);
    expect(source).toMatch(/Not verified — no signature evidence provided/);
  });

  it('does not execute timer-driven TrustOS advisory responses', () => {
    const source = read('src/components/TrustOSView.tsx');
    expect(source).not.toMatch(/setInterval\([\s\S]{0,400}apiFetch\(['"]\/api\/ai\/advisor/);
    expect(source).not.toMatch(/setTimeout\([\s\S]{0,400}apiFetch\(['"]\/api\/ai\/advisor/);
    expect(source).not.toContain("apiFetch('/api/ai/advisor'");
  });

  it('does not label local self-passport evidence as verified', () => {
    const source = read('server.ts');
    const selfPassport = source.slice(
      source.indexOf('const buildSelfPassport'),
      source.indexOf('const ensureSelfPassport')
    );
    expect(selfPassport).not.toMatch(/status:\s*'VERIFIED'/);
    expect(selfPassport).toMatch(/status:\s*'OBSERVED'/);
    expect(selfPassport).toMatch(/isPublisherVerified:\s*false/);
  });

  it('rejects client-supplied fileHash on passport creation in validation', () => {
    const result = createPassportSchema.safeParse({
      name: 'Acme Product',
      version: '1.0.0',
      publisher: 'Acme Corp',
      fileHash: 'deadbeef'.repeat(8)
    });
    expect(result.success).toBe(true);
    expect((result.data as any).fileHash).toBeUndefined();
  });

  it('does not expose canned compliance timeline events', () => {
    const source = read('src/components/ComplianceView.tsx');
    expect(source).toMatch(/const filteredEvents = \(\[\] as AuditTimelineEvent\[\]\)/);
    expect(source).toMatch(/status:\s*'Not verified', evidence:\s*'Awaiting evidence'/);
  });

  it('does not convert failed persistence into local success records', () => {
    const source = read('src/App.tsx');
    expect(source).not.toMatch(/Local log appended/);
    expect(source).not.toMatch(/Local batch tag fallback applied/);
    expect(source).not.toMatch(/health:\s*'Compliant'/);
  });

  it('starts newly registered subjects without unsupported trust scores', () => {
    const source = read('server.ts');
    expect(source).toMatch(/trustScore:\s*0,\s*\n\s*riskLevel:\s*'Unknown'/);
    expect(source).toMatch(/const isPublisherVerified = false/);
    expect(source).toMatch(/const complianceScore = Math\.min\(100, verifiedEvidence \* 20\)/);
  });

  it('renders the enterprise capability catalog as unverified until evidence is connected', () => {
    const source = read('src/components/EnterpriseReadinessView.tsx');
    expect(source).toMatch(/return capabilityCatalog\.map\(item =>/);
    expect(source).toMatch(/status:\s*'Unverified'/);
    expect(source).toMatch(/Implementation and operational evidence have not been independently verified/);
    expect(source).toMatch(/No verification evidence is connected/);
  });

  it('keeps onboarding copy clear and avoids unsupported security claims', () => {
    const wizard = read('src/components/OnboardingWizard.tsx');
    const tutorial = read('src/components/TrustOSTutorial.tsx');
    const checklist = read('src/components/PilotOnboardingChecklist.tsx');

    expect(wizard).toContain('Set up your SPR workspace');
    expect(wizard).toContain('Four short steps');
    expect(wizard).not.toContain('Generating Node Isolation');
    expect(wizard).not.toContain('Secret Handshake Key');
    expect(tutorial).toContain('This four-step tour shows the basic workflow');
    expect(tutorial).not.toContain('crown jewel');
    expect(tutorial).not.toContain('immutable ledger');
    expect(checklist).not.toContain('sealed cryptographic channel');
    expect(checklist).not.toContain('absolute pilot-readiness');
  });

  it('fails closed when integration verification or patch execution is unavailable', () => {
    const server = read('server.ts');
    const app = read('src/App.tsx');

    expect(server).toContain("error: 'AUTOMATED_REMEDIATION_UNAVAILABLE'");
    expect(server).toContain('Alerts were not changed');
    expect(server).toContain("error: 'INTEGRATION_VERIFICATION_REQUIRED'");
    expect(server).not.toContain('Successfully remediated ${activeAlerts.length} active alerts.');
    expect(app).not.toMatch(/setPassports\(prev => prev\.map\(p => p\.id === updatedPassport\.id \? updatedPassport : p\)\);\s+apiFetch/);
  });

  it('backs AI Brain and AI Swarm with supported server operations only', () => {
    const brain = read('src/components/TrustBrainView.tsx');
    const swarm = read('src/components/PassportSwarmView.tsx');
    const server = read('server.ts');

    expect(brain).toContain('/trust-observation');
    expect(brain).toContain('Unknown dimensions');
    expect(brain).not.toContain('overallScore: 96');
    expect(swarm).toContain("agentId: 'osv-worker'");
    expect(swarm).toContain("jobType: 'osv_manifest_scan'");
    expect(swarm).not.toContain('automated_integrity_audit');
    expect(swarm).not.toContain('24/7 Continuous Monitoring');
    expect(server).toContain('eq(agentJobsTable.tenantId, req.user!.tenantId)');
  });

  it('provides separate sanitized liveness and dependency readiness endpoints', () => {
    const server = read('server.ts');
    expect(server).toContain("app.get('/health/live'");
    expect(server).toContain("app.get('/health/ready'");
    expect(server).toContain("dependencies: { database: database.db }");
  });
});

describe('independent OSV worker truth boundaries', () => {
  it('claims persisted jobs with database locking and stores provider evidence as observed', () => {
    const worker = read('src/workers/osv-worker.ts');
    expect(worker).toContain('FOR UPDATE SKIP LOCKED');
    expect(worker).toContain("https://api.osv.dev/v1/query");
    expect(worker).toContain("'Security Scan', 0, 'OBSERVED', 'api.osv.dev'");
    expect(worker).toContain("evidenceState: 'Provider response persisted; not a cryptographic verification'");
  });

  it('does not dispatch the supported OSV job inside the HTTP process', () => {
    const server = read('server.ts');
    expect(server).toContain('OSV manifest scan job persisted and awaiting an independent worker.');
    expect(server).not.toContain('processAgentJobInBackground(jobId');
  });

  it('hashes the exact evidence payload that the worker persists', () => {
    const worker = read('src/workers/osv-worker.ts');
    expect(worker).toContain("const digest = `sha256:${crypto.createHash('sha256').update(persistedPayload, 'utf8').digest('hex')}`");
    expect(worker).toContain('`sha256:${sha256(sbomEvidencePayload)}`');
    expect(worker).not.toContain("`ev-sbom-${crypto.randomUUID()}`, rawSbomHash");
  });

  it('persists rejected oversized integrity attempts and their audit outcome', () => {
    const server = read('server.ts');
    const route = server.slice(
      server.indexOf("app.post('/api/evidence/:id/verify-integrity'"),
      server.indexOf("app.post('/api/passports'", server.indexOf("app.post('/api/evidence/:id/verify-integrity'"))
    );
    expect(route.indexOf('db.update(evidenceItemsTable)')).toBeLessThan(route.indexOf("result.outcome === 'rejected'"));
    expect(route).toContain('auditEventPersisted');
    expect(route).toContain("EVIDENCE_AUDIT_PERSISTENCE_FAILED");
    expect(route).toContain("? 413");
  });

  it('keeps repository and OSV scanning out of the HTTP process', () => {
    const server = read('server.ts');
    expect(server).toContain('Repository scan request persisted and awaiting an independent worker.');
    expect(server).not.toContain('processRepositoryJob(');
    expect(server).not.toContain('fetchOsv(');
  });

  it('acquires an already-resolved immutable SHA without a rate-limited metadata lookup', () => {
    const worker = read('src/workers/osv-worker.ts');
    expect(worker).toContain('const suppliedImmutableSha');
    expect(worker).toContain("metadata = suppliedImmutableSha");
    expect(worker).toContain('https://codeload.github.com/');
    expect(worker).toContain('/zip/${commitSha}');
  });

  it('uses a ZIP-capable extractor in the Linux worker image', () => {
    const worker = read('src/workers/osv-worker.ts');
    const dockerfile = read('Dockerfile.worker');
    expect(dockerfile).toMatch(/apt-get install[^\n]+unzip/);
    expect(worker).toContain("process.platform === 'win32' ? 'tar.exe' : 'unzip'");
    expect(worker).toContain("['-Z1', archivePath]");
    expect(worker).toContain("['-q', archivePath, '-d', extractPath]");
  });

  it('publishes tenant-scoped repository reports using controlled evidence states', () => {
    const server = read('server.ts');
    expect(server).toContain("'/api/repository-scans/:jobId/report'");
    expect(server).toContain('eq(repositoryScanSourcesTable.tenantId, tenantId)');
    expect(server).toContain('PARTIALLY_VERIFIED means the stored evidence payload passed byte-integrity verification.');
    expect(server).not.toMatch(/Fully secure|Completely safe|Certified secure|Guaranteed compliant|100% trusted|AI verified|Unhackable/);
  });
});
