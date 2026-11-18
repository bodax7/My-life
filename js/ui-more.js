/* MyLife — More menu, global search, settings, categories, household, backup & restore */
(() => {
  const { h, t, S } = App;
  App.more = App.more || {};

  App.screens.more = (sub) => {
    if (sub && App.more[sub]) return h('div', {}, h('button', { class: 'btn sm ghost', onclick: () => App.go('more') }, (App.lang === 'ar' ? '→ ' : '← ') + t('back')), App.more[sub]());
    const item = (ic, k, fn, sk) => h('div', { class: 'card row tap', style: { margin: '8px 0' }, onclick: fn }, h('div', { class: 'avatar' }, ic), h('div', { class: 'grow' }, h('div', { class: 'title' }, t(k)), sk ? h('div', { class: 'sub' }, t(sk)) : null), h('span', { class: 'muted' }, App.lang === 'ar' ? '‹' : '›'));
    return h('div', {}, h('div', { class: 'card row', style: { margin: '4px 0 10px' } }, h('div', { class: 'avatar' }, App.user.role === 'admin' ? '👤' : '👥'), h('div', { class: 'grow' }, h('div', { class: 'title' }, App.user.name), h('div', { class: 'sub' }, App.user.role === 'admin' ? t('role_admin') : t('role_member'))), h('button', { class: 'btn sm', onclick: App.logout }, '🔒 ' + t('lock_switch'))),
      item('🛒', 'shopping', () => App.go('more', 'shopping'), 'shopping_sub'), item('📅', 'calendar', () => App.go('more', 'calendar'), 'calendar_sub'), item('🔍', 'search', () => App.go('more', 'search'), 'search_sub'), item('🧾', 'scan_receipt', () => App.scanReceipt(), 'scan_sub'),
      item('⚙️', 'settings', () => App.go('more', 'settings'), 'settings_sub'), item('💾', 'backup', () => App.go('more', 'backup'), 'backup_sub'), item('ℹ️', 'about', () => App.go('more', 'about'), 'about_sub'));
  };

  /* ---------- global search ---------- */
  const SF = { q: '', module: '', user: '', category: '', account: '', visibility: '', from: '', to: '' };
  App.more.search = () => {
    const res = (SF.q || SF.module || SF.user || SF.category || SF.account || SF.visibility || SF.from || SF.to) ? Life.search(S, App.user, SF.q, SF) : [];
    const q = App.input('search', { ph: t('search_everything'), value: SF.q }); q.addEventListener('keydown', e => { if (e.key === 'Enter') { SF.q = q.value; App.render(); } }); q.addEventListener('change', () => { SF.q = q.value; App.render(); });
    const mk = (k, opts, ph) => { const s = App.select([['', ph], ...opts], SF[k]); s.addEventListener('change', () => { SF[k] = s.value; App.render(); }); return s; };
    const from = App.input('date', { value: SF.from }), to = App.input('date', { value: SF.to }); from.addEventListener('change', () => { SF.from = from.value; App.render(); }); to.addEventListener('change', () => { SF.to = to.value; App.render(); });
    const MODS = ['accounts', 'transactions', 'categories', 'notes', 'tasks', 'shopping', 'attachments', 'events', 'debts', 'goals'];
    const open = r => { const m = r.module; if (m === 'accounts') App.go('money', 'accounts', { acc: r.id }); else if (m === 'transactions') App.txDetail(r.id); else if (m === 'notes') App.noteEditor(Fin.get(S, 'notes', r.id)); else if (m === 'tasks') App.taskSheet(Fin.get(S, 'tasks', r.id)); else if (m === 'shopping') App.go('more', 'shopping'); else if (m === 'attachments') App.viewFile(Fin.get(S, 'files', r.id)); else if (m === 'events') App.go('more', 'calendar'); else if (m === 'debts') App.go('money', 'debts'); else if (m === 'goals') App.go('money', 'goals'); else App.go('money', 'transactions'); };
    const groups = MODS.map(m => [m, res.filter(r => r.module === m)]).filter(([, l]) => l.length);
    return h('div', {}, q, h('div', { class: 'grid2', style: { marginTop: '8px' } }, mk('module', MODS.map(m => [m, t('mod_' + m)]), t('all_modules')), mk('visibility', [['private', t('private')], ['household', t('household')]], t('all_visibility'))),
      h('div', { class: 'grid2' }, mk('user', S.users.map(u => [u.id, u.name]), t('all_users')), mk('account', App.accountsFor(App.user).map(a => [a.id, a.name]), t('all_accounts'))), mk('category', S.categories.filter(c => c.kind !== 'system').map(c => [c.id, c.icon + ' ' + (App.lang === 'ar' ? c.name_ar : c.name_en)]), t('all_categories')),
      h('div', { class: 'grid2' }, App.field(t('from'), from), App.field(t('to'), to)), h('div', { class: 'small muted' }, t('search_privacy_note')),
      groups.length ? groups.map(([m, l]) => h('div', { class: 'card' }, h('h3', {}, t('mod_' + m) + ' (' + App.num(l.length) + ')'), l.slice(0, 30).map(r => h('div', { class: 'row tap', onclick: () => open(r) }, h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'sub' }, [r.sub, r.date ? App.date(String(r.date).slice(0, 10)) : ''].filter(Boolean).join(' · ')))))))
        : (SF.q || SF.module || SF.user || SF.category || SF.account || SF.visibility || SF.from || SF.to) ? App.empty(t('no_results')) : App.empty(t('search_hint')));
  };

  /* ---------- settings ---------- */
  function memberSheet(u) {
    const nm = App.input('text', { value: u ? u.name : '' }), pin = App.input('password', { mode: 'numeric', ph: u ? t('new_pin_optional') : t('ob_pin_ph'), maxlength: 8 }), role = App.seg([['member', t('role_member')], ['admin', t('role_admin')]], u ? u.role : 'member');
    App.sheet(u ? t('edit_member') : t('add_member'), s => h('div', {}, App.field(t('name'), nm), App.field(t('pin'), pin, t('ob_pin_hint')), u ? null : App.field(t('role'), role), u ? null : h('div', { class: 'banner' }, t('member_privacy_note')),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        if (!nm.value.trim()) return App.toast(t('err_NAME_REQUIRED'), 'err'); if (pin.value && !/^\d{4,8}$/.test(pin.value)) return App.toast(t('pin_bad'), 'err');
        const r = await App.act(async () => { if (u) { const nu = { ...u, name: nm.value.trim() }; if (pin.value) { nu.salt = Fin.uid(); nu.pinHash = await App.hashPin(pin.value, nu.salt); } Fin.put(S, 'users', nu); if (App.user.id === u.id) App.user = nu; }
          else { const salt = Fin.uid(); const nu = { id: Fin.uid(), name: nm.value.trim(), role: role.value, salt, pinHash: pin.value ? await App.hashPin(pin.value, salt) : null, createdAt: new Date().toISOString() }; Fin.put(S, 'users', nu); App.seedAccounts(nu); } }, t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')))));
  }
  function categorySheet(c) {
    const nmA = App.input('text', { value: c ? c.name_ar : '', ph: 'العربية' }), nmE = App.input('text', { value: c ? c.name_en : '', ph: 'English' }), ic = App.input('text', { value: c ? c.icon : '📦', maxlength: 4 }), co = App.input('text', { value: c ? c.color : '#64748b' }); co.type = 'color'; const kd = App.seg([['expense', t('tt_expense')], ['income', t('tt_income')]], c ? c.kind : 'expense');
    App.sheet(c ? t('edit_category') : t('add_category'), s => h('div', {}, c ? null : kd, App.field(t('name') + ' (AR)', nmA), App.field(t('name') + ' (EN)', nmE), App.field(t('icon'), ic), App.field(t('color'), co),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { if (!nmA.value.trim() && !nmE.value.trim()) return App.toast(t('err_NAME_REQUIRED'), 'err'); const r = await App.act(() => { const rec = c ? { ...c } : { id: 'cat_' + Fin.uid().slice(0, 8), key: null, kind: kd.value, system: false }; rec.name_ar = nmA.value.trim() || nmE.value.trim(); rec.name_en = nmE.value.trim() || nmA.value.trim(); rec.icon = ic.value || '📦'; rec.color = co.value; Fin.put(S, 'categories', rec); }, t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')),
        c && !c.system ? h('button', { class: 'btn danger', onclick: async () => { const used = S.transactions.some(x => x.categoryId === c.id) || S.budgets.some(b => b.categoryId === c.id); if (used) return App.toast(t('category_in_use'), 'err'); await App.act(() => Fin.remove(S, 'categories', c.id)); s.close(); App.render(); } }, t('delete')) : null)));
  }
  function pinSheet() {
    const old = App.input('password', { mode: 'numeric', maxlength: 8 }), nw = App.input('password', { mode: 'numeric', maxlength: 8 });
    App.sheet(t('change_pin'), s => h('div', {}, App.user.pinHash ? App.field(t('current_pin'), old) : null, App.field(t('new_pin_optional'), nw, t('ob_pin_hint')), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
      if (App.user.pinHash && await App.hashPin(old.value, App.user.salt) !== App.user.pinHash) return App.toast(t('pin_wrong'), 'err'); if (nw.value && !/^\d{4,8}$/.test(nw.value)) return App.toast(t('pin_bad'), 'err');
      const r = await App.act(async () => { const nu = { ...App.user }; nu.salt = Fin.uid(); nu.pinHash = nw.value ? await App.hashPin(nw.value, nu.salt) : null; Fin.put(S, 'users', nu); App.user = nu; }, t('saved')); if (r.ok) s.close(); } }, t('save')), h('button', { class: 'btn', onclick: s.close }, t('cancel')))));
  }
  App.more.settings = () => {
    const u = App.user; const prefs = App.get('notifPrefs_' + u.id, {}); const sw = (label, checked, on) => h('div', { class: 'switch' }, h('label', { style: { flex: 1 } }, label), h('input', { type: 'checkbox', checked, onchange: e => on(e.target.checked) }));
    const wsSel = App.select([[6, t('wd_sat')], [0, t('wd_sun')], [1, t('wd_mon')]], App.get('weekStart', 6)); wsSel.addEventListener('change', async () => { App.set('weekStart', Number(wsSel.value)); await DB.flush(S); });
    const savePref = async (k, v) => { const p = { ...App.get('notifPrefs_' + u.id, {}), [k]: v }; App.set('notifPrefs_' + u.id, p); await DB.flush(S); };
    return h('div', {},
      h('div', { class: 'card' }, h('h3', {}, t('appearance')), App.field(t('language'), App.seg([['ar', 'العربية'], ['en', 'English']], App.lang, async v => { App.lang = v; App.set('lang_' + u.id, v); App.set('lang', v); await DB.flush(S); App.render(); })),
        App.field(t('theme'), App.seg([['auto', t('theme_auto')], ['light', t('theme_light')], ['dark', t('theme_dark')]], App.get('theme', 'auto'), async v => { App.set('theme', v); await DB.flush(S); App.render(); })),
        App.field(t('week_starts'), wsSel)),
      h('div', { class: 'card' }, h('h3', {}, t('notifications')), ...['tasks', 'budgets', 'bills', 'debts', 'goals', 'events'].map(k => sw(t('np_' + k), prefs[k] !== false, v => savePref(k, v))),
        sw(t('push_when_hidden'), App.get('push_' + u.id, false), async v => { if (v && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { App.toast(t('push_denied'), 'err'); App.render(); return; } } App.set('push_' + u.id, v); await DB.flush(S); }), h('div', { class: 'small muted' }, t('push_limits'))),
      h('div', { class: 'card' }, h('h3', {}, t('insights')), sw(t('insights_enabled'), !App.get('insights_off_' + u.id, false), async v => { App.set('insights_off_' + u.id, !v); await DB.flush(S); }), h('div', { class: 'small muted' }, t('insights_note'))),
      h('div', { class: 'card' }, h('h3', {}, t('security')), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: pinSheet }, '🔑 ' + t('change_pin')), h('button', { class: 'btn', onclick: App.logout }, '🔒 ' + t('lock_switch')))),
      h('div', { class: 'card' }, h('h3', {}, t('household_members')), S.users.map(m => h('div', { class: 'row' }, h('div', { class: 'avatar' }, m.role === 'admin' ? '👤' : '👥'), h('div', { class: 'grow' }, h('div', { class: 'title' }, m.name), h('div', { class: 'sub' }, m.role === 'admin' ? t('role_admin') : t('role_member'))), Fin.isAdmin(u) || m.id === u.id ? h('button', { class: 'btn sm', onclick: () => memberSheet(m) }, t('edit')) : null)), Fin.isAdmin(u) ? h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => memberSheet() }, '+ ' + t('add_member'))) : null),
      h('div', { class: 'card' }, h('h3', {}, t('categories')), ['expense', 'income'].map(k => h('div', {}, h('div', { class: 'day' }, t('tt_' + k)), h('div', { class: 'cats' }, S.categories.filter(c => c.kind === k).map(c => h('button', { onclick: () => categorySheet(c) }, c.icon + ' ' + (App.lang === 'ar' ? c.name_ar : c.name_en)))))), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => categorySheet() }, '+ ' + t('add_category')))));
  };
  /* ---------- backup / restore / export ---------- */
  function exportMine() {
    const u = App.user; const accs = Fin.visibleAccounts(S, u);
    const data = { app: 'MyLife', kind: 'personal-export', exportedAt: new Date().toISOString(), user: u.name, accounts: accs, transactions: Fin.visibleTx(S, u), categories: S.categories, budgets: S.budgets.filter(b => b.scope === 'household' || b.ownerId === u.id), recurring: S.recurring.filter(r => Fin.canView(Fin.get(S, 'accounts', r.accountId), u)),
      goals: S.goals.filter(g => g.scope === 'household' || g.ownerId === u.id), debts: S.debts.filter(d => d.scope === 'household' || d.ownerId === u.id), notes: S.notes.filter(n => Life.canViewNote(n, u)), tasks: S.tasks.filter(x => Life.canViewTask(x, u)), shopLists: S.shopLists.filter(l => Life.canViewList(l, u)),
      shopItems: S.shopItems.filter(i => S.shopLists.some(l => l.id === i.listId && Life.canViewList(l, u))), events: S.events.filter(e => Life.canViewEvent(e, u)), files: S.files.filter(f => Life.canViewFile(S, f, u)) };
    App.download('mylife-my-data-' + App.today() + '.json', JSON.stringify(data, null, 1), 'application/json');
  }
  App.more.backup = () => {
    const last = App.get('lastBackup'); const isAdm = Fin.isAdmin(App.user); const out = h('div');
    return h('div', {},
      h('div', { class: 'banner' }, t('backup_warn_local')), last ? h('div', { class: 'small muted' }, t('last_backup') + ': ' + App.dateTime(last)) : h('div', { class: 'banner' }, t('never_backed_up')),
      h('div', { class: 'card' }, h('h3', {}, t('export')), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: exportMine }, '👤 ' + t('export_my_data')), h('button', { class: 'btn', onclick: () => App.exportTx(Fin.visibleTx(S, App.user), 'csv') }, 'CSV ' + t('transactions')), h('button', { class: 'btn', onclick: () => App.exportTx(Fin.visibleTx(S, App.user), 'xls') }, 'Excel')), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { App.go('money', 'reports'); setTimeout(() => window.print(), 400); } }, '🖨️ ' + t('print_pdf')),
        h('button', { class: 'btn', onclick: () => App.download('mylife-notes-tasks-' + App.today() + '.json', JSON.stringify({ notes: S.notes.filter(n => Life.canViewNote(n, App.user)), tasks: S.tasks.filter(x => Life.canViewTask(x, App.user)) }, null, 1), 'application/json') }, t('export_notes_tasks')))),
      isAdm ? h('div', { class: 'card' }, h('h3', {}, t('full_backup')), h('p', { class: 'small muted' }, t('full_backup_note')), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const txt = await DB.exportAll(S); const v = await DB.verifyBackup(txt); App.download('mylife-backup-' + App.today() + '.mylife', txt, 'application/json'); App.set('lastBackup', new Date().toISOString()); await DB.flush(S); App.toast(v.ok ? t('backup_created_verified') : t('backup_created_issues'), v.ok ? 'ok' : 'err'); App.render(); } }, '💾 ' + t('create_backup')))) : h('div', { class: 'banner' }, t('backup_admin_only')),
      isAdm ? h('div', { class: 'card' }, h('h3', {}, t('verify_restore')), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: async () => { const f = await App.pickFile('.mylife,.json,application/json'); if (!f) return; const v = await DB.verifyBackup(await f.text()); out.replaceChildren(h('div', { class: 'banner', style: v.ok ? { background: 'rgba(21,128,61,.15)', color: 'var(--income)' } : {} }, v.ok ? '✔ ' + t('backup_ok') + ' (' + App.dateTime(v.exportedAt) + ')' : '✖ ' + t('backup_bad') + ': ' + v.issues.slice(0, 5).join(', ')), v.counts ? h('div', { class: 'small muted' }, Object.entries(v.counts).filter(([, n]) => n).map(([k, n]) => k + ': ' + n).join(' · ')) : null); } }, '✔ ' + t('verify_file')),
        h('button', { class: 'btn danger', onclick: async () => { const f = await App.pickFile('.mylife,.json,application/json'); if (!f) return; const v = await DB.verifyBackup(await f.text()); if (!v.ok && !(v.parsed && v.issues.every(i => i.startsWith('missing_blob')))) return App.toast(t('backup_bad') + ': ' + v.issues.slice(0, 3).join(', '), 'err'); if (!(await App.confirm(t('confirm_restore'), { danger: true, ok: t('restore') }))) return; await DB.restore(S, v.parsed); sessionStorage.removeItem('mylife.user'); location.reload(); } }, '♻️ ' + t('restore_backup'))), out) : null,
      isAdm ? h('div', { class: 'card' }, h('h3', {}, t('danger_zone')), h('div', { class: 'btns' }, h('button', { class: 'btn danger', onclick: async () => { if (!(await App.confirm(t('confirm_wipe'), { danger: true, ok: t('delete_everything') }))) return; if (!(await App.confirm(t('confirm_wipe2'), { danger: true, ok: t('delete_everything') }))) return; await DB.clearAll(); sessionStorage.clear(); location.reload(); } }, '🗑️ ' + t('wipe_data')))) : null);
  };

  /* ---------- about / known limitations ---------- */
  App.more.about = () => h('div', {}, h('div', { class: 'card' }, h('h3', {}, 'MyLife'), h('p', {}, t('about_text'))),
    h('div', { class: 'card' }, h('h3', {}, t('known_limitations')), h('div', {}, ['lim_local', 'lim_privacy', 'lim_sync', 'lim_bg', 'lim_ocr', 'lim_storage', 'lim_ios'].map(k => h('p', { class: 'small', style: { whiteSpace: 'normal' } }, '• ' + t(k))))),
    h('div', { class: 'card' }, h('h3', {}, t('data_policy')), h('p', { class: 'small' }, t('data_policy_text'))));
})();
