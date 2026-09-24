import {cleanMappings,mappingSources,saveMapping} from './field-mappings.js';
export async function renderMappings(container,report){
  container.replaceChildren();
  const {fieldMappings=[]}=await chrome.storage.local.get('fieldMappings');
  const mappings=cleanMappings(fieldMappings);
  if(!mappings.length){container.textContent='No saved mappings. Map an unanswered question from the application panel.';return;}
  for(const mapping of mappings){
    const card=document.createElement('div');card.className='field';
    const label=document.createElement('label');label.textContent=`${mapping.label} (${mapping.control}, ${mapping.type||mapping.tag})`;
    const select=document.createElement('select');select.setAttribute('aria-label',`Mapping for ${mapping.label}`);
    for(const [key,text] of Object.entries(mappingSources)){const option=document.createElement('option');option.value=key;option.textContent=text;select.append(option);}
    select.value=mapping.profileKey;
    const save=document.createElement('button');save.type='button';save.textContent='Save mapping';
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove mapping';
    const update=async key=>{try{await saveMapping(mapping,key);await renderMappings(container,report);report('Mapping updated. Rescan the application to use it.');}catch(error){report(error.message);}};
    save.onclick=()=>update(select.value);remove.onclick=()=>update('');
    card.append(label,select,save,remove);container.append(card);
  }
}
