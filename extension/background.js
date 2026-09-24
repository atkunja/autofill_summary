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
