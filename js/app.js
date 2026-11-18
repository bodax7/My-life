/* MyLife — application core: DOM helpers, state, shell, lock screen, onboarding. */
const App = (() => {
  const S = Fin.newState();
  const A = { S, user: null, lang: 'ar', route: { tab: 'home', sub: null, p: {} }, screens: {}, online: navigator.onLine };

  /* ---------- tiny DOM builder ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag); props = props || {};
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false || k === 'value') continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    if (props.value != null) el.value = props.value;
    return el;
  }
  A.h = h;
  A.t = (k, p) => I18N.t(A.lang, k, p);
  const t = A.t;

  /* ---------- settings / formatting ---------- */
  A.get = (k, d) => (k in S.settings ? S.settings[k] : d);
  A.set = (k, v) => { S.settings[k] = v; S.dirty.push(['settings', k]); };
  A.money = (m, cur) => h('bdi', { class: 'num money' }, Fin.fmtMoney(m, cur || Fin.BASE, A.lang));
  A.moneyTxt = (m, cur) => Fin.fmtMoney(m, cur || Fin.BASE, A.lang);
  A.locale = () => (A.lang === 'ar' ? 'ar-EG' : 'en-GB');
  A.date = d => { if (!d) return ''; try { return Fin.parseD(d).toLocaleDateString(A.locale(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
  A.dateTime = iso => { try { return new Date(iso).toLocaleString(A.locale(), { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
  A.monthName = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(A.locale(), { month: 'long', year: 'numeric' }); };
  A.num = n => Number(n).toLocaleString(A.locale());
  A.cat = id => Fin.get(S, 'categories', id);
  A.catName = id => { const c = A.cat(id); return c ? (A.lang === 'ar' ? c.name_ar : c.name_en) : t('none'); };
  A.catIcon = id => { const c = A.cat(id); return c ? c.icon : '📦'; };
  A.acc = id => Fin.get(S, 'accounts', id);
  A.accName = id => { const a = A.acc(id); return a ? a.name : '—'; };
  A.userName = id => { const u = S.users.find(x => x.id === id); return u ? u.name : '—'; };
  A.other = () => S.users.find(u => u.id !== (A.user && A.user.id));
  A.today = () => Fin.today();
  A.err = e => (e && e.code && I18N.has(A.lang, 'err_' + e.code)) ? t('err_' + e.code) : ((e && e.message) || String(e));

  /* ---------- toasts / sheets ---------- */
  A.toast = (msg, kind) => {
    const el = h('div', { class: 'toast ' + (kind || '') }, msg); document.getElementById('toasts').append(el);
    setTimeout(() => el.remove(), kind === 'err' ? 4500 : 2200);
  };
  A.sheet = (title, build) => {
    const scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) api.close(); } });
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'handle' }), title ? h('h2', {}, title) : null);
    const api = { el: box, close: () => scrim.remove() };
    box.append(build(api)); scrim.append(box); document.body.append(scrim); return api;
  };
  A.confirm = (text, opts) => new Promise(res => {
    opts = opts || {};
    A.sheet(opts.title || t('confirm'), s => h('div', {}, h('p', {}, text),
      h('div', { class: 'btns' },
        h('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), onclick: () => { s.close(); res(true); } }, opts.ok || t('yes')),
        h('button', { class: 'btn', onclick: () => { s.close(); res(false); } }, t('cancel')))));
  });
  // run a mutation, persist atomically, report errors in the user's language; on failure reload from disk (no partial state)
  A.act = async (fn, okMsg) => {
    try { const r = await fn(); await DB.flush(S); if (okMsg) A.toast(okMsg, 'ok'); return { ok: true, value: r }; }
    catch (e) { console.warn(e); A.toast(A.err(e), 'err'); try { S.dirty = []; S.removed = []; await DB.loadAll(S); } catch (_) { } return { ok: false, error: e }; }
  };

  /* ---------- form helpers ---------- */
  A.field = (label, control, hint) => h('div', { class: 'field' }, label ? h('label', {}, label) : null, control, hint ? h('div', { class: 'small muted' }, hint) : null);
  A.input = (type, o) => { o = o || {}; const e = h('input', { type: type || 'text', placeholder: o.ph || '', inputmode: o.mode, autocomplete: 'off', class: o.class || '', min: o.min, max: o.max, step: o.step, maxlength: o.maxlength }); if (o.value != null) e.value = o.value; return e; };
  A.moneyInput = (minor, o) => { const e = A.input('text', { mode: 'decimal', ph: '0.00', class: (o && o.big) ? 'amount-input' : '', ...(o || {}) }); if (minor != null && minor !== '') e.value = (minor / 100).toFixed(2).replace(/\.00$/, ''); return e; };
  A.select = (opts, value) => { const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v }, l))); if (value != null) s.value = value; return s; };
  A.seg = (opts, value, onchange) => {
    const box = h('div', { class: 'seg' }); box.value = value;
    opts.forEach(([v, l]) => { const b = h('button', { type: 'button', class: v === box.value ? 'on' : '', onclick: () => { box.value = v; [...box.children].forEach(c => c.classList.toggle('on', c === b)); onchange && onchange(v); } }, l); box.append(b); });
    return box;
  };
  A.chips = (opts, value, onpick) => h('div', { class: 'chips' }, opts.map(([v, l]) => h('button', { class: 'chip' + (v === value ? ' on' : ''), onclick: () => onpick(v) }, l)));
  A.catPicker = (kind, value) => {
    const cats = S.categories.filter(c => c.kind === kind); const recent = A.get('recentCats_' + kind, []);
    cats.sort((a, b) => { const ia = recent.indexOf(a.id), ib = recent.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    const box = h('div', { class: 'cats' }); box.value = value || (cats[0] && cats[0].id);
    cats.forEach(c => { const b = h('button', { type: 'button', class: c.id === box.value ? 'on' : '', onclick: () => { box.value = c.id; [...box.children].forEach(x => x.classList.toggle('on', x === b)); } }, c.icon + ' ' + (A.lang === 'ar' ? c.name_ar : c.name_en)); box.append(b); });
    return box;
  };
  A.empty = (txt) => h('div', { class: 'empty' }, txt);
  A.progress = (pct, level, planned) => h('div', { class: 'bar' }, h('i', { class: level || '', style: { width: Math.min(100, Math.max(0, pct)) + '%' } }), planned != null ? h('s', { style: { insetInlineStart: planned + '%' } }) : null);
  A.accountsFor = (user, writableOnly) => S.accounts.filter(a => a.active !== false && (writableOnly ? Fin.canWrite(a, user) : Fin.canView(a, user)));
  A.accOptions = (writableOnly) => A.accountsFor(A.user, writableOnly).map(a => [a.id, a.name + ' (' + a.currency + ')' + (a.visibility === 'household' ? ' 🏠' : ' 🔒')]);

  /* ---------- files / images ---------- */
  A.compressImage = (file, max, q) => new Promise(res => {
    if (!/^image\/(jpeg|png|webp)/.test(file.type)) return res(file);
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      max = max || 1600; const sc = Math.min(1, max / Math.max(img.width, img.height));
      if (sc === 1 && file.size < 400000) { URL.revokeObjectURL(url); return res(file); }
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); res(b && b.size < file.size ? b : file); }, 'image/jpeg', q || 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); }; img.src = url;
  });
  const urlCache = {};
  A.blobURL = async id => { if (urlCache[id]) return urlCache[id]; const b = await DB.getBlob(id); if (!b) return null; return (urlCache[id] = URL.createObjectURL(b)); };
  // saves a picked file as an attachment of `parent` ({kind,id}); returns the file record
  A.saveAttachment = async (file, parent, extra) => {
    const blob = file.type && file.type.startsWith('image/') ? await A.compressImage(file) : file;
    const rec = Life.addFile(S, A.user, { name: file.name || 'file', mime: blob.type || file.type, size: blob.size, parent, kind: (blob.type || '').startsWith('image/') ? 'image' : (blob.type || '').startsWith('audio/') ? 'audio' : 'file', ...(extra || {}) });
    await DB.putBlob(rec.id, blob); return rec;
  };
  A.pickFile = (accept, capture) => new Promise(res => {
    const i = h('input', { type: 'file', accept: accept || '*/*', capture: capture || null, style: { display: 'none' } });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); }); document.body.append(i); i.click();
  });
  A.viewFile = async rec => {
    const url = await A.blobURL(rec.id); if (!url) return A.toast(t('file_missing'), 'err');
    A.sheet(rec.name, s => h('div', {},
      rec.kind === 'image' ? h('img', { src: url, style: { maxWidth: '100%', borderRadius: '12px' } }) : rec.kind === 'audio' ? h('audio', { controls: true, src: url, style: { width: '100%' } }) : h('p', { class: 'muted' }, rec.mime || ''),
      h('div', { class: 'btns' }, h('a', { class: 'btn', href: url, download: rec.name, style: { textAlign: 'center', lineHeight: '48px', textDecoration: 'none' } }, t('download')), h('button', { class: 'btn', onclick: s.close }, t('close')))));
  };
  A.download = (name, data, mime) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' }); const u = URL.createObjectURL(blob);
    const a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  };

  /* ---------- navigation / shell ---------- */
  const TABS = [['home', '🏠', 'nav_home'], ['money', '💰', 'nav_money'], ['notes', '📝', 'nav_notes'], ['tasks', '✅', 'nav_tasks'], ['more', '☰', 'nav_more']];
  A.go = (tab, sub, p) => { A.route = { tab, sub: sub || null, p: p || {} }; A.render(); window.scrollTo(0, 0); };
  A.unread = () => S.notifs.filter(n => n.userId === (A.user && A.user.id) && !n.read).length;

  A.quickActions = () => [
    ['💸', 'qa_expense', () => A.txSheet({ type: 'expense' })], ['💵', 'qa_income', () => A.txSheet({ type: 'income' })], ['🔄', 'qa_transfer', () => A.txSheet({ type: 'transfer' })], ['🧾', 'qa_scan', () => A.scanReceipt()],
    ['📝', 'qa_note', () => A.noteEditor()], ['🎙️', 'qa_voice', () => A.voiceSheet()], ['✅', 'qa_task', () => A.taskSheet()], ['🛒', 'qa_shop', () => A.shopQuickAdd()],
  ];
  A.quickMenu = () => A.sheet(t('quick_actions'), s => h('div', { class: 'qa' }, A.quickActions().map(([ic, k, fn]) => h('button', { onclick: () => { s.close(); fn(); } }, h('span', { class: 'ic' }, ic), t(k)))));

  A.render = () => {
    const root = document.getElementById('app'); const y = window.scrollY;
    document.documentElement.lang = A.lang; document.documentElement.dir = A.lang === 'ar' ? 'rtl' : 'ltr';
    const th = A.get('theme', 'auto'); if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
    root.replaceChildren();
    if (!S.users.length) return root.append(A.onboarding());
    if (!A.user) return root.append(A.lockScreen());
    const titleKey = { home: 'app_dashboard', money: 'nav_money', notes: 'nav_notes', tasks: 'nav_tasks', more: 'nav_more' }[A.route.tab];
    const un = A.unread();
    root.append(
      h('header', { class: 'top' }, h('h1', {}, t(titleKey)),
        h('span', { class: 'badge ' + (A.online ? 'ok' : 'warn'), title: t('sync_status') }, A.online ? t('online_saved') : t('offline_saved')),
        h('button', { class: 'iconbtn', 'aria-label': t('search'), onclick: () => A.go('more', 'search') }, '🔍'),
        h('button', { class: 'iconbtn', 'aria-label': t('notifications'), onclick: () => A.notifSheet() }, '🔔', un ? h('span', { class: 'dot' }, un) : null)),
      h('main', {}, (A.screens[A.route.tab] || (() => h('div')))(A.route.sub, A.route.p)),
      h('button', { class: 'fab', 'aria-label': t('quick_actions'), onclick: A.quickMenu }, '+'),
      h('nav', { class: 'bottom' }, TABS.map(([k, ic, lk]) => h('button', { class: A.route.tab === k ? 'on' : '', onclick: () => A.go(k) }, h('span', { class: 'ic' }, ic), t(lk)))));
    window.scrollTo(0, y);
  };

  /* ---------- notifications ---------- */
  A.refreshNotifs = async () => {
    if (!A.user) return;
    const fresh = Life.computeNotifs(S, A.user, A.today(), A.get('notifPrefs_' + A.user.id, {}));
    if (!fresh.length) return;
    fresh.forEach(n => Fin.put(S, 'notifs', n)); await DB.flush(S);
    if ('Notification' in window && Notification.permission === 'granted' && A.get('push_' + A.user.id, false) && document.hidden) {
      fresh.slice(0, 3).forEach(n => { try { navigator.serviceWorker.ready.then(r => r.showNotification('MyLife', { body: A.notifText(n), icon: 'icons/icon-192.png', tag: n.key })); } catch (e) { } });
    }
    if (document.visibilityState === 'visible') A.render();
  };
  A.notifText = n => { const x = n.text; return t(x.k, { title: x.title || '', date: x.date ? A.date(x.date) : '', time: x.time || '', cat: x.cat ? A.catName(x.cat) : '', pct: x.pct || '' }); };
  A.notifSheet = () => {
    const mine = S.notifs.filter(n => n.userId === A.user.id).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 60);
    mine.filter(n => !n.read).forEach(n => Fin.put(S, 'notifs', { ...n, read: true })); DB.flush(S);
    A.sheet(t('notifications'), s => h('div', {}, mine.length ? mine.map(n => h('div', { class: 'row' }, h('div', { class: 'avatar' }, { tasks: '✅', budgets: '📊', bills: '🔁', debts: '🤝', goals: '🎯', events: '📅' }[n.type] || '🔔'), h('div', { class: 'grow' }, h('div', { class: 'title', style: { whiteSpace: 'normal' } }, A.notifText(n)), h('div', { class: 'sub' }, A.dateTime(n.at))))) : A.empty(t('no_notifs')),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { s.close(); A.go('more', 'settings'); } }, t('notif_settings')), h('button', { class: 'btn', onclick: s.close }, t('close')))));
    setTimeout(A.render, 0);
  };

  /* ---------- auth: onboarding & lock ---------- */
  A.hashPin = async (pin, salt) => DB.sha256(salt + ':' + pin);
  A.login = async u => { A.user = u; A.lang = A.get('lang_' + u.id, A.get('lang', 'ar')); sessionStorage.setItem('mylife.user', u.id); A.route = { tab: 'home', sub: null, p: {} }; A.render(); A.refreshNotifs(); };
  A.logout = () => { A.user = null; sessionStorage.removeItem('mylife.user'); A.render(); };

  A.onboarding = () => {
    A.lang = A.get('lang', 'ar');
    const name = A.input('text', { ph: t('ob_name_ph') }), pin = A.input('password', { mode: 'numeric', ph: t('ob_pin_ph'), maxlength: 8 });
    const langSeg = A.seg([['ar', 'العربية'], ['en', 'English']], A.lang, v => { A.set('lang', v); A.lang = v; DB.flush(S); A.render(); });
    return h('div', { class: 'lock' }, h('div', { class: 'box' },
      h('h1', { style: { textAlign: 'center', margin: '0 0 4px' } }, '🌿 MyLife'), h('p', { class: 'muted', style: { textAlign: 'center' } }, t('ob_welcome')), langSeg,
      A.field(t('ob_name'), name), A.field(t('ob_pin'), pin, t('ob_pin_hint')),
      h('div', { class: 'banner' }, t('ob_local_note')),
      h('button', { class: 'btn primary', style: { width: '100%' }, onclick: async () => {
        const nm = name.value.trim(); if (!nm) return A.toast(t('err_NAME_REQUIRED'), 'err');
        if (pin.value && !/^\d{4,8}$/.test(pin.value)) return A.toast(t('pin_bad'), 'err');
        await A.act(async () => {
          const salt = Fin.uid(); const u = { id: Fin.uid(), name: nm, role: 'admin', salt, pinHash: pin.value ? await A.hashPin(pin.value, salt) : null, createdAt: new Date().toISOString() };
          Fin.put(S, 'users', u); Fin.seedCategories(S); A.seedAccounts(u); A.set('lang', A.lang); A.set('created', new Date().toISOString());
          A.user = u; sessionStorage.setItem('mylife.user', u.id);
        });
        if (A.user) { navigator.storage && navigator.storage.persist && navigator.storage.persist(); A.render(); }
      } }, t('ob_start')),
      h('button', { class: 'btn ghost', style: { width: '100%', marginTop: '10px' }, onclick: async () => {
        const f = await A.pickFile('.mylife,.json,application/json'); if (!f) return;
        const v = await DB.verifyBackup(await f.text());
        if (!v.parsed || !(v.ok || v.issues.every(i => i.startsWith('missing_blob')))) return A.toast(t('backup_bad') + ': ' + (v.issues || []).slice(0, 3).join(', '), 'err');
        await DB.restore(S, v.parsed); sessionStorage.removeItem('mylife.user'); location.reload();
      } }, '♻️ ' + t('restore_from_backup'))));
  };
  A.seedAccounts = u => {
    const mk = (name, type, vis) => Fin.createAccount(S, u, { name, type, visibility: vis, currency: 'EGP' });
    mk(t('acc_personal_cash'), 'cash', 'private');
    if (u.role === 'admin') mk(t('acc_household_cash'), 'cash', 'household');
    mk(t('acc_bank'), 'bank', 'private'); mk(t('acc_wallet'), 'wallet', 'private'); mk(t('acc_savings'), 'savings', 'private');
  };
  A.lockScreen = () => {
    const sel = { id: null };
    const box = h('div', { class: 'box' });
    const draw = () => {
      box.replaceChildren(h('h1', { style: { textAlign: 'center' } }, '🌿 MyLife'), h('p', { class: 'muted', style: { textAlign: 'center' } }, t('lock_who')));
      if (!sel.id) S.users.forEach(u => box.append(h('button', { class: 'card row tap', style: { width: '100%', border: 0, textAlign: 'start' }, onclick: async () => { if (!u.pinHash) return A.login(u); sel.id = u.id; draw(); } }, h('div', { class: 'avatar' }, u.role === 'admin' ? '👤' : '👥'), h('div', { class: 'grow' }, h('div', { class: 'title' }, u.name), h('div', { class: 'sub' }, u.role === 'admin' ? t('role_admin') : t('role_member'))), u.pinHash ? '🔒' : '')));
      else {
        const u = S.users.find(x => x.id === sel.id); const pin = A.input('password', { mode: 'numeric', ph: 'PIN', maxlength: 8 });
        const go = async () => { if (await A.hashPin(pin.value, u.salt) === u.pinHash) A.login(u); else { A.toast(t('pin_wrong'), 'err'); pin.value = ''; } };
        pin.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        box.append(h('div', { class: 'card' }, h('b', {}, u.name), A.field(t('pin'), pin), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: go }, t('unlock')), h('button', { class: 'btn', onclick: () => { sel.id = null; draw(); } }, t('back')))));
        setTimeout(() => pin.focus(), 50);
      }
    };
    draw(); return h('div', { class: 'lock' }, box);
  };

  window.addEventListener('online', () => { A.online = true; A.user && A.render(); });
  window.addEventListener('offline', () => { A.online = false; A.user && A.render(); });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (A.user && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && A.user.pinHash) { A.logout(); }
    else if (A.user) A.refreshNotifs();
  });

  return A;
})();
