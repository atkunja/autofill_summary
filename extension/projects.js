export const MAX_PROJECTS = 10;
export function projectTarget(value) {
  let url;
  try {url = new URL(value.trim());} catch {throw Error('Enter a complete https:// project URL.');}
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use a public HTTPS URL without credentials.');
  const host=url.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':')) throw Error('Use a public website, not a local address.');
  url.hash='';
  let fetchUrl=url.href;
  if(host==='github.com') {
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts.length!==2 || !parts.every(p=>/^[\w.-]+$/.test(p)))throw Error('Use a GitHub repository URL: https://github.com/owner/repo.');
    fetchUrl=`https://api.github.com/repos/${parts[0]}/${parts[1]}/readme`;
  }
  return {url:url.href,fetchUrl,origin:new URL(fetchUrl).origin+'/*',github:host==='github.com'};
}
export async function readSource(target, fetcher=fetch) {
  const response=await fetcher(target.fetchUrl,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000),headers:target.github?{Accept:'application/vnd.github.raw+json'}:{}});
  if(!response.ok)throw Error(`Source returned ${response.status}. Check the link, or paste project notes below.`);
  const type=response.headers.get('content-type') || '';
  if(!/text\/|json|xml/.test(type))throw Error('This link is not a text page. Paste a summary instead.');
  const reader=response.body.getReader(), chunks=[];let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw Error('Page exceeds 2 MB. Paste the relevant project text instead.');chunks.push(value);}
  } finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
export function extractSource(raw, github=false) {
  let text=raw;
  if(!github) {
    const doc=new DOMParser().parseFromString(raw,'text/html');
    doc.querySelectorAll('script,style,nav,footer,header,iframe,svg,noscript,form,template').forEach(el=>el.remove());
    const root=doc.querySelector('main,article') || doc.body;
    root.querySelectorAll('p,div,li,section,h1,h2,h3,br').forEach(el=>el.append('\n'));
    text=root.textContent;
  }
  text=text.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  if(text.length<60)throw Error('This page provides too little readable text. Add project details manually.');
  return {text:text.slice(0,6000),truncated:text.length>6000};
}
export function cleanProjects(projects) {
  if(!Array.isArray(projects) || projects.length>MAX_PROJECTS)throw Error(`Use at most ${MAX_PROJECTS} projects.`);
  return projects.map(p=>{
    if(!p || typeof p!=='object')throw Error('Invalid project entry.');
    const string=(key,max)=>typeof p[key]==='string'?p[key].slice(0,max):'';
    return {title:string('title',150),url:p.url?projectTarget(p.url).url:'',notes:string('notes',2000),sourceText:string('sourceText',6000),fetchedAt:string('fetchedAt',40),enabled:p.enabled!==false};
  });
}
export function projectContext(projects=[]) {
  return cleanProjects(projects).filter(p=>p.enabled && (p.notes.trim() || p.sourceText.trim())).map(({title,url,notes,sourceText,fetchedAt})=>({title,url,candidateContribution:notes,sourceExcerpt:sourceText,retrievedAt:fetchedAt}));
}
