import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
for(const name of await readdir('extension'))if(name.endsWith('.js'))execFileSync(process.execPath,['--check',`extension/${name}`],{stdio:'inherit'});
