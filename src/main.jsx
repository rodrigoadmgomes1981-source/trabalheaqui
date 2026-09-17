import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Search,UploadCloud,FileText,Download,Eye,MessageCircle,Users,MapPin,Briefcase,CheckCircle2,Loader2} from 'lucide-react';
import './polyfills.js';
import mammoth from 'mammoth/mammoth.browser';
import './styles.css';
import './auto-upload.css';

const phoneLink=p=>'https://wa.me/55'+String(p).replace(/\D/g,'');
async function getBuffer(file){if(typeof file.arrayBuffer==='function')return file.arrayBuffer();return new Response(file).arrayBuffer()}
async function extractText(file){try{const buffer=await getBuffer(file),name=file.name.toLowerCase();if(file.type==='application/pdf'||name.endsWith('.pdf')){const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url).toString();const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer),useWorkerFetch:false,isEvalSupported:false}).promise;const pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();pages.push(content.items.filter(x=>x&&typeof x.str==='string').map(x=>x.str).join(' '));page.cleanup()}await pdf.destroy();return pages.join(' ').trim()}if(name.endsWith('.docx'))return (await mammoth.extractRawText({arrayBuffer:buffer})).value.trim();throw Error('Envie um currículo em PDF ou DOCX.')}catch(error){console.error('Falha ao ler currículo',error);throw Error('Não foi possível ler este arquivo. Tente salvar o currículo novamente em PDF ou DOCX. Se ele for uma imagem digitalizada, será necessário usar OCR.')}}

function App(){
 const [tab,setTab]=useState('search'),[query,setQuery]=useState(''),[results,setResults]=useState([]),[filters,setFilters]=useState(null),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const [file,setFile]=useState(null),[candidate,setCandidate]=useState(null);
 const search=async(e)=>{e.preventDefault();setLoading(true);setMessage('');try{const r=await fetch('/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query})});const d=await r.json();if(!r.ok)throw Error(d.error);setResults(d.results||[]);setFilters(d.filters)}catch(e){setMessage(e.message)}finally{setLoading(false)}};
 const submit=async(e)=>{e.preventDefault();if(!file)return setMessage('Selecione o currículo.');setLoading(true);setMessage('');setCandidate(null);try{const extractedText=await extractText(file);if(extractedText.length<30)throw Error('Não foi possível identificar texto suficiente neste currículo.');const fd=new FormData();fd.append('resume',file);fd.append('extractedText',extractedText.slice(0,50000));const r=await fetch('/api/candidates',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw Error(d.error);setCandidate(d.candidate);setMessage('Currículo lido e profissional cadastrado automaticamente.');setFile(null);e.target.reset()}catch(e){setMessage(e.message)}finally{setLoading(false)}};
 return <div className="app">
  <aside><div className="brand"><div className="brandmark">A</div><div><b>Ágile</b><span>Banco de Talentos</span></div></div><nav><button className={tab==='search'?'active':''} onClick={()=>{setTab('search');setMessage('')}}><Search/>Pesquisa inteligente</button><button className={tab==='register'?'active':''} onClick={()=>{setTab('register');setMessage('')}}><UploadCloud/>Cadastrar currículo</button></nav><div className="aside-note"><Users/><b>Talentos em um só lugar</b><span>Encontre profissionais por função, região e experiência.</span></div></aside>
  <main>
   <header><div><small>RECRUTAMENTO INTELIGENTE</small><h1>{tab==='search'?'Encontre o profissional certo':'Cadastro de profissional'}</h1><p>{tab==='search'?'Pesquise em linguagem natural e encontre candidatos em segundos.':'Inclua os dados e o currículo no banco de talentos.'}</p></div><div className="status"><i/>Sistema online</div></header>
   {tab==='search'?<section>
    <form className="searchbox" onSubmit={search}><label>O que você procura?</label><div><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Quero enfermeiros que morem no estado do Pará" required/><button disabled={loading}>{loading?<Loader2 className="spin"/>:<Search/>}Pesquisar</button></div><span>Experimente buscar por profissão, estado e tempo de experiência.</span></form>
    {message&&<div className="alert">{message}</div>}
    {filters&&<div className="summary"><div><b>{results.length}</b><span>candidatos encontrados</span></div><div className="chips">{filters.profession&&<em>{filters.profession}</em>}{filters.state&&<em><MapPin/>{filters.state}</em>}{filters.minExperience>0&&<em><Briefcase/>{filters.minExperience}+ anos</em>}</div></div>}
    <div className="cards">{results.map(c=><article key={c.id}><div className="avatar">{c.name.split(' ').slice(0,2).map(x=>x[0]).join('')}</div><div className="person"><h3>{c.name}</h3><b>{c.profession}</b><p><MapPin/>{c.city} · {c.state}</p><p><Briefcase/>{c.experience_years} {c.experience_years===1?'ano':'anos'} de experiência</p><span><FileText/>{c.resume_name}</span></div><div className="actions"><a className="whatsapp" href={phoneLink(c.phone)} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a><a href={c.resume_url||`/api/candidates/${c.id}/resume`} target="_blank" rel="noreferrer"><Eye/>Visualizar</a><a href={(c.resume_url||`/api/candidates/${c.id}/resume`)+(c.resume_url?'':'?download=1')} download><Download/>Baixar</a></div></article>)}</div>
    {filters&&results.length===0&&<div className="empty"><Search/><h3>Nenhum candidato encontrado</h3><p>Tente ampliar os critérios ou cadastrar um novo currículo.</p></div>}
   </section>:<section><form className="register auto-register" onSubmit={submit}>
    <div className="form-title"><div><UploadCloud/></div><span><h2>Envie o currículo</h2><p>A inteligência artificial fará a leitura e o cadastro automaticamente.</p></span></div>
    <div className="ai-flow"><span><b>1</b> Upload</span><i/><span><b>2</b> Leitura por IA</span><i/><span><b>3</b> Cadastro automático</span></div>
    <label className="drop big"><input type="file" accept=".pdf,.docx" onChange={e=>{setFile(e.target.files[0]);setCandidate(null);setMessage('')}}/><UploadCloud/><b>{file?file.name:'Arraste ou clique para enviar o currículo'}</b><span>PDF ou DOCX · máximo 10 MB</span></label>
    {loading&&<div className="processing"><Loader2 className="spin"/><span><b>Lendo o currículo com inteligência artificial...</b><small>Identificando dados pessoais, profissão, localização e experiência.</small></span></div>}
    {message&&<div className={candidate?'success alert':'alert'}>{candidate&&<CheckCircle2/>}{message}</div>}
    {candidate&&<div className="read-result"><div className="avatar">{candidate.name?.split(' ').slice(0,2).map(x=>x[0]).join('')}</div><div><small>DADOS IDENTIFICADOS PELA IA</small><h3>{candidate.name||'Nome não identificado'}</h3><p>{candidate.profession||'Profissão não identificada'} · {candidate.city||'Cidade não identificada'} / {candidate.state||'UF'}</p><p>{candidate.phone||'Telefone não identificado'} · {candidate.email||'E-mail não identificado'}</p></div></div>}
    <button className="submit" disabled={loading||!file}>{loading?<Loader2 className="spin"/>:<UploadCloud/>}{loading?'Processando currículo':'Ler e cadastrar automaticamente'}</button>
   </form></section>}
  </main>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
