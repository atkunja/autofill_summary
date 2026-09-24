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
  manifest.host_permissions.push('http://127.0.0.1/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
  server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Example application</title><form><label>First name<input id="first" autocomplete="given-name"></label><label>Email<input id="email" type="email" value="existing@example.test"></label><label>State<select id="state"><option value="">Choose</option><option value="MI">Michigan</option></select></label><label>Resume<input id="resume" type="file" accept=".txt"></label><label>Why this company?<textarea id="why"></textarea></label><label>Gender<textarea id="gender"></textarea></label><input id="hidden" style="display:none"><button type="submit">Submit application</button></form><script>window.submitted=false;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submitted=true};</script>`);});
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
  await popup.screenshot({path:'test-results/popup.png'});
});
