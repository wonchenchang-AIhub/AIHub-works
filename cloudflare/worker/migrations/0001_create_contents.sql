CREATE TABLE IF NOT EXISTS contents (
  content_id TEXT PRIMARY KEY,
  normalized_type TEXT NOT NULL CHECK (normalized_type IN ('learning', 'tools', 'notes')),
  content_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL,
  publish_date TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  source_url TEXT NOT NULL DEFAULT '',
  source_message_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contents_public
  ON contents (status, normalized_type, sort_order DESC, publish_date DESC);

CREATE INDEX IF NOT EXISTS idx_contents_source_url
  ON contents (source_url)
  WHERE source_url <> '';

CREATE INDEX IF NOT EXISTS idx_contents_source_message_id
  ON contents (source_message_id)
  WHERE source_message_id <> '';
