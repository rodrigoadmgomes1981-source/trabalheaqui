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
      // Vagas publicadas no portal interno e espelhadas no portal do candidato.
      await sql`CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY,
        title TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT '',
        state CHAR(2) NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        salary TEXT NOT NULL DEFAULT '',
        contract TEXT NOT NULL DEFAULT 'CLT',
        status TEXT NOT NULL DEFAULT 'publicada',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      // Candidaturas: quem demonstrou interesse em cada vaga e em que etapa está.
      await sql`CREATE TABLE IF NOT EXISTS applications (
        id UUID PRIMARY KEY,
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        stage TEXT NOT NULL DEFAULT 'recebido',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(job_id,candidate_id)
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status,created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id,stage)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_candidates_profession_state ON candidates(profession,state)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at DESC)`;
    })().catch(error=>{schemaReady=null;throw error});
  }
  return schemaReady;
}
