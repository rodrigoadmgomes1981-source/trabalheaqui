import './polyfills.js';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,UploadCloud,FileText,Download,Eye,MessageCircle,Users,MapPin,Briefcase,CheckCircle2,Loader2,Lock,Trash2,Smartphone,Share2,Sparkles,Mail,Phone,Building2,GraduationCap,Award,Stethoscope,ChevronDown,ChevronUp,BadgeCheck,RefreshCw,AlertTriangle,X,LayoutGrid,ArrowLeft,UserRound,Clock3,PencilLine} from 'lucide-react';
import mammoth from 'mammoth/mammoth.browser';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import './styles.css';
import './auto-upload.css';

const MAX_UPLOAD=4*1024*1024;
const PASS_KEY='agile-app-password';

function getPassword(){try{return sessionStorage.getItem(PASS_KEY)||''}catch{return ''}}
function setPassword(v){try{v?sessionStorage.setItem(PASS_KEY,v):sessionStorage.removeItem(PASS_KEY)}catch{}}

class ApiError extends Error{constructor(message,auth){super(message);this.auth=auth}}

async function api(url,options={}){
  const headers={...(options.headers||{})};
  const pass=getPassword();
  if(pass)headers['x-app-password']=pass;
  let r;
  try{r=await fetch(url,{...options,headers})}catch{throw new ApiError('Sem conexão com o servidor. Verifique sua internet.')}
  let d={};
  try{d=await r.json()}catch{}
  if(r.status===401)throw new ApiError(d.error||'Senha de acesso necessária.',true);
  if(r.status===413)throw new ApiError('O arquivo deve ter até 4 MB.');
  if(!r.ok)throw new ApiError(d.error||`Erro inesperado no servidor (${r.status}).`);
  return d;
}

function phoneLink(p){
  let digits=String(p||'').replace(/\D/g,'');
  if(digits.length<10)return '';
  if(!(digits.startsWith('55')&&digits.length>=12))digits='55'+digits;
  return 'https://wa.me/'+digits;
}

function resumeLink(c,download){
  const params=new URLSearchParams({id:c.id});
  if(download)params.set('download','1');
  const pass=getPassword();
  if(pass)params.set('key',pass);
  return `/api/resume?${params}`;
}

const SHARE_CACHE='agile-share-v1';
const isMobile=()=>/android|iphone|ipad|ipod/i.test(navigator.userAgent);
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(e=>console.warn('Service worker não registrado',e)));
}

/** Lê o currículo recebido pelo "Compartilhar" do celular (guardado pelo service worker). */
async function takeSharedFile(){
  if(!('caches' in window))return null;
  const cache=await caches.open(SHARE_CACHE);
  const r=await cache.match('/shared-resume');
  if(!r)return null;
  await cache.delete('/shared-resume');
  const blob=await r.blob();
  let name=decodeURIComponent(r.headers.get('x-file-name')||'curriculo');
  const type=blob.type||r.headers.get('content-type')||'';
  if(!/\.(pdf|docx)$/i.test(name)){
    if(type.includes('pdf'))name+='.pdf';
    else if(type.includes('wordprocessingml'))name+='.docx';
  }
  return new File([blob],name,{type});
}

const splitList=v=>String(v||'').split(/[,;]/).map(x=>x.trim()).filter(Boolean);
const EXAMPLES=[
  'Enfermeiros com mais de 3 anos em UTI no Pará',
  'Técnico de enfermagem que mora em Porto Velho',
  'Fisioterapeuta com experiência em home care',
  'Quem trabalhou no pronto-socorro e tem curso ACLS'
];
const yearsText=n=>`${n} ${n===1?'ano':'anos'}`;

function expLabel(f){
  if(f.maxExperience===0)return 'Sem experiência / recém-formado';
  if(f.maxExperience!=null&&f.minExperience>0)return `${f.minExperience} a ${yearsText(f.maxExperience)}`;
  if(f.maxExperience!=null)return `Até ${yearsText(f.maxExperience)}`;
  if(f.minExperience>0)return `${f.minExperience}+ anos`;
  return '';
}

function Chips({items,matched=[],className=''}){
  const m=matched.map(x=>x.toLowerCase());
  if(!items.length)return null;
  return <div className={'tags '+className}>{items.map(t=><i key={t} className={m.some(x=>t.toLowerCase().includes(x)||x.includes(t.toLowerCase()))?'hit':''}>{t}</i>)}</div>;
}

function CandidateCard({c,onDelete,deleting}){
  const [open,setOpen]=useState(false);
  const wa=phoneLink(c.phone);
  const place=[c.city,c.state].filter(Boolean).join(' / ')||'Local não informado';
  const sectors=splitList(c.sectors),specialties=splitList(c.specialties),employers=splitList(c.employers),skills=splitList(c.skills);
  const matched=c.matched||[];
  const hasDetails=specialties.length||employers.length||skills.length||c.education||c.email||c.phone;
  const semArquivo=c.resume_type==='manual';
  return <article className="candidate">
    <div className="avatar">{initials(c.name)}</div>
    <div className="person">
      <div className="person-head">
        <h3>{c.name}</h3>
        {matched.length+(c.missing||[]).length>0&&<span className={'score'+(c.score===100?' full':'')}><BadgeCheck/>{c.score}% compatível</span>}
      </div>
      <b>{c.profession}{c.council&&<small> · {c.council}{c.council_number?` ${c.council_number}`:''}</small>}</b>
      <div className="meta">
        <p><MapPin/>{place}</p>
        <p><Briefcase/>{yearsText(c.experience_years)} de experiência</p>
        <p><FileText/>{semArquivo?'Sem arquivo · dados digitados':c.resume_name}</p>
      </div>
      {c.summary&&<p className="summary-text">{c.summary}</p>}
      {sectors.length>0&&<div className="field"><span><Stethoscope/>Setores</span><Chips items={sectors} matched={matched}/></div>}
      {(matched.length>0||(c.missing||[]).length>0)&&<div className="match-line">
        {matched.length>0&&<span className="ok">Encontrado: {matched.join(', ')}</span>}
        {(c.missing||[]).length>0&&<span className="miss">Não encontrado: {c.missing.join(', ')}</span>}
      </div>}
      {open&&<div className="details">
        {specialties.length>0&&<div className="field"><span><Award/>Especializações e cursos</span><Chips items={specialties} matched={matched}/></div>}
        {employers.length>0&&<div className="field"><span><Building2/>Onde trabalhou</span><Chips items={employers} matched={matched}/></div>}
        {c.education&&<div className="field"><span><GraduationCap/>Formação</span><p>{c.education}</p></div>}
        {skills.length>0&&<div className="field"><span><Sparkles/>Competências</span><Chips items={skills} matched={matched}/></div>}
        <div className="field contacts">
          {c.phone&&<p><Phone/>{c.phone}</p>}
          {c.email&&<p><Mail/><a href={`mailto:${c.email}`}>{c.email}</a></p>}
          {c.created_at&&<p className="muted">Cadastrado em {new Date(c.created_at).toLocaleDateString('pt-BR')}</p>}
        </div>
      </div>}
      {hasDetails?<button type="button" className="more" onClick={()=>setOpen(v=>!v)}>{open?<><ChevronUp/>Menos informações</>:<><ChevronDown/>Ver todas as informações</>}</button>:null}
    </div>
    <div className="actions">
      {wa&&<a className="whatsapp" href={wa} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a>}
      {semArquivo
        ?<span className="sem-arquivo"><PencilLine/>Cadastro digitado pelo candidato</span>
        :<><a href={resumeLink(c,false)} target="_blank" rel="noreferrer"><Eye/>Visualizar</a>
           <a href={resumeLink(c,true)} download={c.resume_name}><Download/>Baixar</a></>}
      <button type="button" className="danger" onClick={()=>onDelete(c)} disabled={deleting}>{deleting?<Loader2 className="spin"/>:<Trash2/>}Excluir</button>
    </div>
  </article>;
}

const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'?';

/** Pop-up de confirmação do cadastro: fecha no botão, no Esc ou clicando fora. */
function SuccessDialog({onClose}){
  const ref=useRef(null);
  useEffect(()=>{
    ref.current?.focus();
    const onKey=e=>{if(e.key==='Escape')onClose()};
    document.addEventListener('keydown',onKey);
    document.body.style.overflow='hidden';
    return ()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=''};
  },[onClose]);
  return <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <button type="button" className="dialog-close" onClick={onClose} aria-label="Fechar"><X/></button>
      <div className="dialog-icon"><CheckCircle2/></div>
      <h2 id="dialog-title">Currículo cadastrado!</h2>
      <p>O profissional já está no banco de talentos e aparece na pesquisa.</p>
      <button type="button" className="dialog-ok" ref={ref} onClick={onClose}>Fechar</button>
    </div>
  </div>;
}

async function extractText(file){
  const name=file.name.toLowerCase();
  const isPdf=file.type==='application/pdf'||name.endsWith('.pdf');
  if(!isPdf&&!name.endsWith('.docx'))throw Error('Envie um currículo em PDF ou DOCX.');
  try{
    const buffer=typeof file.arrayBuffer==='function'?await file.arrayBuffer():await new Response(file).arrayBuffer();
    if(isPdf){
      const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
      const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer),useWorkerFetch:false,isEvalSupported:false}).promise;
      const pages=[];
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i),content=await page.getTextContent();
        let text='';
        for(const item of content.items){if(item&&typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ')}
        pages.push(text);
        page.cleanup();
      }
      await pdf.destroy();
      return pages.join('\n').replace(/[ \t]+/g,' ').trim();
    }
    return (await mammoth.extractRawText({arrayBuffer:buffer})).value.trim();
  }catch(error){
    console.error('Falha ao ler currículo',error);
    throw Error('Não foi possível ler este arquivo. Tente salvar o currículo novamente em PDF ou DOCX. Se ele for uma imagem digitalizada, será necessário usar OCR.');
  }
}

function App(){
  const [tab,setTab]=useState('search');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [filters,setFilters]=useState(null);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [file,setFile]=useState(null);
  const [candidate,setCandidate]=useState(null);
  const [dragging,setDragging]=useState(false);
  const [needPass,setNeedPass]=useState(false);
  const [passInput,setPassInput]=useState('');
  const [deleting,setDeleting]=useState('');
  const [installEvent,setInstallEvent]=useState(null);
  const [pending,setPending]=useState(0);
  const [updating,setUpdating]=useState(false);
  const [updateInfo,setUpdateInfo]=useState('');
  const [showInstallHelp,setShowInstallHelp]=useState(false);
  const [saved,setSaved]=useState(false);
  const [recentes,setRecentes]=useState(null);    // {horas,total} das últimas 2 horas
  const [painel,setPainel]=useState(null);        // {total, grupos:[...]}
  const [grupo,setGrupo]=useState(null);          // {grupo:{...}, results:[...]}
  const inputRef=useRef(null);

  useEffect(()=>{
    const onPrompt=e=>{e.preventDefault();setInstallEvent(e)};
    window.addEventListener('beforeinstallprompt',onPrompt);
    return ()=>window.removeEventListener('beforeinstallprompt',onPrompt);
  },[]);

  // Currículos recebidos nas últimas 2 horas: atualiza sozinho a cada minuto
  // e sempre que a aba volta a ficar visível.
  useEffect(()=>{
    let vivo=true;
    const buscar=()=>api('/api/recent').then(d=>{if(vivo)setRecentes(d)}).catch(()=>{});
    buscar();
    const intervalo=setInterval(buscar,60000);
    const aoVoltar=()=>{if(document.visibilityState==='visible')buscar()};
    document.addEventListener('visibilitychange',aoVoltar);
    window.addEventListener('focus',aoVoltar);
    return ()=>{vivo=false;clearInterval(intervalo);document.removeEventListener('visibilitychange',aoVoltar);window.removeEventListener('focus',aoVoltar)};
  },[]);

  /** Mostra na pesquisa os currículos que chegaram nas últimas 2 horas. */
  const verRecentes=async()=>{
    setTab('search');setLoading(true);setMessage('');setGrupo(null);
    try{
      const d=await api('/api/recent?listar=1');
      setRecentes({horas:d.horas,total:d.total,agora:d.agora});
      setResults(d.results||[]);
      setFilters({profession:'',city:'',state:'',minExperience:0,maxExperience:null,sectors:[],keywords:[],
        interpretation:`Currículos recebidos nas últimas ${d.horas} horas.`});
      setQuery('');
    }catch(err){handleError(err)}
    finally{setLoading(false)}
  };

  // Cadastros antigos (sem o texto do currículo) que ainda podem ser reprocessados.
  useEffect(()=>{
    api('/api/reprocess').then(d=>setPending(d.pending||0)).catch(()=>{});
  },[]);

  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    const share=params.get('share');
    if(!share)return;
    history.replaceState(null,'','/');
    setTab('register');
    if(share!=='1'){setMessage('Não foi possível receber o arquivo compartilhado. Tente novamente.');return}
    takeSharedFile().then(f=>{
      if(!f)return setMessage('Nenhum arquivo foi recebido. Compartilhe o currículo novamente.');
      if(chooseFile(f))processFile(f);
    }).catch(()=>setMessage('Não foi possível receber o arquivo compartilhado. Tente novamente.'));
  },[]);

  const handleError=e=>{
    if(e.auth){setPassword('');setNeedPass(true)}
    setMessage(e.message);
  };

  const chooseFile=f=>{
    setCandidate(null);setMessage('');
    if(!f){setFile(null);return false}
    if(!/\.(pdf|docx)$/i.test(f.name)){setFile(null);setMessage('Envie um currículo em PDF ou DOCX.');return false}
    if(f.size>MAX_UPLOAD){setFile(null);setMessage('O arquivo deve ter até 4 MB.');return false}
    setFile(f);
    return true;
  };

  const search=async e=>{
    e.preventDefault();
    if(!query.trim())return;
    setLoading(true);setMessage('');
    try{
      const d=await api('/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query})});
      setResults(d.results||[]);setFilters(d.filters||{});
    }catch(err){handleError(err)}finally{setLoading(false)}
  };

  const submit=e=>{
    e.preventDefault();
    if(!file)return setMessage('Selecione o currículo.');
    processFile(file);
  };

  const processFile=async file=>{
    setLoading(true);setMessage('');setCandidate(null);
    try{
      const extractedText=await extractText(file);
      if(extractedText.length<30)throw Error('Não foi possível identificar texto suficiente neste currículo. Se ele for uma imagem digitalizada, será necessário usar OCR.');
      const fd=new FormData();
      fd.append('resume',file);
      fd.append('extractedText',extractedText.slice(0,50000));
      await api('/api/candidates',{method:'POST',body:fd});
      // Limpa a tela e confirma o cadastro no pop-up.
      setCandidate(null);
      setMessage('');
      setFile(null);
      setDragging(false);
      if(inputRef.current)inputRef.current.value='';
      setSaved(true);
      api('/api/recent').then(setRecentes).catch(()=>{});   // atualiza o contador das últimas horas
    }catch(err){handleError(err)}finally{setLoading(false)}
  };

  const removeCandidate=async c=>{
    if(!window.confirm(`Excluir o currículo de ${c.name}?\n\nEssa ação não pode ser desfeita.`))return;
    setDeleting(c.id);setMessage('');
    try{
      await api(`/api/candidates?id=${encodeURIComponent(c.id)}`,{method:'DELETE'});
      setResults(list=>list.filter(x=>x.id!==c.id));
      if(grupo)setGrupo(g=>g&&{...g,grupo:{...g.grupo,total:Math.max(0,g.grupo.total-1)},results:g.results.filter(x=>x.id!==c.id)});
      if(painel)setPainel(p=>p&&{...p,total:Math.max(0,p.total-1),grupos:p.grupos.map(x=>x.chave===grupo?.grupo?.chave?{...x,total:Math.max(0,x.total-1)}:x).filter(x=>x.total>0)});
    }catch(err){handleError(err)}finally{setDeleting('')}
  };

  const updateOld=async()=>{
    setUpdating(true);setMessage('');
    let done=0,errors=0;
    try{
      for(let i=0;i<200;i++){
        const d=await api('/api/reprocess',{method:'POST'});
        done+=d.processed||0;errors+=(d.failed||[]).length;
        setPending(d.pending||0);
        setUpdateInfo(`Atualizados ${done} currículo(s)... faltam ${d.pending||0}.`);
        if(!d.pending)break;
      }
      setUpdateInfo(`Pronto: ${done} currículo(s) atualizado(s)${errors?`, ${errors} não puderam ser lidos (provavelmente currículos digitalizados)`:''}.`);
    }catch(err){handleError(err);setUpdateInfo('')}finally{setUpdating(false)}
  };

  const install=async()=>{
    if(installEvent){
      installEvent.prompt();
      await installEvent.userChoice.catch(()=>null);
      setInstallEvent(null);
    }else setShowInstallHelp(v=>!v);
  };

  const savePass=e=>{
    e.preventDefault();
    setPassword(passInput.trim());
    setPassInput('');setNeedPass(false);setMessage('');
  };

  const carregarPainel=async()=>{
    setLoading(true);setMessage('');
    try{setPainel(await api('/api/stats'))}
    catch(err){handleError(err)}
    finally{setLoading(false)}
  };

  const abrirGrupo=async g=>{
    setLoading(true);setMessage('');
    try{setGrupo(await api(`/api/stats?grupo=${encodeURIComponent(g.chave)}`))}
    catch(err){handleError(err)}
    finally{setLoading(false)}
  };

  const switchTab=t=>{
    setTab(t);setMessage('');setGrupo(null);
    if(t==='painel')carregarPainel();
  };

  return <div className="app">
    <aside>
      <div className="brand"><img src="/logo-doccsc.png" alt="doc csc · centro de serviços compartilhados"/><span>Banco de Talentos</span></div>
      <nav>
        <button type="button" className={tab==='search'?'active':''} onClick={()=>switchTab('search')}>
          <Search/>Pesquisa inteligente
          {recentes?.total>0&&<em className="badge" title={`${recentes.total} currículo(s) recebido(s) nas últimas ${recentes.horas} horas`}>{recentes.total>99?'99+':recentes.total}</em>}
        </button>
        <button type="button" className={tab==='register'?'active':''} onClick={()=>switchTab('register')}><UploadCloud/>Cadastrar currículo</button>
        <button type="button" className={tab==='painel'?'active':''} onClick={()=>switchTab('painel')}><LayoutGrid/>Painel por profissão</button>
      </nav>
      {!isStandalone()&&(installEvent||isMobile())&&<button type="button" className="install" onClick={install}><Smartphone/>Instalar no celular</button>}
      <div className="aside-note"><Users/><b>Talentos em um só lugar</b><span>Encontre profissionais por função, região e experiência.</span></div>
    </aside>
    <main>
      <header>
        <div>
          <small>RECRUTAMENTO INTELIGENTE</small>
          <h1>{tab==='search'?'Encontre o profissional certo':tab==='register'?'Cadastro de profissional':'Painel por profissão'}</h1>
          <p>{tab==='search'?'Pesquise em linguagem natural e encontre candidatos em segundos.':tab==='register'?'Envie o currículo e o sistema cadastra o profissional automaticamente.':'Quantos profissionais existem no banco de talentos, por profissão. Clique em uma profissão para ver os currículos.'}</p>
        </div>
        <div className="status"><i/>Sistema online</div>
      </header>

      {needPass&&<form className="searchbox passbox" onSubmit={savePass}>
        <label><Lock/> Este sistema é protegido por senha</label>
        <div><Lock/><input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)} placeholder="Digite a senha de acesso" autoFocus required/><button>Entrar</button></div>
      </form>}

      {showInstallHelp&&<div className="share-help">
        <b><Smartphone/> Instalar e receber currículos pelo WhatsApp</b>
        {isIOS()?<ol>
          <li>No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</li>
          <li>O iPhone não permite que sites recebam arquivos pelo "Compartilhar". No WhatsApp, abra o currículo, toque em <b>Compartilhar → Salvar em Arquivos</b> e depois envie pela tela <b>Cadastrar currículo</b>.</li>
        </ol>:<ol>
          <li>No Chrome, toque no menu <b>⋮</b> e depois em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</li>
          <li>No WhatsApp, toque e segure o currículo, toque em <b>Compartilhar</b> <Share2/> e escolha <b>Banco de Talentos</b>.</li>
          <li>O sistema abre, lê e cadastra o currículo automaticamente.</li>
        </ol>}
        <button type="button" onClick={()=>setShowInstallHelp(false)}>Entendi</button>
      </div>}

      {tab==='search'&&(pending>0||updateInfo)&&<div className="update-old">
        <AlertTriangle/>
        <div>
          {pending>0
            ?<span><b>{pending} currículo(s) cadastrados antes da atualização</b> ainda não têm o texto completo indexado, então não aparecem nas buscas por setor, curso ou local de trabalho.</span>
            :<span><b>Cadastros atualizados.</b></span>}
          {updateInfo&&<small>{updateInfo}</small>}
        </div>
        {pending>0&&<button type="button" onClick={updateOld} disabled={updating}>{updating?<Loader2 className="spin"/>:<RefreshCw/>}{updating?'Atualizando...':'Atualizar agora'}</button>}
      </div>}

      {tab==='search'?<section>
        {recentes&&<div className={'recentes'+(recentes.total>0?'':' vazio')}>
          <Clock3/>
          <span>{recentes.total>0
            ?<><b>{recentes.total} {recentes.total===1?'currículo recebido':'currículos recebidos'}</b> nas últimas {recentes.horas} horas.</>
            :<>Nenhum currículo recebido nas últimas {recentes.horas} horas.</>}</span>
          {recentes.total>0&&<button type="button" onClick={verRecentes} disabled={loading}>Ver os mais recentes</button>}
        </div>}
        <form className="searchbox" onSubmit={search}>
          <label htmlFor="q">O que você procura?</label>
          <div><Search/><input id="q" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Enfermeiros em Belém com mais de 3 anos em UTI e curso ACLS" required/><button disabled={loading}>{loading?<Loader2 className="spin"/>:<Search/>}Pesquisar</button></div>
          <span>Pesquise por profissão, cidade, estado, tempo de experiência, setores (UTI, pronto-socorro, home care...), cursos, especializações ou locais onde trabalhou. Digite <b>todos</b> para listar tudo.</span>
          <div className="examples">{EXAMPLES.map(x=><button type="button" key={x} onClick={()=>setQuery(x)}>{x}</button>)}</div>
        </form>
        {message&&<div className="alert">{message}</div>}
        {filters&&<div className="summary">
          <div><b>{results.length}</b><span>{results.length===1?'candidato encontrado':'candidatos encontrados'}</span></div>
          <div className="chips">
            {filters.profession&&<em><Stethoscope/>{filters.profession}</em>}
            {filters.city&&<em><MapPin/>{filters.city}</em>}
            {filters.state&&<em><MapPin/>{filters.state}</em>}
            {expLabel(filters)&&<em><Briefcase/>{expLabel(filters)}</em>}
            {(filters.sectors||[]).map(x=><em key={'s'+x}><Building2/>{x}</em>)}
            {(filters.keywords||[]).map(x=><em key={'k'+x}><Search/>{x}</em>)}
          </div>
        </div>}
        {filters?.interpretation&&<p className="interpretation"><Sparkles/>{filters.interpretation}</p>}
        <div className="cards">{results.map(c=><CandidateCard key={c.id} c={c} onDelete={removeCandidate} deleting={deleting===c.id}/>)}</div>
        {filters&&results.length===0&&!message&&<div className="empty"><Search/><h3>Nenhum candidato encontrado</h3><p>Tente ampliar os critérios ou cadastrar um novo currículo.</p></div>}
      </section>:tab==='painel'?<section>
        {message&&<div className="alert">{message}</div>}

        {grupo?<>
          <div className="grupo-topo">
            <button type="button" className="voltar" onClick={()=>setGrupo(null)}><ArrowLeft/>Voltar ao painel</button>
            <div>
              <h2>{grupo.grupo.rotulo||grupo.grupo.label}</h2>
              <span>{grupo.results.length} {grupo.results.length===1?'currículo cadastrado':'currículos cadastrados'}</span>
            </div>
          </div>
          <div className="cards">{grupo.results.map(c=><CandidateCard key={c.id} c={c} onDelete={removeCandidate} deleting={deleting===c.id}/>)}</div>
          {grupo.results.length===0&&<div className="empty"><UserRound/><h3>Nenhum currículo neste grupo</h3><p>Os cadastros podem ter sido excluídos. Volte ao painel.</p></div>}
        </>:<>
          {loading&&!painel&&<div className="processing"><Loader2 className="spin"/><span><b>Carregando o painel...</b><small>Contando os cadastros por profissão.</small></span></div>}

          {painel&&<>
            <div className="painel-resumo">
              <div><b>{painel.total}</b><span>{painel.total===1?'profissional cadastrado':'profissionais cadastrados'}</span></div>
              <div><b>{painel.grupos.length}</b><span>{painel.grupos.length===1?'profissão':'profissões'}</span></div>
              <button type="button" onClick={carregarPainel} disabled={loading}>{loading?<Loader2 className="spin"/>:<RefreshCw/>}Atualizar</button>
            </div>

            <div className="painel">
              {painel.grupos.map(g=><button type="button" key={g.chave} className={'grupo-card'+(g.chave.startsWith('medico:')?' medico':'')} onClick={()=>abrirGrupo(g)}>
                <span className="grupo-nome">{g.rotulo||g.label}</span>
                <b>{g.total}</b>
                <span className="grupo-acao">Ver currículos <ChevronDown/></span>
              </button>)}
            </div>

            {painel.grupos.length===0&&<div className="empty"><UserRound/><h3>Nenhum currículo cadastrado</h3><p>Assim que os primeiros currículos entrarem, eles aparecem aqui agrupados por profissão.</p></div>}
          </>}
        </>}
      </section>:<section>
        <form className="register auto-register" onSubmit={submit}>
          <div className="form-title"><div><UploadCloud/></div><span><h2>Envie o currículo</h2><p>A inteligência artificial fará a leitura e o cadastro automaticamente.</p></span></div>
          <div className="ai-flow"><span><b>1</b> Upload</span><i/><span><b>2</b> Leitura por IA</span><i/><span><b>3</b> Cadastro automático</span></div>
          <label className={'drop big'+(dragging?' dragging':'')}
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);if(!loading)chooseFile(e.dataTransfer.files?.[0])}}>
            <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={loading} onChange={e=>chooseFile(e.target.files?.[0])}/>
            <UploadCloud/>
            <b>{file?file.name:'Arraste ou clique para enviar o currículo'}</b>
            <span>PDF ou DOCX · máximo 4 MB</span>
          </label>
          {isMobile()&&<p className="mobile-tip"><Share2/>{isStandalone()&&!isIOS()
            ?<span>Dica: no WhatsApp, toque e segure o currículo, toque em <b>Compartilhar</b> e escolha <b>Banco de Talentos</b>.</span>
            :<span>Quer receber currículos direto do WhatsApp? <button type="button" onClick={()=>setShowInstallHelp(true)}>Veja como</button></span>}</p>}
          {loading&&<div className="processing"><Loader2 className="spin"/><span><b>Lendo o currículo com inteligência artificial...</b><small>Identificando dados pessoais, profissão, localização e experiência.</small></span></div>}
          {message&&<div className={candidate?'success alert':'alert'}>{candidate&&<CheckCircle2/>}{message}</div>}
          {candidate&&<div className="read-result">
            <div className="avatar">{initials(candidate.name)}</div>
            <div>
              <small>DADOS IDENTIFICADOS PELA IA</small>
              <h3>{candidate.name||'Nome não identificado'}</h3>
              <p>{candidate.profession||'Profissão não identificada'} · {candidate.city||'Cidade não identificada'} / {candidate.state||'UF'}</p>
              <p>{candidate.phone||'Telefone não identificado'} · {candidate.email||'E-mail não identificado'}</p>
              {candidate.experienceYears>0&&<p>{yearsText(candidate.experienceYears)} de experiência</p>}
              {candidate.sectors&&<p><b>Setores:</b> {candidate.sectors}</p>}
              {candidate.specialties&&<p><b>Cursos:</b> {candidate.specialties}</p>}
            </div>
          </div>}
          <button className="submit" disabled={loading||!file}>{loading?<Loader2 className="spin"/>:<UploadCloud/>}{loading?'Processando currículo':'Ler e cadastrar automaticamente'}</button>
        </form>
      </section>}
    </main>
    {saved&&<SuccessDialog onClose={()=>setSaved(false)}/>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
