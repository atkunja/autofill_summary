import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,suggestion,canDraft} from '../extension/matching.js';
import {createRequest,draftAnswer} from '../extension/ai.js';
test('maps common contact labels and autocomplete tokens',()=>{
  for(const [label,key] of [['First name','firstName'],['lastName','lastName'],['E-mail address','email'],['Mobile phone','phone'],['Address line 2','address2'],['Postal code','postalCode'],['LinkedIn profile','linkedin']])assert.equal(classify({label}),key);
  assert.equal(classify({label:'Contact',autocomplete:'section-applicant given-name'}),'firstName');
  assert.equal(suggestion({label:'Full name'},{firstName:'Alex',lastName:'Example'}),'Alex Example');
});
test('uses exact dropdown options and never guesses',()=>{
  const field={label:'State',options:[{label:'Michigan',value:'MI'},{label:'California',value:'CA',disabled:true}]};
  assert.equal(suggestion(field,{state:'Michigan'}),'MI');assert.equal(suggestion(field,{state:'CA'}),'');assert.equal(suggestion(field,{state:'New York'}),'');
});
test('sensitive and ambiguous fields stay manual',()=>{
  for(const label of ['Visa sponsorship','Gender','Salary expectations','Social security number','Citizenship','Disability','Work authorization','Are you legally eligible to work?','Sexual orientation','Preferred pronouns']){assert.equal(classify({label}),null);assert.equal(canDraft({label,tag:'textarea'}),false);}
  assert.equal(classify({label:'Cover letter',type:'file'}),null);
  assert.equal(classify({label:'Upload resume',type:'file'}),'resume');
  assert.equal(canDraft({label:'Why this company?',tag:'textarea'}),true);
});
test('AI payload omits contact data and disables storage',()=>{
  const body=createRequest({question:'Why this role?',profile:{background:'Built tools',goals:'Learn',email:'private@example.test',address:'Secret'}});
  assert.equal(body.store,false);assert.ok(!body.input.includes('private@'));assert.ok(!body.input.includes('Secret'));
  assert.throws(()=>createRequest({question:'Why?',profile:{}}),/experience/);
});
test('handles output, quota, refusals, and incomplete responses',async()=>{
  const args={question:'Why?',profile:{background:'Built tools'}};
  const mock=data=>async()=>({ok:true,json:async()=>data});
  assert.equal(await draftAnswer(args,'test',mock({status:'completed',output:[{content:[{type:'output_text',text:'A grounded answer.'}]}]})),'A grounded answer.');
  await assert.rejects(draftAnswer(args,'test',async()=>({ok:false,status:429})),/quota/);
  await assert.rejects(draftAnswer(args,'test',mock({status:'incomplete'})),/incomplete/);
  await assert.rejects(draftAnswer(args,'test',mock({output:[]})),/no draft/);
  await assert.rejects(draftAnswer(args,''),/API key/);
});
