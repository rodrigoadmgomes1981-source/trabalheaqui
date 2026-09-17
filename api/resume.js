import {database} from '../lib/db.js';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido.'});
  try{
    const id=String(req.query.id||''),sql=database();
    const rows=await sql`SELECT resume_name,resume_type,resume_data FROM candidates WHERE id=${id}::uuid LIMIT 1`;
    const file=rows[0];
    if(!file||!file.resume_data)return res.status(404).json({error:'Currículo não encontrado.'});
    res.setHeader('Content-Type',file.resume_type||'application/octet-stream');
    res.setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="${String(file.resume_name).replace(/"/g,'')}"`);
    return res.send(Buffer.from(file.resume_data));
  }catch(error){
    console.error(error);
    return res.status(500).json({error:'Não foi possível abrir o currículo.'});
  }
}
