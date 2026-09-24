import {scanApplication,fillApplication} from './application.js';
import {classify,suggestion,canDraft,isSensitive,savedFieldKey,fallbackValues} from './matching.js';
const $=id=>document.getElementById(id);
let tabId, pageUrl, rows=[], resume;
const status=text=>$('status').textContent=text;
$('profile').onclick=()=>chrome.runtime.openOptionsPage();
function make(tag, text) {const el=document.createElement(tag);if(text)el.textContent=text;return el;}
function render(field, profile) {
  const card=make('div');card.className='field';
  const label=make('label'), check=make('input');check.type='checkbox';
  const kind=classify(field), value=suggestion(field,profile);
  const savedDisclosure=isSensitive(field.label)&&savedFieldKey(field)&&!!value;
  const eligible=!field.value && (!isSensitive(field.label)||savedDisclosure);
  check.checked=eligible && !!(value || (kind==='resume' && resume));
  check.disabled=!eligible;
  label.append(check,document.createTextNode(' '+field.label));card.append(label);
  if(field.sourceUrl && field.sourceUrl!==pageUrl)card.append(make('small',`Embedded form: ${new URL(field.sourceUrl).hostname}`));
  let editor;
  if (kind==='resume') {
    card.append(make('small',field.value?`Already attached: ${field.value}`:resume?resume.name:'Save a resume in Profile first.'));
    if(!resume)check.disabled=true;
  } else if(field.type==='file' || (isSensitive(field.label)&&!savedDisclosure)) {
    check.disabled=true;card.append(make('small','Save an explicit answer in Profile or complete this field manually.'));
  } else {
    editor=make(field.options?'select':field.tag==='textarea'?'textarea':'input');editor.setAttribute('aria-label',`Value for ${field.label}`);
    if(field.options)for(const option of field.options){const o=make('option',option.label);o.value=option.value;o.disabled=option.disabled;editor.append(o);}
    editor.value=field.value || value;editor.disabled=!eligible;
    if(field.maxLength)editor.maxLength=field.maxLength;
    card.append(editor);
    if(!field.value && !value && kind){const saved=suggestion({...field,options:null},profile);card.append(make('small',saved?`Saved answer “${saved}” is not offered by this form. Choose an option manually.`:'No saved answer. Add it in Profile or enter it here.'));}
    if(field.value)card.append(make('small','Already filled — left unchanged.'));
    else if(!value && !kind && !canDraft(field))card.append(make('small',/graduation date/i.test(field.label)?'Your resume may give a month and year; this field needs an exact date. Enter it manually.':'No saved answer matches this question. Enter your answer here or on the form.'));
    else if(canDraft(field)) {
      const button=make('button','Generate AI draft');button.type='button';
      button.onclick=async()=>{
        button.disabled=true;status('Drafting with your resume, enabled projects, goals, question, and supplied job context…');
        try {
          const result=await chrome.runtime.sendMessage({type:'draft',args:{question:field.label,context:$('context').value,maxLength:field.maxLength}});
          if(!result)throw Error('Could not reach the extension. Reload it and try again.');
          if(result.error)throw Error(result.error);
          editor.value=result.answer;check.checked=false;
          status('Draft ready. Edit it, then select its checkbox to approve filling.' + (field.maxLength && result.answer.length>field.maxLength?' Shorten it to fit the character limit.':''));
        }catch(error){status(error.message);}finally{button.disabled=false;}
      };
      const actions=make('div');actions.className='actions';actions.append(button);card.append(actions);
    }
  }
  $('fields').append(card);rows.push({field,check,editor,kind,profile});
}
$('scan').onclick=async()=>{
  $('scan').disabled=true;rows=[];$('fields').replaceChildren();$('fill').hidden=true;
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id || !/^https?:/.test(tab.url || ''))throw Error('Open an http(s) job application page first. Chrome internal pages cannot be filled.');
    tabId=tab.id;pageUrl=tab.url;
    const result=await scanApplication(tabId);
    if(result.error)throw Error(result.error);
    if(!$('context').value.trim()&&result.context)$('context').value=result.context;
    const saved=await chrome.storage.local.get(['profile','resume']);resume=saved.resume;
    $('pageInfo').textContent=`${new URL(result.url).hostname} · ${result.fields.length} fields found`;
    const profile=saved.profile || {};
    const contextMissing=saved.resume && !profile.background?.trim() && !profile.school;
    for(const field of result.fields)render(field,profile);
    $('fill').hidden=!rows.length;
    status((rows.length?'Review the suggestions below. Select only the fields you want to fill.':'No supported fields found. Open the application form, then scan again. Embedded forms and custom widgets may need manual entry.') + (contextMissing?'\nYour resume is attached, but its text and education are not saved. In Profile, extract the resume text or import your prepared profile, then Save profile and rescan.':'') + (result.warnings.length?'\n'+result.warnings.join('\n'):''));
  } catch(error){status(error.message);}finally{$('scan').disabled=false;}
};
$('fill').onclick=async()=>{
  $('fill').disabled=true;$('scan').disabled=true;
  try {
    const tab=await chrome.tabs.get(tabId);
    if(tab.url!==pageUrl)throw Error('The page changed. Scan the application again.');
    status('Filling selected fields and verifying dropdown selections…');
    const items=rows.filter(r=>r.check.checked && !r.check.disabled).map(r=>({id:r.field.id,documentId:r.field.documentId,kind:r.kind,value:r.editor?.value || '',alternatives:fallbackValues(r.kind,r.editor?.value || '',r.profile)}));
    if(!items.length)throw Error('Select at least one field to fill.');
    const result=await fillApplication(tabId,items,resume);
    if(result.error)throw Error(result.error);
    const successes=result.results.filter(r=>r.ok);
    for(const r of rows)if(successes.some(s=>s.id===r.field.id)){r.check.checked=false;r.check.disabled=true;if(r.editor){r.editor.disabled=true;const chosen=successes.find(s=>s.id===r.field.id)?.selectedValue;if(chosen)r.editor.value=chosen;}}
    status(`Filled ${successes.length} of ${items.length} selected fields. Review the application before submitting.` + result.results.filter(r=>!r.ok).map(r=>`\n${rows.find(row=>row.field.id===r.id)?.field.label}: ${r.reason}`).join(''));
  }catch(error){status(error.message);}finally{$('fill').disabled=false;$('scan').disabled=false;}
};
