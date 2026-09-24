import {build} from 'esbuild';
import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
let context,worker,extensionId,temp,server,url,page;
test.beforeAll(async()=>{
  temp=await mkdtemp(path.join(tmpdir(),'apply-test-'));
  const ext=path.join(temp,'extension');await cp('extension',ext,{recursive:true});
  const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));
  // Test-only localhost permission substitutes for clicking Chrome's toolbar action.
  manifest.host_permissions.push('http://127.0.0.1/*','https://example.com/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
  const fixtureBundle=(await build({entryPoints:['tests/fixtures/greenhouse.jsx'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  const ashbyBundle=(await build({entryPoints:['tests/fixtures/ashby.jsx'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  const portableFixture=await readFile('tests/fixtures/portable.html','utf8');
  server=http.createServer((req,res)=>{if(req.url.startsWith('/portable')){res.setHeader('Content-Type','text/html');res.end(portableFixture);return;}if(req.url==='/blocked-embed'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Blocked embed</title><label>First name<input></label><iframe src="https://blocked.test/application"></iframe>');return;}if(req.url==='/embedded'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Embedded application</title><iframe src="/portable?one"></iframe><iframe src="/portable?two"></iframe>');return;}if(req.url==='/ashby.js'){res.setHeader('Content-Type','text/javascript');res.end(ashbyBundle);return;}if(req.url.startsWith('/ashby')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Ashby fixture</title><div id="root"></div><script src="/ashby.js"></script>');return;}if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureBundle);return;}if(req.url.startsWith('/greenhouse')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Greenhouse fixture</title><div id="root"></div><script src="/fixture.js"></script>');return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Example application</title><form><label>First name<input id="first" autocomplete="given-name"></label><label>Email<input id="email" type="email" value="existing@example.test"></label><label>State<select id="state"><option value="">Choose</option><option value="MI">Michigan</option></select></label><label>Resume<input id="resume" type="file" accept=".txt"></label><label>Why this company?<textarea id="why"></textarea></label><label>Gender<textarea id="gender"></textarea></label><input id="hidden" style="display:none"><button type="submit">Submit application</button></form><script>window.submitted=false;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submitted=true};</script>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
  worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');extensionId=new URL(worker.url()).host;
});
test.afterAll(async()=>{await context?.close();await new Promise(resolve=>server?.close(resolve));if(temp)await rm(temp,{recursive:true,force:true});});
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
  await popup.getByRole('button',{name:'Fill selected fields'}).click();await expect(popup.locator('#status')).toContainText('Filled 3 of 3');
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
  await worker.evaluate(()=>chrome.storage.local.set({profile:{firstName:'Alex',lastName:'Example',school:'University of Michigan - Ann Arbor',degree:"Bachelor's Degree",discipline:'Computer Engineering',educationEndMonth:'May',educationEndYear:'2028',currentlyStudent:'Yes',sponsorship:'No'}}));
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
  await popup.getByRole('button',{name:'Scan this application'}).click();
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
