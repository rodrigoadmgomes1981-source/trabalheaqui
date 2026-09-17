import {neon} from '@neondatabase/serverless';

export function database(){
  const connection=process.env.DATABASE_URL||process.env.POSTGRES_URL;
  if(!connection)throw new Error('DATABASE_NOT_CONFIGURED');
  return neon(connection);
}

let schemaReady=null;
export function ensureSchema(sql){
  if(!schemaReady){
    schemaReady=(async()=>{
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
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS sectors TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS specialties TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS employers TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_text TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS search_text TEXT`;
      // Cadastros antigos: índice de busca a partir dos campos existentes.
      await sql`UPDATE candidates SET search_text=btrim(regexp_replace(translate(lower(concat_ws(' ',name,profession,council,city,state,skills,sectors,specialties,employers,education,summary,resume_text)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+',' ','g')) WHERE search_text IS NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_candidates_profession_state ON candidates(profession,state)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at DESC)`;
    })().catch(error=>{schemaReady=null;throw error});
  }
  return schemaReady;
}
