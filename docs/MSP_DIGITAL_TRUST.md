# SPR MSP Digital Trust

## Architecture

The MSP Digital Trust layer extends the existing Software Passport, evidence, immutable Trust Observation, continuous monitoring, RBAC, audit ledger, and SBOM infrastructure. It does not replace those systems.

The trust chain is:

`entity -> claim -> evidence -> source -> observation -> timestamp/hash -> confidence -> rule -> decision`

Existing `trust_observations` and `trust_observation_changes` remain authoritative for observed trust state and change history. The MSP tables provide graph relationships, policy versions/results, AI asset metadata, service packages, ROI inputs, and immutable report snapshots.

## Evidence rules

- Evidence is data, never instructions.
- External evidence is explicitly marked untrusted before deterministic processing.
- SHA-256 hashes are calculated over canonical payloads.
- Conflicting verified evidence produces `CONFLICT`/`REVIEW` rather than an invented winner.
- Missing evidence produces `UNKNOWN` or `UNVERIFIED`.
- Freshness is evaluated from observation timestamps and policy thresholds.

## MSP workflow

1. Select a tenant-scoped Passport.
2. Inspect current Trust Observation and evidence freshness.
3. Review changes and evidence provenance.
4. Evaluate the applicable deterministic policy.
5. Review responsibility and client impact.
6. For AI/agent assets, record only observable attributes and evidence references.
7. Generate an immutable white-label report snapshot.
8. Use continuous monitoring to create the next trusted observation.

## Policy semantics

`PASS` requires all required inputs to be known and compliant. `FAIL` is reserved for explicit evidence-backed violations. `UNKNOWN` is never converted to `PASS`. `REVIEW` is used when evidence is materially incomplete, conflicting, or requires human assessment.

## AI / Agent Passport

AI assets use the existing Passport identity as their anchor and add type, provider, model/version, permissions, data access, provenance, monitoring, human approval, dependencies, and evidence references where observable. The deterministic engine can return `APPROVE`, `REVIEW`, `RESTRICT`, `BLOCK`, or `UNKNOWN`. No safety claim is inferred from model names or vendor reputation.

## Responsibility and impact

Responsibility is evidence-backed only. If vendor, MSP, client, or shared responsibility cannot be supported by stored evidence/rules, the result is `UNKNOWN`.

Business impact is likewise evidence-backed. A technical severity without a demonstrated downstream relationship does not become a business impact claim.

## ROI methodology

ROI fields are stored with provenance. The engine distinguishes measured inputs from estimates, user-provided values, and unverified values. No default labor rate, assessment time, client price, or SPR cost is silently treated as measured.

## API

Authenticated MSP APIs are mounted under `/api/msp` and inherit the existing production hardening middleware, Firebase authentication, tenant isolation, RBAC, and shared rate limiting.

Core endpoints include:

- `GET /api/msp/passport/:id`
- `GET /api/msp/trust-state/:id`
- `GET /api/msp/evidence/:passportId`
- `GET /api/msp/changes/:passportId`
- `GET /api/msp/graph/:passportId`
- `GET /api/msp/decision/:entityId`
- `GET /api/msp/dependencies/:entityId`
- `GET /api/msp/impact/:entityId`
- `GET/POST /api/msp/policies`
- `POST /api/msp/policies/:id/evaluate`
- `POST /api/msp/ai/passport`
- `POST /api/msp/roi/calculate`
- `GET /api/msp/roi/:clientId`
- `GET/POST /api/msp/services`
- `GET /api/msp/reports/:clientId`
- `POST /api/msp/reports`

## Security model

All new API inputs are Zod validated. All resource reads are tenant scoped. Mutating operations use role checks. External URLs require HTTPS and reject obvious loopback/private IPv4 targets. Immutable evidence, decisions, and report snapshots are protected by database triggers. Audit events are written to the existing tamper-evident audit trail.

Network-level SSRF defense must still be enforced at the actual outbound fetch layer because DNS can resolve public hostnames to private addresses. The URL validator is a first gate, not a complete network sandbox.

## Migration

`0009_msp_digital_trust.sql` is additive and transactional under the existing migration runner. It creates only new tables, indexes, triggers, and constraints; it does not delete or rewrite existing production records.
