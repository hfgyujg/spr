-- MSP responsibility and AI asset vocabulary hardening.
-- Added after existing audit-chain migrations so production migration history remains append-only.

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
