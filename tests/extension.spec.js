import {build} from 'esbuild';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
const atsEvidence=[];
function recordFixture(ats,observations,preserved=[],expectedMissed=0){
 const correct=observations.filter(o=>o.actual===o.expected).length;
 const incorrect=observations.filter(o=>o.actual!==o.expected&&o.actual!=='').length;
 const missed=observations.filter(o=>o.actual==='').length;
 const kept=preserved.filter(o=>o.actual===o.expected).length;
 atsEvidence.push({ats,evidenceKind:'fixture',liveVerified:false,testedAt:new Date().toISOString(),controlVersion:'behavioral-v1',knownFields:observations.length,correctFills:correct,incorrectFills:incorrect,missedKnownFields:missed,existingFields:preserved.length,preservedExistingAnswers:kept,overwrittenExistingAnswers:preserved.length-kept,observations,preserved});
 expect(incorrect).toBe(0);expect(missed).toBe(expectedMissed);expect(kept).toBe(preserved.length);
}
let context,worker,extensionId,temp,server,url,page;
test.beforeAll(async()=>{
  temp=await mkdtemp(path.join(tmpdir(),'apply-test-'));
  const ext=path.join(temp,'extension');await cp('extension',ext,{recursive:true});
  const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));
  // Test-only localhost permission substitutes for clicking Chrome's toolbar action.
  manifest.host_permissions.push('http://127.0.0.1/*','https://example.com/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
  const fixtureBundle=(await build({entryPoints:['tests/fixtures/greenhouse.jsx'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  const ashbyBundle=(await build({entryPoints:['tests/fixtures/ashby.jsx'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  const atsFixtures=Object.fromEntries(await Promise.all(['lever','workday','icims'].map(async name=>[name,await readFile(`tests/fixtures/${name}.html`,'utf8')])));
  const workflowFixture=await readFile('tests/fixtures/workflow.html','utf8');
  const portableFixture=await readFile('tests/fixtures/portable.html','utf8');
  server=http.createServer((req,res)=>{if(req.url==='/ats/icims'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>iCIMS embedded fixture</title><iframe src="/ats/icims-content"></iframe>');return;}const atsName=req.url==='/ats/icims-content'?'icims':req.url.replace('/ats/','');if(atsFixtures[atsName]){res.setHeader('Content-Type','text/html');res.end(atsFixtures[atsName]);return;}if(req.url.startsWith('/workflow')){res.setHeader('Content-Type','text/html');res.end(workflowFixture);return;}if(req.url.startsWith('/portable')){res.setHeader('Content-Type','text/html');res.end(portableFixture);return;}if(req.url==='/blocked-embed'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Blocked embed</title><label>First name<input></label><iframe src="https://blocked.test/application"></iframe>');return;}if(req.url==='/embedded'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Embedded application</title><iframe src="/portable?one"></iframe><iframe src="/portable?two"></iframe>');return;}if(req.url==='/ashby.js'){res.setHeader('Content-Type','text/javascript');res.end(ashbyBundle);return;}if(req.url.startsWith('/ashby')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Ashby fixture</title><div id="root"></div><script src="/ashby.js"></script>');return;}if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureBundle);return;}if(req.url.startsWith('/greenhouse')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Greenhouse fixture</title><div id="root"></div><script src="/fixture.js"></script>');return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Example application</title><form><label>First name<input id="first" autocomplete="given-name"></label><label>Email<input id="email" type="email" value="existing@example.test"></label><label>State<select id="state"><option value="">Choose</option><option value="MI">Michigan</option></select></label><label>Resume<input id="resume" type="file" accept=".txt"></label><label>Why this company?<textarea id="why"></textarea></label><label>Gender<textarea id="gender"></textarea></label><input id="hidden" style="display:none"><button type="submit">Submit application</button></form><script>window.submitted=false;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submitted=true};</script>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
  worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');extensionId=new URL(worker.url()).host;
});
test.afterAll(async()=>{if(atsEvidence.length){await mkdir('test-results',{recursive:true});const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));for(const entry of atsEvidence){const ext=['ashby','greenhouse'].includes(entry.ats)?'jsx':'html';entry.fixtureSha256=createHash('sha256').update(await readFile(`tests/fixtures/${entry.ats}.${ext}`)).digest('hex');entry.extensionVersion=manifest.version;entry.browserVersion=context.browser()?.version()||'Chromium persistent context';}await writeFile('test-results/ats-fixtures.json',JSON.stringify(atsEvidence,null,2));}await context?.close();await new Promise(resolve=>server?.close(resolve));if(temp)await rm(temp,{recursive:true,force:true});});
test('profile persists; preview fills contact and resume without overwriting or submitting',async()=>{
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel('First name',{exact:true}).fill('Alex');await options.getByLabel('State / province').fill('Michigan');
  await options.getByLabel('Experience / resume text').fill('Built internal tools and APIs.');
  await options.locator('#resume').setInputFiles({name:'resume.txt',mimeType:'text/plain',buffer:Buffer.from('Example resume')});
  await options.getByRole('button',{name:'Save profile',exact:true}).click();await expect(options.locator('#status')).toContainText('Profile saved');
  await options.reload();await expect(options.getByLabel('First name',{exact:true})).toHaveValue('Alex');
  page=await context.newPage();await page.goto(url);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/').id,url);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();await expect(popup.locator('#pageInfo')).toContainText('6 fields found');
  await expect(popup.getByLabel('Value for First name')).toHaveValue('Alex');
  await expect(popup.locator('#coverage')).toContainText('1 already filled · 3 selected · 2 need attention');
  await popup.getByRole('button',{name:'Fill selected fields'}).click();await expect(popup.locator('#status')).toContainText('Filled 3 of 3');
  await expect(popup.locator('#coverage')).toContainText('4 already filled · 0 selected · 2 need attention');
  await expect(page.locator('#first')).toHaveValue('Alex');await expect(page.locator('#state')).toHaveValue('MI');await expect(page.locator('#email')).toHaveValue('existing@example.test');
  expect(await page.locator('#resume').evaluate(el=>el.files[0].name)).toBe('resume.txt');expect(await page.evaluate(()=>window.submitted)).toBe(false);
  await expect(page.locator('#gender')).toHaveValue('');
  await popup.getByRole('button',{name:'Generate AI draft'}).click();await expect(popup.locator('#status')).toContainText('Add an OpenAI API key');
});
test('rejects stale fields and values entered after scanning',async()=>{
  page=await context.newPage();await page.goto(url+'/?stale');
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/?stale').id,url);
  const fields=await worker.evaluate(async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});return (await chrome.tabs.sendMessage(id,{type:'scan'})).fields;},id);
  await page.locator('#first').fill('Human entry');await page.locator('#why').evaluate(el=>el.remove());
  const result=await worker.evaluate(({id,fields})=>chrome.tabs.sendMessage(id,{type:'apply',items:fields.filter(f=>['First name','Why this company?'].includes(f.label)).map(f=>({id:f.id,value:'Replacement'}))}),{id,fields});
  expect(result.results.every(r=>!r.ok)).toBe(true);await expect(page.locator('#first')).toHaveValue('Human entry');
});
test('AI draft requires explicit selection and credentials stay out of content scripts',async()=>{
  await worker.evaluate(async()=>{
    await chrome.storage.local.set({profile:{background:'Built internal tools.',goals:'Build reliable software.'}});
    await chrome.storage.session.set({apiKey:'test-key-not-real'});
    globalThis.fetch=async(url,options)=>{globalThis.lastRequest=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'I want to bring my experience building internal tools to this role.'}]}]})};};
  });
  const application=await context.newPage();await application.goto(url+'/?draft');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/?draft').id,url);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await popup.locator('summary').click();await popup.locator('#context').fill('Example company needs internal tools.');
  await popup.getByRole('button',{name:'Generate AI draft'}).click();
  await expect(popup.locator('#status')).toContainText('Draft ready');
  const row=popup.locator('.field').filter({hasText:'Why this company?'});
  await expect(row.locator('input[type=checkbox]')).not.toBeChecked();
  await row.locator('textarea').fill('An answer I reviewed myself.');await row.locator('input[type=checkbox]').check();
  await popup.getByRole('button',{name:'Fill selected fields'}).click();await expect(application.locator('#why')).toHaveValue('An answer I reviewed myself.');
  expect((await worker.evaluate(()=>globalThis.lastRequest)).store).toBe(false);
  const privacy=await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:async()=>{
    try {await chrome.storage.local.get('profile');return false;}catch{return true;}
  }}))[0].result,id);expect(privacy).toBe(true);
  await expect(popup.locator('#status')).toContainText('Filled');
  await popup.setViewportSize({width:390,height:850});
  await popup.evaluate(()=>window.scrollTo(0,0));
  await popup.screenshot({path:'test-results/popup.png',fullPage:true});
});

test('does not fill controls whose type changed after scanning',async()=>{
  const application=await context.newPage();await application.goto(url+'/?types');
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/?types').id,url);
  const field=await worker.evaluate(async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});return (await chrome.tabs.sendMessage(id,{type:'scan'})).fields.find(f=>f.label==='First name');},id);
  await application.locator('#first').evaluate(el=>el.type='password');
  const result=await worker.evaluate(({id,field})=>chrome.tabs.sendMessage(id,{type:'apply',items:[{id:field.id,value:'Alex'}]}),{id,field});
  expect(result.results[0].ok).toBe(false);await expect(application.locator('#first')).toHaveValue('');
});

test('imports private context without replacing API key and persists project edits',async()=>{
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  await worker.evaluate(async()=>{await chrome.storage.session.set({apiKey:'preserve-test-key'});globalThis.fetch=async(url,options)=>{globalThis.lastRequest=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Test answer.'}]}]})};};});
  options.on('dialog',dialog=>dialog.accept());
  await options.locator('#profileImport').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,apiKey:'never-import-this',profile:{github:'https://github.com/example',background:'Example engineer',projects:[{title:'Example project',url:'https://example.com',notes:'Built API',sourceText:'An example project.'}]}}))});
  await expect(options.locator('#status')).toContainText('Import ready');
  await expect(options.getByLabel('GitHub URL')).toHaveValue('https://github.com/example');
  await options.getByRole('button',{name:'Save profile',exact:true}).click();await expect(options.locator('#status')).toContainText('Profile saved');
  await options.reload();await expect(options.getByLabel('Project name',{exact:true})).toHaveValue('Example project');
  expect(await worker.evaluate(async()=>(await chrome.storage.session.get('apiKey')).apiKey)).toBe('preserve-test-key');
  await options.getByLabel('Include in AI answers').uncheck();await options.getByRole('button',{name:'Save profile',exact:true}).click();await expect(options.locator('#status')).toContainText('Profile saved');
  const result=await options.evaluate(()=>chrome.runtime.sendMessage({type:'draft',args:{question:'Why this role?'}}));expect(result.answer).toBeTruthy();
  expect(JSON.parse((await worker.evaluate(()=>globalThis.lastRequest)).input).projects).toHaveLength(0);
});

function examplePDF(){
  const stream='BT /F1 12 Tf 50 750 Td (Example Engineer - Built reliable APIs) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=pdf.length;pdf+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test('extracts PDF resume text locally under extension CSP',async()=>{
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  options.on('dialog',dialog=>dialog.accept());
  const remoteRequests=[];options.on('request',req=>{if(req.url().startsWith('https:'))remoteRequests.push(req.url());});
  await options.locator('#resume').setInputFiles({name:'resume.pdf',mimeType:'application/pdf',buffer:examplePDF()});
  await options.getByRole('button',{name:'Extract resume text'}).click();
  await expect(options.locator('#status')).toContainText('Resume text extracted locally');
  expect(await options.locator('#background').inputValue()).toContain('Example Engineer - Built reliable APIs');
  expect(remoteRequests).toEqual([]);
});
test('project source extraction drops scripts and renders fetched text as plain text',async()=>{
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  const result=await options.evaluate(async()=>{
    const {extractSource}=await import('./projects.js');
    return extractSource('<main><h1>Example</h1><p>A project that helps engineers build reliable APIs and manage repeatable workloads.</p><script>maliciousInstruction()</script></main><nav>Unrelated navigation</nav>');
  });
  expect(result.text).toContain('reliable APIs');expect(result.text).not.toContain('maliciousInstruction');expect(result.text).not.toContain('Unrelated');
});

test('reading a project link updates reviewable source text and saves it',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({profile:{projects:[{title:'Example',url:'https://example.com',notes:'Built APIs'}]}}));
  const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><h1>Example project</h1><p>Built for engineers who need reliable API workflows and repeatable automation.</p></main>'}));
  await options.getByRole('button',{name:'Read project link'}).click();
  await expect(options.locator('.project-card .hint')).toContainText('Review source text');
  await options.getByRole('button',{name:'Save profile',exact:true}).click();await expect(options.locator('#status')).toContainText('Profile saved');
  await options.reload();await options.locator('.project-card summary').click();
  expect(await options.getByLabel('Imported source text (editable)').inputValue()).toContain('reliable API workflows');
  await options.getByLabel('Project link (website or GitHub repository)').fill('https://example.com/other');
  expect(await options.getByLabel('Imported source text (editable)').inputValue()).toBe('');
});

test('fills React Select education, saved disclosures, graduation questions, and radios',async()=>{
 const profile={school:'Example University - Main',degree:"Bachelor's Degree",discipline:'Computer Engineering',educationEndMonth:'May',educationEndYear:'2028',seekingInternship:'Yes',workAuthorizationUS:'Yes',sponsorship:'No',over18:'Yes',gender:'Female',race:'Asian',hispanicLatino:'No',veteranStatus:'I am not a protected veteran'};
 await worker.evaluate(profile=>chrome.storage.local.set({profile}),profile);
 const application=await context.newPage();await application.goto(url+'/greenhouse');await expect(application.getByRole('combobox',{name:'School',exact:true})).toBeVisible();
 const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
 const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/greenhouse').id,url);await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
 await popup.getByRole('button',{name:'Scan this application'}).click();
 await expect(popup.getByLabel('Value for Gender',{exact:true})).toHaveValue('Male');await expect(popup.getByLabel('Value for Gender',{exact:true})).toBeDisabled();
 await popup.getByRole('button',{name:'Fill selected fields'}).click();await expect(popup.locator('#status')).toContainText('Filled 13 of 13',{timeout:20000});
 const values=JSON.parse(await application.locator('#values').textContent());
 expect(values.school.label).toBe('Example University - Main');expect(values.major.label).toBe('Computer Engineering');expect(values.graduation.label).toBe('No');expect(values.internship.label).toBe('Yes');expect(values.authorization.label).toBe('Yes');expect(values.sponsor.label).toBe('No');expect(values.gender.label).toBe('Male');expect(values.race.label).toBe('Asian');expect(values.ethnicity.label).toBe('No');expect(values.veteran.label).toBe('I am not a protected veteran');
 await expect(application.locator('#end-year')).toHaveValue('2028');await expect(application.locator('input[name=adult][value=yes]')).toBeChecked();await expect(application.locator('#consent')).not.toBeChecked();
 expect(await popup.locator('#context').inputValue()).toContain('reliable connectivity');
 recordFixture('greenhouse',Object.entries({school:'Example University - Main',degree:"Bachelor's Degree",'end-month':'May',major:'Computer Engineering',graduation:'No',internship:'Yes',authorization:'Yes',sponsor:'No',race:'Asian',ethnicity:'No',veteran:'I am not a protected veteran'}).map(([field,expected])=>({field,expected,actual:values[field]?.label||''})).concat([{field:'end-year',expected:'2028',actual:await application.locator('#end-year').inputValue()},{field:'adult',expected:'yes',actual:await application.locator('input[name=adult]:checked').inputValue()}]),[{field:'gender',expected:'Male',actual:values.gender.label}]);
});

test('falls back to the broader Engineering option only when the precise major is absent',async()=>{
 const application=await context.newPage();await application.goto(url+'/greenhouse?generic');await expect(application.getByRole('combobox',{name:'Discipline',exact:true})).toBeVisible();
 const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/greenhouse?generic').id,url);
 const field=await worker.evaluate(async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});return (await chrome.tabs.sendMessage(id,{type:'scan'})).fields.find(f=>f.label==='Discipline');},id);
 const result=await worker.evaluate(({id,field})=>chrome.tabs.sendMessage(id,{type:'apply',items:[{id:field.id,value:'Computer Engineering',alternatives:['Engineering']}]}),{id,field});
 expect(result.results[0].ok).toBe(true);expect(result.results[0].selectedValue).toBe('Engineering');expect(JSON.parse(await application.locator('#values').textContent()).major.label).toBe('Engineering');
});

test('a stale preview cannot target new field IDs after script reinjection',async()=>{
 const application=await context.newPage();await application.goto(url+'/?reinjected');
 const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/?reinjected').id,url);
 const result=await worker.evaluate(async id=>{
  await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});const old=(await chrome.tabs.sendMessage(id,{type:'scan'})).fields[0];
  await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});await chrome.tabs.sendMessage(id,{type:'scan'});
  return chrome.tabs.sendMessage(id,{type:'apply',items:[{id:old.id,value:'Stale value'}]});
 },id);
 expect(result.results[0].ok).toBe(false);await expect(application.locator('#first')).toHaveValue('');
});

test('Ashby nested education, canonical school options and answer buttons fill through preview',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({resume:{name:'resume.txt',type:'text/plain',data:'RXhhbXBsZSByZXN1bWU='},profile:{firstName:'Alex',lastName:'Example',school:'University of Michigan - Ann Arbor',degree:"Bachelor's Degree",discipline:'Computer Engineering',educationEndMonth:'May',educationEndYear:'2028',currentlyStudent:'Yes',sponsorship:'No'}}));
  const application=await context.newPage();await application.goto(url+'/ashby');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/ashby').id,url);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await expect(popup.getByLabel('Value for Full Legal Name')).toHaveValue('Alex Example');
  await expect(popup.getByLabel('Value for School',{exact:true})).toHaveValue('University of Michigan - Ann Arbor');
  await expect(popup.getByLabel('Value for Requesting visa sponsorship?')).toHaveValue('no');
  await expect(popup.getByText('Saved answer “2028” is not offered', {exact:false})).toBeVisible();
  await expect(popup.getByLabel('Value for Start Date Year')).toHaveValue('');
  await expect(popup.getByLabel('Value for What is your graduation date?')).toHaveValue('');
  await expect(popup.getByRole('button',{name:'Generate AI draft'})).toBeVisible();
  await expect(popup.getByText('Autofill from resume',{exact:true})).toHaveCount(0);
  await popup.getByRole('button',{name:'Fill selected fields'}).click();
  await expect(popup.locator('#status')).toContainText('Filled 8 of 8');
  await expect(application.getByRole('combobox',{name:'Search schools...'})).toHaveValue('University of Michigan');
  await expect(application.locator('#degree')).toHaveValue("Bachelor's Degree");
  await expect(application.locator('#major')).toHaveValue('Computer Engineering');
  await expect(application.locator('button[data-option=no][aria-pressed=true]')).toHaveCount(1);
  await expect(application.getByLabel('Still Student?')).toBeChecked();
  await expect(application.getByLabel('I agree to terms')).not.toBeChecked();
  await expect(application.locator('input[name=communicationConsent]')).not.toBeChecked();
  expect(await application.evaluate(()=>!!window.submitted)).toBe(false);
  recordFixture('ashby',[{field:'school',expected:'University of Michigan',actual:await application.getByRole('combobox',{name:'Search schools...'}).inputValue()},{field:'degree',expected:"Bachelor's Degree",actual:await application.locator('#degree').inputValue()},{field:'major',expected:'Computer Engineering',actual:await application.locator('#major').inputValue()},{field:'sponsorship',expected:'no',actual:await application.locator('button[data-option=no][aria-pressed=true]').getAttribute('data-option')},{field:'name',expected:'Alex Example',actual:await application.locator('.ashby-application-form-field-entry').filter({hasText:'Full Legal Name'}).locator('input').inputValue()},{field:'resume',expected:'resume.txt',actual:await application.locator('input[accept=".txt"]').evaluate(el=>el.files[0]?.name||'')},{field:'end-month',expected:'5',actual:await application.locator('select').nth(2).inputValue()},{field:'currently-student',expected:'Yes',actual:await application.getByLabel('Still Student?').isChecked()?'Yes':''},{field:'end-year',expected:'2028',actual:await application.locator('select').nth(3).inputValue(),limitation:'Known year is not offered by the fixture'}],[],1);
  // A second scan must preserve committed school and No answers.
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await expect(popup.getByLabel('Value for School',{exact:true})).toBeDisabled();
  await expect(popup.getByLabel('Value for Requesting visa sponsorship?')).toBeDisabled();
});

test('portable ARIA controls, nearby labels, shadow fields and new steps work without a site adapter',async()=>{
  await worker.evaluate(()=>chrome.storage.local.set({profile:{firstName:'Alex',lastName:'Example',school:'Example University',country:'United States',workAuthorizationUS:'Yes'},resume:null}));
  const application=await context.newPage();await application.goto(url+'/portable');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/portable').id,url);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await expect(popup.getByLabel('Value for School',{exact:true})).toHaveValue('Example University');
  await popup.getByRole('button',{name:'Fill selected fields'}).click();
  await expect(popup.locator('#status')).toContainText('Filled 4 of 4');
  await expect(application.locator('#school')).toHaveValue('Example University');
  await expect(application.locator('#country')).toHaveText('United States');
  await expect(application.getByRole('radio',{name:'Yes',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(application.locator('#shadow-first')).toHaveValue('Alex');
  await expect(application.locator('#email')).toHaveValue('existing@example.test');
  await expect(application.locator('#consent')).not.toBeChecked();
  expect(await application.evaluate(()=>window.submitted)).toBe(false);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await expect(popup.getByLabel('Value for Country',{exact:true})).toBeDisabled();
  await expect(popup.getByLabel('Value for Are you authorized to work in the US?')).toBeDisabled();
  await application.locator('#next').click();
  await expect(popup.locator('#changes')).toBeVisible();
  await popup.getByRole('button',{name:'Rescan changed form'}).click();
  await expect(popup.getByRole('checkbox',{name:'Last name',exact:true})).not.toBeChecked();
  await popup.getByRole('checkbox',{name:'Last name',exact:true}).check();
  await popup.getByRole('button',{name:'Fill selected fields'}).click();
  await expect(application.locator('#last')).toHaveValue('Example');
});

test('embedded previews route to each document and reject a navigated frame',async()=>{
  const application=await context.newPage();await application.goto(url+'/embedded');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/embedded').id,url);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await expect(popup.getByLabel('Value for School',{exact:true})).toHaveCount(2);
  const frames=application.frames().filter(f=>f.url().includes('/portable'));
  await frames[0].goto(url+'/portable?navigated');
  await popup.getByRole('button',{name:'Fill selected fields'}).click();
  await expect(popup.locator('#status')).toContainText('Filled 4 of 8');
  await expect(popup.locator('#status')).toContainText('frame changed');
  await expect(frames[0].locator('#school')).toHaveValue('');
  await expect(frames[1].locator('#school')).toHaveValue('Example University');
});

test('inaccessible embedded content is reported while the main form still fills',async()=>{
  await context.route('https://blocked.test/application',route=>route.fulfill({contentType:'text/html',body:'<label>Last name<input></label>'}));
  const application=await context.newPage();await application.goto(url+'/blocked-embed');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/blocked-embed').id,url);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await expect(popup.locator('#status')).toContainText('embedded content may be inaccessible');
  await popup.getByRole('button',{name:'Fill selected fields'}).click();
  await expect(application.getByLabel('First name')).toHaveValue('Alex');
  await expect(application.frameLocator('iframe').getByLabel('Last name')).toHaveValue('');
});

test('changed custom control roles are rejected before any click',async()=>{
  const application=await context.newPage();await application.goto(url+'/portable?changed');
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/portable?changed').id,url);
  const field=await worker.evaluate(async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['content.js']});return (await chrome.tabs.sendMessage(id,{type:'scan'})).fields.find(f=>f.label==='Country');},id);
  await application.locator('#country').evaluate(el=>{el.removeAttribute('role');el.onclick=()=>{window.clickedChangedControl=true;};});
  const result=await worker.evaluate(({id,field})=>chrome.tabs.sendMessage(id,{type:'apply',items:[{id:field.id,value:'United States'}]}),{id,field});
  expect(result.results[0].ok).toBe(false);
  expect(await application.evaluate(()=>!!window.clickedChangedControl)).toBe(false);
});

test('attachment-only profiles explain missing context and keep SMS consent manual',async()=>{
 await worker.evaluate(()=>chrome.storage.local.set({profile:{firstName:'Alex'},resume:{name:'resume.txt',type:'text/plain',data:btoa('Example resume')}}));
 const application=await context.newPage();await application.goto(url+'/ashby?empty-context');
 const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
 const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target+'/ashby?empty-context').id,url);
 await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
 await popup.getByRole('button',{name:'Scan this application'}).click();
 await expect(popup.locator('#status')).toContainText('Your resume is attached, but its text and education are not saved');
 await expect(popup.getByRole('checkbox',{name:'Communication consent',exact:true})).toBeDisabled();
 await expect(popup.getByLabel('Value for School',{exact:true})).toHaveValue('');
});

test('resume upload prepares reviewable education without replacing saved answers',async()=>{
 await worker.evaluate(()=>chrome.storage.local.set({profile:{degree:'My saved degree'},resume:null}));
 const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
 const resume='EDUCATION\nExample University\nBachelor of Science, Computer Engineering May 2028\nEXPERIENCE\nBuilt reliable tools.';
 await options.locator('#resume').setInputFiles({name:'education.txt',mimeType:'text/plain',buffer:Buffer.from(resume)});
 await expect(options.locator('#status')).toContainText('ready to review');
 await expect(options.getByLabel('Experience / resume text')).toHaveValue(resume);
 await expect(options.getByLabel('School / university')).toHaveValue('Example University');
 await expect(options.getByLabel('Degree level')).toHaveValue('My saved degree');
 await expect(options.getByLabel('Graduation year')).toHaveValue('2028');
 await expect(options.getByLabel('Education start year')).toHaveValue('');
 expect(await worker.evaluate(async()=>(await chrome.storage.local.get('profile')).profile.background)).toBeUndefined();
 await options.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(options.locator('#status')).toContainText('Profile saved');
 await options.locator('#resume').setInputFiles({name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('Different resume')});
 await expect(options.getByLabel('Experience / resume text')).toHaveValue(resume);
});

async function openWorkflow(suffix,profile={firstName:'Alex',school:'Example University',background:'Built an API.'}){
 await worker.evaluate(profile=>chrome.storage.local.set({profile,resume:null}),profile);
 const application=await context.newPage();await application.goto(url+'/workflow?'+suffix);
 const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
 const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target).id,url+'/workflow?'+suffix);
 await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
 await popup.getByRole('button',{name:'Scan this application'}).click();
 return {application,popup,id};
}

test('reviewed mappings persist across applications, can be edited and removed, and preserve entries',async()=>{
 await worker.evaluate(()=>chrome.storage.local.remove('fieldMappings'));
 const first=await openWorkflow('mapping-first');
 await first.popup.getByLabel('Use profile field for Academic institution attended').selectOption('school');
 await expect(first.popup.getByLabel('Value for Academic institution attended')).toHaveValue('Example University');
 const row=first.popup.locator('.field').filter({hasText:'Academic institution attended'});
 await row.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(row).toContainText('Mapping saved');
 const second=await openWorkflow('mapping-second');
 await expect(second.popup.getByLabel('Value for Academic institution attended')).toHaveValue('Example University');
 await second.application.locator('#institution').fill('Human choice');
 await second.popup.getByRole('button',{name:'Fill selected fields'}).click();
 await expect(second.popup.locator('#status')).toContainText('Already contains a value');
 await expect(second.application.locator('#institution')).toHaveValue('Human choice');
 const options=await context.newPage();await options.goto(`chrome-extension://${extensionId}/options.html`);
 await options.getByLabel('Mapping for Academic institution attended').selectOption('degree');
 await options.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(options.locator('#status')).toContainText('Mapping updated');
 expect(await worker.evaluate(async()=>(await chrome.storage.local.get('fieldMappings')).fieldMappings[0].profileKey)).toBe('degree');
 await options.getByRole('button',{name:'Remove mapping',exact:true}).click();
 await expect(options.locator('#mappings')).toContainText('No saved mappings');
});

test('delayed clearing and user edits fail final verification without retries',async()=>{
 const {application,id}=await openWorkflow('delayed');
 await application.locator('#institution').evaluate(el=>el.addEventListener('input',()=>setTimeout(()=>{el.value='User changed this';},650),{once:true}));
 const field=await worker.evaluate(async id=>(await chrome.tabs.sendMessage(id,{type:'scan'})).fields.find(f=>f.label==='Academic institution attended'),id);
 const result=await worker.evaluate(({id,field})=>chrome.tabs.sendMessage(id,{type:'apply',items:[{id:field.id,value:'Example University'}]}),{id,field});
 expect(result.results[0].ok).toBe(false);expect(result.results[0].reason).toContain('after filling');
 await expect(application.locator('#institution')).toHaveValue('User changed this');
 await application.locator('#draft-one').evaluate(el=>el.addEventListener('input',()=>setTimeout(()=>{const replacement=el.cloneNode(true);replacement.value='';el.replaceWith(replacement);},650),{once:true}));
 const cleared=await worker.evaluate(async id=>(await chrome.tabs.sendMessage(id,{type:'scan'})).fields.find(f=>f.label==='Why this role?'),id);
 const rerender=await worker.evaluate(({id,field})=>chrome.tabs.sendMessage(id,{type:'apply',items:[{id:field.id,value:'Reviewed draft'}]}),{id,field:cleared});
 expect(rerender.results[0].ok).toBe(false);
 await expect(application.locator('#draft-one')).toHaveValue('');
});

test('changed forms preserve edited drafts and require review of new fields',async()=>{
 const {application,popup}=await openWorkflow('rescan');
 await popup.getByLabel('Value for Why this role?').fill('My carefully edited draft');
 await application.locator('#add').click();
 await expect(popup.locator('#changes')).toBeVisible();
 await expect(popup.getByRole('button',{name:'Fill selected fields'})).toBeDisabled();
 await popup.getByRole('button',{name:'Rescan changed form'}).click();
 await expect(popup.getByLabel('Value for Why this role?')).toHaveValue('My carefully edited draft');
 await expect(popup.getByRole('checkbox',{name:'Why this role?',exact:true})).not.toBeChecked();
 await expect(popup.getByRole('checkbox',{name:'First name',exact:true})).not.toBeChecked();
 await popup.getByRole('checkbox',{name:'Why this role?',exact:true}).check();
 await popup.getByRole('button',{name:'Fill selected fields'}).click();
 await expect(application.locator('#draft-one')).toHaveValue('My carefully edited draft');
 await expect(application.locator('#added-first')).toHaveValue('');
});

test('batch drafting limits concurrency, sends explicit context, and keeps generated answers unselected',async()=>{
 await worker.evaluate(async()=>{
  await chrome.storage.session.set({apiKey:'test-only'});globalThis.batchActive=0;globalThis.batchMaximum=0;globalThis.batchRequests=[];
  globalThis.fetch=async(_url,{body,signal})=>{globalThis.batchActive++;globalThis.batchMaximum=Math.max(globalThis.batchMaximum,globalThis.batchActive);globalThis.batchRequests.push(JSON.parse(body));await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,150);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('aborted'));},{once:true});});globalThis.batchActive--;return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'I built an API and want to deepen that experience.'}]}]})};};
 });
 const {popup}=await openWorkflow('batch');
 await popup.getByRole('button',{name:'Draft unanswered questions (up to 8)'}).click();
 await expect(popup.locator('#status')).toContainText('Enter the company and role');
 await popup.getByLabel('Company',{exact:true}).fill('Example Company');await popup.getByLabel('Role',{exact:true}).fill('Intern');
 await popup.getByRole('button',{name:'Draft unanswered questions (up to 8)'}).click();
 await expect(popup.locator('#status')).toContainText('Draft ready: 3 answer(s)');
 for(const label of ['Why this role?','Describe a project','Tell us about your experience']){
  await expect(popup.getByLabel('Value for '+label)).toHaveValue('I built an API and want to deepen that experience.');
  await expect(popup.getByRole('checkbox',{name:label,exact:true})).not.toBeChecked();
 }
 const evidence=await worker.evaluate(()=>({maximum:globalThis.batchMaximum,requests:globalThis.batchRequests}));
 expect(evidence.maximum).toBe(2);expect(evidence.requests).toHaveLength(3);
 expect(evidence.requests.every(r=>JSON.parse(r.input).company==='Example Company'&&JSON.parse(r.input).role==='Intern')).toBe(true);
 expect(evidence.requests.every(r=>!JSON.parse(r.input).question.includes('Gender'))).toBe(true);
});

test('cancelling a batch aborts active fetches and never starts queued questions',async()=>{
 await worker.evaluate(async()=>{
  await chrome.storage.session.set({apiKey:'test-only'});globalThis.cancelStarted=0;globalThis.cancelAborted=0;
  globalThis.fetch=(_url,{signal})=>{globalThis.cancelStarted++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{globalThis.cancelAborted++;reject(Error('aborted'));},{once:true}));};
 });
 const {popup}=await openWorkflow('cancel');
 await popup.locator('summary').click();await popup.getByLabel('Company',{exact:true}).fill('Example');await popup.getByLabel('Role',{exact:true}).fill('Intern');
 await popup.getByRole('button',{name:'Draft unanswered questions (up to 8)'}).click();
 await expect.poll(()=>worker.evaluate(()=>globalThis.cancelStarted)).toBe(2);
 await popup.getByRole('button',{name:'Cancel drafting'}).click();
 await expect.poll(()=>worker.evaluate(()=>globalThis.cancelAborted)).toBe(2);
 expect(await worker.evaluate(()=>globalThis.cancelStarted)).toBe(2);
 for(const label of ['Why this role?','Describe a project','Tell us about your experience'])await expect(popup.getByLabel('Value for '+label)).toHaveValue('');
});

test('representative Lever, Workday and iCIMS fixtures record independent fill outcomes',async()=>{
 const profile={firstName:'Alex',lastName:'Example',phone:'5551234567',github:'https://github.com/example',country:'United States',workAuthorizationUS:'Yes',school:'Example University',discipline:'Computer Engineering',degree:"Bachelor's Degree"};
 for(const ats of ['lever','workday','icims']){
  await worker.evaluate(profile=>chrome.storage.local.set({profile,resume:null}),profile);
  const application=await context.newPage();await application.goto(url+'/ats/'+ats);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const id=await worker.evaluate(async target=>(await chrome.tabs.query({})).find(t=>t.url===target).id,url+'/ats/'+ats);
  await worker.evaluate(id=>chrome.tabs.update(id,{active:true}),id);
  await popup.getByRole('button',{name:'Scan this application'}).click();
  await popup.getByRole('button',{name:'Fill selected fields'}).click();
  await expect(popup.locator('#status')).toContainText('Filled 3 of 3');
  let observations=[],preserved=[];
  if(ats==='lever'){
   for(const [field,expected] of [['name','Alex Example'],['phone',profile.phone],['github',profile.github]])observations.push({field,expected,actual:await application.locator('#'+field).inputValue()});
   preserved=[{field:'email',expected:'existing@example.test',actual:await application.locator('#email').inputValue()}];
   expect(await application.evaluate(()=>window.submitted)).toBe(false);
  }else if(ats==='workday'){
   observations=[{field:'first',expected:'Alex',actual:await application.locator('#first').inputValue()},{field:'country',expected:'United States',actual:await application.locator('#country').textContent()},{field:'authorization',expected:'Yes',actual:await application.locator('[role=radio][aria-checked=true]').textContent()}];
   preserved=[{field:'last',expected:'Existing',actual:await application.locator('#last').inputValue()}];
   await application.locator('#next').click();await expect(popup.locator('#changes')).toBeVisible();await popup.getByRole('button',{name:'Rescan changed form'}).click();
   for(const label of ['School','Field of Study']){await expect(popup.getByRole('checkbox',{name:label,exact:true})).not.toBeChecked();await popup.getByRole('checkbox',{name:label,exact:true}).check();}
   await popup.getByRole('button',{name:'Fill selected fields'}).click();await expect(popup.locator('#status')).toContainText('Filled 2 of 2');
   observations.push({field:'school',expected:profile.school,actual:await application.locator('#school').inputValue()},{field:'major',expected:profile.discipline,actual:await application.locator('#major').inputValue()});
   expect(await application.evaluate(()=>window.submitted)).toBe(false);
  }else{
   const frame=application.frameLocator('iframe');
   for(const [field,expected] of [['first','Alex'],['phone',profile.phone],['degree','bs']])observations.push({field,expected,actual:await frame.locator('#'+field).inputValue()});
   preserved=[{field:'email',expected:'existing@example.test',actual:await frame.locator('#email').inputValue()}];
   await expect(frame.locator('#terms')).not.toBeChecked();
  }
  recordFixture(ats,observations,preserved);await popup.close();await application.close();
 }
});
