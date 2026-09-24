chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
import {draftAnswer} from './ai.js';
// Profile and session credentials are unavailable to injected content scripts.
const ready = Promise.all([
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
  chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})
]);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if (message.type !== 'draft') return;
  (async () => {
    await ready;
    const {profile = {}, model} = await chrome.storage.local.get(['profile','model']);
    const {apiKey} = await chrome.storage.session.get('apiKey');
    return {answer:await draftAnswer({...message.args,profile,model},apiKey)};
  })().then(reply, error => reply({error:error.message}));
  return true;
});

// A port owns its queue: closing the panel or cancelling aborts its active work.
import {runDraftQueue} from './draft-queue.js';
import {canDraft} from './matching.js';
chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='application-drafts'||port.sender?.id!==chrome.runtime.id||!port.sender.url?.startsWith(chrome.runtime.getURL(''))){port.disconnect();return;}
  let controller=null,disconnected=false;
  const send=message=>{if(!disconnected)try{port.postMessage(message);}catch{controller?.abort();}};
  port.onDisconnect.addListener(()=>{disconnected=true;controller?.abort();});
  port.onMessage.addListener(message=>{
    if(message.type==='cancel'){controller?.abort();return;}
    if(message.type!=='start'||controller)return;
    controller=new AbortController();const signal=controller.signal;
    (async()=>{
      await ready;
      const {profile={},model}=await chrome.storage.local.get(['profile','model']);
      const {apiKey}=await chrome.storage.session.get('apiKey');
      if(!apiKey)throw Error('Add an OpenAI API key for this browser session in Profile.');
      if(message.batch&&(!message.company?.trim()||!message.role?.trim()))throw Error('Enter the company and role before drafting a batch.');
      if(!Array.isArray(message.items)||message.items.some(item=>!canDraft(item.field)||typeof item.id!=='string'))throw Error('Only unanswered, non-sensitive writing questions can be drafted.');
      return runDraftQueue(message.items,(item,signal)=>draftAnswer({question:item.field.label,maxLength:item.field.maxLength,context:message.context,company:message.company,role:message.role,profile,model},apiKey,fetch,signal),{signal,onResult:result=>send({type:'result',...result})});
    })().then(summary=>send({type:'complete',...summary}),error=>send({type:'error',error:error.message})).finally(()=>{controller=null;});
  });
});
