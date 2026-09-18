import {database,ensureSchema} from '../lib/db.js';
import {authorized} from '../lib/util.js';

/**
 * Currículos recebidos nas últimas horas (padrão: 2).
 *
 * GET /api/recent            -> { horas, total, agora }
 * GET /api/recent?listar=1   -> também devolve os currículos do período
 *
 * Consulta leve, feita para ser chamada de tempos em tempos pela tela.
 */
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  try{
    const horas=Math.min(Math.max(parseInt(req.query.horas||'2',10)||2,1),72);
    const sql=database();
    await ensureSchema(sql);

    const [{total}]=await sql`SELECT count(*)::int AS total FROM candidates WHERE created_at > now() - (${horas}::int * interval '1 hour')`;
    res.setHeader('cache-control','no-store');

    if(!req.query.listar)return res.status(200).json({horas,total,agora:new Date().toISOString()});

    const results=await sql`
      SELECT id,name,phone,email,profession,council,council_number,city,state,experience_years,
             skills,sectors,specialties,employers,education,summary,resume_name,resume_type,created_at
      FROM candidates
      WHERE created_at > now() - (${horas}::int * interval '1 hour')
      ORDER BY created_at DESC
      LIMIT 100`;
    return res.status(200).json({horas,total,agora:new Date().toISOString(),
      results:results.map(r=>({...r,matched:[],missing:[],score:100}))});
  }catch(e){
    console.error(e);
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível contar os currículos recentes.'});
  }
}
