-- SPR Connect: machine-to-machine integration infrastructure
CREATE TABLE IF NOT EXISTS spr_api_keys (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text NOT NULL DEFAULT '["read"]',
  last_used_at text,
  expires_at text,
  revoked_at text,
  created_by text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS spr_api_keys_tenant_idx ON spr_api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS spr_assets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  passport_id text NOT NULL,
  external_id text,
  name text NOT NULL,
  source_type text NOT NULL,
  source_url text,
  version text,
  publisher text,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS spr_assets_tenant_idx ON spr_assets(tenant_id);
CREATE INDEX IF NOT EXISTS spr_assets_passport_idx ON spr_assets(passport_id);
CREATE UNIQUE INDEX IF NOT EXISTS spr_assets_external_idx ON spr_assets(tenant_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS spr_webhooks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  url text NOT NULL,
  secret_hash text NOT NULL,
  events text NOT NULL DEFAULT '["passport.updated","trust.changed","risk.created","risk.resolved","evidence.updated","verification.completed","verification.expired"]',
  enabled integer NOT NULL DEFAULT 1,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS spr_webhooks_tenant_idx ON spr_webhooks(tenant_id);

CREATE TABLE IF NOT EXISTS spr_webhook_deliveries (
  id text PRIMARY KEY,
  webhook_id text NOT NULL,
  event_type text NOT NULL,
  payload text NOT NULL,
  status_code integer,
  attempt_count integer NOT NULL DEFAULT 0,
  delivered_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS spr_webhook_deliveries_webhook_idx ON spr_webhook_deliveries(webhook_id);

CREATE TABLE IF NOT EXISTS spr_integration_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  event_type text NOT NULL,
  asset_id text,
  passport_id text,
  payload text NOT NULL,
  idempotency_key text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS spr_integration_events_idempotency_idx ON spr_integration_events(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
