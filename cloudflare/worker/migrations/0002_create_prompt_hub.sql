CREATE TABLE IF NOT EXISTS prompt_categories (
  category_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  css_class TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompts (
  prompt_id INTEGER PRIMARY KEY,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES prompt_categories(category_id)
);

CREATE TABLE IF NOT EXISTS prompt_cases (
  case_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt_ids_json TEXT NOT NULL CHECK (json_valid(prompt_ids_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompts_public
  ON prompts (status, sort_order ASC, prompt_id ASC);

CREATE INDEX IF NOT EXISTS idx_prompts_category
  ON prompts (category_id, status, sort_order ASC);

CREATE INDEX IF NOT EXISTS idx_prompt_cases_public
  ON prompt_cases (status, sort_order ASC, case_id ASC);
