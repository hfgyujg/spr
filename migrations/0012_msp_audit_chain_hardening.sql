-- MSP audit-chain hardening.
-- Serializes tenant audit writes and prevents broken hash chains.

CREATE OR REPLACE FUNCTION msp_audit_chain_guard() RETURNS trigger AS $$
DECLARE
  prior_hash text;
  prior_id bigint;
BEGIN
  -- Serialize writers for this tenant for the duration of the transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id, 0));

  SELECT id, current_hash
    INTO prior_id, prior_hash
    FROM audit_trail
   WHERE tenant_id = NEW.tenant_id
   ORDER BY id DESC
   LIMIT 1;

  IF prior_id IS NULL THEN
    IF NEW.previous_hash NOT IN ('GENESIS', 'msp-digital-trust') THEN
      RAISE EXCEPTION 'AUDIT_CHAIN_GENESIS_MISMATCH';
    END IF;
  ELSIF NEW.previous_hash <> prior_hash THEN
    RAISE EXCEPTION 'AUDIT_CHAIN_PREVIOUS_HASH_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_audit_chain_guard ON audit_trail;
CREATE TRIGGER trg_msp_audit_chain_guard
BEFORE INSERT ON audit_trail
FOR EACH ROW WHEN (NEW.action LIKE 'MSP_%')
EXECUTE FUNCTION msp_audit_chain_guard();

-- Do not permit mutation or deletion of the MSP audit ledger.
CREATE OR REPLACE FUNCTION msp_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_AUDIT_LEDGER';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_audit_immutable ON audit_trail;
CREATE TRIGGER trg_msp_audit_immutable
BEFORE UPDATE OR DELETE ON audit_trail
FOR EACH ROW WHEN (OLD.action LIKE 'MSP_%')
EXECUTE FUNCTION msp_reject_audit_mutation();

-- Bound trust decision vocabulary at the database boundary.
ALTER TABLE msp_decisions
  DROP CONSTRAINT IF EXISTS msp_decision_outcome_check;
ALTER TABLE msp_decisions
  ADD CONSTRAINT msp_decision_outcome_check
  CHECK (outcome IN ('PASS','FAIL','UNKNOWN','REVIEW','APPROVE','RESTRICT','BLOCK'));

ALTER TABLE msp_policy_results
  DROP CONSTRAINT IF EXISTS msp_policy_result_outcome_check;
ALTER TABLE msp_policy_results
  ADD CONSTRAINT msp_policy_result_outcome_check
  CHECK (outcome IN ('PASS','FAIL','UNKNOWN','REVIEW'));

ALTER TABLE msp_responsibilities
  DROP CONSTRAINT IF EXISTS msp_responsibility_value_check;
ALTER TABLE msp_responsibilities
  ADD CONSTRAINT msp_responsibility_value_check
  CHECK (responsibility IN ('VENDOR','MSP','CLIENT','SHARED','UNKNOWN'));

ALTER TABLE msp_ai_assets
  DROP CONSTRAINT IF EXISTS msp_ai_type_check;
ALTER TABLE msp_ai_assets
  ADD CONSTRAINT msp_ai_type_check
  CHECK (ai_type IN ('AI MODEL','AI APPLICATION','AI AGENT','AI TOOL','PLUGIN','API','DATA SOURCE','VECTOR DATABASE','EXTERNAL SERVICE'));
