import test from 'node:test';
import assert from 'node:assert/strict';
import {canMap,cleanMappings,mappedKey,mappingKey,mappingSuggestion} from '../extension/field-mappings.js';
import {captureDrafts,restoreDraft} from '../extension/draft-state.js';
import {runDraftQueue} from '../extension/draft-queue.js';
import {createRequest,draftAnswer} from '../extension/ai.js';
const field={label:'Academic institution attended',tag:'input',type:'text',control:'native'};
test('reviewed mappings are scoped to question and control and exclude disclosures',()=>{
 const mappings=cleanMappings([{...field,profileKey:'school'}]);
 assert.equal(mappedKey(field,mappings),'school');
 assert.equal(mappedKey({...field,type:'number'},mappings),null);
 assert.equal(mappedKey({...field,label:'Another question'},mappings),null);
 assert.equal(mappingSuggestion(field,{school:'Example University'},'school'),'Example University');
 assert.equal(mappingSuggestion({...field,options:[{value:'other',label:'Other University'}]},{school:'Example University'},'school'),'');
 for(const label of ['communicationConsent','I accept the terms','Ethnic identity','Veteran disclosure','Please certify this information'])assert.equal(canMap({...field,label}),false);
 assert.deepEqual(cleanMappings([{...field,profileKey:'gender'},{...field,label:'Salary expectations',profileKey:'school'}]),[]);
 assert.equal(mappingKey(field),mappingKey({...field,label:'ACADEMIC INSTITUTION ATTENDED?'}));
});
test('draft restoration requires the same unique question, type, options and document',()=>{
 const original={...field,documentId:'doc-a',sourceUrl:'https://example.test/app',options:null};
 const drafts=captureDrafts([{field:original,edited:true,editor:{value:'My edited answer'}}]);
 assert.equal(restoreDraft(original,[original],drafts).value,'My edited answer');
 for(const changed of [{...original,documentId:'doc-b'},{...original,type:'number'},{...original,options:[{value:'x'}]},{...original,value:'Human entry'}])assert.equal(restoreDraft(changed,[changed],drafts),null);
 assert.equal(restoreDraft(original,[original,original],drafts),null);
 assert.equal(captureDrafts([{field:original,edited:true,editor:{value:'a'}},{field:original,edited:true,editor:{value:'b'}}]).size,0);
});
test('batch concurrency is bounded and cancellation stops queued requests',async()=>{
 const controller=new AbortController();let active=0,maximum=0,started=0;
 const releases=[];const results=[];
 const pending=runDraftQueue(Array.from({length:8},(_,i)=>({id:String(i)})),async()=>{started++;active++;maximum=Math.max(maximum,active);await new Promise(resolve=>releases.push(resolve));active--;return 'Answer';},{signal:controller.signal,onResult:r=>results.push(r)});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(started,2);
 controller.abort();releases.forEach(resolve=>resolve());
 const summary=await pending;
 assert.equal(maximum,2);assert.equal(started,2);assert.equal(results.length,0);assert.equal(summary.cancelled,true);
 await assert.rejects(runDraftQueue(Array(9).fill({}),()=>{}),/1–8/);
});
test('drafts include explicit job context, enforce limits, and cancel fetches',async()=>{
 const args={question:'Why this role?',company:'Example',role:'Intern',context:'Build APIs',profile:{background:'Built an API.',gender:'Female'},maxLength:10};
 const request=createRequest(args),input=JSON.parse(request.input);
 assert.equal(input.company,'Example');assert.equal(input.role,'Intern');assert.equal(request.store,false);assert.equal(input.gender,undefined);
 assert.match(request.instructions,/Never invent credentials/);
 await assert.rejects(draftAnswer(args,'test',async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'This answer is too long.'}]}]})})),/character limit/);
 const controller=new AbortController();
 const pending=draftAnswer(args,'test',(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),controller.signal);
 controller.abort();await assert.rejects(pending,/cancelled/);
});
