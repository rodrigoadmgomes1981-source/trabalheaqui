import OpenAI from 'openai';
import {database,ensureSchema} from '../lib/db.js';
import {parseQueryLocal,sectorTerms} from '../lib/query.js';
import {authorized,norm,professionStem,searchNorm,readJson,toInt,toUF} from '../lib/util.js';

const ACCENTS_FROM='áàâãäéèêëíìîïóòôõöúùûüç';
const ACCENTS_TO='aaaaaeeeeiiiiooooouuuuc';

const list=v=>(Array.isArray(v)?v:typeof v==='string'&&v?v.split(/[,;]/):[]).map(x=>String(x).trim()).filter(Boolean);

async function parseWithAI(query){
  const ai=new OpenAI();
  const r=await ai.chat.completions.create({
    model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
    response_format:{type:'json_object'},
    temperature:0,
    messages:[
      {role:'system',content:`Você interpreta pesquisas de recrutamento na área da saúde (Brasil) e responde somente JSON com as chaves:
- profession: profissão procurada no singular masculino (ex.: "enfermeiro", "técnico de enfermagem") ou "".
- city: cidade onde o profissional mora, com acentos (ex.: "Porto Velho") ou "".
- state: sigla UF de 2 letras. Se só a cidade for citada e ela for inequívoca, informe a UF dela. Senão "".
- minExperience: anos mínimos de experiência (inteiro, 0 se não informado).
- maxExperience: anos máximos de experiência (inteiro) ou null. "Recém-formado" ou "sem experiência" = 0.
- sectors: lista de setores/áreas onde trabalhou (ex.: "UTI", "UTI neonatal", "pronto-socorro", "centro cirúrgico", "home care", "hemodiálise", "atenção básica").
- keywords: outras palavras-chave importantes que devem aparecer no currículo (cursos, especializações, certificações, instituições, empresas, habilidades), cada item com 1 a 3 palavras.
- interpretation: frase curta em português explicando o que foi entendido.
Não repita em keywords o que já estiver em profession, city, state ou sectors.`},
      {role:'user',content:query}
    ]
  });
  return readJson(r.choices?.[0]?.message?.content);
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  try{
    let body=req.body;
    if(typeof body==='string')body=readJson(body);
    const query=String(body?.query||'').slice(0,500).trim();
    if(!query)return res.status(400).json({error:'Digite o que você procura.'});
    const sql=database();
    await ensureSchema(sql);

    const local=parseQueryLocal(query);
    let f={...local,interpretation:'',ai:false};
    if(process.env.OPENAI_API_KEY){
      try{
        const a=await parseWithAI(query);
        const maxAI=a.maxExperience===null||a.maxExperience===undefined||a.maxExperience===''?null:toInt(a.maxExperience);
        f={
          profession:String(a.profession||'').trim()||local.profession,
          city:String(a.city||'').trim()||local.city,
          state:toUF(a.state)||local.state,
          minExperience:toInt(a.minExperience)||local.minExperience,
          maxExperience:maxAI??local.maxExperience,
          sectors:[...new Set([...list(a.sectors),...local.sectors])],
          keywords:list(a.keywords).length?list(a.keywords):local.keywords,
          interpretation:String(a.interpretation||'').slice(0,300),
          ai:true
        };
      }catch(error){console.warn('Falha na interpretação por IA; usando interpretação local.',error?.message)}
    }

    // Normalização final
    f.profession=String(f.profession||'').slice(0,100);
    f.city=String(f.city||'').slice(0,100);
    f.state=toUF(f.state);
    f.minExperience=toInt(f.minExperience);
    f.maxExperience=f.maxExperience===null||f.maxExperience===undefined?null:toInt(f.maxExperience);
    if(f.maxExperience!==null&&f.maxExperience<f.minExperience)f.maxExperience=null;
    f.sectors=list(f.sectors).slice(0,8);
    f.keywords=list(f.keywords).filter(k=>!f.sectors.some(s=>norm(s)===norm(k))).slice(0,8);

    // Sem nenhum filtro reconhecido, usa o texto inteiro como palavra-chave.
    const hasFilters=f.profession||f.city||f.state||f.minExperience||f.maxExperience!==null||f.sectors.length||f.keywords.length;
    const listAll=/^(todos|todas|tudo|listar( todos)?|mostrar todos)$/i.test(query);
    if(!hasFilters&&!listAll)f.keywords=[query.slice(0,60)];

    const groups=[
      ...f.sectors.map(label=>({label,terms:sectorTerms(label)})),
      ...f.keywords.map(label=>{const n=searchNorm(label);const stem=searchNorm(professionStem(label));return {label,terms:[...new Set([n,stem].filter(t=>t.length>=2))]}})
    ].filter(g=>g.terms.length);

    const stem=professionStem(f.profession);
    const profLike=`%${stem.split(' ').join('%')}%`;
    const city=searchNorm(f.city);
    const rows=await sql`
      WITH base AS (
        SELECT id,name,phone,email,profession,council,council_number,city,state,experience_years,
               skills,sectors,specialties,employers,education,summary,resume_name,created_at,
               coalesce(search_text,'') AS st
        FROM candidates
        WHERE (${stem}::text='' OR translate(lower(profession),${ACCENTS_FROM},${ACCENTS_TO}) LIKE ${profLike})
          AND (${city}::text='' OR translate(lower(city),${ACCENTS_FROM},${ACCENTS_TO}) LIKE ${'%'+city+'%'}
               OR (city='' AND coalesce(search_text,'') LIKE ${'%'+city+'%'}))
          AND (${f.state}::text='' OR state=${f.state})
          AND experience_years>=${f.minExperience}
          AND (${f.maxExperience}::int IS NULL OR experience_years<=${f.maxExperience}::int)
      ), scored AS (
        SELECT base.*,
          (SELECT coalesce(json_agg(g->>'label'),'[]'::json)
             FROM jsonb_array_elements(${JSON.stringify(groups)}::jsonb) g
            WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
                           WHERE CASE WHEN length(t)<=4 THEN ' '||base.st||' ' LIKE '% '||t||' %'
                                      ELSE base.st LIKE '%'||t||'%' END)) AS matched
        FROM base
      )
      SELECT id,name,phone,email,profession,council,council_number,city,state,experience_years,
             skills,sectors,specialties,employers,education,summary,resume_name,created_at,matched
      FROM scored
      WHERE ${groups.length}::int=0 OR json_array_length(matched)>0
      ORDER BY json_array_length(matched) DESC, experience_years DESC, created_at DESC
      LIMIT 100`;

    const total=groups.length;
    const results=rows.map(r=>{
      const matched=Array.isArray(r.matched)?r.matched:readJson(r.matched);
      const m=Array.isArray(matched)?matched:[];
      return {...r,matched:m,missing:groups.map(g=>g.label).filter(l=>!m.includes(l)),score:total?Math.round(m.length/total*100):100};
    });
    return res.status(200).json({filters:f,results});
  }catch(e){
    console.error(e);
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível pesquisar.'});
  }
}
