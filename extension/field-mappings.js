import {classify,isSensitive,normalize,profileFields,suggestion} from './matching.js';
import {educationFields} from './profile-schema.js';

// Only ordinary profile facts are selectable. Disclosures and consent cannot be
// reclassified as contact information by a stored mapping.
export const mappingSources={fullName:'Full name',...profileFields,...educationFields};
export function canMap(field){
  return !classify(field)&&!isSensitive(field.label)&&!field.options?.some(o=>isSensitive(o.label))&&
    !/\b(terms|permission|authorize|opt in|opt out|subscribe|acknowledge|certify|attest|signature|disclose)\b/.test(normalize(field.label))&&
    field.type!=='file'&&field.type!=='checkbox'&&normalize(field.label)!=='unlabeled field';
}
export function mappingKey(field){return JSON.stringify([normalize(field.label),field.control||'native',field.tag||'',field.type||'']);}
export function cleanMappings(raw){
  if(!Array.isArray(raw))return [];
  const result=new Map();
  for(const item of raw.slice(0,200)){
    if(!item||typeof item.label!=='string'||item.label.length>500||!Object.hasOwn(mappingSources,item.profileKey))continue;
    const field={label:item.label,control:String(item.control||'native'),tag:String(item.tag||''),type:String(item.type||'')};
    if(!canMap(field))continue;
    result.set(mappingKey(field),{...field,profileKey:item.profileKey});
  }
  return [...result.values()];
}
export function mappedKey(field,mappings){
  if(!canMap(field))return null;
  return cleanMappings(mappings).find(m=>mappingKey(m)===mappingKey(field))?.profileKey || null;
}
export function mappingSuggestion(field,profile,key){
  return canMap(field)&&Object.hasOwn(mappingSources,key)?suggestion(field,profile,key):'';
}
export async function saveMapping(field,profileKey){
  if(!canMap(field)||profileKey&&!Object.hasOwn(mappingSources,profileKey))throw Error('This question cannot use a profile mapping.');
  const {fieldMappings=[]}=await chrome.storage.local.get('fieldMappings');
  const next=cleanMappings(fieldMappings).filter(m=>mappingKey(m)!==mappingKey(field));
  if(profileKey)next.push({label:field.label,control:field.control||'native',tag:field.tag||'',type:field.type||'',profileKey});
  if(next.length>200)throw Error('Remove an unused mapping before adding another (limit 200).');
  await chrome.storage.local.set({fieldMappings:next});return next;
}
