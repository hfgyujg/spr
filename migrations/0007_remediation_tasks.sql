BEGIN;

CREATE TABLE IF NOT EXISTS remediation_tasks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  client_id text NOT NULL,
  alert_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_VERIFICATION', 'VERIFICATION_QUEUED', 'VERIFYING', 'VERIFIED', 'STILL_OBSERVED', 'VERIFICATION_FAILED')),
  assignee_id text,
  created_by text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  completed_at text,
  ready_for_verification_at text,
  verified_at text,
  verification_job_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS remediation_tasks_one_active_per_alert
  ON remediation_tasks (tenant_id, alert_id)
  WHERE status NOT IN ('VERIFIED');
CREATE INDEX IF NOT EXISTS remediation_tasks_tenant_updated_idx ON remediation_tasks (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS remediation_tasks_tenant_client_idx ON remediation_tasks (tenant_id, client_id);

COMMIT;
