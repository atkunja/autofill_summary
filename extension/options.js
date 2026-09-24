import {profileFields} from './matching.js';
import {projectEditor} from './project-editor.js';
import {extractResume} from './resume.js';
import {parseProfileImport} from './profile-import.js';
const $ = id => document.getElementById(id);
let savedResume;
const projects=projectEditor($('projects'),report);
$('addProject').onclick=()=>{try{projects.add();}catch(error){report(error);}};
for (const [key,label] of Object.entries(profileFields)) {
  const wrap=document.createElement('div'), l=document.createElement('label'), input=document.createElement('input');
  l.htmlFor=key; l.textContent=label; input.id=key; input.maxLength=500;
  input.type=key==='email'?'email':['linkedin','github','website'].includes(key)?'url':key==='phone'?'tel':'text';
  wrap.append(l,input); $('profileFields').append(wrap);
}
async function load() {
  const {profile={},resume,model='gpt-5-mini'}=await chrome.storage.local.get(['profile','resume','model']);
  savedResume=resume;
  projects.set(profile.projects || []);
  for (const key of [...Object.keys(profileFields),'background','goals']) $(key).value=profile[key] || '';
  $('model').value=model; $('resumeName').textContent=resume?.name || 'No resume saved.';
  const {apiKey}=await chrome.storage.session.get('apiKey');
  $('keyState').textContent=apiKey?'A key is available for this session. Leave blank to keep it.':'No key saved. Your key clears when Chrome closes.';
}
function report(error) {$('status').textContent=error.message;}
$('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const profile=Object.fromEntries([...Object.keys(profileFields),'background','goals'].map(k=>[k,$(k).value.trim()]));
    profile.projects=projects.read();
    const file=$('resume').files[0];
    let resume=savedResume;
    if (file) {
      if(file.size>4*1024*1024 || !/\.(pdf|docx?|txt)$/i.test(file.name)) throw Error('Choose a PDF, DOC, DOCX, or TXT file up to 4 MB.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Could not read resume.'));reader.readAsDataURL(file);});
      resume={name:file.name,type:file.type || 'application/octet-stream',data};
    }
    await chrome.storage.local.set({profile,model:$('model').value.trim() || 'gpt-5-mini',resume:resume || null});
    if($('apiKey').value.trim()) await chrome.storage.session.set({apiKey:$('apiKey').value.trim()});
    $('apiKey').value='';$('resume').value='';await load();$('status').textContent='Profile saved. Open a job application, then click the extension to scan it.';
  } catch(error){report(error);}
});
$('removeResume').onclick=async()=>{await chrome.storage.local.remove('resume');savedResume=null;$('resume').value='';$('resumeName').textContent='No resume saved.';};
$('forgetKey').onclick=async()=>{await chrome.storage.session.remove('apiKey');$('apiKey').value='';$('keyState').textContent='API key removed.';};
$('erase').onclick=async()=>{if(!confirm('Erase your profile, resume, and session API key?'))return;await chrome.storage.local.clear();await chrome.storage.session.clear();$('profileForm').reset();await load();$('status').textContent='All saved data erased.';};
$('extractResume').onclick=async()=>{
  const button=$('extractResume');button.disabled=true;
  try {
    let file=$('resume').files[0];
    if(!file && savedResume)file=new File([Uint8Array.from(atob(savedResume.data),c=>c.charCodeAt(0))],savedResume.name,{type:savedResume.type});
    if(!file)throw Error('Choose or save a PDF or TXT resume first.');
    const result=await extractResume(file);
    if($('background').value.trim() && !confirm('Replace the experience / resume text with the extracted text?'))return;
    $('background').value=result.text;
    $('status').textContent='Resume text extracted locally. Review it, remove any contact details you do not want in AI requests, then Save profile.'+(result.truncated?' Limited to 16,000 characters.':'');
  }catch(error){report(error);}finally{button.disabled=false;}
};
$('profileImport').onchange=async()=>{
  try {
    const file=$('profileImport').files[0];if(!file)return;
    if(file.size>7*1024*1024)throw Error('Profile import exceeds 7 MB.');
    const data=parseProfileImport(await file.text());
    if(!confirm('Load imported details into this editor? Unsaved edits in matching fields will be replaced. Your API key is preserved.'))return;
    for(const [key,value] of Object.entries(data.profile))if(key!=='projects')$(key).value=value;
    if(data.profile.projects)projects.set(data.profile.projects);
    if(data.resume){savedResume=data.resume;$('resume').value='';$('resumeName').textContent=data.resume.name+' (import preview)';}
    $('status').textContent='Import ready to review. Click Save profile to apply it. Your API key has not changed.';
  }catch(error){report(error);}finally{$('profileImport').value='';}
};
load().catch(report);
