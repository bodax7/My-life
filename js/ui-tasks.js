/* MyLife — tasks, shopping lists, calendar */
(() => {
  const { h, t, S } = App;
  App.more = App.more || {};
  const parseM = s => Fin.parseMoney(s);
  const TCATS = ['personal', 'household', 'shopping', 'financial', 'work', 'other'];

  /* ---------- tasks ---------- */
  const TV = { view: 'today' };
  const prioBadge = p => h('span', { class: 'badge ' + (p === 'urgent' ? 'bad' : p === 'high' ? 'warn' : '') }, t('p_' + p));

  App.taskSheet = (task, preset) => {
    const ex = task && task.id ? task : null; const id = ex ? ex.id : Fin.uid(); const added = []; const atts = ex ? [...(ex.attachments || [])] : []; preset = preset || {};
    const ti = App.input('text', { ph: t('task_title'), value: ex ? ex.title : (preset.title || '') }), de = h('textarea', { placeholder: t('description') }); de.value = ex ? ex.description : '';
    const du = App.input('date', { value: ex ? ex.due || '' : (preset.due || '') }), tm = App.input('time', { value: ex ? ex.time || '' : '' });
    const pr = App.select(['low', 'medium', 'high', 'urgent'].map(p => [p, t('p_' + p)]), ex ? ex.priority : 'medium'), stt = App.select(['todo', 'doing', 'done', 'cancelled'].map(p => [p, t('s_' + p)]), ex ? ex.status : 'todo'), cat = App.select(TCATS.map(c => [c, t('tc_' + c)]), ex ? ex.category : 'personal');
    const sc = App.seg([['personal', '🔒 ' + t('personal')], ['household', '🏠 ' + t('household')]], ex ? ex.scope : (preset.scope || 'personal')); const as = App.select(S.users.map(u => [u.id, u.name]), ex ? ex.assignedTo || App.user.id : App.user.id);
    const nt = App.select([['', t('none')], ...Life.listNotes(S, App.user, {}).map(n => [n.id, n.title || t('untitled')])], ex ? ex.noteId || '' : ''); const rp = App.select([['', t('no_repeat')], ['daily', t('f_daily')], ['weekly', t('f_weekly')], ['monthly', t('f_monthly')], ['yearly', t('f_yearly')]], ex ? ex.repeat || '' : '');
    const attBox = h('div', { class: 'chips' }); const drawAtt = () => attBox.replaceChildren(...atts.map(fid => { const f = Fin.get(S, 'files', fid); return f ? h('button', { class: 'chip', onclick: () => App.viewFile(f) }, '📎 ' + f.name) : null; }),
      h('button', { class: 'chip', onclick: async () => { const f = await App.pickFile('*/*'); if (!f) return; const rec = await App.saveAttachment(f, { kind: 'task', id }); added.push(rec.id); atts.push(rec.id); drawAtt(); } }, '+ 📎 ' + t('attach_file'))); drawAtt();
    App.sheet(ex ? t('edit_task') : t('add_task'), s => h('div', {}, App.field(t('task_title'), ti), App.field(t('description'), de), h('div', { class: 'grid2' }, App.field(t('due_date'), du), App.field(t('due_time'), tm)), h('div', { class: 'grid2' }, App.field(t('priority'), pr), App.field(t('status'), stt)),
      App.field(t('category'), cat), App.field(t('scope'), sc), App.field(t('assigned_to'), as), App.field(t('related_note'), nt), App.field(t('repeat'), rp), attBox,
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        const r = await App.act(() => Life.saveTask(S, App.user, { id, title: ti.value, description: de.value, due: du.value || null, time: tm.value || null, priority: pr.value, status: stt.value, category: cat.value, scope: sc.value, assignedTo: as.value, noteId: nt.value || null, repeat: rp.value || null, attachments: atts }), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')),
        ex ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete'), { danger: true, ok: t('delete') })) { await App.act(() => { Fin.remove(S, 'tasks', ex.id); }); s.close(); App.render(); } } }, t('delete')) : null,
        h('button', { class: 'btn', onclick: async () => { if (!ex) { for (const f of added) { Fin.remove(S, 'files', f); await DB.delBlob(f); } await DB.flush(S); } s.close(); } }, t('close')))));
  };

  App.screens.tasks = () => {
    const other = App.other(); const views = [['today', t('tv_today')], ['upcoming', t('tv_upcoming')], ['overdue', t('tv_overdue')], ['completed', t('tv_completed')], ['mine', t('tv_mine')], ['household', t('tv_household')], ['assignedMe', t('tv_assigned_me')], ...(other ? [['assignedOther', t('tv_assigned_to', { name: other.name })]] : [])];
    const list = Life.taskView(S, App.user, TV.view, App.today());
    const row = x => h('div', { class: 'row' }, h('button', { class: 'iconbtn', style: { width: '34px', height: '34px', fontSize: '16px' }, 'aria-label': t('s_done'), onclick: async () => { await App.act(() => Life.saveTask(S, App.user, { id: x.id, status: x.status === 'done' ? 'todo' : 'done' })); App.render(); } }, x.status === 'done' ? '✅' : '⚪'),
      h('div', { class: 'grow tap', onclick: () => App.taskSheet(x) }, h('div', { class: 'title', style: x.status === 'done' ? { textDecoration: 'line-through', opacity: .6 } : null }, x.title), h('div', { class: 'sub' }, [x.due ? App.date(x.due) + (x.time ? ' ' + x.time : '') : t('no_due'), x.scope === 'household' ? '🏠' : '🔒', x.assignedTo ? '👤 ' + App.userName(x.assignedTo) : '', (x.attachments || []).length ? '📎' : '', x.repeat ? '🔁' : ''].filter(Boolean).join(' · '))), prioBadge(x.priority));
    return h('div', {}, App.chips(views, TV.view, v => { TV.view = v; App.render(); }), h('div', { class: 'card' }, list.length ? list.map(row) : App.empty(t('no_tasks'))), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => App.taskSheet() }, '+ ' + t('add_task'))));
  };

  /* ---------- shopping ---------- */
  const SH = { list: null };
  function listSheet(l) {
    const nm = App.input('text', { value: l ? l.name : '', ph: t('list_name') }); const sc = App.seg([['household', '🏠 ' + t('household')], ['personal', '🔒 ' + t('personal')]], l ? l.scope : 'household'); const others = S.users.filter(u => u.id !== App.user.id); let shared = l ? [...(l.sharedWith || [])] : [];
    const shareBox = h('div', { class: 'cats' }, others.map(u => { const b = h('button', { type: 'button', class: shared.includes(u.id) ? 'on' : '', onclick: () => { shared = shared.includes(u.id) ? shared.filter(x => x !== u.id) : [...shared, u.id]; b.classList.toggle('on'); } }, u.name); return b; }));
    App.sheet(l ? t('edit_list') : t('add_list'), s => h('div', {}, App.field(t('name'), nm), l ? null : App.field(t('scope'), sc), others.length ? App.field(t('share_with'), shareBox, t('share_list_hint')) : null,
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { if (!nm.value.trim()) return App.toast(t('err_NAME_REQUIRED'), 'err'); const r = await App.act(() => Life.saveList(S, App.user, { id: l && l.id, name: nm.value.trim(), scope: l ? l.scope : sc.value, ownerId: l && l.ownerId, sharedWith: shared }), t('saved')); if (r.ok) { SH.list = r.value.id; s.close(); App.render(); } } }, t('save')),
        l && (l.ownerId === App.user.id || Fin.isAdmin(App.user)) ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete'), { danger: true, ok: t('delete') })) { await App.act(() => { S.shopItems.filter(i => i.listId === l.id).forEach(i => Fin.remove(S, 'shopItems', i.id)); Fin.remove(S, 'shopLists', l.id); }); SH.list = null; s.close(); App.render(); } } }, t('delete')) : null)));
  }
  function itemSheet(it, listId) {
    const nm = App.input('text', { value: it ? it.name : '', ph: t('item_name') }), q = App.input('number', { value: it ? it.qty : 1, step: 'any', min: 0 }), un = App.input('text', { value: it ? it.unit : '', ph: t('unit_ph') }), ep = App.moneyInput(it ? it.estPrice : null), ap = App.moneyInput(it ? it.actualPrice : null), ct = App.input('text', { value: it ? it.category : '', ph: t('category') }), as = App.select([['', t('none')], ...S.users.map(u => [u.id, u.name])], it ? it.assignedTo || '' : ''), no = App.input('text', { value: it ? it.notes : '', ph: t('notes') }); let photo = it ? it.photo : null;
    const photoBox = h('div', { class: 'chips' }); const dp = () => photoBox.replaceChildren(h('button', { class: 'chip', onclick: async () => { const f = await App.pickFile('image/*', 'environment'); if (!f) return; const rec = await App.saveAttachment(f, null); photo = rec.id; dp(); } }, '📷 ' + (photo ? t('change_photo') : t('add_photo'))), photo ? h('button', { class: 'chip', onclick: () => App.viewFile(Fin.get(S, 'files', photo)) }, '🖼️ ' + t('view')) : null); dp();
    App.sheet(it ? t('edit_item') : t('add_item'), s => h('div', {}, App.field(t('item_name'), nm), h('div', { class: 'grid2' }, App.field(t('quantity'), q), App.field(t('unit'), un)), h('div', { class: 'grid2' }, App.field(t('estimated_price'), ep), App.field(t('actual_price'), ap)), App.field(t('category'), ct), App.field(t('assigned_to'), as), App.field(t('notes'), no), photoBox,
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const r = await App.act(() => Life.saveItem(S, App.user, { id: it && it.id, listId: it ? it.listId : listId, name: nm.value, qty: Number(q.value) || 1, unit: un.value, estPrice: ep.value ? parseM(ep.value) : 0, actualPrice: ap.value ? parseM(ap.value) : 0, category: ct.value, assignedTo: as.value || null, notes: no.value, photo, purchased: it ? it.purchased : false }), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')),
        it ? h('button', { class: 'btn danger', onclick: async () => { await App.act(() => Fin.remove(S, 'shopItems', it.id)); s.close(); App.render(); } }, t('delete')) : null)));
  }
  function purchaseSheet(it) { // offer (never force) a household expense; recorded only once
    const writable = App.accountsFor(App.user, true); const ap = App.moneyInput(it.actualPrice || it.estPrice || null, { big: true }); const acc = App.select(writable.map(a => [a.id, a.name + (a.visibility === 'household' ? ' 🏠' : ' 🔒')]), (writable.find(a => a.visibility === 'household') || writable[0] || {}).id);
    const cat = App.select(S.categories.filter(c => c.kind === 'expense').map(c => [c.id, c.icon + ' ' + (App.lang === 'ar' ? c.name_ar : c.name_en)]), 'cat_groceries');
    const already = it.expenseTxId && Fin.get(S, 'transactions', it.expenseTxId) && !Fin.get(S, 'transactions', it.expenseTxId).deleted;
    App.sheet(t('mark_purchased') + ': ' + it.name, s => h('div', {}, already ? h('div', { class: 'banner' }, t('expense_already_recorded')) : h('div', {}, h('p', { class: 'muted' }, t('record_expense_q')), h('div', { class: 'field' }, ap), App.field(t('account'), acc), App.field(t('category'), cat)),
      h('div', { class: 'btns' }, !already && writable.length ? h('button', { class: 'btn primary', onclick: async () => { const m = parseM(ap.value); if (!m) return App.toast(t('err_BAD_AMOUNT'), 'err'); const r = await App.act(() => { Life.saveItem(S, App.user, { ...it, listId: it.listId, actualPrice: m, purchased: true }); Fin.recordItemExpense(S, App.user, it.id, acc.value, cat.value); }, t('recorded')); if (r.ok) { s.close(); App.render(); } } }, t('record_expense')) : null,
        h('button', { class: 'btn', onclick: async () => { await App.act(() => Life.saveItem(S, App.user, { ...it, purchased: true })); s.close(); App.render(); } }, already ? t('ok') : t('without_expense')), h('button', { class: 'btn ghost', onclick: s.close }, t('cancel')))));
  }
  App.shopQuickAdd = () => {
    let lists = S.shopLists.filter(l => Life.canViewList(l, App.user));
    if (!lists.length) { Life.saveList(S, App.user, { name: t('list_groceries'), scope: 'household' }); lists = S.shopLists.filter(l => Life.canViewList(l, App.user)); DB.flush(S); }
    const ls = App.select(lists.map(l => [l.id, l.name]), SH.list && lists.some(l => l.id === SH.list) ? SH.list : lists[0].id), nm = App.input('text', { ph: t('item_name') }), q = App.input('number', { value: 1, min: 0, step: 'any' });
    App.sheet(t('add_item'), s => { const add = async (keep) => { const r = await App.act(() => Life.saveItem(S, App.user, { listId: ls.value, name: nm.value, qty: Number(q.value) || 1 }), t('saved')); if (r.ok) { if (keep) { nm.value = ''; nm.focus(); } else s.close(); App.render(); } }; nm.addEventListener('keydown', e => { if (e.key === 'Enter') add(true); }); setTimeout(() => nm.focus(), 80);
      return h('div', {}, App.field(t('list'), ls), App.field(t('item_name'), nm), App.field(t('quantity'), q), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => add(false) }, t('add')), h('button', { class: 'btn', onclick: () => add(true) }, t('add_another')))); });
  };
  App.more.shopping = () => {
    const lists = S.shopLists.filter(l => Life.canViewList(l, App.user)); if (!SH.list || !lists.some(l => l.id === SH.list)) SH.list = lists[0] && lists[0].id;
    const cur = lists.find(l => l.id === SH.list); const items = cur ? S.shopItems.filter(i => i.listId === cur.id) : [];
    const pend = items.filter(i => !i.purchased), done = items.filter(i => i.purchased);
    const est = pend.reduce((s, i) => s + (i.estPrice || 0) * (i.qty || 1), 0); const act = done.reduce((s, i) => s + (i.actualPrice || 0), 0);
    const row = i => h('div', { class: 'row' }, h('button', { class: 'iconbtn', style: { width: '34px', height: '34px', fontSize: '16px' }, onclick: async () => { if (!i.purchased) purchaseSheet(i); else { await App.act(() => Life.saveItem(S, App.user, { ...i, purchased: false })); App.render(); } } }, i.purchased ? '✅' : '⚪'),
      h('div', { class: 'grow tap', onclick: () => itemSheet(i) }, h('div', { class: 'title', style: i.purchased ? { textDecoration: 'line-through', opacity: .6 } : null }, i.name + (i.qty && i.qty !== 1 ? ' × ' + App.num(i.qty) + (i.unit ? ' ' + i.unit : '') : (i.unit ? ' ' + i.unit : ''))), h('div', { class: 'sub' }, [i.assignedTo ? '👤 ' + App.userName(i.assignedTo) : '', i.estPrice ? '≈ ' + App.moneyTxt(i.estPrice) : '', i.actualPrice ? '✔ ' + App.moneyTxt(i.actualPrice) : '', i.expenseTxId ? '💱' : '', i.photo ? '📷' : '', i.notes].filter(Boolean).join(' · '))));
    return h('div', {}, App.chips(lists.map(l => [l.id, (l.scope === 'household' ? '🏠 ' : '🔒 ') + l.name]), SH.list, v => { SH.list = v; App.render(); }),
      cur ? h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'stat' }, h('small', {}, t('estimated_remaining')), h('b', {}, App.money(est))), h('div', { class: 'stat' }, h('small', {}, t('spent_so_far')), h('b', {}, App.money(act)))),
        h('div', { class: 'card' }, h('h3', {}, t('pending') + ' (' + App.num(pend.length) + ')'), pend.length ? pend.map(row) : App.empty(t('nothing_pending'))), done.length ? h('div', { class: 'card' }, h('h3', {}, t('purchased') + ' (' + App.num(done.length) + ')'), done.map(row)) : null,
        h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => itemSheet(null, cur.id) }, '+ ' + t('add_item')), h('button', { class: 'btn', onclick: () => listSheet(cur) }, '⚙️ ' + t('edit_list')))) : App.empty(t('no_lists')),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => listSheet() }, '+ ' + t('add_list'))));
  };

  /* ---------- calendar ---------- */
  const CAL = { view: 'month', date: null, sel: null };
  function eventSheet(e, preset) {
    const ex = e && e.id && e.src === 'event' ? S.events.find(x => x.id === e.id) : null; preset = preset || {};
    const ti = App.input('text', { value: ex ? ex.title : '', ph: t('event_title') }), da = App.input('date', { value: ex ? ex.date : (preset.date || CAL.sel || App.today()) }), tm = App.input('time', { value: ex ? ex.time : '' }), et = App.input('time', { value: ex ? ex.endTime : '' }); const sc = App.seg([['personal', '🔒 ' + t('personal')], ['household', '🏠 ' + t('household')]], ex ? ex.scope : 'personal');
    const as = App.select([['', t('none')], ...S.users.map(u => [u.id, u.name])], ex ? ex.assignedTo || '' : ''), kd = App.select([['event', t('ek_event')], ['appointment', t('ek_appointment')], ['reminder', t('ek_reminder')]], ex ? ex.kind : 'event'); const rp = App.select([['', t('no_repeat')], ['daily', t('f_daily')], ['weekly', t('f_weekly')], ['monthly', t('f_monthly')], ['yearly', t('f_yearly')]], ex ? ex.repeat || '' : '');
    const tk = App.select([['', t('none')], ...Life.taskView(S, App.user, 'all').map(x => [x.id, x.title])], ex ? ex.taskId || '' : ''), db = App.select([['', t('none')], ...S.debts.filter(d => d.scope === 'household' || d.ownerId === App.user.id).map(d => [d.id, d.party])], ex ? ex.debtId || '' : ''); const rm = App.input('number', { value: ex ? ex.remindMin : 30, min: 0 }), no = App.input('text', { value: ex ? ex.notes : '', ph: t('notes') });
    App.sheet(ex ? t('edit_event') : t('add_event'), s => h('div', {}, App.field(t('event_title'), ti), App.field(t('type'), kd), App.field(t('date'), da), h('div', { class: 'grid2' }, App.field(t('start_time'), tm), App.field(t('end_time'), et)), App.field(t('scope'), sc), App.field(t('assigned_to'), as), App.field(t('repeat'), rp), App.field(t('link_task'), tk), App.field(t('link_debt'), db), App.field(t('remind_minutes'), rm), App.field(t('notes'), no),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const r = await App.act(() => Life.saveEvent(S, App.user, { id: ex && ex.id, ownerId: ex && ex.ownerId, title: ti.value, date: da.value, time: tm.value, endTime: et.value, scope: sc.value, assignedTo: as.value || null, repeat: rp.value || null, kind: kd.value, taskId: tk.value || null, debtId: db.value || null, remindMin: Number(rm.value), notes: no.value }), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')),
        ex ? h('button', { class: 'btn danger', onclick: async () => { await App.act(() => Fin.remove(S, 'events', ex.id)); s.close(); App.render(); } }, t('delete')) : null)));
  }
  App.more.calendar = () => {
    if (!CAL.date) CAL.date = App.today(); const ws = App.get('weekStart', 6); const cur = CAL.date;
    const evRow = e => h('div', { class: 'row tap', onclick: () => e.src === 'event' ? eventSheet(e) : e.src === 'task' ? App.taskSheet(S.tasks.find(x => x.id === e.taskId)) : e.src === 'debt' ? App.go('money', 'debts') : App.go('money', 'recurring') },
      h('div', { class: 'avatar' }, { task: '✅', bill: '🔁', debt: '🤝', event: e.kind === 'appointment' ? '🩺' : e.kind === 'reminder' ? '⏰' : '📅' }[e.src] || '📅'), h('div', { class: 'grow' }, h('div', { class: 'title' }, e.title), h('div', { class: 'sub' }, App.date(e.date) + (e.time ? ' ' + e.time : '') + (e.scope === 'household' ? ' · 🏠' : '') + (e.assignedTo ? ' · 👤 ' + App.userName(e.assignedTo) : '') + (e.src === 'bill' && e.amount ? ' · ' + App.moneyTxt(e.amount) : ''))));
    const nav = (n) => { const d = CAL.view === 'month' ? Fin.addMonthsClamped(cur, n, 1) : Fin.addDays(cur, n * (CAL.view === 'week' ? 7 : 1)); CAL.date = d; CAL.sel = null; App.render(); };
    let body;
    if (CAL.view === 'month') {
      const first = cur.slice(0, 7) + '-01'; const gridStart = Fin.weekStart(first, ws); const rg = Fin.monthRange(Fin.monthOf(cur)); const gridEnd = Fin.addDays(Fin.weekStart(rg.to, ws), 6); const ev = Life.expandEvents(S, App.user, gridStart, gridEnd);
      const names = [...Array(7)].map((_, i) => new Date(2024, 0, 7 + ((ws + i) % 7)).toLocaleDateString(App.locale(), { weekday: 'narrow' }));
      const cells = []; for (let d = gridStart; d <= gridEnd; d = Fin.addDays(d, 1)) { const n = ev.filter(e => e.date === d).length; cells.push(h('button', { class: 'd' + (d === App.today() ? ' today' : '') + (d === CAL.sel ? ' sel' : '') + (d.slice(0, 7) !== cur.slice(0, 7) ? ' off' : ''), onclick: () => { CAL.sel = d; App.render(); } }, App.num(Number(d.slice(8, 10))), h('div', {}, n ? [...Array(Math.min(n, 3))].map(() => h('i')) : null))); }
      const day = CAL.sel || App.today(); body = h('div', {}, h('div', { class: 'cal' }, names.map(n => h('div', { class: 'h' }, n)), cells), h('div', { class: 'card' }, h('h3', {}, App.date(day), h('button', { class: 'btn sm', onclick: () => eventSheet(null, { date: day }) }, '+ ' + t('add_event'))), (() => { const l = ev.filter(e => e.date === day); return l.length ? l.map(evRow) : App.empty(t('no_events')); })()));
    } else if (CAL.view === 'week') {
      const ws0 = Fin.weekStart(cur, ws); const ev = Life.expandEvents(S, App.user, ws0, Fin.addDays(ws0, 6));
      body = h('div', {}, [...Array(7)].map((_, i) => { const d = Fin.addDays(ws0, i); const l = ev.filter(e => e.date === d); return h('div', { class: 'card' }, h('h3', {}, (d === App.today() ? '● ' : '') + new Date(Fin.parseD(d)).toLocaleDateString(App.locale(), { weekday: 'long', day: 'numeric', month: 'short' }), h('button', { class: 'btn sm', onclick: () => eventSheet(null, { date: d }) }, '+')), l.length ? l.map(evRow) : h('div', { class: 'small muted' }, '—')); }));
    } else { const l = Life.expandEvents(S, App.user, cur, cur); body = h('div', { class: 'card' }, h('h3', {}, App.date(cur), h('button', { class: 'btn sm', onclick: () => eventSheet(null, { date: cur }) }, '+ ' + t('add_event'))), l.length ? l.map(evRow) : App.empty(t('no_events'))); }
    return h('div', {}, App.seg([['month', t('monthly')], ['week', t('weekly')], ['day', t('daily')]], CAL.view, v => { CAL.view = v; App.render(); }),
      h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, h('button', { class: 'btn sm', onclick: () => nav(App.lang === 'ar' ? 1 : -1) }, '‹'), h('b', {}, CAL.view === 'month' ? App.monthName(Fin.monthOf(cur)) : App.date(cur)), h('button', { class: 'btn sm', onclick: () => nav(App.lang === 'ar' ? -1 : 1) }, '›')), body,
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => eventSheet(null, { date: CAL.sel || App.today() }) }, '+ ' + t('add_event')), h('button', { class: 'btn', onclick: () => { CAL.date = App.today(); CAL.sel = App.today(); App.render(); } }, t('today'))));
  };
})();
