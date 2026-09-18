import {PROFESSIONS} from './query.js';
import {norm,searchNorm} from './util.js';

/**
 * Agrupamento de candidatos por profissão, para o painel do portal interno.
 * Médicos são separados por especialidade ("Médico Pediatra", "Médico GO"...).
 */

/** Especialidades médicas: rótulo canônico, adjetivo do profissional e sinônimos normalizados. */
export const ESPECIALIDADES=[
  ['Ginecologia e Obstetrícia','GO',['ginecolog','obstetr',' go ','gineco obstetr','tocoginecolog']],
  ['Pediatria','Pediatra',['pediatr','puericultura']],
  ['Neonatologia','Neonatologista',['neonatolog','neonato']],
  ['Ortopedia','Ortopedista',['ortoped','traumatolog']],
  ['Clínica médica','Clínico',['clinica medica','clinico geral','medicina interna']],
  ['Cardiologia','Cardiologista',['cardiolog','hemodinamic']],
  ['Anestesiologia','Anestesista',['anestesiolog','anestesist']],
  ['Cirurgia geral','Cirurgião',['cirurgia geral','cirurgiao geral']],
  ['Cirurgia plástica','Cirurgião plástico',['cirurgia plastica','cirurgiao plastico']],
  ['Neurocirurgia','Neurocirurgião',['neurocirurg']],
  ['Cirurgia vascular','Cirurgião vascular',['cirurgia vascular','angiolog']],
  ['Coloproctologia','Coloproctologista',['coloproctolog','proctolog']],
  ['Dermatologia','Dermatologista',['dermatolog']],
  ['Psiquiatria','Psiquiatra',['psiquiatr']],
  ['Neurologia','Neurologista',['neurolog']],
  ['Oftalmologia','Oftalmologista',['oftalmolog']],
  ['Otorrinolaringologia','Otorrinolaringologista',['otorrinolaringolog','otorrino']],
  ['Urologia','Urologista',['urolog']],
  ['Radiologia e imagem','Radiologista',['radiolog','diagnostico por imagem','ultrassonograf']],
  ['Endocrinologia','Endocrinologista',['endocrinolog']],
  ['Gastroenterologia','Gastroenterologista',['gastroenterolog','endoscop']],
  ['Nefrologia','Nefrologista',['nefrolog']],
  ['Pneumologia','Pneumologista',['pneumolog']],
  ['Reumatologia','Reumatologista',['reumatolog']],
  ['Oncologia','Oncologista',['oncolog','cancerolog']],
  ['Hematologia','Hematologista',['hematolog']],
  ['Infectologia','Infectologista',['infectolog']],
  ['Geriatria','Geriatra',['geriatr']],
  ['Mastologia','Mastologista',['mastolog']],
  ['Medicina intensiva','Intensivista',['medicina intensiva','intensivist']],
  ['Medicina de emergência','Emergencista',['medicina de emergencia','emergencist']],
  ['Medicina do trabalho','Médico do trabalho',['medicina do trabalho','medico do trabalho']],
  ['Medicina de família','Médico de família',['medicina de familia','saude da familia','medicina de familia e comunidade']],
  ['Patologia','Patologista',['patolog','anatomia patologica']]
];

const MEDICO=/\bmedic[oa]s?\b|\bmedic[oa]\b/;

/** Detecta a especialidade médica em um texto já normalizado. */
export function especialidadeMedica(textoNorm){
  const t=' '+String(textoNorm||'')+' ';
  for(const [label,adjetivo,termos] of ESPECIALIDADES){
    if(termos.some(termo=>t.includes(termo)))return {label,adjetivo};
  }
  return null;
}

/**
 * Profissão canônica: junta "Enfermeira"/"Enfermeiro" no mesmo grupo.
 * Fora da lista, mantém o texto original (com acentos) como rótulo.
 */
export function profissaoCanonica(profissao){
  const n=norm(profissao);
  if(!n||/^nao identificad/.test(n))return '';
  const achou=PROFESSIONS.find(([re])=>re.test(n));
  if(achou)return achou[1];                                      // rótulo canônico, em minúsculas
  return String(profissao||'').replace(/\s+/g,' ').trim().toLowerCase();
}

const capitaliza=s=>String(s||'').split(' ')
  .map(w=>['de','da','do','das','dos','e'].includes(w)?w:w.charAt(0).toUpperCase()+w.slice(1)).join(' ');

const PARADAS=['de','da','do','das','dos','e','em','no','na'];
const pluralizaPalavra=w=>{
  if(/^[A-ZÀ-Þ]{2,4}$/.test(w))return w;                         // sigla: "GO" fica "GO"
  if(/[çc]ão$/i.test(w))return w.replace(/[çc]ão$/i,'ções');
  if(/l$/i.test(w))return w.replace(/l$/i,'is');
  if(/[rz]$/i.test(w))return w+'es';
  if(/m$/i.test(w))return w.replace(/m$/i,'ns');
  if(/s$/i.test(w))return w;
  return w+'s';
};

/**
 * Plural do rótulo: pluraliza as palavras iniciais e para na primeira
 * preposição ou parêntese — "Técnicos de Enfermagem", "Médicos GO",
 * "Médicos (especialidade não informada)".
 */
export function plural(label){
  const partes=String(label||'').split(' ');
  let parou=false;
  return partes.map(w=>{
    if(parou)return w;
    if(w.startsWith('(')||PARADAS.includes(w.toLowerCase())){parou=true;return w}
    return pluralizaPalavra(w);
  }).join(' ');
}

/**
 * Grupo do candidato no painel.
 * @param {{profession?:string, texto?:string}} c profissão e um texto de apoio
 *        (especializações, resumo, formação, índice de busca) para achar a especialidade.
 * @returns {{chave:string,label:string}}
 */
export function grupoDoCandidato(c){
  const canonica=profissaoCanonica(c.profession);
  if(!canonica)return {chave:'nao-identificada',label:'Profissão não identificada',rotulo:'Profissão não identificada'};

  if(MEDICO.test(canonica)||MEDICO.test(norm(c.profession))){
    const base=searchNorm([c.profession,c.texto].filter(Boolean).join(' '));
    const esp=especialidadeMedica(base);
    const label=esp?'Médico '+esp.adjetivo:'Médico (especialidade não informada)';
    const chave=esp?'medico:'+searchNorm(esp.label).replace(/ /g,'-'):'medico:sem-especialidade';
    return {chave,label,rotulo:plural(label)};
  }
  const label=capitaliza(canonica);
  return {chave:searchNorm(canonica).replace(/ /g,'-'),label,rotulo:plural(label)};
}
