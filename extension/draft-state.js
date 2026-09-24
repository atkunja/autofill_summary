import {mappingKey} from './field-mappings.js';
export function draftKey(field){
  return JSON.stringify([field.documentId,field.sourceUrl,mappingKey(field),field.maxLength||null,field.options||null]);
}
// Duplicate questions are intentionally not restored: source order is not identity.
export function captureDrafts(rows){
  const counts=new Map();for(const r of rows){const k=draftKey(r.field);counts.set(k,(counts.get(k)||0)+1);}
  return new Map(rows.filter(r=>r.edited&&r.editor&&!r.filled&&counts.get(draftKey(r.field))===1).map(r=>[draftKey(r.field),{value:r.editor.value}]));
}
export function restoreDraft(field,fields,drafts){
  const key=draftKey(field);
  if(field.value||fields.filter(f=>draftKey(f)===key).length!==1)return null;
  return drafts.get(key)||null;
}
