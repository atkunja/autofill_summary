(() => {
  // Replace old listeners when an updated extension is injected without reloading the form.
  if (globalThis.__applyPersonally?.listener) chrome.runtime.onMessage.removeListener(globalThis.__applyPersonally.listener);
  const fields=new Map();let busy=false;
  const visible=el=>!el.matches(':disabled')&&!el.readOnly&&!el.closest('[inert]')&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const norm=s=>String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const labelText=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('input,textarea,select,button').forEach(el=>el.remove());return copy.textContent;};
  // Ashby visually labels nested controls without associating the label with the input.
  function ashbyLabel(el){
    if(!el.closest('.ashby-application-form-field-entry'))return '';
    for(let parent=el.parentElement;parent;parent=parent.parentElement){
      const title=parent.querySelector(':scope > .ashby-application-form-question-title');
      if(title){
        const part=el.tagName==='SELECT'?el.options[0]?.text.match(/^(Month|Year)/i)?.[1]:'';
        return [labelText(title),part].filter(Boolean).join(' ');
      }
      if(parent.matches('.ashby-application-form-field-entry'))break;
    }
    return '';
  }
  const label=el=>[Array.from(el.labels || []).map(labelText).join(' '),el.getAttribute('aria-label'),(el.getAttribute('aria-labelledby') || '').split(' ').map(id=>el.getRootNode().getElementById?.(id)?.textContent || '').join(' '),ashbyLabel(el),el.placeholder,el.name,el.id].find(s=>s?.trim())?.trim().slice(0,500) || 'Unlabeled field';
  const comboRoot=el=>el.closest('.select__control,[class$="-control"]');
  const selected=el=>{
    if(el.matches('.ashby-application-form-input-yesno'))return el.querySelector('button[aria-pressed="true"]')?.dataset.option || '';
    if(el.type==='checkbox')return el.checked?'Yes':'';
    if(el.getAttribute('role')!=='combobox')return el.type==='file'?(el.files[0]?.name || ''):el.value || '';
    const text=comboRoot(el)?.querySelector('.select__single-value,[class*="-singleValue"]')?.textContent || el.getAttribute('aria-valuetext');
    if(text)return text.trim();
    return el.value || '';
  };
  function controls(root=document){return [...root.querySelectorAll('input,textarea,select,[role="combobox"],.ashby-application-form-input-yesno'),...[...root.querySelectorAll('*')].filter(el=>el.shadowRoot).flatMap(el=>controls(el.shadowRoot))];}
  function scan(){
    if(busy)throw Error('A fill is still running. Wait before scanning again.');
    fields.clear();const seenRadios=new Set();const result=[];
    for(const el of [...new Set(controls())].filter(el=>visible(el)&&!el.closest('.ashby-application-form-autofill-input-root')&&(el.tagName!=='INPUT'||['text','email','tel','url','file','search','number','date','month','radio'].includes(el.type)||(el.type==='checkbox'&&el.id==='_systemfield_education_history-isCurrent'))).slice(0,150)){
      let group,question=label(el),options=el.tagName==='SELECT'?[...el.options].map(o=>({value:o.value,label:o.text,disabled:o.disabled})):null;
      if(el.type==='radio'){
        if(seenRadios.has(el))continue;
        group=controls(el.form || document).filter(r=>r.type==='radio'&&r.name===el.name&&r.getRootNode()===el.getRootNode()&&visible(r));
        if(!el.name)group=[el];group.forEach(r=>seenRadios.add(r));
        question=el.closest('fieldset')?.querySelector('legend')?.textContent || el.closest('[role="radiogroup"]')?.getAttribute('aria-label') || el.name;
        options=group.map(r=>({value:r.value,label:label(r),disabled:r.disabled}));
      }
      if(el.matches('.ashby-application-form-input-yesno'))options=[...el.querySelectorAll('button[data-option]')].map(b=>({value:b.dataset.option,label:b.textContent,disabled:b.disabled}));
      if(el.type==='checkbox')options=[{value:'Yes',label:'Yes'},{value:'No',label:'No'}];
      const id=crypto.randomUUID(), control=el.matches('.ashby-application-form-input-yesno')?'yesno':el.type==='checkbox'?'checkbox':el.getAttribute('role')==='combobox'?'combobox':el.type==='radio'?'radio':'native';
      fields.set(id,{el,label:label(el),type:el.type,group,control});
      result.push({id,label:question.trim(),tag:el.tagName.toLowerCase(),type:el.type,control,autocomplete:el.autocomplete,value:group?(group.find(r=>r.checked)?.value || ''):selected(el),maxLength:el.maxLength>0?el.maxLength:null,options});
    }
    return result;
  }
  function setValue(el,value){const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  function key(el,key,code){el.dispatchEvent(new KeyboardEvent('keydown',{key,code:key,keyCode:code,which:code,bubbles:true}));}
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function fillCombo(el,value){
    const original=selected(el);let committed=false;
    if(original)throw Error('Already contains a value; left unchanged.');
    el.focus();el.click();
    if(el instanceof HTMLInputElement)setValue(el,value);
    key(el,'ArrowDown',40);
    try{
      let match;
      for(let i=0;i<100;i++){
        if(!el.isConnected||!visible(el))throw Error('Field changed while opening options. Scan again.');
        const root=el.getRootNode();
        const ids=(el.getAttribute('aria-controls')||el.getAttribute('aria-owns')||'').split(' ').filter(Boolean);
        const lists=ids.map(id=>root.getElementById?.(id)).filter(Boolean);
        if(!lists.length){const local=comboRoot(el)?.parentElement?.querySelector('[role="listbox"]');if(local)lists.push(local);}
        const matches=lists.flatMap(list=>[...list.querySelectorAll('[role="option"]')]).filter(o=>o.getAttribute('aria-disabled')!=='true'&&visible(o)&&norm(o.querySelector('[class*="_canonicalSchoolResultName_"]')?.textContent || o.textContent)===norm(value));
        if(matches.length>1)throw Error('Several options match. Select this field manually.');
        if(matches.length===1){match=matches[0];break;}
        if(i>10 && lists.some(list=>/no (options|results)/i.test(list.textContent)))break;
        await pause(80);
      }
      if(!match)throw Error('No exact dropdown option found. Adjust the saved answer or select manually.');
      match.click();
      for(let i=0;i<20;i++){
        await pause(50);
        const text=comboRoot(el)?.querySelector('.select__single-value,[class*="-singleValue"]')?.textContent || el.getAttribute('aria-valuetext');
        if(norm(text)===norm(value)){committed=true;return;}
        if(!comboRoot(el)&&el.getAttribute('aria-expanded')==='false'&&norm(el.value)===norm(value)){committed=true;return;}
      }
      throw Error('Could not verify the selected option. Review this field on the page.');
    } finally {
      key(el,'Escape',27);
      if(!committed && el instanceof HTMLInputElement && !comboRoot(el)?.querySelector('.select__single-value,[class*="-singleValue"]') && !el.getAttribute('aria-valuetext'))setValue(el,'');
      el.blur();
    }
  }
  async function apply(items,resume){
    if(busy)throw Error('A fill is already running.');busy=true;const results=[];
    try{for(const item of items){
      const record=fields.get(item.id),el=record?.el;
      try{
        if(!el?.isConnected||!visible(el)||label(el)!==record.label||el.type!==record.type)throw Error('Field changed. Scan again.');
        if(record.group?record.group.some(r=>r.checked):!!selected(el).trim())throw Error('Already contains a value; left unchanged.');
        if(record.control==='combobox'){
          const choices=[item.value,...(Array.isArray(item.alternatives)?item.alternatives.slice(0,3):[])];
          for(let i=0;i<choices.length;i++){try{await fillCombo(el,choices[i]);item.selectedValue=choices[i];break;}catch(error){if(i===choices.length-1||!error.message.startsWith('No exact dropdown'))throw error;}}
        }
        else if(record.control==='yesno'){
          const matches=[...el.querySelectorAll('button[data-option]')].filter(b=>b.dataset.option===item.value&&visible(b));
          if(matches.length!==1)throw Error('Option no longer available.');
          // Some answer buttons omit type=button. Block their native submit default.
          const blockSubmit=event=>{event.preventDefault();event.stopImmediatePropagation();};
          document.addEventListener('submit',blockSubmit,true);
          try{matches[0].click();}finally{document.removeEventListener('submit',blockSubmit,true);}
          await pause(50);
          if(selected(el)!==item.value)throw Error('Yes/No selection did not stick.');
        }else if(record.control==='checkbox'){
          if(!['Yes','No'].includes(item.value))throw Error('Choose Yes or No.');
          if(el.checked!==(item.value==='Yes'))el.click();
          if(el.checked!==(item.value==='Yes'))throw Error('Checkbox selection did not stick.');
        }else if(record.group){
          const matches=record.group.filter(r=>r.value===item.value&&r.isConnected&&visible(r));if(matches.length!==1)throw Error('Option no longer available.');matches[0].click();if(!matches[0].checked)throw Error('Radio selection did not stick.');
        }else if(el.type==='file'){
          if(!resume||item.kind!=='resume')throw Error('No resume selected.');
          const allowed=el.accept.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
          if(allowed.length&&!allowed.some(a=>resume.name.toLowerCase().endsWith(a)||a===resume.type||(a.endsWith('/*')&&resume.type.startsWith(a.slice(0,-1)))))throw Error('This field does not accept your saved resume format.');
          const bytes=Uint8Array.from(atob(resume.data),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],resume.name,{type:resume.type}));el.files=dt.files;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
        }else{
          if(typeof item.value!=='string'||!item.value.trim())throw Error('No value provided.');
          if(el.maxLength>0&&item.value.length>el.maxLength)throw Error('Answer exceeds the field character limit.');
          if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===item.value&&!o.disabled))throw Error('Option no longer available.');
          setValue(el,item.value);
          if(el.value!==item.value)throw Error('The page did not keep this value. Review the field.');
        }
        results.push({id:item.id,ok:true,selectedValue:item.selectedValue});
      }catch(error){results.push({id:item.id,ok:false,reason:error.message});}
    }}finally{busy=false;}return results;
  }
  function jobContext(){const main=document.querySelector('main');if(!main)return '';const text=main.innerText, marker=text.search(/Apply for this job/i);return marker>=0?text.slice(0,marker).slice(0,12000):'';}
  const listener=(message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')))return;
    if(message.type==='scan'){try{reply({fields:scan(),title:document.title,url:location.href,context:jobContext()});}catch(error){reply({error:error.message});}}
    if(message.type==='apply'){apply(message.items,message.resume).then(results=>reply({results}),error=>reply({error:error.message}));return true;}
  };
  globalThis.__applyPersonally={listener};chrome.runtime.onMessage.addListener(listener);
})();
