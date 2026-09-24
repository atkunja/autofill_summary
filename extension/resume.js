export async function extractResume(file) {
  if(file.size>4*1024*1024)throw Error('Choose a resume up to 4 MB.');
  let text;
  if(/\.txt$/i.test(file.name))text=await file.text();
  else if(/\.pdf$/i.test(file.name)) {
    const pdfjs=await import('./vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
    const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
    task.onPassword=()=>{void task.destroy();};
    try {
      const pdf=await task.promise;
      if(pdf.numPages>20)throw Error('Use a resume with 20 pages or fewer.');
      const pages=[];
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i), content=await page.getTextContent();
        pages.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));
      }
      text=pages.join('\n\n');
    } catch(error) {throw Error('Could not read this PDF. Use an unlocked, text-based PDF or paste its text. '+(error.message || ''));}
    finally {await task.destroy();}
  } else throw Error('Text extraction supports PDF and TXT. For DOC/DOCX, paste the resume text.');
  text=text.trim();
  if(!text)throw Error('No readable text found. Scanned PDFs need OCR first; paste the text manually.');
  return {text:text.slice(0,16000),truncated:text.length>16000};
}
