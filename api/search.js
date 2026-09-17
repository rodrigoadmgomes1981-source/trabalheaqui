import OpenAI from 'openai';
import {database,ensureSchema} from '../lib/db.js';
import {authorized,norm,professionStem,readJson,toInt,toUF,UFS} from '../lib/util.js';

const PROFESSIONS=[
  [/tecnic\w* (de|em) enfermagem/,'técnico de enfermagem'],
  [/auxiliar\w* de enfermagem/,'auxiliar de enfermagem'],
  [/tecnic\w* (de|em) radiologia/,'técnico em radiologia'],
  [/enfermeir/,'enfermeiro'],
  [/medic[oa]s?\b/,'médico'],
  [/fisioterapeut/,'fisioterapeuta'],
  [/psicolog/,'psicólogo'],
  [/nutricionist/,'nutricionista'],
  [/fonoaudiolog/,'fonoaudiólogo'],
  [/assistentes? socia/,'assistente social'],
  [/farmaceutic/,'farmacêutico'],
  [/biomedic/,'biomédico'],
  [/dentista|cirurgi\w* dentista|odontolog/,'dentista'],
  [/terapeut\w* ocupaciona/,'terapeuta ocupacional'],
  [/recepcionist/,'recepcionista']
];

function local(q){
  const original=String(q||'');
  const n=norm(original);
  let state='';
  // Nome do estado (do maior para o menor, para "mato grosso do sul" vencer "mato grosso").
  // "para" só conta como Pará quando vem após "do/no/estado do", pois também é preposição.
  for(const [uf,name] of Object.entries(UFS).sort((a,b)=>b[1].length-a[1].length)){
    const pattern=uf==='PA'?/\b(?:do|no|estado do)\s+para\b/:new RegExp(`\\b${name}\\b`);
    if(pattern.test(n)){state=uf;break}
  }
  // Sigla só quando escrita em maiúsculas (ex.: "em SP"), para não confundir com palavras comuns.
  if(!state){const m=original.match(/\b([A-Z]{2})\b/g)?.find(x=>UFS[x]);if(m)state=m}
  const profession=PROFESSIONS.find(([re])=>re.test(n))?.[1]||'';
  const x=n.match(/(?:mais de|acima de|minimo de|pelo menos|no minimo)\s*(\d+)\s*anos?/)||n.match(/(\d+)\s*\+?\s*anos? de experiencia/);
  return {profession,state,minExperience:x?Number(x[1]):0};
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
    let f=local(query);
    if(process.env.OPENAI_API_KEY){
      try{
        const ai=new OpenAI();
        const r=await ai.chat.completions.create({
          model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
          response_format:{type:'json_object'},
          messages:[
            {role:'system',content:'Extraia filtros de recrutamento e responda somente JSON com: profession (profissão no singular, ou string vazia), state (sigla UF com 2 letras, ou string vazia), minExperience (inteiro, 0 se não informado).'},
            {role:'user',content:query}
          ]
        });
        const a=readJson(r.choices?.[0]?.message?.content);
        f={
          profession:String(a.profession||'').trim()||f.profession,
          state:toUF(a.state)||f.state,
          minExperience:toInt(a.minExperience)||f.minExperience
        };
      }catch(error){console.warn('Falha na interpretação por IA; usando interpretação local.',error?.message)}
    }
    f={profession:String(f.profession||'').slice(0,100),state:toUF(f.state),minExperience:toInt(f.minExperience)};
    const stem=professionStem(f.profession);
    const like=`%${stem.replace(/[%_\\]/g,m=>'\\'+m).split(' ').join('%')}%`;
    const out=await sql`
      SELECT id,name,phone,email,profession,city,state,experience_years,resume_name,resume_url,created_at
      FROM candidates
      WHERE (${stem}::text='' OR translate(lower(profession),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') LIKE ${like})
        AND (${f.state}::text='' OR state=${f.state})
        AND experience_years>=${f.minExperience}
      ORDER BY created_at DESC
      LIMIT 100`;
    return res.status(200).json({filters:f,results:out});
  }catch(e){
    console.error(e);
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível pesquisar.'});
  }
}
