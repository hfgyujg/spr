import { describe, expect, it } from 'vitest';
import { validateExternalUrl, evaluateAiDecision, evaluatePolicy } from '../src/utils/msp-digital-trust.ts';

describe('MSP hardening regressions', () => {
  it('rejects loopback and link-local IPv6 URLs', () => {
    expect(validateExternalUrl('https://[::1]/').ok).toBe(false);
    expect(validateExternalUrl('https://[fe80::1]/').ok).toBe(false);
    expect(validateExternalUrl('https://[fc00::1]/').ok).toBe(false);
  });

  it('rejects userinfo in external URLs', () => {
    expect(validateExternalUrl('https://user:pass@example.com/').ok).toBe(false);
  });

  it('cannot approve AI when evidence is unavailable', () => {
    expect(evaluateAiDecision({
      identity: true,
      provenance: true,
      permissionsKnown: true,
      sensitiveDataAccessKnown: true,
      monitoringKnown: true,
      evidenceAvailable: false,
    }).decision).toBe('REVIEW');
  });

  it('cannot pass policies with unknown material controls', () => {
    expect(evaluatePolicy({
      identityVerified: true,
      evidenceFresh: true,
      criticalVulnerabilities: 0,
      provenance: true,
      monitoring: undefined,
    }).outcome).toBe('UNKNOWN');
  });
});
