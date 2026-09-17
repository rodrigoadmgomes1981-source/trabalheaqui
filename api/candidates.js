import {randomUUID} from 'node:crypto';
import {del,put} from '@vercel/blob';
import {database,ensureSchema} from '../lib/db.js';
import {buildSearchText,clean,parseResume} from '../lib/extract.js';
import {authorized,MAX_UPLOAD} from '../lib/util.js';

const ALLOWED=/\.(pdf|docx)$/i;

async function readForm(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_UPLOAD+512*1024)throw new Error('FILE_TOO_LARGE');
    chunks.push(chunk);
  }
  return new Response(Buffer.concat(chunks),{headers:{'content-type':req.headers['content-type']||''}}).formData();
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function remove(req,res){
  try{
    const id=String(req.query.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Currículo não encontrado.'});
    const sql=database();
    const rows=await sql`DELETE FROM candidates WHERE id=${id}::uuid RETURNING resume_url`;
    if(!rows.length)return res.status(404).json({error:'Currículo não encontrado.'});
    const url=rows[0].resume_url||'';
    if(/^https?:\/\//.test(url)&&process.env.BLOB_READ_WRITE_TOKEN){
      try{await del(url,{token:process.env.BLOB_READ_WRITE_TOKEN})}catch(error){console.warn('Não foi possível remover o arquivo do Blob.',error?.message)}
    }
    return res.status(200).json({ok:true,id});
  }catch(e){
    console.error(e);
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível excluir o currículo.'});
  }
}

export default async function handler(req,res){
  if(req.method!=='POST'&&req.method!=='DELETE'){res.setHeader('Allow','POST, DELETE');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  if(req.method==='DELETE')return remove(req,res);
  try{
    const sql=database();
    await ensureSchema(sql);
    const form=await readForm(req);
    const file=form.get('resume');
    const text=String(form.get('extractedText')||'').slice(0,50000);
    if(!file||typeof file.arrayBuffer!=='function')return res.status(400).json({error:'Currículo obrigatório.'});
    if(!ALLOWED.test(file.name||''))return res.status(400).json({error:'Envie um currículo em PDF ou DOCX.'});
    if(file.size>MAX_UPLOAD)return res.status(413).json({error:'O arquivo deve ter até 4 MB.'});
    if(text.trim().length<30)return res.status(400).json({error:'Não foi possível ler o currículo.'});

    const candidate=clean(await parseResume(text));
    const id=randomUUID();
    const bytes=Buffer.from(await file.arrayBuffer());
    const safeName=(file.name||'curriculo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w.-]+/g,'_').slice(-120);
    const type=file.type||(/\.pdf$/i.test(file.name)?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    let resumeUrl=`/api/resume?id=${id}`,resumeData=bytes.toString('base64');
    if(process.env.BLOB_READ_WRITE_TOKEN){
      try{
        const blob=await put(`curriculos/${id}-${safeName}`,bytes,{access:'public',addRandomSuffix:true,contentType:type,token:process.env.BLOB_READ_WRITE_TOKEN});
        resumeUrl=blob.url;resumeData=null;
      }catch(error){console.warn('Blob indisponível; usando Postgres.',error?.message)}
    }
    const c=candidate;
    const searchText=buildSearchText(c,text);
    await sql`INSERT INTO candidates(id,name,phone,email,profession,council,council_number,city,state,experience_years,skills,sectors,specialties,employers,education,summary,resume_text,search_text,resume_url,resume_name,resume_type,resume_data)
      VALUES(${id},${c.name},${c.phone},${c.email},${c.profession},${c.council},${c.councilNumber},${c.city},${c.state},${c.experienceYears},${c.skills},${c.sectors},${c.specialties},${c.employers},${c.education},${c.summary},${text},${searchText},${resumeUrl},${file.name||safeName},${type},decode(${resumeData}::text,'base64'))`;
    return res.status(201).json({ok:true,id,candidate});
  }catch(e){
    console.error(e);
    if(e.message==='FILE_TOO_LARGE')return res.status(413).json({error:'O arquivo deve ter até 4 MB.'});
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível salvar o cadastro. Verifique a conexão do banco de dados.'});
  }
}
