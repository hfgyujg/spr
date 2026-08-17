-- MSP tenant-integrity hardening.
-- Prevents cross-tenant references even if an application-level authorization check is bypassed.

CREATE OR REPLACE FUNCTION msp_assert_same_tenant(child_tenant text, referenced_tenant text)
RETURNS void AS $$
BEGIN
  IF child_tenant IS NULL OR referenced_tenant IS NULL OR child_tenant <> referenced_tenant THEN
    RAISE EXCEPTION 'CROSS_TENANT_REFERENCE_BLOCKED';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION msp_claim_tenant_guard() RETURNS trigger AS $$
DECLARE parent_tenant text;
BEGIN
  SELECT tenant_id INTO parent_tenant FROM msp_entities WHERE id = NEW.entity_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, parent_tenant);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_claim_tenant_guard ON msp_claims;
CREATE TRIGGER trg_msp_claim_tenant_guard BEFORE INSERT OR UPDATE ON msp_claims
FOR EACH ROW EXECUTE FUNCTION msp_claim_tenant_guard();

CREATE OR REPLACE FUNCTION msp_evidence_source_tenant_guard() RETURNS trigger AS $$
DECLARE parent_tenant text;
BEGIN
  IF NEW.source_id IS NOT NULL THEN
    SELECT tenant_id INTO parent_tenant FROM msp_sources WHERE id = NEW.source_id;
    PERFORM msp_assert_same_tenant(NEW.tenant_id, parent_tenant);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_evidence_source_tenant_guard ON msp_evidence;
CREATE TRIGGER trg_msp_evidence_source_tenant_guard BEFORE INSERT OR UPDATE ON msp_evidence
FOR EACH ROW EXECUTE FUNCTION msp_evidence_source_tenant_guard();

CREATE OR REPLACE FUNCTION msp_decision_tenant_guard() RETURNS trigger AS $$
DECLARE entity_tenant text;
DECLARE rule_tenant text;
BEGIN
  SELECT tenant_id INTO entity_tenant FROM msp_entities WHERE id = NEW.entity_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, entity_tenant);
  IF NEW.rule_id IS NOT NULL THEN
    SELECT tenant_id INTO rule_tenant FROM msp_rules WHERE id = NEW.rule_id;
    IF rule_tenant IS NOT NULL THEN PERFORM msp_assert_same_tenant(NEW.tenant_id, rule_tenant); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_decision_tenant_guard ON msp_decisions;
CREATE TRIGGER trg_msp_decision_tenant_guard BEFORE INSERT OR UPDATE ON msp_decisions
FOR EACH ROW EXECUTE FUNCTION msp_decision_tenant_guard();

CREATE OR REPLACE FUNCTION msp_relationship_tenant_guard() RETURNS trigger AS $$
DECLARE from_tenant text;
DECLARE to_tenant text;
BEGIN
  SELECT tenant_id INTO from_tenant FROM msp_entities WHERE id = NEW.from_entity_id;
  SELECT tenant_id INTO to_tenant FROM msp_entities WHERE id = NEW.to_entity_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, from_tenant);
  PERFORM msp_assert_same_tenant(NEW.tenant_id, to_tenant);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_relationship_tenant_guard ON msp_relationships;
CREATE TRIGGER trg_msp_relationship_tenant_guard BEFORE INSERT OR UPDATE ON msp_relationships
FOR EACH ROW EXECUTE FUNCTION msp_relationship_tenant_guard();

CREATE OR REPLACE FUNCTION msp_responsibility_tenant_guard() RETURNS trigger AS $$
DECLARE entity_tenant text;
BEGIN
  SELECT tenant_id INTO entity_tenant FROM msp_entities WHERE id = NEW.risk_entity_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, entity_tenant);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_responsibility_tenant_guard ON msp_responsibilities;
CREATE TRIGGER trg_msp_responsibility_tenant_guard BEFORE INSERT OR UPDATE ON msp_responsibilities
FOR EACH ROW EXECUTE FUNCTION msp_responsibility_tenant_guard();

CREATE OR REPLACE FUNCTION msp_policy_result_tenant_guard() RETURNS trigger AS $$
DECLARE policy_tenant text;
DECLARE version_policy text;
DECLARE entity_tenant text;
BEGIN
  SELECT tenant_id INTO policy_tenant FROM msp_policies WHERE id = NEW.policy_id;
  SELECT policy_id INTO version_policy FROM msp_policy_versions WHERE id = NEW.policy_version_id;
  SELECT tenant_id INTO entity_tenant FROM msp_entities WHERE id = NEW.entity_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, policy_tenant);
  PERFORM msp_assert_same_tenant(NEW.tenant_id, entity_tenant);
  IF version_policy IS NULL OR version_policy <> NEW.policy_id THEN RAISE EXCEPTION 'POLICY_VERSION_MISMATCH'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_policy_result_tenant_guard ON msp_policy_results;
CREATE TRIGGER trg_msp_policy_result_tenant_guard BEFORE INSERT OR UPDATE ON msp_policy_results
FOR EACH ROW EXECUTE FUNCTION msp_policy_result_tenant_guard();

CREATE OR REPLACE FUNCTION msp_ai_asset_tenant_guard() RETURNS trigger AS $$
DECLARE entity_tenant text;
BEGIN
  SELECT tenant_id INTO entity_tenant FROM msp_entities WHERE id = NEW.entity_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, entity_tenant);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_ai_asset_tenant_guard ON msp_ai_assets;
CREATE TRIGGER trg_msp_ai_asset_tenant_guard BEFORE INSERT OR UPDATE ON msp_ai_assets
FOR EACH ROW EXECUTE FUNCTION msp_ai_asset_tenant_guard();

CREATE OR REPLACE FUNCTION msp_report_passport_tenant_guard() RETURNS trigger AS $$
DECLARE passport_tenant text;
DECLARE client_tenant text;
BEGIN
  SELECT tenant_id INTO passport_tenant FROM passports WHERE id = NEW.passport_id;
  SELECT tenant_id INTO client_tenant FROM clients WHERE id = NEW.client_id;
  PERFORM msp_assert_same_tenant(NEW.tenant_id, passport_tenant);
  PERFORM msp_assert_same_tenant(NEW.tenant_id, client_tenant);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_report_passport_tenant_guard ON msp_reports;
CREATE TRIGGER trg_msp_report_passport_tenant_guard BEFORE INSERT OR UPDATE ON msp_reports
FOR EACH ROW EXECUTE FUNCTION msp_report_passport_tenant_guard();
