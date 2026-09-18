import {randomUUID} from 'node:crypto';
import {database,ensureSchema} from '../lib/db.js';
import {ETAPAS,SITUACOES,validarVaga} from '../lib/vagas.js';
import {authorized} from '../lib/util.js';

/**
 * Vagas (portal interno).
 *
 * GET    /api/jobs          -> lista as vagas com a contagem de candidatos por etapa
 * POST   /api/jobs          -> cria uma vaga
 * PATCH  /api/jobs?id=...   -> altera a vaga (inclusive a situação: publicada/pausada/encerrada)
 * DELETE /api/jobs?id=...   -> exclui a vaga e as candidaturas dela
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lerJson(req){
  if(req.body&&typeof req.body==='object')return req.body;
  let bruto='';
  for await(const parte of req){
    bruto+=parte;
    if(bruto.length>60000)throw new Error('CORPO_GRANDE');
  }
  try{return JSON.parse(bruto||'{}')}catch{return {}}
}

export default async function handler(req,res){
  if(!['GET','POST','PATCH','DELETE'].includes(req.method)){
    res.setHeader('Allow','GET, POST, PATCH, DELETE');
    return res.status(405).json({error:'Método não permitido.'});
  }
  if(!authorized(req,res))return;
  try{
    const sql=database();
    await ensureSchema(sql);

    if(req.method==='GET'){
      const rows=await sql`
        SELECT j.*,
          (SELECT count(*)::int FROM applications a WHERE a.job_id=j.id) AS total,
          (SELECT count(*)::int FROM applications a WHERE a.job_id=j.id AND a.stage='recebido') AS novos,
          (SELECT count(*)::int FROM applications a WHERE a.job_id=j.id AND a.stage='descartado') AS descartados,
          (SELECT count(*)::int FROM applications a WHERE a.job_id=j.id AND a.stage NOT IN ('recebido','descartado')) AS avancados
        FROM jobs j
        ORDER BY (j.status='publicada') DESC, j.created_at DESC`;
      res.setHeader('cache-control','no-store');
      return res.status(200).json({vagas:rows,etapas:ETAPAS,situacoes:SITUACOES});
    }

    if(req.method==='POST'){
      const {ok,erros,dados}=validarVaga(await lerJson(req));
      if(!ok)return res.status(400).json({error:'Confira os campos da vaga.',erros});
      const id=randomUUID();
      const [vaga]=await sql`INSERT INTO jobs(id,title,city,state,location,description,salary,contract,status)
        VALUES(${id},${dados.title},${dados.city},${dados.state},${dados.location},${dados.description},${dados.salary},${dados.contract},${dados.status})
        RETURNING *`;
      return res.status(201).json({vaga:{...vaga,total:0,novos:0,descartados:0,avancados:0}});
    }

    const id=String(req.query.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Vaga não encontrada.'});

    if(req.method==='PATCH'){
      const entrada=await lerJson(req);
      // Só a situação: atalho dos botões Publicar / Pausar / Encerrar.
      if(Object.keys(entrada).length===1&&entrada.status){
        if(!SITUACOES.some(s=>s.chave===entrada.status))return res.status(400).json({error:'Situação inválida.'});
        const [vaga]=await sql`UPDATE jobs SET status=${entrada.status},updated_at=NOW() WHERE id=${id}::uuid RETURNING *`;
        if(!vaga)return res.status(404).json({error:'Vaga não encontrada.'});
        return res.status(200).json({vaga});
      }
      const {ok,erros,dados}=validarVaga(entrada);
      if(!ok)return res.status(400).json({error:'Confira os campos da vaga.',erros});
      const [vaga]=await sql`UPDATE jobs SET
        title=${dados.title},city=${dados.city},state=${dados.state},location=${dados.location},
        description=${dados.description},salary=${dados.salary},contract=${dados.contract},
        status=${dados.status},updated_at=NOW()
        WHERE id=${id}::uuid RETURNING *`;
      if(!vaga)return res.status(404).json({error:'Vaga não encontrada.'});
      return res.status(200).json({vaga});
    }

    const rows=await sql`DELETE FROM jobs WHERE id=${id}::uuid RETURNING id`;
    if(!rows.length)return res.status(404).json({error:'Vaga não encontrada.'});
    return res.status(200).json({ok:true,id});
  }catch(e){
    console.error(e);
    if(e.message==='CORPO_GRANDE')return res.status(413).json({error:'Dados muito grandes.'});
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível salvar a vaga.'});
  }
}
