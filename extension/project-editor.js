import {MAX_PROJECTS,cleanProjects,projectTarget,readSource,extractSource} from './projects.js';
export function projectEditor(root, report) {
  let entries=[];
  const field=(name,label,value,tag='input')=>{
    const wrapper=document.createElement('label');wrapper.textContent=label;
    const input=document.createElement(tag);input.value=value || '';input.dataset.field=name;
    input.maxLength={title:150,url:2000,notes:2000,sourceText:6000}[name];
    if(tag==='textarea')input.rows=name==='sourceText'?5:3;
    wrapper.append(input);return wrapper;
  };
  function read(){return cleanProjects(entries.map(({card,meta})=>({...meta,...Object.fromEntries([...card.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el.value])),enabled:card.querySelector('[data-enabled]').checked})));}
  function add(project={}) {
    if(entries.length>=MAX_PROJECTS)throw Error(`You can save up to ${MAX_PROJECTS} projects.`);
    const card=document.createElement('section');card.className='project-card';
    const heading=document.createElement('h3');heading.textContent='Project';card.append(heading);
    const toggle=document.createElement('label'), check=document.createElement('input');check.type='checkbox';check.dataset.enabled='';check.checked=project.enabled!==false;
    toggle.append(check,' Include in AI answers');card.append(toggle);
    card.append(field('title','Project name',project.title),field('url','Project link (website or GitHub repository)',project.url),field('notes','Your contribution, technologies, and results',project.notes,'textarea'));
    const fetchButton=document.createElement('button');fetchButton.type='button';fetchButton.textContent='Read project link';card.append(fetchButton);
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Source text used by AI';details.append(summary,field('sourceText','Imported source text (editable)',project.sourceText,'textarea'));card.append(details);
    const state=document.createElement('p');state.className='hint';state.textContent=project.fetchedAt?`Source saved: ${project.fetchedAt}`:'No source read yet. Your notes can be used on their own.';card.append(state);
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove project';card.append(remove);
    const entry={card,meta:{fetchedAt:project.fetchedAt || ''}};entries.push(entry);root.append(card);
    const get=name=>card.querySelector(`[data-field="${name}"]`);
    get('url').addEventListener('input',()=>{get('sourceText').value='';entry.meta.fetchedAt='';state.textContent='Link changed. Read it again or add source text manually.';});
    remove.onclick=()=>{entries=entries.filter(e=>e!==entry);card.remove();};
    fetchButton.onclick=async()=>{
      fetchButton.disabled=true;
      try {
        const target=projectTarget(get('url').value);
        // Request only this source origin while still in the click user gesture.
        if(!await chrome.permissions.request({origins:[target.origin]}))throw Error('Site access was not granted. Paste project details manually.');
        state.textContent='Reading project source…';
        const result=extractSource(await readSource(target),target.github);
        if(get('url').value.trim()!==target.url && projectTarget(get('url').value).url!==target.url)throw Error('Link changed while reading. Try again.');
        get('sourceText').value=result.text;entry.meta.fetchedAt=new Date().toISOString();
        state.textContent=`Read ${result.text.length.toLocaleString()} characters${result.truncated?' (excerpt limited to 6,000)':''}. Review source text, then save your profile.`;
      }catch(error){state.textContent=error.message;report(error);}finally{fetchButton.disabled=false;}
    };
  }
  function set(projects=[]){const clean=cleanProjects(projects);entries=[];root.replaceChildren();clean.forEach(add);}
  return {read,add,set};
}
