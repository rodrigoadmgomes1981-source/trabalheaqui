import {randomUUID} from 'node:crypto';
import {put} from '@vercel/blob';
import OpenAI from 'openai';
import {database,ensureSchema} from '../lib/db.js';
import {authorized,MAX_UPLOAD,readJson,toInt,toText,toUF} from '../lib/util.js';

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

function fallback(text){
  const lines=text.split(/\n| {2,}/).map(x=>x.trim()).filter(Boolean);
  const email=text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i)?.[0]||'';
  const phone=text.match(/(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}/)?.[0]||'';
  const name=(lines.find(l=>!l.includes('@')&&!/\d{4}/.test(l))||'').split(/\s{2,}|[|•]/)[0].slice(0,100);
  return {name,phone,email,profession:'',council:'',councilNumber:'',city:'',state:'',experienceYears:0,skills:''};
}

async function parseResume(text){
  const base=fallback(text);
  if(!process.env.OPENAI_API_KEY)return base;
  try{
    const ai=new OpenAI();
    const r=await ai.chat.completions.create({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      response_format:{type:'json_object'},
      messages:[
        {role:'system',content:'Leia o currículo e responda somente JSON com as chaves: name, phone, email, profession, council (sigla do conselho, ex.: COREN), councilNumber, city, state (sigla UF com 2 letras), experienceYears (número inteiro de anos) e skills (texto curto separado por vírgulas). Use string vazia quando não houver a informação. Não invente dados.'},
        {role:'user',content:text.slice(0,30000)}
      ]
    });
    const ai_=readJson(r.choices?.[0]?.message?.content);
    const merged={...base};
    for(const [k,v] of Object.entries(ai_))if(v!==null&&v!==undefined&&v!=='')merged[k]=v;
    return merged;
  }catch(error){
    console.warn('Falha na leitura por IA; usando extração local.',error?.message);
    return base;
  }
}

function clean(c){
  return {
    name:toText(c.name,150)||'Não identificado',
    phone:toText(c.phone,40),
    email:toText(c.email,150).toLowerCase(),
    profession:toText(c.profession,120)||'Não identificada',
    council:toText(c.council,30),
    councilNumber:toText(c.councilNumber,40),
    city:toText(c.city,100),
    state:toUF(c.state),
    experienceYears:toInt(c.experienceYears),
    skills:toText(c.skills,2000)
  };
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
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
    await sql`INSERT INTO candidates(id,name,phone,email,profession,council,council_number,city,state,experience_years,skills,resume_url,resume_name,resume_type,resume_data)
      VALUES(${id},${candidate.name},${candidate.phone},${candidate.email},${candidate.profession},${candidate.council},${candidate.councilNumber},${candidate.city},${candidate.state},${candidate.experienceYears},${candidate.skills},${resumeUrl},${file.name||safeName},${type},decode(${resumeData}::text,'base64'))`;
    return res.status(201).json({ok:true,id,candidate});
  }catch(e){
    console.error(e);
    if(e.message==='FILE_TOO_LARGE')return res.status(413).json({error:'O arquivo deve ter até 4 MB.'});
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível salvar o cadastro. Verifique a conexão do banco de dados.'});
  }
}
