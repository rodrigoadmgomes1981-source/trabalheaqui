export const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

export const UFS={AC:'acre',AL:'alagoas',AP:'amapa',AM:'amazonas',BA:'bahia',CE:'ceara',DF:'distrito federal',ES:'espirito santo',GO:'goias',MA:'maranhao',MT:'mato grosso',MS:'mato grosso do sul',MG:'minas gerais',PA:'para',PB:'paraiba',PR:'parana',PE:'pernambuco',PI:'piaui',RJ:'rio de janeiro',RN:'rio grande do norte',RS:'rio grande do sul',RO:'rondonia',RR:'roraima',SC:'santa catarina',SP:'sao paulo',SE:'sergipe',TO:'tocantins'};

/** Converte "Pará", "pa", "PA - Belém" etc. em UF válida, ou ''. */
export function toUF(value){
  const raw=String(value??'').trim();
  if(!raw)return '';
  const up=raw.toUpperCase();
  if(UFS[up])return up;
  const n=norm(raw);
  const entry=Object.entries(UFS).sort((a,b)=>b[1].length-a[1].length).find(([,name])=>n===name);
  if(entry)return entry[0];
  const m=up.match(/^([A-Z]{2})\b/);
  return m&&UFS[m[1]]?m[1]:'';
}

export function toInt(value){
  const n=parseInt(String(value??'').replace(/[^\d]/g,''),10);
  return Number.isFinite(n)&&n>=0&&n<100?n:0;
}

export function toText(value,max=2000){
  if(value==null)return '';
  if(Array.isArray(value))value=value.filter(Boolean).join(', ');
  else if(typeof value==='object')value=Object.values(value).filter(Boolean).join(', ');
  return String(value).trim().slice(0,max);
}

/** Radical usado na busca: remove acentos, plural e gênero ("Enfermeiras" -> "enfermeir"). */
export function professionStem(value){
  return norm(value).split(/\s+/).filter(Boolean).map(w=>w.length>3?w.replace(/s$/,'').replace(/[ao]$/,''):w).join(' ');
}

export function readJson(content){
  try{const d=JSON.parse(content||'{}');return d&&typeof d==='object'?d:{}}catch{return {}}
}

/** Senha opcional (APP_PASSWORD). Retorna true se liberado; caso contrário responde 401. */
export function authorized(req,res){
  const expected=process.env.APP_PASSWORD;
  if(!expected)return true;
  const given=req.headers['x-app-password']||req.query?.key||'';
  if(given===expected)return true;
  res.status(401).json({error:'Senha de acesso inválida.',auth:true});
  return false;
}

export const MAX_UPLOAD=4*1024*1024;
