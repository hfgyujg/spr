import crypto from 'node:crypto';

export type TrustState = 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN' | 'STALE' | 'EXPIRED' | 'CONFLICT';
export type PolicyOutcome = 'PASS' | 'FAIL' | 'UNKNOWN' | 'REVIEW';
export type Responsibility = 'VENDOR' | 'MSP' | 'CLIENT' | 'SHARED' | 'UNKNOWN';
export type AiDecision = 'APPROVE' | 'REVIEW' | 'RESTRICT' | 'BLOCK' | 'UNKNOWN';
export type MeasurementStatus = 'MEASURED' | 'ESTIMATED' | 'USER-PROVIDED' | 'UNVERIFIED';

export interface EvidenceRef {
  id: string;
  sourceId?: string | null;
  observationId?: string | null;
  status: 'OBSERVED' | 'VERIFIED' | 'UNVERIFIED' | 'CONFLICT' | 'STALE' | 'EXPIRED';
  observedAt: string;
  confidenceBasisPoints: number;
  hash: string;
  payload: unknown;
}

export interface ClaimRef {
  id: string;
  entityId: string;
  type: string;
  statement: string;
  evidenceIds: string[];
}

export interface RuleRef { id: string; version: string; type: string; }
export interface DecisionRef { id: string; outcome: string; rule: RuleRef; evidenceIds: string[]; confidenceBasisPoints: number; }

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(k => `${JSON.stringify(k)}:${canonicalize(object[k])}`).join(',')}}`;
}

export function sha256(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;
}

export function freshness(observedAt: string, now = new Date(), maxAgeSeconds = 86_400): TrustState {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return 'UNKNOWN';
  const age = Math.max(0, now.getTime() - observed) / 1000;
  if (age > maxAgeSeconds * 2) return 'EXPIRED';
  if (age > maxAgeSeconds) return 'STALE';
  return 'VERIFIED';
}

export function detectEvidenceConflict(evidence: EvidenceRef[]): boolean {
  const verified = evidence.filter(e => ['OBSERVED', 'VERIFIED'].includes(e.status));
  if (verified.length < 2) return false;
  const hashes = new Set(verified.map(e => e.hash));
  return hashes.size > 1;
}

export function evaluatePolicy(input: {
  identityVerified?: boolean;
  evidenceFresh?: boolean;
  criticalVulnerabilities?: number | null;
  dependencyVisibility?: boolean;
  privacyEvidence?: boolean;
  aiDisclosure?: boolean;
  approvedVendor?: boolean;
  provenance?: boolean;
  monitoring?: boolean;
  minimumConfidenceBasisPoints?: number;
  confidenceBasisPoints?: number | null;
}): { outcome: PolicyOutcome; violations: string[] } {
  const violations: string[] = [];
  const unknown = (value: unknown) => value === undefined || value === null;
  if (input.identityVerified === false) violations.push('identity_not_verified');
  if (input.identityVerified === undefined) violations.push('identity_unknown');
  if (input.evidenceFresh === false) violations.push('evidence_stale');
  if (input.evidenceFresh === undefined) violations.push('evidence_freshness_unknown');
  if (input.criticalVulnerabilities === null || input.criticalVulnerabilities === undefined) violations.push('critical_vulnerability_count_unknown');
  else if (input.criticalVulnerabilities > 0) violations.push('critical_vulnerabilities_present');
  if (input.dependencyVisibility === false) violations.push('dependency_visibility_missing');
  else if (unknown(input.dependencyVisibility)) violations.push('dependency_visibility_unknown');
  if (input.privacyEvidence === false) violations.push('privacy_evidence_missing');
  else if (unknown(input.privacyEvidence)) violations.push('privacy_evidence_unknown');
  if (input.aiDisclosure === false) violations.push('ai_disclosure_missing');
  else if (unknown(input.aiDisclosure)) violations.push('ai_disclosure_unknown');
  if (input.approvedVendor === false) violations.push('vendor_not_approved');
  else if (unknown(input.approvedVendor)) violations.push('vendor_approval_unknown');
  if (input.provenance === false) violations.push('provenance_missing');
  else if (unknown(input.provenance)) violations.push('provenance_unknown');
  if (input.monitoring === false) violations.push('monitoring_missing');
  else if (unknown(input.monitoring)) violations.push('monitoring_unknown');
  const confidence = input.confidenceBasisPoints ?? null;
  if (input.minimumConfidenceBasisPoints !== undefined && confidence !== null && confidence < input.minimumConfidenceBasisPoints) {
    violations.push('confidence_below_threshold');
  } else if (input.minimumConfidenceBasisPoints !== undefined && confidence === null) {
    violations.push('confidence_unknown');
  }
  if (violations.some(v => v.includes('_missing') || v === 'critical_vulnerabilities_present' || v === 'identity_not_verified' || v === 'vendor_not_approved')) return { outcome: 'FAIL', violations };
  if (violations.length) return { outcome: 'UNKNOWN', violations };
  return { outcome: 'PASS', violations: [] };
}

export function evaluateAiDecision(input: {
  identity?: boolean;
  provenance?: boolean;
  permissionsKnown?: boolean;
  sensitiveDataAccessKnown?: boolean;
  humanApprovalKnown?: boolean;
  monitoringKnown?: boolean;
  criticalRisk?: boolean;
  evidenceAvailable?: boolean;
}): { decision: AiDecision; reasons: string[] } {
  const reasons: string[] = [];
  if (input.criticalRisk === true) reasons.push('critical_risk_observed');
  if (input.permissionsKnown === false || input.sensitiveDataAccessKnown === false) reasons.push('permissions_or_data_access_not_acceptable');
  if (input.provenance === false || input.identity === false) reasons.push('identity_or_provenance_unverified');
  if (input.monitoringKnown === false) reasons.push('monitoring_not_observed');
  if (input.humanApprovalKnown === false) reasons.push('human_approval_not_observed');
  if (input.evidenceAvailable === false) reasons.push('required_evidence_unavailable');
  if (input.criticalRisk === true) return { decision: 'BLOCK', reasons };
  if (reasons.includes('identity_or_provenance_unverified')) return { decision: 'RESTRICT', reasons };
  if (reasons.length) return { decision: 'REVIEW', reasons };
  const required = [input.identity, input.provenance, input.permissionsKnown, input.sensitiveDataAccessKnown, input.monitoringKnown, input.evidenceAvailable];
  if (required.some(v => v !== true)) return { decision: 'UNKNOWN', reasons: ['required_ai_trust_fields_not_fully_verified'] };
  return { decision: 'APPROVE', reasons: [] };
}

export function mapResponsibility(input: {
  vendorEvidence?: boolean;
  mspEvidence?: boolean;
  clientEvidence?: boolean;
  sharedEvidence?: boolean;
}): Responsibility {
  if (input.sharedEvidence) return 'SHARED';
  if (input.vendorEvidence && input.mspEvidence) return 'SHARED';
  if (input.vendorEvidence) return 'VENDOR';
  if (input.mspEvidence) return 'MSP';
  if (input.clientEvidence) return 'CLIENT';
  return 'UNKNOWN';
}

export function calculateClientImpact(input: {
  severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  affectedAssetCount: number;
  evidenceBacked: boolean;
  clientName?: string;
}): { severity: string; impact: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; recommendation: string } {
  if (!input.evidenceBacked) return { severity: input.severity, impact: 'UNKNOWN', recommendation: 'Collect or verify evidence before assigning business impact.' };
  if (input.affectedAssetCount <= 0) return { severity: input.severity, impact: 'LOW', recommendation: 'No downstream client assets are currently linked by observed evidence.' };
  const impact = input.severity === 'critical' ? 'CRITICAL' : input.severity === 'high' ? 'HIGH' : input.severity === 'medium' ? 'MEDIUM' : 'LOW';
  return { severity: input.severity, impact, recommendation: impact === 'CRITICAL' || impact === 'HIGH' ? 'Review affected client assets and initiate evidence-backed remediation.' : 'Monitor the affected asset and re-evaluate on the next trusted observation.' };
}

export function calculateRoi(input: {
  manualMinutes: number | null;
  assistedMinutes: number | null;
  assessmentsPerMonth: number | null;
  laborCostPerHour: number | null;
  clientPrice: number | null;
  sprCost: number | null;
}): {
  status: MeasurementStatus;
  minutesSaved: number | null;
  hoursSaved: number | null;
  laborSavings: number | null;
  capacityCreated: number | null;
  revenueGenerated: number | null;
  netBenefit: number | null;
  roiPercent: number | null;
} {
  const values = Object.values(input);
  if (values.some(v => v !== null && (!Number.isFinite(v) || v < 0))) throw new Error('ROI_INPUT_INVALID');
  const status: MeasurementStatus = input.manualMinutes !== null && input.assistedMinutes !== null && input.assessmentsPerMonth !== null && input.laborCostPerHour !== null ? 'MEASURED' : 'UNVERIFIED';
  if (input.manualMinutes === null || input.assistedMinutes === null || input.assessmentsPerMonth === null) return { status, minutesSaved: null, hoursSaved: null, laborSavings: null, capacityCreated: null, revenueGenerated: null, netBenefit: null, roiPercent: null };
  const minutesSaved = Math.max(0, input.manualMinutes - input.assistedMinutes);
  const hoursSaved = minutesSaved / 60;
  const capacityCreated = hoursSaved * input.assessmentsPerMonth;
  const laborSavings = input.laborCostPerHour === null ? null : capacityCreated * input.laborCostPerHour;
  const revenueGenerated = input.clientPrice === null ? null : input.clientPrice * input.assessmentsPerMonth;
  const netBenefit = (laborSavings ?? 0) + (revenueGenerated ?? 0) - (input.sprCost ?? 0);
  const roiPercent = input.sprCost && input.sprCost > 0 ? (netBenefit / input.sprCost) * 100 : null;
  return { status, minutesSaved, hoursSaved, laborSavings, capacityCreated, revenueGenerated, netBenefit, roiPercent };
}

function isPrivateIpv4(host: string) {
  const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [a,b,c,d] = match.slice(1).map(Number);
  if ([a,b,c,d].some(n => n < 0 || n > 255)) return true;
  return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function isBlockedIpv6(host: string) {
  const h = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

export function validateExternalUrl(raw: string): { ok: boolean; reason?: string; url?: URL } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'invalid_url' }; }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https_required' };
  if (url.username || url.password) return { ok: false, reason: 'credentials_in_url_blocked' };
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host.endsWith('.local') || host === 'metadata.google.internal') return { ok: false, reason: 'local_host_blocked' };
  if (isPrivateIpv4(host) || isBlockedIpv6(host)) return { ok: false, reason: 'private_or_invalid_ip' };
  url.username = '';
  url.password = '';
  return { ok: true, url };
}

export function sanitizeExternalEvidence(input: unknown): { content: unknown; untrusted: true } {
  // External evidence is data, never instructions. The trust engine consumes only structured fields.
  return { content: input, untrusted: true };
}