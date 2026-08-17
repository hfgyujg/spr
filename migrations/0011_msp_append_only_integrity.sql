-- MSP append-only integrity hardening.
-- Closes relationship-link and audit-history mutation paths that are not covered by row-level tenant guards.

CREATE OR REPLACE FUNCTION msp_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_TRUST_RECORD';
END;
$$ LANGUAGE plpgsql;

-- A claim/evidence edge must never cross tenant boundaries.
CREATE OR REPLACE FUNCTION msp_claim_evidence_tenant_guard() RETURNS trigger AS $$
DECLARE claim_tenant text;
DECLARE evidence_tenant text;
BEGIN
  SELECT tenant_id INTO claim_tenant FROM msp_claims WHERE id = NEW.claim_id;
  SELECT tenant_id INTO evidence_tenant FROM msp_evidence WHERE id = NEW.evidence_id;
  PERFORM msp_assert_same_tenant(claim_tenant, evidence_tenant);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_claim_evidence_tenant_guard ON msp_claim_evidence;
CREATE TRIGGER trg_msp_claim_evidence_tenant_guard
BEFORE INSERT OR UPDATE ON msp_claim_evidence
FOR EACH ROW EXECUTE FUNCTION msp_claim_evidence_tenant_guard();

-- Trust claims are historical assertions; replace them with a new claim rather than mutating history.
DROP TRIGGER IF EXISTS trg_msp_claims_append_only ON msp_claims;
CREATE TRIGGER trg_msp_claims_append_only
BEFORE UPDATE OR DELETE ON msp_claims
FOR EACH ROW EXECUTE FUNCTION msp_reject_mutation();

-- Relationship/responsibility history must be append-only. A new observation gets a new row.
DROP TRIGGER IF EXISTS trg_msp_relationships_append_only ON msp_relationships;
CREATE TRIGGER trg_msp_relationships_append_only
BEFORE UPDATE OR DELETE ON msp_relationships
FOR EACH ROW EXECUTE FUNCTION msp_reject_mutation();

DROP TRIGGER IF EXISTS trg_msp_responsibilities_append_only ON msp_responsibilities;
CREATE TRIGGER trg_msp_responsibilities_append_only
BEFORE UPDATE OR DELETE ON msp_responsibilities
FOR EACH ROW EXECUTE FUNCTION msp_reject_mutation();

DROP TRIGGER IF EXISTS trg_msp_changes_append_only ON msp_changes;
CREATE TRIGGER trg_msp_changes_append_only
BEFORE UPDATE OR DELETE ON msp_changes
FOR EACH ROW EXECUTE FUNCTION msp_reject_mutation();

DROP TRIGGER IF EXISTS trg_msp_policy_results_append_only ON msp_policy_results;
CREATE TRIGGER trg_msp_policy_results_append_only
BEFORE UPDATE OR DELETE ON msp_policy_results
FOR EACH ROW EXECUTE FUNCTION msp_reject_mutation();

-- Audit records themselves are append-only. The existing audit chain remains readable but cannot be rewritten.
DROP TRIGGER IF EXISTS trg_msp_audit_append_only ON audit_trail;
CREATE TRIGGER trg_msp_audit_append_only
BEFORE UPDATE OR DELETE ON audit_trail
FOR EACH ROW WHEN (OLD.action LIKE 'MSP_%')
EXECUTE FUNCTION msp_reject_mutation();

-- Reject blank/invalid cryptographic references at the database boundary for new evidence edges.
ALTER TABLE msp_evidence
  ADD CONSTRAINT msp_evidence_hash_format
  CHECK (canonical_hash ~ '^sha256:[0-9a-f]{64}$');

ALTER TABLE msp_decisions
  ADD CONSTRAINT msp_decision_outcome_known
  CHECK (outcome IN ('PASS','FAIL','UNKNOWN','REVIEW','APPROVE','RESTRICT','BLOCK'));

ALTER TABLE msp_policy_results
  ADD CONSTRAINT msp_policy_result_outcome_known
  CHECK (outcome IN ('PASS','FAIL','UNKNOWN','REVIEW'));
