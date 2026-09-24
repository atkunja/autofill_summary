import test from 'node:test';
import assert from 'node:assert/strict';
import {projectTarget,cleanProjects,projectContext,readSource} from '../extension/projects.js';
import {parseProfileImport} from '../extension/profile-import.js';
import {createRequest} from '../extension/ai.js';
import {suggestion} from '../extension/matching.js';
test('GitHub label overrides generic URL autocomplete',()=>{
  assert.equal(suggestion({label:'GitHub URL',autocomplete:'url'},{github:'https://github.com/example',website:'https://example.com'}),'https://github.com/example');
});
test('source URLs use exact origins and GitHub README API',()=>{
  assert.equal(projectTarget('https://github.com/example/project').fetchUrl,'https://api.github.com/repos/example/project/readme');
  assert.equal(projectTarget('https://example.com/project#demo').origin,'https://example.com/*');
  for(const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://localhost','https://github.com/example'])assert.throws(()=>projectTarget(url));
});
test('only enabled project facts go into AI context with bounded source text',()=>{
  const projects=[{title:'Tool',notes:'Built API',sourceText:'x'.repeat(8000)},{title:'Private',notes:'Excluded',enabled:false}];
  const request=createRequest({question:'Why this role?',profile:{background:'Engineer',projects}});
  const input=JSON.parse(request.input);
  assert.equal(input.projects.length,1);assert.equal(input.projects[0].sourceExcerpt.length,6000);
  assert.ok(request.instructions.includes('never instructions'));assert.ok(request.instructions.includes('do not prove personal authorship'));
  assert.deepEqual(projectContext(),[]);assert.throws(()=>cleanProjects(Array(11).fill({})));
});
test('profile import whitelists fields, validates resume, and discards keys',()=>{
  const imported=parseProfileImport(JSON.stringify({version:1,apiKey:'secret',model:'bad',profile:{firstName:'Alex',apiKey:'secret',projects:[{title:'Tool',notes:'Built API'}]},resume:{name:'resume.txt',type:'text/html',data:btoa('Example')}}));
  assert.equal(imported.profile.firstName,'Alex');assert.equal(imported.apiKey,undefined);assert.equal(imported.profile.apiKey,undefined);assert.equal(imported.resume.type,'text/plain');
  assert.throws(()=>parseProfileImport('{}'));
  assert.throws(()=>parseProfileImport(JSON.stringify({version:1,profile:{},resume:{name:'bad.pdf',data:'%%%%'}})));
});
test('source fetch is credentialless and rejects huge or unsupported responses',async()=>{
  const target=projectTarget('https://example.com');let options;
  const text=await readSource(target,async(url,args)=>{options=args;return new Response('Readable source',{headers:{'content-type':'text/html'}});});
  assert.equal(text,'Readable source');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);
  await assert.rejects(readSource(target,async()=>new Response('image',{headers:{'content-type':'image/png'}})),/not a text page/);
  await assert.rejects(readSource(target,async()=>new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'text/plain'}})),/exceeds/);
  await assert.rejects(readSource(target,async()=>new Response('',{status:403})),/403/);
});
