import './polyfills.js';
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,UploadCloud,FileText,Download,Eye,MessageCircle,Users,MapPin,Briefcase,CheckCircle2,Loader2,Lock} from 'lucide-react';
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

const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'?';

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
  const inputRef=useRef(null);

  const handleError=e=>{
    if(e.auth){setPassword('');setNeedPass(true)}
    setMessage(e.message);
  };

  const chooseFile=f=>{
    setCandidate(null);setMessage('');
    if(!f){setFile(null);return}
    if(!/\.(pdf|docx)$/i.test(f.name)){setFile(null);return setMessage('Envie um currículo em PDF ou DOCX.')}
    if(f.size>MAX_UPLOAD){setFile(null);return setMessage('O arquivo deve ter até 4 MB.')}
    setFile(f);
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

  const submit=async e=>{
    e.preventDefault();
    if(!file)return setMessage('Selecione o currículo.');
    setLoading(true);setMessage('');setCandidate(null);
    try{
      const extractedText=await extractText(file);
      if(extractedText.length<30)throw Error('Não foi possível identificar texto suficiente neste currículo. Se ele for uma imagem digitalizada, será necessário usar OCR.');
      const fd=new FormData();
      fd.append('resume',file);
      fd.append('extractedText',extractedText.slice(0,50000));
      const d=await api('/api/candidates',{method:'POST',body:fd});
      setCandidate(d.candidate);
      setMessage('Currículo lido e profissional cadastrado automaticamente.');
      setFile(null);
      if(inputRef.current)inputRef.current.value='';
    }catch(err){handleError(err)}finally{setLoading(false)}
  };

  const savePass=e=>{
    e.preventDefault();
    setPassword(passInput.trim());
    setPassInput('');setNeedPass(false);setMessage('');
  };

  const switchTab=t=>{setTab(t);setMessage('')};

  return <div className="app">
    <aside>
      <div className="brand"><div className="brandmark">A</div><div><b>Ágile</b><span>Banco de Talentos</span></div></div>
      <nav>
        <button type="button" className={tab==='search'?'active':''} onClick={()=>switchTab('search')}><Search/>Pesquisa inteligente</button>
        <button type="button" className={tab==='register'?'active':''} onClick={()=>switchTab('register')}><UploadCloud/>Cadastrar currículo</button>
      </nav>
      <div className="aside-note"><Users/><b>Talentos em um só lugar</b><span>Encontre profissionais por função, região e experiência.</span></div>
    </aside>
    <main>
      <header>
        <div>
          <small>RECRUTAMENTO INTELIGENTE</small>
          <h1>{tab==='search'?'Encontre o profissional certo':'Cadastro de profissional'}</h1>
          <p>{tab==='search'?'Pesquise em linguagem natural e encontre candidatos em segundos.':'Envie o currículo e o sistema cadastra o profissional automaticamente.'}</p>
        </div>
        <div className="status"><i/>Sistema online</div>
      </header>

      {needPass&&<form className="searchbox passbox" onSubmit={savePass}>
        <label><Lock/> Este sistema é protegido por senha</label>
        <div><Lock/><input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)} placeholder="Digite a senha de acesso" autoFocus required/><button>Entrar</button></div>
      </form>}

      {tab==='search'?<section>
        <form className="searchbox" onSubmit={search}>
          <label htmlFor="q">O que você procura?</label>
          <div><Search/><input id="q" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Quero enfermeiros que morem no estado do Pará" required/><button disabled={loading}>{loading?<Loader2 className="spin"/>:<Search/>}Pesquisar</button></div>
          <span>Experimente buscar por profissão, estado e tempo de experiência.</span>
        </form>
        {message&&<div className="alert">{message}</div>}
        {filters&&<div className="summary">
          <div><b>{results.length}</b><span>{results.length===1?'candidato encontrado':'candidatos encontrados'}</span></div>
          <div className="chips">{filters.profession&&<em>{filters.profession}</em>}{filters.state&&<em><MapPin/>{filters.state}</em>}{filters.minExperience>0&&<em><Briefcase/>{filters.minExperience}+ anos</em>}</div>
        </div>}
        <div className="cards">{results.map(c=>{
          const wa=phoneLink(c.phone);
          const place=[c.city,c.state].filter(Boolean).join(' · ')||'Local não informado';
          return <article key={c.id}>
            <div className="avatar">{initials(c.name)}</div>
            <div className="person">
              <h3>{c.name}</h3>
              <b>{c.profession}</b>
              <p><MapPin/>{place}</p>
              <p><Briefcase/>{c.experience_years} {c.experience_years===1?'ano':'anos'} de experiência</p>
              <span><FileText/>{c.resume_name}</span>
            </div>
            <div className="actions">
              {wa&&<a className="whatsapp" href={wa} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a>}
              <a href={resumeLink(c,false)} target="_blank" rel="noreferrer"><Eye/>Visualizar</a>
              <a href={resumeLink(c,true)} download={c.resume_name}><Download/>Baixar</a>
            </div>
          </article>})}</div>
        {filters&&results.length===0&&!message&&<div className="empty"><Search/><h3>Nenhum candidato encontrado</h3><p>Tente ampliar os critérios ou cadastrar um novo currículo.</p></div>}
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
          {loading&&<div className="processing"><Loader2 className="spin"/><span><b>Lendo o currículo com inteligência artificial...</b><small>Identificando dados pessoais, profissão, localização e experiência.</small></span></div>}
          {message&&<div className={candidate?'success alert':'alert'}>{candidate&&<CheckCircle2/>}{message}</div>}
          {candidate&&<div className="read-result">
            <div className="avatar">{initials(candidate.name)}</div>
            <div>
              <small>DADOS IDENTIFICADOS PELA IA</small>
              <h3>{candidate.name||'Nome não identificado'}</h3>
              <p>{candidate.profession||'Profissão não identificada'} · {candidate.city||'Cidade não identificada'} / {candidate.state||'UF'}</p>
              <p>{candidate.phone||'Telefone não identificado'} · {candidate.email||'E-mail não identificado'}</p>
            </div>
          </div>}
          <button className="submit" disabled={loading||!file}>{loading?<Loader2 className="spin"/>:<UploadCloud/>}{loading?'Processando currículo':'Ler e cadastrar automaticamente'}</button>
        </form>
      </section>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
