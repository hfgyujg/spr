-- MSP audit-chain integrity hardening.
-- The audit chain is append-only and serialized per tenant.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION msp_audit_current_hash(
  p_tenant text,
  p_actor text,
  p_action text,
  p_timestamp text,
  p_payload text,
  p_previous_hash text
) RETURNS text AS $$
BEGIN
  RETURN 'sha256:' || encode(
    digest(
      json_build_object(
        'tenantId', p_tenant,
        'actor', p_actor,
        'action', p_action,
        'timestamp', p_timestamp,
        'payload', p_payload,
        'previousHash', p_previous_hash
      )::text,
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION msp_audit_chain_guard() RETURNS trigger AS $$
DECLARE
  previous_row audit_trail%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'IMMUTABLE_AUDIT_RECORD';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id, 0));

  SELECT * INTO previous_row
  FROM audit_trail
  WHERE tenant_id = NEW.tenant_id
  ORDER BY id DESC
  LIMIT 1;

  IF FOUND THEN
    IF NEW.previous_hash <> previous_row.current_hash THEN
      RAISE EXCEPTION 'AUDIT_CHAIN_PREVIOUS_HASH_MISMATCH';
    END IF;
  ELSE
    IF NEW.previous_hash <> 'GENESIS' THEN
      RAISE EXCEPTION 'AUDIT_CHAIN_INVALID_GENESIS';
    END IF;
  END IF;

  -- The database is the final source of truth for the chain hash. The application
  -- may supply any placeholder current_hash; it is overwritten before persistence.
  NEW.current_hash := msp_audit_current_hash(
    NEW.tenant_id,
    NEW.actor,
    NEW.action,
    NEW.timestamp,
    NEW.payload,
    NEW.previous_hash
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_msp_audit_chain_guard ON audit_trail;
CREATE TRIGGER trg_msp_audit_chain_guard
BEFORE INSERT OR UPDATE OR DELETE ON audit_trail
FOR EACH ROW EXECUTE FUNCTION msp_audit_chain_guard();

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_tenant_timestamp_hash
  ON audit_trail (tenant_id, timestamp, current_hash);

COMMENT ON TRIGGER trg_msp_audit_chain_guard ON audit_trail IS
  'Append-only, tenant-serialized, database-derived cryptographic audit chain';
