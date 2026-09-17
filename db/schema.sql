CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT 'Não identificada',
  council TEXT,
  council_number TEXT,
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  experience_years INTEGER NOT NULL DEFAULT 0,
  skills TEXT NOT NULL DEFAULT '',
  resume_url TEXT NOT NULL DEFAULT '',
  resume_name TEXT NOT NULL,
  resume_type TEXT NOT NULL,
  resume_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidates_profession_state ON candidates(profession,state);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at DESC);
