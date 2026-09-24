import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestion,canDraft} from '../extension/matching.js';
import {inferEducation} from '../extension/profile-schema.js';
import {createRequest} from '../extension/ai.js';
test('education and date cutoff answers come from saved facts',()=>{
 const p={school:'Example University',degree:"Bachelor's Degree",discipline:'Computer Engineering',educationEndMonth:'May',educationEndYear:'2028',seekingInternship:'Yes'};
 for(const [label,value] of [['School',p.school],['Degree',p.degree],['Discipline',p.discipline],['End date month','May'],['End date year','2028'],['Will you be graduating before September 2027?','No'],['Will you be graduating before September 2029?','Yes'],['Are you looking for a summer internship?','Yes'],['Start date year','']])assert.equal(suggestion({label},p),value);
 assert.equal(suggestion({label:'Will you be graduating before May 2028?'},p),'');
 assert.equal(suggestion({label:'Will you be graduating before September 2027?'},{}),'');
});
test('disclosure answers require explicit saved values and are never generated',()=>{
 for(const [label,key,value] of [['Gender','gender','Male'],['Please identify your race','race','Asian'],['Are you Hispanic/Latino?','hispanicLatino','No'],['Veteran Status','veteranStatus','I am not a protected veteran'],['Are you authorized to work in the US?','workAuthorizationUS','Yes'],['Will you now or in the future require sponsorship for employment visa status (e.g., H-1B visa)?','sponsorship','No'],['Are you 18 years of age or older?','over18','Yes']]){
  assert.equal(suggestion({label},{}),'');assert.equal(suggestion({label},{[key]:value}),value);assert.equal(canDraft({label,tag:'textarea'}),false);
 }
 assert.equal(suggestion({label:'Are you a veteran?'},{veteranStatus:'I am not a protected veteran'}),'');
 const body=createRequest({question:'Why this role?',profile:{background:'Engineer',gender:'Male',race:'Asian',over18:'Yes',workAuthorizationUS:'Yes'}});
 assert.ok(!body.input.includes('Asian'));assert.ok(!body.input.includes('workAuthorizationUS'));
});
test('native option aliases handle month and degree without broad fuzzy matching',()=>{
 assert.equal(suggestion({label:'Degree',options:[{value:'bs',label:'Bachelors'},{value:'ms',label:'Masters'}]},{degree:"Bachelor's Degree"}),'bs');
 assert.equal(suggestion({label:'End date month',options:[{value:'5',label:'May'}]},{educationEndMonth:'May'}),'5');
 assert.equal(suggestion({label:'School',options:[{value:'east',label:'Example University - East'}]},{school:'Example University'}),'');
});
test('resume education inference never invents a start date or disclosures',()=>{
 const facts=inferEducation('EDUCATION\nExample University\nBachelor of Science, Computer Engineering May 2028\nEXPERIENCE\nEngineer');
 assert.equal(facts.school,'Example University');assert.equal(facts.discipline,'Computer Engineering');assert.equal(facts.educationEndYear,'2028');assert.equal(facts.educationStartYear,undefined);assert.equal(facts.gender,undefined);
});

test('Ashby labels use saved answers without inventing missing dates or preferences',()=>{
 const profile={firstName:'Alex',lastName:'Example',sponsorship:'No',currentlyStudent:'Yes',educationEndMonth:'May',educationEndYear:'2028'};
 assert.equal(suggestion({label:'Full Legal Name'},profile),'Alex Example');
 assert.equal(suggestion({label:'Requesting visa sponsorship?',options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]},profile),'no');
 assert.equal(suggestion({label:'Requesting visa sponsorship?'},{}),'');
 assert.equal(suggestion({label:'Still Student?'},profile),'Yes');
 assert.equal(suggestion({label:'Still Student?'},{educationEndYear:'2028'}),'');
 assert.equal(suggestion({label:'What is your graduation date?'},profile),'');
 assert.equal(suggestion({label:'Willing to relocate to NYC?'},profile),'');
 assert.equal(canDraft({label:'Share something you’ve built that you’re proud of.',tag:'input',type:'text'}),true);
 const school={label:'School',options:[{value:'main',label:'University of Michigan'},{value:'flint',label:'University of Michigan–Flint'}]};
 assert.equal(suggestion(school,{school:'University of Michigan - Ann Arbor'}),'main');
 assert.equal(suggestion({...school,options:school.options.slice(1)},{school:'University of Michigan - Ann Arbor'}),'');
});
