import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const routes=new Map();
for(const name of ['ashby','greenhouse']){
 const bundle=(await build({entryPoints:[`tests/fixtures/${name}.jsx`],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 routes.set(`/${name}.js`,['text/javascript',bundle]);
 routes.set(`/${name}`,['text/html',`<!doctype html><title>${name} behavioral fixture</title><div id="root"></div><script src="/${name}.js"></script>`]);
}
for(const name of ['lever','workday','icims','workflow','portable'])routes.set(`/${name}`,['text/html',await readFile(`tests/fixtures/${name}.html`,'utf8')]);
routes.set('/icims-content',routes.get('/icims'));
routes.set('/icims',['text/html','<!doctype html><title>iCIMS embedded fixture</title><iframe src="/icims-content" style="width:100%;height:800px"></iframe>']);
routes.set('/',['text/html','<!doctype html><title>Application fixtures</title><h1>Behavioral fixtures, not live ATS verification</h1>'+['ashby','greenhouse','lever','workday','icims','workflow','portable'].map(name=>`<p><a href="/${name}">${name}</a></p>`).join('')]);
http.createServer((req,res)=>{const route=routes.get(new URL(req.url,'http://localhost').pathname);res.writeHead(route?200:404,{'Content-Type':route?.[0]||'text/plain'});res.end(route?.[1]||'Not found');}).listen(4173,'127.0.0.1',()=>console.log('Fixtures: http://127.0.0.1:4173'));
