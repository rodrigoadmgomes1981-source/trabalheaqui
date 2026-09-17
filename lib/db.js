import {neon} from '@neondatabase/serverless';

export function database(){
  if(!process.env.POSTGRES_URL)throw new Error('DATABASE_NOT_CONFIGURED');
  return neon(process.env.POSTGRES_URL);
}

export async function ensureSchema(sql){
  await sql`CREATE TABLE IF NOT EXISTS candidates (
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
  )`;
  await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_data BYTEA`;
}
