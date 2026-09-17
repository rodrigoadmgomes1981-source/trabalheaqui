import mammoth from 'mammoth';
import {database} from '../lib/db.js';
import {authorized} from '../lib/util.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PDF='application/pdf';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Recupera arquivos gravados por versões antigas (Buffer serializado como JSON ou texto hex). */
function repair(buf){
  if(!buf?.length)return buf;
  const head=buf.subarray(0,20).toString('latin1');
  try{
    if(head.startsWith('{"type":"Buffer"')){const j=JSON.parse(buf.toString('utf8'));return Buffer.from(j.data)}
    if(/^\{"0":\d/.test(head)){const j=JSON.parse(buf.toString('utf8'));return Buffer.from(Object.keys(j).sort((a,b)=>a-b).map(k=>j[k]))}
    if(head.startsWith('\\x')&&/^\\x[0-9a-f]+$/i.test(buf.toString('latin1').trim()))return Buffer.from(buf.toString('latin1').trim().slice(2),'hex');
    if(/^[\d,\s]+$/.test(head)&&head.includes(','))return Buffer.from(buf.toString('latin1').split(',').map(Number));
  }catch{}
  return buf;
}

function detectType(buf,stored,name){
  const head=buf.subarray(0,4).toString('latin1');
  if(head==='%PDF')return PDF;
  if(head.startsWith('PK'))return DOCX;
  if(stored)return stored;
  return /\.pdf$/i.test(name)?PDF:/\.docx$/i.test(name)?DOCX:'application/octet-stream';
}

const escapeHtml=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  try{
    const id=String(req.query.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Currículo não encontrado.'});
    const download=req.query.download==='1';
    const sql=database();
    const rows=await sql`SELECT resume_name,resume_type,resume_url,encode(resume_data,'base64') AS b64 FROM candidates WHERE id=${id}::uuid LIMIT 1`;
    const file=rows[0];
    if(!file)return res.status(404).json({error:'Currículo não encontrado.'});
    const name=String(file.resume_name||'curriculo');
    const blobUrl=/^https?:\/\//.test(file.resume_url||'')?file.resume_url:'';

    let data=null;
    if(file.b64)data=repair(Buffer.from(file.b64,'base64'));
    else if(blobUrl){
      const isDocx=/\.docx$/i.test(name)||file.resume_type===DOCX;
      // PDF ou download: o próprio Blob entrega o arquivo.
      if(download||!isDocx)return res.redirect(302,blobUrl+(download?(blobUrl.includes('?')?'&':'?')+'download=1':''));
      const r=await fetch(blobUrl);
      if(!r.ok)return res.status(404).json({error:'Currículo não encontrado.'});
      data=Buffer.from(await r.arrayBuffer());
    }
    if(!data?.length)return res.status(404).json({error:'Currículo não encontrado.'});

    const type=detectType(data,file.resume_type,name);
    res.setHeader('Cache-Control','private, no-store');

    // Navegadores não exibem DOCX: converte para HTML na visualização.
    if(!download&&type===DOCX){
      const {value}=await mammoth.convertToHtml({buffer:data});
      const dl=new URLSearchParams({id,download:'1'});
      if(req.query.key)dl.set('key',String(req.query.key));
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy',"default-src 'none'; img-src data:; style-src 'unsafe-inline'");
      return res.status(200).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)}</title><style>body{font-family:system-ui,sans-serif;max-width:820px;margin:0 auto;padding:24px 16px 60px;line-height:1.55;color:#17283b}header{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #dfe7ec;padding-bottom:12px;margin-bottom:20px}header b{word-break:break-all}a{color:#087a65}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #dfe7ec;padding:4px 8px}</style></head><body><header><b>${escapeHtml(name)}</b><a href="/api/resume?${dl}">Baixar arquivo original</a></header>${value||'<p>O documento não possui texto visível.</p>'}</body></html>`);
    }

    const ext=type===PDF?'.pdf':type===DOCX?'.docx':'';
    const finalName=ext&&!name.toLowerCase().endsWith(ext)?name+ext:name;
    const ascii=finalName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'_').replace(/["\\]/g,'');
    res.setHeader('Content-Type',type);
    res.setHeader('Content-Length',String(data.length));
    res.setHeader('Content-Disposition',`${download?'attachment':'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(finalName)}`);
    return res.status(200).end(data);
  }catch(error){
    console.error(error);
    if(error.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível abrir o currículo.'});
  }
}
