-- Compatibility migration slot retained for the production migration ledger.
-- The former 0005 migration was superseded; this no-op preserves contiguous ordering
-- without changing or deleting any production data.
SELECT 1;
