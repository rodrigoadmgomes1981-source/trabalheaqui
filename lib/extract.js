import OpenAI from 'openai';
import {SECTORS} from './query.js';
import {norm,readJson,searchNorm,toInt,toText,toUF} from './util.js';

function fallback(text){
  const lines=text.split(/\n| {2,}/).map(x=>x.trim()).filter(Boolean);
  const email=text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i)?.[0]||'';
  const phone=text.match(/(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}/)?.[0]||'';
  const name=(lines.find(l=>!l.includes('@')&&!/\d{4}/.test(l))||'').split(/\s{2,}|[|•]/)[0].slice(0,100);
  const n=' '+norm(text).replace(/[^\w\s-]/g,' ').replace(/\s+/g,' ')+' ';
  const sectors=SECTORS.filter(([,syn])=>syn.some(x=>n.includes(' '+x.trim()+' '))).map(([label])=>label).join(', ');
  const council=text.match(/\b(COREN|CRM|CREFITO|CRP|CRN|CRF|CRO|CRESS|CRBM|CRFa|CRTR)\b/i)?.[1]?.toUpperCase()||'';
  return {name,phone,email,profession:'',council,councilNumber:'',city:'',state:'',experienceYears:0,skills:'',sectors,specialties:'',employers:'',education:'',summary:''};
}

export async function parseResume(text){
  const base=fallback(text);
  if(!process.env.OPENAI_API_KEY)return base;
  try{
    const ai=new OpenAI();
    const r=await ai.chat.completions.create({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      response_format:{type:'json_object'},
      messages:[
        {role:'system',content:`Leia o currículo (área da saúde, Brasil) e responda somente JSON com as chaves:
name; phone; email;
profession (profissão principal, ex.: "Enfermeira", "Técnico de Enfermagem");
council (sigla do conselho, ex.: COREN); councilNumber;
city (cidade onde mora, com acentos); state (sigla UF com 2 letras);
experienceYears (inteiro: total de anos de experiência profissional na área, somando os períodos informados; 0 se não houver);
sectors (setores/áreas onde já trabalhou, separados por vírgula, ex.: "UTI adulto, Pronto-socorro, Centro cirúrgico, Home care");
specialties (especializações, pós-graduações, cursos e certificações, separados por vírgula);
employers (hospitais, clínicas e empresas onde trabalhou, separados por vírgula);
education (formação acadêmica resumida);
skills (principais competências, separadas por vírgula);
summary (resumo profissional em até 2 frases).
Use string vazia quando não houver a informação. Não invente dados.`},
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

export function clean(c){
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
    skills:toText(c.skills,2000),
    sectors:toText(c.sectors,1000),
    specialties:toText(c.specialties,1500),
    employers:toText(c.employers,1000),
    education:toText(c.education,800),
    summary:toText(c.summary,600)
  };
}


/** Texto usado pela pesquisa (sem acentos e sem pontuação). */
export function buildSearchText(c,resumeText){
  const parts=[c.name,c.profession,c.council,c.city,c.state,c.skills,c.sectors,c.specialties,c.employers,c.education,c.summary,resumeText]
    .filter(v=>v&&!/^Não identificad[ao]$/i.test(String(v).trim()));
  return searchNorm(parts.join(' '));
}
