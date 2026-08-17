-- MSP Digital Trust Layer
-- Non-destructive, tenant-scoped, append-oriented persistence.
-- Existing Passport, Evidence, Trust Observation and Monitoring tables remain authoritative.

CREATE TABLE IF NOT EXISTS msp_entities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS msp_sources (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_type text NOT NULL,
  locator text,
  publisher text,
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, locator, observed_at)
);

CREATE TABLE IF NOT EXISTS msp_claims (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  claim_type text NOT NULL,
  statement text NOT NULL,
  state text NOT NULL DEFAULT 'UNKNOWN',
  confidence_basis_points integer NOT NULL DEFAULT 0 CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_evidence (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  source_id text REFERENCES msp_sources(id) ON DELETE RESTRICT,
  observation_id text,
  evidence_type text NOT NULL,
  status text NOT NULL DEFAULT 'UNVERIFIED',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_hash text NOT NULL,
  observed_at timestamptz NOT NULL,
  freshness_seconds integer,
  confidence_basis_points integer NOT NULL DEFAULT 0 CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  immutable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_claim_evidence (
  claim_id text NOT NULL REFERENCES msp_claims(id) ON DELETE RESTRICT,
  evidence_id text NOT NULL REFERENCES msp_evidence(id) ON DELETE RESTRICT,
  relation text NOT NULL DEFAULT 'supports',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, evidence_id, relation)
);

CREATE TABLE IF NOT EXISTS msp_rules (
  id text PRIMARY KEY,
  tenant_id text,
  rule_version text NOT NULL,
  rule_type text NOT NULL,
  definition jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_decisions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  decision_type text NOT NULL,
  outcome text NOT NULL,
  rule_id text REFERENCES msp_rules(id) ON DELETE RESTRICT,
  rule_version text NOT NULL,
  confidence_basis_points integer NOT NULL DEFAULT 0 CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_at timestamptz NOT NULL DEFAULT now(),
  immutable boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS msp_changes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  change_type text NOT NULL,
  severity text NOT NULL,
  what_changed text NOT NULL,
  previous_state jsonb NOT NULL DEFAULT 'null'::jsonb,
  current_state jsonb NOT NULL DEFAULT 'null'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text,
  confidence_basis_points integer NOT NULL DEFAULT 0 CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_relationships (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  from_entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  to_entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  relation_type text NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_basis_points integer NOT NULL DEFAULT 0 CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_entity_id, to_entity_id, relation_type)
);

CREATE TABLE IF NOT EXISTS msp_responsibilities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  risk_entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  responsibility text NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_version text NOT NULL,
  confidence_basis_points integer NOT NULL DEFAULT 0 CHECK (confidence_basis_points BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_policies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  name text NOT NULL,
  active_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_policy_versions (
  id text PRIMARY KEY,
  policy_id text NOT NULL REFERENCES msp_policies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, version)
);

CREATE TABLE IF NOT EXISTS msp_policy_results (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  policy_id text NOT NULL REFERENCES msp_policies(id) ON DELETE RESTRICT,
  policy_version_id text NOT NULL REFERENCES msp_policy_versions(id) ON DELETE RESTRICT,
  entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  outcome text NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_ai_assets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  entity_id text NOT NULL REFERENCES msp_entities(id) ON DELETE RESTRICT,
  ai_type text NOT NULL,
  provider text,
  model_version text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_service_packages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  included_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  monitoring_frequency text,
  report_schedule text,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  white_label jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_roi_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  client_id text NOT NULL,
  manual_minutes numeric,
  assisted_minutes numeric,
  assessments_per_month numeric,
  labor_cost_per_hour numeric,
  client_price numeric,
  spr_cost numeric,
  value_status text NOT NULL DEFAULT 'UNVERIFIED',
  inputs_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS msp_reports (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  client_id text NOT NULL,
  passport_id text NOT NULL,
  report_reference text NOT NULL UNIQUE,
  brand_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  immutable boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_msp_entities_tenant ON msp_entities(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_msp_claims_tenant_entity ON msp_claims(tenant_id, entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_msp_evidence_tenant_observed ON msp_evidence(tenant_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_msp_changes_tenant_observed ON msp_changes(tenant_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_msp_relationships_tenant_from ON msp_relationships(tenant_id, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_msp_relationships_tenant_to ON msp_relationships(tenant_id, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_msp_policy_results_tenant_entity ON msp_policy_results(tenant_id, entity_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msp_ai_assets_tenant ON msp_ai_assets(tenant_id, ai_type);
CREATE INDEX IF NOT EXISTS idx_msp_reports_tenant_client ON msp_reports(tenant_id, client_id, generated_at DESC);

-- Prevent accidental mutation of immutable trust records.
CREATE OR REPLACE FUNCTION msp_reject_immutable_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_TRUST_RECORD';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_evidence_immutable ON msp_evidence;
CREATE TRIGGER trg_msp_evidence_immutable BEFORE UPDATE OR DELETE ON msp_evidence
FOR EACH ROW WHEN (OLD.immutable = true) EXECUTE FUNCTION msp_reject_immutable_mutation();

DROP TRIGGER IF EXISTS trg_msp_decisions_immutable ON msp_decisions;
CREATE TRIGGER trg_msp_decisions_immutable BEFORE UPDATE OR DELETE ON msp_decisions
FOR EACH ROW WHEN (OLD.immutable = true) EXECUTE FUNCTION msp_reject_immutable_mutation();

DROP TRIGGER IF EXISTS trg_msp_reports_immutable ON msp_reports;
CREATE TRIGGER trg_msp_reports_immutable BEFORE UPDATE OR DELETE ON msp_reports
FOR EACH ROW WHEN (OLD.immutable = true) EXECUTE FUNCTION msp_reject_immutable_mutation();
