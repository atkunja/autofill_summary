import {profileFields} from './matching.js';
import {cleanProjects} from './projects.js';
export function parseProfileImport(raw) {
  const data=JSON.parse(raw);
  if(data?.version!==1 || !data.profile || typeof data.profile!=='object' || Array.isArray(data.profile))throw Error('Choose an Apply, personally profile JSON (version 1).');
  const profile={};
  for(const key of [...Object.keys(profileFields),'background','goals']){
    if(data.profile[key]!==undefined){if(typeof data.profile[key]!=='string')throw Error(`Invalid profile field: ${key}.`);profile[key]=data.profile[key].slice(0,key==='background'?16000:key==='goals'?4000:500);}
  }
  if(data.profile.projects!==undefined)profile.projects=cleanProjects(data.profile.projects);
  let resume;
  if(data.resume){
    const r=data.resume;
    if(typeof r.name!=='string'||!/^.{1,255}\.(pdf|docx?|txt)$/i.test(r.name)||typeof r.data!=='string'||r.data.length>5600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw Error('Invalid resume in import.');
    let binary;try{binary=atob(r.data);}catch{throw Error('Invalid resume encoding.');}
    if(binary.length>4*1024*1024)throw Error('Imported resume exceeds 4 MB.');
    const ext=r.name.split('.').pop().toLowerCase();
    const type={pdf:'application/pdf',txt:'text/plain',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[ext];
    resume={name:r.name,type,data:r.data};
  }
  // Intentionally ignore all other properties, including credentials and model settings.
  return {profile,resume};
}
