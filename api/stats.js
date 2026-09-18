import {database,ensureSchema} from '../lib/db.js';
import {grupoDoCandidato,plural} from '../lib/profissoes.js';
import {authorized} from '../lib/util.js';

/**
 * Painel por profissão.
 *
 * GET /api/stats            -> { total, grupos:[{chave,label,rotulo,total}] }
 * GET /api/stats?grupo=...  -> { grupo:{chave,label,rotulo,total}, results:[candidato] }
 *
 * O grupo é calculado na hora a partir da profissão e, para médicos, da
 * especialidade encontrada no currículo — sem coluna nova no banco.
 */
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'})}
  if(!authorized(req,res))return;
  try{
    const sql=database();
    await ensureSchema(sql);

    const rows=await sql`
      SELECT id,name,phone,email,profession,council,council_number,city,state,experience_years,
             skills,sectors,specialties,employers,education,summary,resume_name,resume_type,created_at,
             left(concat_ws(' ',specialties,summary,education,coalesce(search_text,'')),2000) AS texto_grupo
      FROM candidates
      ORDER BY created_at DESC`;

    const grupos=new Map();
    const porGrupo=new Map();
    for(const row of rows){
      const {chave,label}=grupoDoCandidato({profession:row.profession,texto:row.texto_grupo});
      const atual=grupos.get(chave)||{chave,label,rotulo:plural(label),total:0};
      atual.total++;
      grupos.set(chave,atual);
      const lista=porGrupo.get(chave)||[];
      lista.push(row);
      porGrupo.set(chave,lista);
    }

    const lista=[...grupos.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'pt-BR'));
    const chave=String(req.query.grupo||'');
    if(!chave)return res.status(200).json({total:rows.length,grupos:lista});

    const grupo=grupos.get(chave);
    if(!grupo)return res.status(404).json({error:'Este grupo não tem mais cadastros. Volte ao painel.'});

    const results=(porGrupo.get(chave)||[]).map(({texto_grupo,...c})=>({...c,matched:[],missing:[],score:100}));
    return res.status(200).json({grupo,results});
  }catch(e){
    console.error(e);
    if(e.message==='DATABASE_NOT_CONFIGURED')return res.status(503).json({error:'O banco de dados ainda não foi conectado ao projeto Vercel.'});
    return res.status(500).json({error:'Não foi possível carregar o painel.'});
  }
}
