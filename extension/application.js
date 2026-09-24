// Route every preview back to the exact document scanned, including embedded forms.
export async function scanApplication(tabId){
  let injected,partial=false;
  try{injected=await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']});}
  catch{partial=true;injected=await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}
  const results=await Promise.allSettled(injected.map(async frame=>{
    const result=await chrome.tabs.sendMessage(tabId,{type:'scan'},{documentId:frame.documentId});
    if(result.error)throw Error(result.error);
    return {...result,documentId:frame.documentId,frameId:frame.frameId};
  }));
  const frames=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  if(!frames.length)throw Error('Could not scan this application. Reload the panel and try again.');
  partial ||=results.some(r=>r.status==='rejected');
  const top=frames.find(f=>f.frameId===0)||frames[0];
  const warnings=[];
  if(partial||frames.reduce((count,f)=>count+(f.embeddedCount||0),0)>frames.length-1)warnings.push('Some embedded content may be inaccessible. Open the embedded application directly in a tab if its fields are missing.');
  return {...top,documents:frames.map(f=>({documentId:f.documentId,url:f.url})),fields:frames.flatMap(f=>f.fields.map(field=>({...field,documentId:f.documentId,sourceUrl:f.url}))),warnings};
}
export async function fillApplication(tabId,items,resume){
  const groups=new Map();
  for(const item of items){if(!groups.has(item.documentId))groups.set(item.documentId,[]);groups.get(item.documentId).push(item);}
  const results=[];
  // Sequential documents keep dropdown focus and user-visible updates deterministic.
  for(const [documentId,group] of groups){
    try{
      const reply=await chrome.tabs.sendMessage(tabId,{type:'apply',items:group,resume:group.some(i=>i.kind==='resume')?resume:null},{documentId});
      if(reply.error)throw Error(reply.error);
      results.push(...reply.results);
    }catch{results.push(...group.map(i=>({id:i.id,ok:false,reason:'This application frame changed or became unavailable. Scan again.'})));}
  }
  // Recheck earlier documents after later frames finish too. This never writes.
  for(const [documentId,group] of groups){
    const ids=group.filter(i=>results.some(r=>r.id===i.id&&r.ok)).map(i=>i.id);
    if(!ids.length)continue;
    try{
      const verified=await chrome.tabs.sendMessage(tabId,{type:'verify',ids},{documentId});
      for(const failure of verified.results.filter(r=>!r.ok))Object.assign(results.find(r=>r.id===failure.id),failure);
    }catch{for(const result of results)if(ids.includes(result.id)){result.ok=false;result.reason='The application document changed after filling. Scan again.';}}
  }
  return {results};
}

export async function applicationChanged(tabId,documents){
  const results=await Promise.allSettled(documents.map(doc=>chrome.tabs.sendMessage(tabId,{type:'inspect'},{documentId:doc.documentId})));
  return results.some(r=>r.status==='rejected'||r.value.changed&&!r.value.busy);
}
