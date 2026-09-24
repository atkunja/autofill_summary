import {scanApplication,fillApplication,applicationChanged} from './application.js';
import {classify,suggestion,canDraft,isSensitive,savedFieldKey,fallbackValues} from './matching.js';
import {canMap,mappedKey,mappingSources,mappingSuggestion,saveMapping} from './field-mappings.js';
import {captureDrafts,restoreDraft,draftKey} from './draft-state.js';
import {BATCH_LIMIT} from './draft-queue.js';
const $=id=>document.getElementById(id);
let tabId,pageUrl,documents=[],rows=[],resume,scanning=false,filling=false,changed=false,polling=false,job=null,epoch=0;
const status=text=>$('status').textContent=text;
$('profile').onclick=()=>chrome.runtime.openOptionsPage();
function make(tag,text){const el=document.createElement(tag);if(text)el.textContent=text;return el;}
function draftable(row){return row.editor&&!row.field.value&&!row.filled&&!row.mapped&&canDraft(row.field);}
function updateUi(){
  const complete=rows.filter(r=>r.field.value||r.filled).length;
  const selected=rows.filter(r=>!r.field.value&&!r.filled&&!r.check.disabled&&r.check.checked).length;
  $('coverage').textContent=rows.length?`${complete} already filled · ${selected} selected · ${rows.length-complete-selected} need attention (${rows.length} detected fields)`:'';
  $('scan').disabled=scanning||filling;$('rescan').disabled=scanning||filling;
  $('fill').disabled=scanning||filling||changed||!!job;
  $('batch').disabled=scanning||filling||changed||!!job||!rows.some(r=>draftable(r)&&!r.editor.value.trim());
  $('cancelDrafts').hidden=!job;
  for(const row of rows)if(row.draftButton)row.draftButton.disabled=scanning||filling||changed||!!job||!draftable(row);
}
function cancelDrafts(message='Drafting cancelled. Completed drafts remain available for review.'){
  if(!job)return;
  const old=job;job=null;old.cancelled=true;
  try{old.port.postMessage({type:'cancel'});old.port.disconnect();}catch{}
  for(const {row} of old.targets.values())if(row.note.textContent==='Drafting…')row.note.textContent='Drafting cancelled. Retry when ready.';
  status(message);updateUi();
}
function startDrafts(targets,batch){
  if(job||changed||scanning||filling)return;
  if(batch&&(!$('company').value.trim()||!$('role').value.trim())){status('Enter the company and role under Context for better answers before drafting a batch.');$('jobContext').open=true;return;}
  targets=targets.filter(draftable).slice(0,BATCH_LIMIT);
  if(!targets.length){status('No unanswered writing questions are ready for drafting.');return;}
  const port=chrome.runtime.connect({name:'application-drafts'});
  const active={port,cancelled:false,count:0,errors:0,targets:new Map(targets.map(r=>[r.field.id,{row:r,revision:r.revision}]))};job=active;
  for(const row of targets){row.check.checked=false;row.note.textContent='Drafting…';}
  status(`Drafting ${targets.length} answer(s), at most two at a time. Review each answer before selecting it.`);updateUi();
  port.onMessage.addListener(message=>{
    if(job!==active||active.cancelled)return;
    if(message.type==='result'){
      const target=active.targets.get(message.id);if(!target)return;
      const {row,revision}=target;active.count++;
      if(message.error){active.errors++;row.note.textContent=message.error;}
      else if(!rows.includes(row)||row.revision!==revision){row.note.textContent='Your edit was preserved; the arriving draft was discarded.';}
      else if(typeof message.answer==='string'&&(!row.field.maxLength||message.answer.length<=row.field.maxLength)){
        row.editor.value=message.answer;row.check.checked=false;row.edited=true;row.revision++;
        row.note.textContent='Draft ready. Review and edit it, then select the checkbox to approve filling.';
      }else{active.errors++;row.note.textContent='Draft exceeded the field limit or was invalid.';}
      status(`Drafted ${active.count} of ${targets.length}. ${active.errors} failed. All generated answers need review.`);updateUi();
    }
    if(message.type==='complete'||message.type==='error'){
      job=null;port.disconnect();
      status(message.error||`Draft ready: ${active.count-active.errors} answer(s), ${active.errors} failed. Review each answer, then select its checkbox to approve filling.`);updateUi();
    }
  });
  port.onDisconnect.addListener(()=>{if(job===active){job=null;status('Draft connection closed. Completed drafts remain for review; retry unfinished questions.');updateUi();}});
  port.postMessage({type:'start',batch,company:$('company').value.trim(),role:$('role').value.trim(),context:$('context').value,items:targets.map(r=>({id:r.field.id,field:{label:r.field.label,type:r.field.type,tag:r.field.tag,options:r.field.options,maxLength:r.field.maxLength}}))});
}
$('batch').onclick=()=>startDrafts(rows.filter(r=>draftable(r)&&!r.editor.value.trim()),true);
$('cancelDrafts').onclick=()=>cancelDrafts();

function render(field,profile,mappings,{draft,isNew}={}){
  const card=make('div');card.className='field';
  const label=make('label'),check=make('input');check.type='checkbox';
  const automatic=classify(field),mapped=mappedKey(field,mappings);
  const kind=mapped||automatic,value=mapped?mappingSuggestion(field,profile,mapped):suggestion(field,profile);
  const savedDisclosure=isSensitive(field.label)&&savedFieldKey(field)&&!!value;
  const eligible=!field.value&&(!isSensitive(field.label)||savedDisclosure);
  check.checked=eligible&&!isNew&&!draft&&!!(value||(kind==='resume'&&resume));check.disabled=!eligible;
  label.append(check,document.createTextNode(' '+field.label));card.append(label);
  if(field.sourceUrl&&field.sourceUrl!==pageUrl)card.append(make('small',`Embedded form: ${new URL(field.sourceUrl).hostname}`));
  const row={field,check,kind,profile,mapped,revision:0,edited:false,card};
  const note=make('small');row.note=note;
  if(kind==='resume'){
    card.append(make('small',field.value?`Already attached: ${field.value}`:resume?resume.name:'Save a resume in Profile first.'));if(!resume)check.disabled=true;
  }else if(field.type==='file'||isSensitive(field.label)&&!savedDisclosure){
    check.disabled=true;card.append(make('small','Save an explicit answer in Profile or complete this field manually.'));
  }else{
    const editor=make(field.options?'select':field.tag==='textarea'?'textarea':'input');row.editor=editor;
    editor.setAttribute('aria-label',`Value for ${field.label}`);
    if(field.options){const blank=make('option','Choose an answer');blank.value='';editor.append(blank);for(const option of field.options.filter(o=>o.value)){const o=make('option',option.label);o.value=option.value;o.disabled=option.disabled;editor.append(o);}}
    editor.value=field.value||(draft?draft.value:value);editor.disabled=!eligible;
    if(field.maxLength)editor.maxLength=field.maxLength;
    if(draft){row.edited=true;check.checked=false;}
    editor.addEventListener('input',()=>{row.edited=true;row.revision++;updateUi();});
    card.append(editor);
    if(field.value)card.append(make('small','Already filled — left unchanged.'));
    else if(draft)note.textContent='Restored your draft. Review and select it before filling.';
    else if(isNew)note.textContent='New field. Review the suggestion and select it before filling.';
    else if(!value&&kind){const saved=mapped?mappingSuggestion({...field,options:null},profile,mapped):suggestion({...field,options:null},profile);note.textContent=saved?`Saved answer “${saved}” is not offered by this form. Choose an option manually.`:'No saved answer. Add it in Profile or enter it here.';}
    else if(!value&&!kind&&!canDraft(field))note.textContent=/graduation date/i.test(field.label)?'Your resume may give a month and year; this field needs an exact date. Enter it manually.':'No saved answer matches this question. Enter your answer here or on the form.';
    if(canMap(field)){
      const select=make('select');select.setAttribute('aria-label',`Use profile field for ${field.label}`);
      const placeholder=make('option','Use this profile field…');placeholder.value='';select.append(placeholder);
      for(const [key,text] of Object.entries(mappingSources)){const option=make('option',text);option.value=key;select.append(option);}select.value=mapped||'';
      const save=make('button','Save mapping'),remove=make('button','Remove mapping');save.type=remove.type='button';remove.hidden=!mapped;
      select.onchange=()=>{
        row.mapped=select.value||null;row.kind=row.mapped||automatic;row.revision++;
        if(eligible){editor.value=row.mapped?mappingSuggestion(field,profile,row.mapped):'';row.edited=true;check.checked=false;}
        note.textContent='Review the mapped answer, then Save mapping to reuse it on matching questions.';updateUi();
      };
      save.onclick=async()=>{try{if(!select.value)throw Error('Choose a profile field first.');await saveMapping(field,select.value);remove.hidden=false;note.textContent='Mapping saved for this question and control type. Review the answer before filling.';}catch(error){note.textContent=error.message;}};
      remove.onclick=async()=>{try{await saveMapping(field,'');select.value='';row.mapped=null;row.kind=automatic;row.revision++;if(eligible){editor.value='';check.checked=false;row.edited=false;}remove.hidden=true;note.textContent='Mapping removed.';updateUi();}catch(error){note.textContent=error.message;}};
      card.append(select,save,remove);
    }
    if(canDraft(field)&&!field.value){const button=make('button','Generate AI draft');button.type='button';row.draftButton=button;button.onclick=()=>startDrafts([row],false);const actions=make('div');actions.className='actions';actions.append(button);card.append(actions);}
  }
  card.append(note);$('fields').append(card);rows.push(row);check.addEventListener('change',updateUi);
}

async function scan(){
  if(scanning||filling)return;
  cancelDrafts('Drafting stopped for rescan.');
  const previous=rows,previousTab=tabId,previousUrl=pageUrl,drafts=captureDrafts(previous);
  scanning=true;epoch++;updateUi();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('Open an http(s) job application page first. Chrome internal pages cannot be filled.');
    const result=await scanApplication(tab.id);
    const saved=await chrome.storage.local.get(['profile','resume','fieldMappings']);
    tabId=tab.id;pageUrl=tab.url;documents=result.documents;resume=saved.resume;
    if(previousTab!==tabId||previousUrl!==pageUrl){$('context').value=result.context||'';$('company').value='';$('role').value='';}
    else if(!$('context').value.trim()&&result.context)$('context').value=result.context;
    rows=[];$('fields').replaceChildren();changed=false;$('changes').hidden=true;
    $('pageInfo').textContent=`${new URL(result.url).hostname} · ${result.fields.length} fields found`;
    const profile=saved.profile||{},keys=new Set(previous.map(r=>draftKey(r.field)));
    for(const field of result.fields)render(field,profile,saved.fieldMappings,{draft:restoreDraft(field,result.fields,drafts),isNew:previousTab===tabId&&previous.length>0&&!keys.has(draftKey(field))});
    $('fill').hidden=!rows.length;
    status((rows.length?'Review the suggestions below. Select only the fields you want to fill.':'No supported fields found. Open the application form, then scan again.')+(saved.resume&&!profile.background?.trim()&&!profile.school?'\nYour resume is attached, but its text and education are not saved. In Profile, extract the resume text or import your prepared profile, then Save profile and rescan.':'')+(result.warnings.length?'\n'+result.warnings.join('\n'):''));
  }catch(error){changed=true;status(error.message);}finally{scanning=false;updateUi();}
}
$('scan').onclick=scan;$('rescan').onclick=scan;
$('fill').onclick=async()=>{
  if(filling||scanning||changed||job)return;
  filling=true;epoch++;updateUi();
  try{
    const tab=await chrome.tabs.get(tabId);if(tab.url!==pageUrl)throw Error('The page changed. Scan the application again.');
    status('Filling selected fields, then checking that answers survive page updates…');
    const items=rows.filter(r=>r.check.checked&&!r.check.disabled).map(r=>({id:r.field.id,documentId:r.field.documentId,kind:r.kind,value:r.editor?.value||'',alternatives:fallbackValues(r.kind,r.editor?.value||'',r.profile)}));
    if(!items.length)throw Error('Select at least one field to fill.');
    const result=await fillApplication(tabId,items,resume),successes=result.results.filter(r=>r.ok);
    for(const row of rows){const outcome=result.results.find(r=>r.id===row.field.id);if(!outcome)continue;
      if(outcome.ok){row.filled=true;row.check.checked=false;row.check.disabled=true;if(row.editor){row.editor.disabled=true;if(outcome.selectedValue)row.editor.value=outcome.selectedValue;}}
      else{row.note.textContent=outcome.reason;row.check.checked=false;}
    }
    status(`Filled ${successes.length} of ${items.length} selected fields. Review the application before submitting.`+result.results.filter(r=>!r.ok).map(r=>`\n${rows.find(row=>row.field.id===r.id)?.field.label}: ${r.reason}`).join(''));
  }catch(error){status(error.message);}finally{filling=false;updateUi();}
};
async function inspect(){
  if(!tabId||!documents.length||polling||scanning||filling||changed)return;
  polling=true;const started=epoch;
  try{
    const tab=await chrome.tabs.get(tabId);
    const needsRescan=tab.url!==pageUrl||await applicationChanged(tabId,documents);
    if(started!==epoch||scanning||filling)return;
    if(needsRescan){
      changed=true;cancelDrafts('Application changed. Drafting stopped; rescan to continue.');
      $('changes').hidden=false;updateUi();
    }
  }catch{if(started===epoch&&!scanning&&!filling){changed=true;$('changes').hidden=false;updateUi();}}finally{polling=false;}
}
const pollingTimer=setInterval(inspect,1500);
window.addEventListener('pagehide',()=>{clearInterval(pollingTimer);cancelDrafts();});
updateUi();
