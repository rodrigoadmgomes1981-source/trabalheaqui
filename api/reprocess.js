import {database,ensureSchema} from '../lib/db.js';
import {buildSearchText,clean,parseResume} from '../lib/extract.js';
import {authorized} from '../lib/util.js';

const BATCH=3;

/** Extrai o texto de um PDF usando o pdf.js (mesma biblioteca usada no navegador). */
async function pdfText(buffer){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer),useWorkerFetch:false,isEvalSupported:false,useSystemFonts:false,disableWorker:true}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),content=await page.getTextContent();
    let text='';
    for(const item of content.items)if(item&&typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');
    pages.push(text);
    page.cleanup();
  }
  await pdf.destroy();
  return pages.join('\n').replace(/[ \t]+/g,' ').trim();
}

async function docxText(buffer){
  const mammoth=(await import('mammoth')).default;
  return (await mammoth.extractRawText({buffer})).value.trim();
}

async function fileBytes(row){
  if(row.b64)return Buffer.from(row.b64,'base64');
  if(/^https?:\/\//.test(row.resume_url||'')){
    const r=await fetch(row.resume_url);
    if(!r.ok)throw new Error('Arquivo indisponível.');
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('Arquivo não encontrado.');
}

export default async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  try{
    const sql=database();
    await ensureSchema(sql);
    const pendingRows=await sql`SELECT count(*)::int AS total FROM candidates WHERE resume_text=''`;
    const pending=pendingRows[0]?.total||0;
    if(req.method==='GET')return res.status(200).json({pending});
    if(!pending)return res.status(200).json({pending:0,processed:0,failed:[]});

    const rows=await sql`SELECT id,resume_name,resume_type,resume_url,encode(resume_data,'base64') AS b64
      FROM candidates WHERE resume_text='' ORDER BY created_at DESC LIMIT ${BATCH}`;

    let processed=0;
    const failed=[];
    for(const row of rows){
      try{
        const bytes=await fileBytes(row);
        const name=String(row.resume_name||'');
        const isPdf=bytes.subarray(0,4).toString('latin1')==='%PDF'||/\.pdf$/i.test(name);
        const text=(isPdf?await pdfText(bytes):await docxText(bytes)).slice(0,50000);
        if(text.trim().length<30)throw new Error('Currículo sem texto legível (imagem digitalizada).');
        const c=clean(await parseResume(text));
        await sql`UPDATE candidates SET
          name=CASE WHEN name IN ('','Não identificado') THEN ${c.name} ELSE name END,
          phone=CASE WHEN phone='' THEN ${c.phone} ELSE phone END,
          email=CASE WHEN email='' THEN ${c.email} ELSE email END,
          profession=CASE WHEN profession IN ('','Não identificada') THEN ${c.profession} ELSE profession END,
          council=CASE WHEN coalesce(council,'')='' THEN ${c.council} ELSE council END,
          council_number=CASE WHEN coalesce(council_number,'')='' THEN ${c.councilNumber} ELSE council_number END,
          city=CASE WHEN city='' THEN ${c.city} ELSE city END,
          state=CASE WHEN state='' THEN ${c.state} ELSE state END,
          experience_years=CASE WHEN experience_years=0 THEN ${c.experienceYears} ELSE experience_years END,
          skills=CASE WHEN skills='' THEN ${c.skills} ELSE skills END,
          sectors=${c.sectors}, specialties=${c.specialties}, employers=${c.employers},
          education=${c.education}, summary=${c.summary},
          resume_text=${text},
          search_text=${buildSearchText(c,text)}
        WHERE id=${row.id}::uuid`;
        processed++;
      }catch(error){
        console.warn('Falha ao reprocessar currículo',row.id,error?.message);
        failed.push({id:row.id,name:row.resume_name,error:error?.message||'Falha ao ler o arquivo.'});
        // Marca com um espaço para não repetir indefinidamente o mesmo arquivo com problema.
        await sql`UPDATE candidates SET resume_text=' ' WHERE id=${row.id}::uuid`;
      }
    }
    const leftRows=await sql`SELECT count(*)::int AS total FROM candidates WHERE resume_text=''`;
    return res.status(200).json({processed,failed,pending:leftRows[0]?.total||0});
  }catch(e){
    console.error(e);
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível atualizar os cadastros antigos.'});
  }
}
