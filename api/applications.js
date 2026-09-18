import {randomUUID} from 'node:crypto';
import {database,ensureSchema} from '../lib/db.js';
import {DESCARTADO,ETAPAS,ETAPAS_VALIDAS,etapaAnterior,proximaEtapa} from '../lib/vagas.js';
import {authorized} from '../lib/util.js';

/**
 * Candidaturas de uma vaga (portal interno).
 *
 * GET   /api/applications?job=<id>  -> vaga + candidatos com a etapa de cada um
 * PATCH /api/applications?id=<id>   -> { acao: 'curtir' | 'descartar' | 'voltar' | 'restaurar' }
 *                                      ou { stage: '<etapa>' }
 * POST  /api/applications           -> { jobId, candidateId } liga um candidato do banco à vaga
 *
 * Curtir avança uma etapa; descartar devolve o candidato ao banco de talentos
 * (a ficha continua no banco, só sai da esteira da vaga).
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lerJson(req){
  if(req.body&&typeof req.body==='object')return req.body;
  let bruto='';
  for await(const parte of req){bruto+=parte;if(bruto.length>20000)throw new Error('CORPO_GRANDE')}
  try{return JSON.parse(bruto||'{}')}catch{return {}}
}

export default async function handler(req,res){
  if(!['GET','POST','PATCH'].includes(req.method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'Método não permitido.'});
  }
  if(!authorized(req,res))return;
  try{
    const sql=database();
    await ensureSchema(sql);

    if(req.method==='GET'){
      const jobId=String(req.query.job||'');
      if(!UUID.test(jobId))return res.status(404).json({error:'Vaga não encontrada.'});
      const [vaga]=await sql`SELECT * FROM jobs WHERE id=${jobId}::uuid`;
      if(!vaga)return res.status(404).json({error:'Vaga não encontrada.'});
      const candidaturas=await sql`
        SELECT a.id, a.stage, a.created_at AS candidatura_em, a.updated_at,
               c.id AS candidate_id, c.name, c.phone, c.email, c.profession, c.council, c.council_number,
               c.city, c.state, c.experience_years, c.skills, c.sectors, c.specialties, c.employers,
               c.education, c.summary, c.resume_name, c.resume_type, c.created_at
        FROM applications a
        JOIN candidates c ON c.id=a.candidate_id
        WHERE a.job_id=${jobId}::uuid
        ORDER BY a.updated_at DESC`;
      res.setHeader('cache-control','no-store');
      return res.status(200).json({
        vaga,etapas:ETAPAS,descartado:DESCARTADO,
        candidaturas:candidaturas.map(r=>({...r,id:r.candidate_id,applicationId:r.id,matched:[],missing:[],score:100}))
      });
    }

    if(req.method==='POST'){
      const {jobId,candidateId}=await lerJson(req);
      if(!UUID.test(String(jobId||''))||!UUID.test(String(candidateId||'')))
        return res.status(400).json({error:'Vaga ou candidato inválido.'});
      const [ja]=await sql`SELECT id FROM applications WHERE job_id=${jobId}::uuid AND candidate_id=${candidateId}::uuid`;
      if(ja)return res.status(200).json({ok:true,id:ja.id,repetido:true});
      const id=randomUUID();
      await sql`INSERT INTO applications(id,job_id,candidate_id,stage) VALUES(${id},${jobId}::uuid,${candidateId}::uuid,'recebido')`;
      return res.status(201).json({ok:true,id});
    }

    const id=String(req.query.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Candidatura não encontrada.'});
    const {acao,stage}=await lerJson(req);
    const [atual]=await sql`SELECT stage FROM applications WHERE id=${id}::uuid`;
    if(!atual)return res.status(404).json({error:'Candidatura não encontrada.'});

    let nova;
    if(acao==='curtir')nova=proximaEtapa(atual.stage);
    else if(acao==='descartar')nova=DESCARTADO.chave;
    else if(acao==='voltar')nova=etapaAnterior(atual.stage);
    else if(acao==='restaurar')nova='recebido';
    else if(ETAPAS_VALIDAS.includes(stage))nova=stage;
    else return res.status(400).json({error:'Ação inválida.'});

    const [linha]=await sql`UPDATE applications SET stage=${nova},updated_at=NOW() WHERE id=${id}::uuid RETURNING id,stage`;
    return res.status(200).json({ok:true,...linha});
  }catch(e){
    console.error(e);
    if(e.message==='CORPO_GRANDE')return res.status(413).json({error:'Dados muito grandes.'});
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível atualizar a candidatura.'});
  }
}
