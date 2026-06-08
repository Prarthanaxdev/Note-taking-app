-- Adds tsvector generated column and GIN index for full-text search on Note.
-- Uses IF NOT EXISTS for idempotency — safe to re-run.

ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS ts tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title, '') || ' ' || coalesce("contentText", ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS note_ts_gin ON "Note" USING GIN(ts);
