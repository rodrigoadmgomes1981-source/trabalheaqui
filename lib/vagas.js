import {toUF,UFS} from './util.js';

/**
 * Vagas e candidaturas.
 * Compartilhado pelo portal interno e pelo portal do candidato (Talentos DOC),
 * para que as duas pontas usem as mesmas regras, etapas e rótulos.
 */

export const CONTRATOS=['CLT','PJ','Sócio'];
export const SITUACOES=[
  {chave:'publicada',label:'Publicada'},     // aparece no portal do candidato
  {chave:'pausada',label:'Pausada'},         // some do portal, continua no interno
  {chave:'encerrada',label:'Encerrada'}
];

/** Etapas do processo, na ordem. "Curtir" avança uma etapa. */
export const ETAPAS=[
  {chave:'recebido',label:'Recebido'},
  {chave:'triagem',label:'Triagem'},
  {chave:'entrevista',label:'Entrevista'},
  {chave:'proposta',label:'Proposta'},
  {chave:'contratado',label:'Contratado'}
];
/** Fora da esteira: não curtido volta para o banco de talentos. */
export const DESCARTADO={chave:'descartado',label:'No banco de talentos'};

export const ESTADOS=Object.entries(UFS)
  .map(([uf,nome])=>({uf,nome:nome.replace(/\b\w/g,c=>c.toUpperCase())}))
  .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));

export const etapaPorChave=chave=>ETAPAS.find(e=>e.chave===chave)||(chave===DESCARTADO.chave?DESCARTADO:ETAPAS[0]);
export const indiceEtapa=chave=>ETAPAS.findIndex(e=>e.chave===chave);

/** Próxima etapa ao curtir; na última, continua na última. */
export function proximaEtapa(chave){
  const i=indiceEtapa(chave);
  if(i<0)return ETAPAS[0].chave;                       // vinha de descartado: volta para o início
  return ETAPAS[Math.min(i+1,ETAPAS.length-1)].chave;
}

/** Etapa anterior (botão de desfazer). */
export function etapaAnterior(chave){
  const i=indiceEtapa(chave);
  if(i<0)return ETAPAS[0].chave;
  return ETAPAS[Math.max(i-1,0)].chave;
}

export const ETAPAS_VALIDAS=[...ETAPAS.map(e=>e.chave),DESCARTADO.chave];

const trim=v=>String(v??'').replace(/\s+/g,' ').trim();

export const LIMITES_VAGA={title:120,city:100,location:150,salary:80,description:4000};

/**
 * Valida e normaliza os dados de uma vaga.
 * @returns {{ok:boolean,erros:Object<string,string>,dados:Object}}
 */
export function validarVaga(entrada={}){
  const dados={
    title:trim(entrada.title).slice(0,LIMITES_VAGA.title),
    city:trim(entrada.city).slice(0,LIMITES_VAGA.city),
    state:toUF(entrada.state),
    location:trim(entrada.location).slice(0,LIMITES_VAGA.location),
    description:String(entrada.description??'').replace(/\r\n/g,'\n').trim().slice(0,LIMITES_VAGA.description),
    salary:trim(entrada.salary).slice(0,LIMITES_VAGA.salary),
    contract:CONTRATOS.includes(trim(entrada.contract))?trim(entrada.contract):'',
    status:SITUACOES.some(s=>s.chave===entrada.status)?entrada.status:'publicada'
  };
  const erros={};
  if(dados.title.length<3)erros.title='Informe o nome da vaga (ex.: Enfermeiro - UTI adulto).';
  if(dados.city.length<2)erros.city='Informe a cidade da vaga.';
  if(!dados.state)erros.state='Escolha o estado (UF).';
  if(dados.location.length<2)erros.location='Informe o local de trabalho (hospital, unidade, setor).';
  if(dados.description.length<20)erros.description='Descreva a vaga em pelo menos uma frase (escala, requisitos, atividades).';
  if(!dados.contract)erros.contract='Escolha o tipo de contratação: CLT, PJ ou Sócio.';
  if(!dados.salary)erros.salary='Informe o valor (ex.: R$ 8.500/mês ou R$ 1.200 por plantão).';
  return {ok:Object.keys(erros).length===0,erros,dados};
}

/** Resumo de uma vaga em uma linha, usado nas listagens. */
export const resumoVaga=v=>[v.title,[v.city,v.state].filter(Boolean).join('/'),v.contract].filter(Boolean).join(' · ');
