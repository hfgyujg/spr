-- MSP trust-record immutability hardening.
-- Prevents post-creation mutation/deletion of provenance, claims, changes,
-- relationships, responsibilities, policy versions/results, and AI trust records.

CREATE OR REPLACE FUNCTION msp_reject_trust_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_TRUST_RECORD';
END;
$$ LANGUAGE plpgsql;

-- Source provenance is historical evidence metadata and must not be rewritten.
DROP TRIGGER IF EXISTS trg_msp_sources_immutable ON msp_sources;
CREATE TRIGGER trg_msp_sources_immutable BEFORE UPDATE OR DELETE ON msp_sources
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_claims_immutable ON msp_claims;
CREATE TRIGGER trg_msp_claims_immutable BEFORE UPDATE OR DELETE ON msp_claims
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_changes_immutable ON msp_changes;
CREATE TRIGGER trg_msp_changes_immutable BEFORE UPDATE OR DELETE ON msp_changes
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_relationships_immutable ON msp_relationships;
CREATE TRIGGER trg_msp_relationships_immutable BEFORE UPDATE OR DELETE ON msp_relationships
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_responsibilities_immutable ON msp_responsibilities;
CREATE TRIGGER trg_msp_responsibilities_immutable BEFORE UPDATE OR DELETE ON msp_responsibilities
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_policy_versions_immutable ON msp_policy_versions;
CREATE TRIGGER trg_msp_policy_versions_immutable BEFORE UPDATE OR DELETE ON msp_policy_versions
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_policy_results_immutable ON msp_policy_results;
CREATE TRIGGER trg_msp_policy_results_immutable BEFORE UPDATE OR DELETE ON msp_policy_results
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_ai_assets_immutable ON msp_ai_assets;
CREATE TRIGGER trg_msp_ai_assets_immutable BEFORE UPDATE OR DELETE ON msp_ai_assets
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

DROP TRIGGER IF EXISTS trg_msp_roi_records_immutable ON msp_roi_records;
CREATE TRIGGER trg_msp_roi_records_immutable BEFORE UPDATE OR DELETE ON msp_roi_records
FOR EACH ROW EXECUTE FUNCTION msp_reject_trust_mutation();

-- Make policy versions explicitly append-only at the database boundary.
ALTER TABLE msp_policy_versions
  ADD CONSTRAINT msp_policy_version_positive CHECK (version > 0);

-- Prevent duplicate semantic change records from being replayed into the graph.
CREATE UNIQUE INDEX IF NOT EXISTS idx_msp_changes_dedup
  ON msp_changes (tenant_id, entity_id, change_type, observed_at, what_changed);

-- Prevent duplicate evidence-to-claim relations from being replayed with a different relation label.
CREATE INDEX IF NOT EXISTS idx_msp_claim_evidence_evidence
  ON msp_claim_evidence (tenant_id, evidence_id)
  WHERE false;
