import {norm,searchNorm,UFS} from './util.js';

export const PROFESSIONS=[
  [/tecnic\w* (de|em) enfermagem/,'técnico de enfermagem'],
  [/auxiliar\w* de enfermagem/,'auxiliar de enfermagem'],
  [/tecnic\w* (de|em) radiologia/,'técnico em radiologia'],
  [/tecnic\w* (de|em) laboratorio/,'técnico de laboratório'],
  [/tecnic\w* (de|em) seguranca do trabalho/,'técnico em segurança do trabalho'],
  [/enfermeir/,'enfermeiro'],
  [/medic[oa]s?\b/,'médico'],
  [/fisioterapeut/,'fisioterapeuta'],
  [/psicolog/,'psicólogo'],
  [/nutricionist/,'nutricionista'],
  [/fonoaudiolog/,'fonoaudiólogo'],
  [/assistentes? socia/,'assistente social'],
  [/farmaceutic/,'farmacêutico'],
  [/biomedic/,'biomédico'],
  [/dentista|odontolog/,'dentista'],
  [/terapeut\w* ocupaciona/,'terapeuta ocupacional'],
  [/recepcionist/,'recepcionista'],
  [/instrumentador/,'instrumentador cirúrgico'],
  [/maqueir/,'maqueiro'],
  [/condutor\w* socorrist|motorista\w* socorrist/,'condutor socorrista'],
  [/cuidador/,'cuidador'],
  [/faturist/,'faturista'],
  [/administrativ/,'administrativo']
];

/** Setores / áreas de atuação comuns (termo canônico -> sinônimos normalizados). */
export const SECTORS=[
  ['UTI',['uti','terapia intensiva','cti']],
  ['UTI neonatal',['uti neonatal','utin','neonatal','neonatologia']],
  ['UTI pediátrica',['uti pediatrica','utip']],
  ['Pronto-socorro',['pronto socorro','pronto-socorro','ps ']],
  ['Urgência e emergência',['urgencia','emergencia']],
  ['Centro cirúrgico',['centro cirurgico','bloco cirurgico']],
  ['CME',['cme','central de material']],
  ['Clínica médica',['clinica medica']],
  ['Clínica cirúrgica',['clinica cirurgica']],
  ['Pediatria',['pediatria','pediatric']],
  ['Obstetrícia',['obstetricia','maternidade','centro obstetrico','sala de parto']],
  ['Oncologia',['oncologia','quimioterapia']],
  ['Hemodiálise',['hemodialise','nefrologia','dialise']],
  ['Home care',['home care','atendimento domiciliar']],
  ['Ambulatório',['ambulatorio','ambulatorial']],
  ['Atenção básica',['ubs','esf','estrategia saude da familia','saude da familia','atencao basica','atencao primaria','psf']],
  ['SAMU / APH',['samu','aph','atendimento pre-hospitalar','pre hospitalar']],
  ['CCIH',['ccih','controle de infeccao']],
  ['Auditoria',['auditoria']],
  ['Regulação',['regulacao']],
  ['Vacinação',['vacinacao','imunizacao','sala de vacina']],
  ['Hemodinâmica',['hemodinamica']],
  ['Cardiologia',['cardiologia']],
  ['Ortopedia',['ortopedia']],
  ['Saúde mental',['saude mental','caps','psiquiatria']],
  ['Diagnóstico por imagem',['radiologia','tomografia','ressonancia','diagnostico por imagem']],
  ['Laboratório',['laboratorio','analises clinicas']],
  ['Saúde ocupacional',['saude ocupacional','medicina do trabalho','enfermagem do trabalho']],
  ['Gestão / coordenação',['coordenacao','coordenador','gestao','supervisao','supervisor','gerencia']],
  ['Docência',['docencia','docente','professor','preceptor']]
];

const STOP=new Set(('quero preciso procuro busco buscar encontrar encontre mostrar mostre listar liste me traga traz ver todos todas que qual quais '
  +'com sem de da do das dos em no na nos nas para pra por e ou o a os as um uma uns umas ao aos '
  +'profissional profissionais candidato candidatos candidata candidatas pessoa pessoas alguem '
  +'mora moram morem morando reside residem residente residentes more vive vivem cidade estado regiao '
  +'tenha tenham tem possui possuam possua experiencia experiencias ano anos trabalhou trabalharam trabalhado atuou atuaram atuacao setor setores area areas '
  +'mais menos acima abaixo minimo maximo pelo menos ate entre seja sejam esteja estejam formado formada formados formadas '
  +'quem trabalha trabalhe trabalhem atua atue atuem atuando experiente experientes '
  +'curriculo curriculos perfil perfis bom boa bons boas curso cursos pos graduacao formacao').split(/\s+/));

const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Interpretação local (sem IA) da pesquisa. */
export function parseQueryLocal(q){
  const original=String(q||'');
  let n=' '+searchNorm(original)+' ';
  const used=[];
  const take=re=>{const m=n.match(re);if(m){used.push(m[0]);n=n.replace(m[0],' ')}return m};

  // Experiência
  let minExperience=0,maxExperience=null;
  let m;
  if((m=take(/entre (\d+) e (\d+) anos?/))){minExperience=+m[1];maxExperience=+m[2]}
  else if((m=take(/(?:mais de|acima de|minimo de|pelo menos|no minimo|a partir de)\s*(\d+)\s*anos?/)))minExperience=+m[1]+(/mais de|acima de/.test(m[0])?0:0);
  else if((m=take(/(?:ate|no maximo|menos de|maximo de)\s*(\d+)\s*anos?/)))maxExperience=+m[1];
  else if((m=take(/(\d+)\s*\+?\s*anos? (?:de )?(?:experiencia|atuacao)/)))minExperience=+m[1];
  else if((m=take(/(\d+)\s*anos?/)))minExperience=+m[1];
  if(take(/sem experiencia|recem formad\w*|primeiro emprego/))maxExperience=0;

  // Cidades com hífen (Ji-Paraná, Mogi-Guaçu) antes do estado, para "Paraná" não virar PR.
  let city='';
  for(const h of original.match(/[A-ZÀ-Ú][a-zà-ú]+(?:-[A-Za-zÀ-ú]+)+/g)||[]){
    const hn=searchNorm(h);
    if(SECTORS.some(([,syn])=>syn.some(x=>searchNorm(x)===hn)))continue;
    city=h;n=n.replace(' '+hn+' ',' ');break;
  }

  // Estado
  let state='';
  for(const [uf,name] of Object.entries(UFS).sort((a,b)=>b[1].length-a[1].length)){
    const re=uf==='PA'?/\b(?:do|no|estado do)\s+para\b/:new RegExp(`\\b(?:estado d[eoa] |d[oa] |n[oa] |em )?${esc(name)}\\b`);
    if(take(re)){state=uf;break}
  }
  if(!state){const s=original.match(/\b([A-Z]{2})\b/g)?.find(x=>UFS[x]);if(s){state=s;n=n.replace(new RegExp(`\\b${s.toLowerCase()}\\b`),' ')}}

  // Instituições citadas pelo nome ("Hospital de Base", "Clínica São Lucas") viram palavra-chave.
  const places=[];
  const INSTITUTIONS=[
    // Nome genérico + nome próprio: "Hospital de Base", "Clínica Vida"
    /\b(?:[Hh]ospital|[Cc]l[ií]nica|UPA|[Pp]oliclínica|[Pp]oliclinica|[Ll]aborat[óo]rio|[Mm]aternidade|[Ii]nstituto|[Uu]nidade)(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú0-9][\wÀ-ú]*)+/g,
    // Nomes que já são a instituição inteira
    /\b(?:[Ss]anta [Cc]asa|[Uu]nimed|[Hh]apvida)(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú0-9][\wÀ-ú]*)*/g
  ];
  for(const x of INSTITUTIONS.flatMap(re=>[...original.matchAll(re)])){
    places.push(x[0]);
    const pn=searchNorm(x[0]);
    n=n.replace(pn,' ');
  }
  const cleanOriginal=places.reduce((o,p)=>o.replace(p,' '),original);

  // Cidade: "em Porto Velho", "mora em Belém", "cidade de Ananindeua", ou "Belém/PA"
  const cityRe=/(?:mora(?:m|ndo)? em|morem em|reside(?:m|ntes?)? em|residente em|na cidade de|cidade de|cidade|municipio de|\bem|\bno|\bna)\s+((?:[A-ZÀ-Ú][a-zà-ú]+)(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+)*)/g;
  for(const x of city?[]:cleanOriginal.matchAll(cityRe)){
    const cand=x[1];
    const cn=norm(cand);
    const inState=Object.values(UFS).some(name=>name.split(' ').length>1&&name.endsWith(cn)&&norm(original).includes(name));
    if(inState||Object.values(UFS).includes(cn)||PROFESSIONS.some(([re])=>re.test(cn))||SECTORS.some(([,syn])=>syn.some(s=>cn===s.trim())))continue;
    if(/^(uti|samu|ubs|esf|caps|cme|ccih)$/i.test(cand))continue;
    city=cand;break;
  }
  if(!city){const x=original.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+)*)\s*[/-]\s*([A-Z]{2})\b/);if(x&&UFS[x[2]]){city=x[1];state=state||x[2]}}
  if(city)n=n.replace(' '+searchNorm(city)+' ',' ');

  // Profissão
  let profession='';
  for(const [re,label] of PROFESSIONS){
    if(re.test(n)){profession=label;n=n.replace(re,' ');break}
  }

  // Setores
  const sectors=[];
  for(const [label,syn] of SECTORS){
    const hit=syn.find(x=>{const t=searchNorm(x);return n.includes(' '+t+' ')||(t.length>4&&n.includes(' '+t))});
    if(hit&&!sectors.includes(label)){
      // "UTI neonatal" vence "UTI"
      if(label==='UTI'&&sectors.some(s=>s.startsWith('UTI')))continue;
      sectors.push(label);
      n=n.replace(' '+searchNorm(hit),' ');
    }
  }
  if(sectors.includes('UTI')&&sectors.some(s=>s.startsWith('UTI ')))sectors.splice(sectors.indexOf('UTI'),1);

  // Demais palavras relevantes viram palavras-chave (cursos, empresas, habilidades...)
  const keywords=n.split(/\s+/).filter(w=>w.length>2&&!STOP.has(w)&&!/^\d+$/.test(w));
  return {profession,city,state,minExperience,maxExperience,sectors,keywords:[...new Set([...places,...keywords])].slice(0,8)};
}

/** Termos de busca (normalizados) para cada setor, usados no SQL. */
export function sectorTerms(label){
  const n=norm(label);
  const found=SECTORS.find(([l,syn])=>norm(l)===n||syn.some(x=>x.trim()===n));
  const terms=found?found[1]:[label];
  return [...new Set(terms.map(searchNorm).filter(t=>t.length>=3))];
}
