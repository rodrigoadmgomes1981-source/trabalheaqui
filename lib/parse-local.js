import {PROFESSIONS,SECTORS} from './query.js';
import {norm,toUF,UFS} from './util.js';

/**
 * Leitura local do currículo (sem IA).
 * Usada sempre que OPENAI_API_KEY não está configurada e como base para a IA:
 * o que a IA preencher substitui estes campos.
 */

const ANO_ATUAL=new Date().getFullYear();

// Linhas que nunca são o nome do candidato (títulos, endereço, rótulos).
const NAO_NOME=/(^|\b)(curriculo|curriculum|vitae|dados pessoais|informacoes pessoais|contato|contatos|telefone|celular|e ?mail|endereco|rua|avenida|av|travessa|alameda|rodovia|estrada|bairro|cep|quadra|conjunto|village|residencial|condominio|apto|apartamento|casa|lote|setor|cidade|estado|uf|naturalidade|nacionalidade|brasileiro|brasileira|estado civil|solteiro|solteira|casado|casada|idade|anos|data de nascimento|nascimento|rg|cpf|cnh|pis|objetivo|objetivos|resumo|perfil|experiencia|experiencias|profissional|formacao|escolaridade|academica|cursos|curso|qualificacao|qualificacoes|habilidades|competencias|idiomas|referencias|linkedin|whatsapp|instagram|disponibilidade|pretensao|salarial)(\b|$)/;

const SECOES=[
  ['objetivo',/^(objetivo|objetivos|objetivo profissional|perfil|perfil profissional|resumo|resumo profissional|sobre mim)\b/],
  ['experiencia',/^(experiencia|experiencias|experiencia profissional|experiencias profissionais|historico profissional|atuacao profissional)\b/],
  ['formacao',/^(formacao|formacao academica|escolaridade|educacao)\b/],
  ['cursos',/^(cursos|cursos complementares|qualificacao|qualificacoes|qualificacao profissional|especializacao|especializacoes|certificacoes|capacitacoes|aperfeicoamento)\b/],
  ['habilidades',/^(habilidades|competencias|conhecimentos|informatica)\b/]
];

const EMPREGADOR=/\b(hospital|hospitais|maternidade|santa casa|clinica|clinicas|policlinica|upa|uba|ubs|posto de saude|unidade de saude|pronto atendimento|laboratorio|secretaria (municipal|estadual|de saude)|prefeitura|instituto|fundacao|casa de saude|home care|cooperativa|grupo|rede)\b/;
const REGISTRO=/^(coren|crm|crefito|crp|crn|crf|cro|cress|crbm|crfa|crtr)\b/;
const SIGLA=/^[A-Z]{2,10}$/;

const trim=s=>String(s||'').replace(/\s+/g,' ').trim();
const capitaliza=w=>w.split('-').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join('-');
const titulo=s=>trim(s).toLowerCase().split(' ')
  .map(w=>['de','da','do','das','dos','e'].includes(w)?w:capitaliza(w)).join(' ');
const unico=arr=>[...new Set(arr.map(trim).filter(Boolean))];

/** Divide o texto em linhas úteis. */
function linhas(text){
  return String(text||'')
    .split(/\r?\n|\u2028|\u2029|(?: {3,})/)
    .map(trim)
    .filter(l=>l.length>1);
}

/** Agrupa as linhas por seção do currículo ("objetivo", "cursos", ...). */
function secoes(ls){
  const out={};
  let atual=null;
  for(const linha of ls){
    const n=norm(linha).replace(/[:\-–•]+$/,'').trim();
    const achou=SECOES.find(([,re])=>re.test(n)&&n.length<=45);
    if(achou){atual=achou[0];out[atual]=out[atual]||[];continue}
    if(atual)out[atual].push(linha);
  }
  return out;
}

/** Nome do candidato: primeira linha do topo que se pareça com um nome próprio. */
export function acharNome(ls){
  const candidatas=[];
  ls.slice(0,25).forEach((linha,i)=>{
    const l=trim(linha).replace(/^[•\-–|]+\s*/,'').replace(/\s*[•\-–|:]+$/,'');
    if(l.length<5||l.length>60)return;
    if(/[0-9@(){}\[\]_\/\\]|:|https?:/i.test(l))return;
    const n=norm(l);
    if(NAO_NOME.test(n))return;
    if(PROFESSIONS.some(([re])=>re.test(n)))return;                       // "Enfermeira" não é nome
    if(Object.values(UFS).includes(n))return;                             // "Rondônia" não é nome
    const palavras=l.split(' ').filter(Boolean);
    if(palavras.length<2||palavras.length>6)return;
    if(!palavras.every(p=>/^[A-Za-zÀ-ÿ'´`^~.]+$/.test(p)))return;
    const maiusculas=palavras.filter(p=>/^[A-ZÀ-Þ]/.test(p)).length;
    if(maiusculas<Math.max(2,palavras.length-1))return;                   // nome vem capitalizado
    let peso=100-i*4;                                                     // quanto mais no topo, melhor
    if(palavras.length>=2&&palavras.length<=4)peso+=10;
    if(l===l.toUpperCase())peso+=6;                                       // nomes costumam vir em caixa alta
    candidatas.push({nome:l,peso});
  });
  candidatas.sort((a,b)=>b.peso-a.peso);
  const escolhido=candidatas[0]?.nome||'';
  return escolhido===escolhido.toUpperCase()?titulo(escolhido):escolhido;
}

/** Profissão: primeira da lista canônica encontrada no texto (a lista vai da mais específica à mais genérica). */
export function acharProfissao(n){
  for(const [re,label] of PROFESSIONS){
    if(!re.test(n))continue;
    // Usa o feminino quando ele aparece no currículo ("enfermeira").
    if(/o$/.test(label)){
      const fem=label.replace(/o$/,'a');
      if(n.includes(norm(fem)))return titulo(fem);
    }
    return titulo(label);
  }
  return '';
}

/** Cidade e UF: "Porto Velho/RO", "Belém - PA", "Cidade: X", ou o nome do estado escrito. */
export function acharLocal(text,n){
  const ufs=Object.keys(UFS).join('|');
  const padrao=new RegExp(`([A-ZÀ-Þ][A-Za-zÀ-ÿ'´\`^~.\\-]+(?: (?:de|da|do|das|dos|[A-ZÀ-Þ][A-Za-zÀ-ÿ'´\`^~.\\-]+)){0,3})\\s*[\\/\\-–,]\\s*(${ufs})\\b`,'g');
  for(const m of text.matchAll(padrao)){
    const cidade=trim(m[1]);
    const ehSigla=SIGLA.test(cidade)||REGISTRO.test(norm(cidade));   // "COREN/PA" não é cidade
    if(ehSigla||NAO_NOME.test(norm(cidade)))continue;
    return {city:titulo(cidade),state:m[2].toUpperCase()};
  }
  const rotulo=text.match(/(?:cidade|munic[íi]pio|resid(?:e|ente) em|moro em|naturalidade)\s*:?\s*([A-ZÀ-Þ][A-Za-zÀ-ÿ'´`^~. ]{2,40})/i);
  const estado=Object.entries(UFS).sort((a,b)=>b[1].length-a[1].length).find(([,nome])=>n.includes(' '+nome+' '));
  return {
    city:rotulo?titulo(rotulo[1]):'',
    state:estado?estado[0]:(rotulo?'':'')
  };
}

/** Conselho de classe e número de registro. */
export function acharConselho(text){
  const m=text.match(/\b(COREN|CRM|CREFITO|CRP|CRN|CRF|CRO|CRESS|CRBM|CRFA|CRTR)\b[\s\-:\/]*(?:[A-Z]{2})?[\s\-:\/]*([\d][\d.\-\/]{3,14})?/i);
  if(!m)return {council:'',councilNumber:''};
  return {council:m[1].toUpperCase(),councilNumber:m[2]?trim(m[2]).replace(/[.\-\/]+$/,''):''};
}

/** Anos de experiência: menção explícita ou soma dos períodos informados. */
export function acharExperiencia(n){
  const explicito=[...n.matchAll(/(\d{1,2})\s*(?:\+)?\s*anos?\s*(?:de\s*)?(?:experiencia|atuacao|atuando|na area|no cargo)/g)]
    .map(m=>parseInt(m[1],10)).filter(v=>v>0&&v<50);
  if(explicito.length)return Math.max(...explicito);

  const periodos=[];
  const re=/(19[89]\d|20[0-4]\d)\s*(?:a|ate|-|–|\/|)\s*(19[89]\d|20[0-4]\d|atual|presente|hoje|momento)/g;
  for(const m of n.matchAll(re)){
    const ini=parseInt(m[1],10);
    const fim=/^\d+$/.test(m[2])?parseInt(m[2],10):ANO_ATUAL;
    if(fim<ini||fim>ANO_ATUAL||fim-ini>15)continue;
    periodos.push([ini,fim]);
  }
  if(!periodos.length)return 0;
  periodos.sort((a,b)=>a[0]-b[0]);
  let total=0,[ini,fim]=periodos[0];
  for(const [a,b] of periodos.slice(1)){
    if(a<=fim){fim=Math.max(fim,b);continue}
    total+=fim-ini;ini=a;fim=b;
  }
  total+=fim-ini;
  return Math.min(total,45);
}

/** Leitura local completa. Campos que não dá para inferir com segurança ficam vazios. */
export function parseLocal(text){
  const ls=linhas(text);
  const sec=secoes(ls);
  const n=' '+norm(text).replace(/[^\w\s-]/g,' ').replace(/\s+/g,' ')+' ';

  const email=text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i)?.[0]||'';
  const phone=text.match(/(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s.-]?\d{4}/)?.[0]||'';
  const {council,councilNumber}=acharConselho(text);
  const {city,state}=acharLocal(text,n);
  const sectors=SECTORS.filter(([,syn])=>syn.some(x=>n.includes(' '+x.trim()+' '))).map(([label])=>label);
  const doObjetivo=new Set(sec.objetivo||[]);
  const employers=ls.filter(l=>!doObjetivo.has(l)&&EMPREGADOR.test(norm(l))&&l.length<=90).slice(0,8);
  const specialties=(sec.cursos||[]).filter(l=>l.length<=90).slice(0,12);
  const education=(sec.formacao||[]).filter(l=>l.length<=120&&!REGISTRO.test(norm(l))).slice(0,4).join('; ');
  const skills=(sec.habilidades||[]).filter(l=>l.length<=90).slice(0,10);
  const summary=(sec.objetivo||[]).join(' ').slice(0,400);

  return {
    name:acharNome(ls),
    phone:trim(phone),
    email:email.toLowerCase(),
    profession:acharProfissao(n),
    council,
    councilNumber,
    city,
    state:toUF(state),
    experienceYears:acharExperiencia(n),
    skills:unico(skills).join(', '),
    sectors:unico(sectors).join(', '),
    specialties:unico(specialties).join(', '),
    employers:unico(employers).join(', '),
    education,
    summary
  };
}
