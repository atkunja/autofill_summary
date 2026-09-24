export const BATCH_LIMIT=8;
export const BATCH_CONCURRENCY=2;
export async function runDraftQueue(items,run,{signal,onResult=()=>{}}={}){
  if(!Array.isArray(items)||items.length<1||items.length>BATCH_LIMIT)throw Error(`Choose 1–${BATCH_LIMIT} questions.`);
  let cursor=0,completed=0;
  async function worker(){
    while(!signal?.aborted&&cursor<items.length){
      const item=items[cursor++];
      let result;
      try{result={id:item.id,answer:await run(item,signal)};}catch(error){result={id:item.id,error:error.message};}
      if(signal?.aborted)break;
      completed++;onResult(result);
    }
  }
  await Promise.all(Array.from({length:Math.min(BATCH_CONCURRENCY,items.length)},worker));
  return {completed,total:items.length,cancelled:!!signal?.aborted};
}
