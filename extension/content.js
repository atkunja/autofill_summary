(() => {
  if (globalThis.__applyPersonally) return;
  globalThis.__applyPersonally = true;
  const fields = new Map();
  let counter = 0;
  const visible = el => !el.disabled && !el.readOnly && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const label = el => [Array.from(el.labels || []).map(l => l.textContent).join(' '),
    el.getAttribute('aria-label'), (el.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' '),
    el.placeholder, el.name, el.id].find(s => s?.trim())?.trim().slice(0, 500) || 'Unlabeled field';
  function controls(root = document) {
    return [...root.querySelectorAll('input,textarea,select'), ...[...root.querySelectorAll('*')].filter(el => el.shadowRoot).flatMap(el => controls(el.shadowRoot))];
  }
  function scan() {
    fields.clear();
    return controls().filter(el => visible(el) && (el.tagName !== 'INPUT' || ['text','email','tel','url','file','search'].includes(el.type))).slice(0, 150).map(el => {
      const id = String(++counter); fields.set(id, {el, label: label(el)});
      return {id, label: label(el), tag: el.tagName.toLowerCase(), type: el.type, autocomplete: el.autocomplete,
        value: el.type === 'file' ? (el.files[0]?.name || '') : el.value,
        maxLength: el.maxLength > 0 ? el.maxLength : null,
        options: el.tagName === 'SELECT' ? [...el.options].map(o => ({value:o.value,label:o.text,disabled:o.disabled})) : null};
    });
  }
  function apply(items, resume) {
    return items.map(item => {
      const record = fields.get(item.id); const el = record?.el;
      if (!el?.isConnected || !visible(el) || label(el) !== record.label) return {id:item.id, ok:false, reason:'Field changed. Scan again.'};
      if (el.type === 'file' ? el.files.length : !!el.value.trim()) return {id:item.id, ok:false, reason:'Already contains a value; left unchanged.'};
      try {
        if (el.type === 'file') {
          if (!resume || item.kind !== 'resume') throw Error('No resume selected.');
          const allowed = el.accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (allowed.length && !allowed.some(a => resume.name.toLowerCase().endsWith(a) || a === resume.type || (a.endsWith('/*') && resume.type.startsWith(a.slice(0,-1))))) throw Error('This field does not accept your saved resume format.');
          const bytes = Uint8Array.from(atob(resume.data), c => c.charCodeAt(0));
          const dt = new DataTransfer(); dt.items.add(new File([bytes], resume.name, {type:resume.type})); el.files = dt.files;
        } else {
          if (typeof item.value !== 'string' || !item.value.trim()) throw Error('No value provided.');
          if (el.maxLength > 0 && item.value.length > el.maxLength) throw Error('Answer exceeds the field character limit.');
          if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === item.value && !o.disabled)) throw Error('Option no longer available.');
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, item.value);
        }
        el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
        return {id:item.id,ok:true};
      } catch(error) {return {id:item.id,ok:false,reason:error.message};}
    });
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'scan') reply({fields:scan(), title:document.title, url:location.href});
    if (message.type === 'apply') reply({results:apply(message.items, message.resume)});
  });
})();
