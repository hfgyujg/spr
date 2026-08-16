BEGIN;

CREATE TABLE IF NOT EXISTS remediation_verifications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  task_id text NOT NULL,
  client_id text NOT NULL,
  alert_id text NOT NULL,
  monitoring_configuration_id text NOT NULL,
  collector_job_id text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  observation_id text,
  evidence_ids text NOT NULL DEFAULT '[]',
  evaluator_version text,
  failure_reason text,
  created_at text NOT NULL,
  completed_at text
);

CREATE UNIQUE INDEX IF NOT EXISTS remediation_verifications_active_task_idx ON remediation_verifications (tenant_id, task_id) WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX IF NOT EXISTS remediation_verifications_tenant_task_idx ON remediation_verifications (tenant_id, task_id, created_at DESC);

COMMIT;
