/* MyLife — IndexedDB persistence (all data stays on this device). */
const DB = (() => {
  const NAME = 'mylife', VER = 1;
  const STORES = Fin.STORES.concat(['users', 'settings', 'blobs']);
  let db = null;

  const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function open() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(NAME, VER);
      rq.onupgradeneeded = () => { const d = rq.result; STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); }); };
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => rej(rq.error);
    });
  }
  async function loadAll(S) {
    for (const s of Fin.STORES.concat(['users'])) {
      const tx = db.transaction(s, 'readonly'); S[s] = await wrap(tx.objectStore(s).getAll());
    }
    const st = await wrap(db.transaction('settings', 'readonly').objectStore('settings').getAll());
    S.settings = {}; st.forEach(r => { S.settings[r.id] = r.value; });
    S.dirty = []; S.removed = [];
  }
  // Writes everything that changed since the last flush in ONE transaction (all-or-nothing).
  async function flush(S) {
    if (!S.dirty.length && !S.removed.length) return;
    const dirty = S.dirty.splice(0), removed = S.removed.splice(0);
    const names = [...new Set([...dirty, ...removed].map(x => x[0]))];
    const tx = db.transaction(names, 'readwrite');
    const done = new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('abort')); });
    for (const [store, id] of dirty) {
      const os = tx.objectStore(store);
      if (store === 'settings') os.put({ id, value: S.settings[id] });
      else { const rec = (S[store] || []).find(r => r.id === id); if (rec) os.put(JSON.parse(JSON.stringify(rec))); }
    }
    for (const [store, id] of removed) tx.objectStore(store).delete(id);
    await done;
  }
  async function putBlob(id, blob) { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put({ id, blob, type: blob.type, size: blob.size }); return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function getBlob(id) { const r = await wrap(db.transaction('blobs', 'readonly').objectStore('blobs').get(id)); return r ? r.blob : null; }
  async function delBlob(id) { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').delete(id); return new Promise(res => { tx.oncomplete = res; }); }
  async function allBlobs() { return wrap(db.transaction('blobs', 'readonly').objectStore('blobs').getAll()); }
  async function clearAll() {
    const tx = db.transaction(STORES, 'readwrite'); STORES.forEach(s => tx.objectStore(s).clear());
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }

  const b2b64 = blob => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
  const b642b = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---- full backup (JSON, with attachments embedded and a SHA-256 checksum) ----
  async function exportAll(S) {
    const data = {}; Fin.STORES.concat(['users']).forEach(s => { data[s] = S[s]; });
    const blobs = {}; for (const b of await allBlobs()) blobs[b.id] = { type: b.type, b64: await b2b64(b.blob) };
    const payload = { data, settings: S.settings, blobs };
    const body = JSON.stringify(payload);
    return JSON.stringify({ app: 'MyLife', version: 1, exportedAt: new Date().toISOString(), checksum: await sha256(body), counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])), payload: body });
  }
  async function verifyBackup(text) {
    const issues = [];
    let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, issues: ['not_json'] }; }
    if (o.app !== 'MyLife' || !o.payload) return { ok: false, issues: ['not_mylife'] };
    if (await sha256(o.payload) !== o.checksum) issues.push('checksum');
    let p; try { p = JSON.parse(o.payload); } catch (e) { return { ok: false, issues: ['payload'] }; }
    for (const [k, n] of Object.entries(o.counts || {})) if (!p.data[k] || p.data[k].length !== n) issues.push('count:' + k);
    // relations: every referenced attachment exists, every transaction points to a real account
    const accIds = new Set((p.data.accounts || []).map(a => a.id));
    (p.data.transactions || []).forEach(t => { if (!accIds.has(t.accountId)) issues.push('orphan_tx:' + t.id); });
    const fileIds = new Set((p.data.files || []).map(f => f.id));
    (p.data.notes || []).forEach(n => (n.attachments || []).forEach(f => { if (!fileIds.has(f)) issues.push('orphan_att:' + f); }));
    (p.data.files || []).forEach(f => { if (!(p.blobs || {})[f.id]) issues.push('missing_blob:' + f.id); });
    return { ok: issues.length === 0, issues, counts: o.counts, exportedAt: o.exportedAt, parsed: p };
  }
  async function restore(S, parsed) {
    await clearAll();
    for (const s of Fin.STORES.concat(['users'])) { S[s] = parsed.data[s] || []; S[s].forEach(r => S.dirty.push([s, r.id])); }
    S.settings = parsed.settings || {}; Object.keys(S.settings).forEach(k => S.dirty.push(['settings', k]));
    S.removed = [];
    await flush(S);
    for (const [id, b] of Object.entries(parsed.blobs || {})) await putBlob(id, b64toBlob(b));
  }
  const b64toBlob = b => b642b(b.b64, b.type);

  return { open, loadAll, flush, putBlob, getBlob, delBlob, allBlobs, clearAll, exportAll, verifyBackup, restore, sha256 };
})();
