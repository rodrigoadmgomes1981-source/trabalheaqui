import {database} from '../lib/db.js';
import {authorized} from '../lib/util.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  try{
    const id=String(req.query.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Currículo não encontrado.'});
    const sql=database();
    const rows=await sql`SELECT resume_name,resume_type,resume_url,resume_data FROM candidates WHERE id=${id}::uuid LIMIT 1`;
    const file=rows[0];
    if(!file)return res.status(404).json({error:'Currículo não encontrado.'});
    if(!file.resume_data){
      if(/^https?:\/\//.test(file.resume_url||''))return res.redirect(302,file.resume_url);
      return res.status(404).json({error:'Currículo não encontrado.'});
    }
    const name=String(file.resume_name||'curriculo');
    const ascii=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'_').replace(/["\\]/g,'');
    const data=Buffer.isBuffer(file.resume_data)?file.resume_data
      :typeof file.resume_data==='string'?Buffer.from(file.resume_data.replace(/^\\x/,''),'hex')
      :Buffer.from(file.resume_data);
    res.setHeader('Content-Type',file.resume_type||'application/octet-stream');
    res.setHeader('Content-Length',data.length);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    return res.status(200).send(data);
  }catch(error){
    console.error(error);
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível abrir o currículo.'});
  }
}
