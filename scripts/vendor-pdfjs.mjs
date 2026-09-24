import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
const dest='extension/vendor/pdfjs';await mkdir(dest,{recursive:true});
for(const file of ['pdf.mjs','pdf.worker.mjs'])await copyFile(`node_modules/pdfjs-dist/legacy/build/${file}`,`${dest}/${file}`);
await copyFile('node_modules/pdfjs-dist/LICENSE',`${dest}/LICENSE`);
const {version}=JSON.parse(await readFile('node_modules/pdfjs-dist/package.json','utf8'));
await writeFile(`${dest}/VERSION`,version+'\n');
