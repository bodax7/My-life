/* MyLife — productivity logic (notes, tasks, shopping, calendar, files, search, notifications). Pure, testable. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./finance.js'));
  else root.Life = factory(root.Fin);
})(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';
  const { put, get, uid, err, today, audit } = F;

  const stripHtml = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

  /* ---------- notes ---------- */
  function canViewNote(n, u) { return n.ownerId === u.id || n.visibility === 'household' || (n.visibility === 'custom' && (n.sharedWith || []).includes(u.id)); }
  function canEditNote(n, u) { return n.ownerId === u.id || n.visibility === 'household'; }
  function saveNote(S, user, o) {
    const ex = o.id ? get(S, 'notes', o.id) : null;
    if (ex && !canEditNote(ex, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (!ex && !(o.title || '').trim() && !stripHtml(o.html)) throw err('EMPTY', 'اكتب عنواناً أو محتوى');
    const vis = ['private', 'household', 'custom'].includes(o.visibility) ? o.visibility : (ex ? ex.visibility : 'private');
    const n = { id: ex ? ex.id : (o.id || uid()), ownerId: ex ? ex.ownerId : user.id, title: (o.title || '').trim(), html: o.html || '', category: o.category || (ex && ex.category) || 'personal',
      tags: (o.tags || (ex && ex.tags) || []).map(t => t.trim()).filter(Boolean), favorite: o.favorite != null ? !!o.favorite : !!(ex && ex.favorite), pinned: o.pinned != null ? !!o.pinned : !!(ex && ex.pinned),
      visibility: vis, sharedWith: vis === 'custom' ? (o.sharedWith || (ex && ex.sharedWith) || []) : [], attachments: o.attachments || (ex && ex.attachments) || [],
      createdAt: ex ? ex.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() };
    put(S, 'notes', n); return n;
  }
  function deleteNote(S, user, id) {
    const n = get(S, 'notes', id); if (!n || n.ownerId !== user.id && !F.isAdmin(user)) throw err('FORBIDDEN', 'غير مسموح');
    if (n.ownerId !== user.id && n.visibility !== 'household') throw err('FORBIDDEN', 'غير مسموح');
    (n.attachments || []).forEach(fid => F.remove(S, 'files', fid)); F.remove(S, 'notes', id);
  }
  function listNotes(S, user, o) {
    o = o || {}; let a = S.notes.filter(n => canViewNote(n, user));
    if (o.category) a = a.filter(n => n.category === o.category);
    if (o.tag) a = a.filter(n => (n.tags || []).includes(o.tag));
    if (o.favorites) a = a.filter(n => n.favorite);
    if (o.q) { const q = norm(o.q); a = a.filter(n => norm(n.title + ' ' + stripHtml(n.html) + ' ' + (n.tags || []).join(' ')).includes(q)); }
    const key = o.sort || 'updated';
    const cmp = { updated: (x, y) => x.updatedAt < y.updatedAt ? 1 : -1, created: (x, y) => x.createdAt < y.createdAt ? 1 : -1, category: (x, y) => x.category.localeCompare(y.category), tags: (x, y) => ((x.tags || [])[0] || '~').localeCompare((y.tags || [])[0] || '~'), favorites: (x, y) => (y.favorite - x.favorite) || (x.updatedAt < y.updatedAt ? 1 : -1) }[key];
    return a.sort((x, y) => (y.pinned - x.pinned) || cmp(x, y));
  }

  /* ---------- files / voice ---------- */
  function fileParent(S, f) { return f.parent ? get(S, f.parent.kind === 'note' ? 'notes' : f.parent.kind === 'task' ? 'tasks' : f.parent.kind === 'tx' ? 'transactions' : 'x', f.parent.id) : null; }
  function canViewFile(S, f, u) {
    if (f.ownerId === u.id) return true;
    if (f.shared) return true;
    const p = fileParent(S, f); if (!p) return false;
    if (f.parent.kind === 'note') return canViewNote(p, u);
    if (f.parent.kind === 'task') return p.scope === 'household' || p.ownerId === u.id || p.assignedTo === u.id;
    if (f.parent.kind === 'tx') return F.canView(get(S, 'accounts', p.accountId), u);
    return false;
  }
  function addFile(S, user, o) {
    const f = { id: o.id || uid(), name: o.name || 'file', mime: o.mime || '', size: o.size || 0, kind: o.kind || 'file', ownerId: user.id, parent: o.parent || null, shared: !!o.shared,
      tags: o.tags || [], duration: o.duration || 0, createdAt: new Date().toISOString() };
    put(S, 'files', f); return f;
  }

  /* ---------- tasks ---------- */
  const PRIO = { low: 1, medium: 2, high: 3, urgent: 4 };
  function canViewTask(t, u) { return t.scope === 'household' || t.ownerId === u.id || t.assignedTo === u.id; }
  function saveTask(S, user, o) {
    const ex = o.id ? get(S, 'tasks', o.id) : null;
    if (ex && !canViewTask(ex, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (!(o.title || (ex && ex.title) || '').trim()) throw err('EMPTY', 'عنوان المهمة مطلوب');
    const status = o.status || (ex && ex.status) || 'todo';
    const t = { id: ex ? ex.id : uid(), title: (o.title != null ? o.title : ex.title).trim(), description: o.description != null ? o.description : (ex ? ex.description : ''),
      due: o.due !== undefined ? o.due : (ex ? ex.due : null), time: o.time !== undefined ? o.time : (ex ? ex.time : null),
      priority: o.priority || (ex ? ex.priority : 'medium'), status, category: o.category || (ex ? ex.category : 'personal'),
      scope: o.scope || (ex ? ex.scope : 'personal'), ownerId: ex ? ex.ownerId : user.id, assignedTo: o.assignedTo !== undefined ? o.assignedTo : (ex ? ex.assignedTo : user.id),
      noteId: o.noteId !== undefined ? o.noteId : (ex ? ex.noteId : null), repeat: o.repeat !== undefined ? o.repeat : (ex ? ex.repeat : null),
      attachments: o.attachments || (ex ? ex.attachments : []), createdAt: ex ? ex.createdAt : new Date().toISOString(),
      completedAt: status === 'done' ? (ex && ex.completedAt) || new Date().toISOString() : null, nextCreated: ex ? ex.nextCreated : false };
    put(S, 'tasks', t);
    if (t.status === 'done' && t.repeat && t.due && !t.nextCreated) { // recurring task: create the next occurrence exactly once
      const nd = t.repeat === 'daily' ? F.addDays(t.due, 1) : t.repeat === 'weekly' ? F.addDays(t.due, 7) : t.repeat === 'monthly' ? F.addMonthsClamped(t.due, 1) : F.addMonthsClamped(t.due, 12);
      put(S, 'tasks', { ...t, nextCreated: true });
      put(S, 'tasks', { ...t, id: uid(), due: nd, status: 'todo', completedAt: null, nextCreated: false });
    }
    return t;
  }
  function taskView(S, user, view, nowStr) {
    nowStr = nowStr || today(); const mine = S.tasks.filter(t => canViewTask(t, user)); const open = t => t.status === 'todo' || t.status === 'doing';
    const by = {
      today: t => open(t) && t.due === nowStr, upcoming: t => open(t) && t.due && t.due > nowStr, overdue: t => open(t) && t.due && t.due < nowStr,
      completed: t => t.status === 'done', mine: t => t.scope === 'personal' && t.ownerId === user.id, household: t => t.scope === 'household',
      assignedMe: t => t.assignedTo === user.id && open(t), assignedOther: t => t.assignedTo && t.assignedTo !== user.id && open(t), all: () => true, cancelled: t => t.status === 'cancelled',
    }[view] || (() => true);
    return mine.filter(by).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : (PRIO[b.priority] - PRIO[a.priority]));
  }

  /* ---------- shopping ---------- */
  function canViewList(l, u) { return l.scope === 'household' || l.ownerId === u.id || (l.sharedWith || []).includes(u.id); }
  function saveList(S, user, o) { return put(S, 'shopLists', { id: o.id || uid(), name: o.name, scope: o.scope || 'household', ownerId: o.ownerId || user.id, sharedWith: o.sharedWith || [] }); }
  function saveItem(S, user, o) {
    const l = get(S, 'shopLists', o.listId); if (!l || !canViewList(l, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (!(o.name || '').trim()) throw err('EMPTY', 'اسم الصنف مطلوب');
    const ex = o.id ? get(S, 'shopItems', o.id) : null;
    return put(S, 'shopItems', { id: ex ? ex.id : uid(), listId: o.listId, name: o.name.trim(), qty: o.qty || 1, unit: o.unit || '', estPrice: o.estPrice || 0, actualPrice: o.actualPrice || 0,
      category: o.category || '', assignedTo: o.assignedTo || null, purchased: !!o.purchased, notes: o.notes || '', photo: o.photo || null, expenseTxId: ex ? ex.expenseTxId : null, createdAt: ex ? ex.createdAt : new Date().toISOString() });
  }

  /* ---------- calendar ---------- */
  function canViewEvent(e, u) { return e.scope === 'household' || e.ownerId === u.id || e.assignedTo === u.id; }
  function saveEvent(S, user, o) {
    if (!(o.title || '').trim()) throw err('EMPTY', 'عنوان الحدث مطلوب');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) throw err('BAD_DATE', 'التاريخ غير صالح');
    return put(S, 'events', { id: o.id || uid(), title: o.title.trim(), date: o.date, time: o.time || '', endTime: o.endTime || '', scope: o.scope || 'personal', ownerId: o.ownerId || user.id,
      assignedTo: o.assignedTo || null, repeat: o.repeat || null, kind: o.kind || 'event', notes: o.notes || '', taskId: o.taskId || null, debtId: o.debtId || null, remindMin: o.remindMin == null ? 30 : o.remindMin });
  }
  function expandEvents(S, user, from, to) {
    const out = [];
    for (const e of S.events) {
      if (!canViewEvent(e, user)) continue;
      if (!e.repeat) { if (e.date >= from && e.date <= to) out.push({ ...e, src: 'event' }); continue; }
      let n = 0, d = e.date; if (d > to) continue;
      const step = k => e.repeat === 'daily' ? F.addDays(e.date, k) : e.repeat === 'weekly' ? F.addDays(e.date, 7 * k) : e.repeat === 'monthly' ? F.addMonthsClamped(e.date, k) : F.addMonthsClamped(e.date, 12 * k);
      for (; n < 800; n++) { d = step(n); if (d > to) break; if (d >= from) out.push({ ...e, date: d, src: 'event', occurrence: true }); }
    }
    for (const t of S.tasks) if (t.due && t.due >= from && t.due <= to && canViewTask(t, user) && (t.status === 'todo' || t.status === 'doing'))
      out.push({ id: 't:' + t.id, title: t.title, date: t.due, time: t.time || '', kind: 'task', src: 'task', taskId: t.id, scope: t.scope });
    for (const r of F.upcoming(S, user, from, to)) if (r.date >= from && r.date <= to)
      out.push({ id: 'r:' + r.rule.id + r.date, title: r.rule.description || 'التزام متكرر', date: r.date, kind: 'bill', src: 'bill', amount: r.rule.amount, ruleId: r.rule.id });
    for (const d of S.debts) { if (d.due && d.due >= from && d.due <= to && (d.scope === 'household' || d.ownerId === user.id) && F.debtStatus(S, d).status !== 'paid')
      out.push({ id: 'd:' + d.id, title: (d.direction === 'owe' ? 'استحقاق دين: ' : 'تحصيل: ') + d.party, date: d.due, kind: 'bill', src: 'debt', debtId: d.id }); }
    return out.sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  }

  /* ---------- global search (never returns records the user cannot see) ---------- */
  function search(S, user, q, f) {
    f = f || {}; const nq = norm(q || ''); const hits = [];
    const hit = (module, id, title, sub, date, extra) => hits.push({ module, id, title, sub: sub || '', date: date || '', ...extra });
    const match = (...parts) => !nq || norm(parts.join(' ')).includes(nq);
    const inDate = d => (!f.from || !d || d.slice(0, 10) >= f.from) && (!f.to || !d || d.slice(0, 10) <= f.to);
    const want = m => !f.module || f.module === m;
    const catName = id => { const c = get(S, 'categories', id); return c ? c.name_ar + ' ' + c.name_en : ''; };
    if (want('accounts')) for (const a of F.visibleAccounts(S, user)) {
      if (f.account && f.account !== a.id) continue; if (f.visibility && f.visibility !== a.visibility) continue;
      if (match(a.name, a.type, a.description)) hit('accounts', a.id, a.name, a.currency, a.createdAt);
    }
    if (want('transactions')) for (const t of F.visibleTx(S, user)) {
      if (f.account && t.accountId !== f.account && t.toAccountId !== f.account) continue;
      if (f.category && t.categoryId !== f.category) continue; if (f.user && t.createdBy !== f.user) continue; if (!inDate(t.date)) continue;
      const a = get(S, 'accounts', t.accountId); if (f.visibility && a && f.visibility !== a.visibility) continue;
      if (match(t.description, t.notes, catName(t.categoryId), String(t.amount / 100))) hit('transactions', t.id, t.description || t.type, F.fmtMoney(t.amount, t.currency, 'ar'), t.date);
    }
    if (want('categories')) for (const c of S.categories) if (!f.category && match(c.name_ar, c.name_en)) hit('categories', c.id, c.name_ar, c.name_en);
    if (want('notes')) for (const n of S.notes) {
      if (!canViewNote(n, user)) continue; if (f.category && n.category !== f.category) continue; if (f.user && n.ownerId !== f.user) continue; if (f.visibility && f.visibility !== n.visibility) continue; if (!inDate(n.createdAt)) continue;
      if (match(n.title, stripHtml(n.html), (n.tags || []).join(' '))) hit('notes', n.id, n.title || stripHtml(n.html).slice(0, 40), stripHtml(n.html).slice(0, 60), n.updatedAt);
    }
    if (want('tasks')) for (const t of S.tasks) {
      if (!canViewTask(t, user)) continue; if (f.user && t.assignedTo !== f.user && t.ownerId !== f.user) continue; if (f.visibility && (f.visibility === 'household') !== (t.scope === 'household')) continue; if (!inDate(t.due || t.createdAt)) continue;
      if (match(t.title, t.description, t.category)) hit('tasks', t.id, t.title, t.status, t.due);
    }
    if (want('shopping')) for (const l of S.shopLists) {
      if (!canViewList(l, user)) continue; if (f.visibility && (f.visibility === 'household') !== (l.scope === 'household')) continue;
      if (match(l.name)) hit('shopping', l.id, l.name, 'list');
      for (const it of S.shopItems.filter(i => i.listId === l.id)) if (match(it.name, it.notes, it.category)) hit('shopping', it.id, it.name, l.name, it.createdAt, { listId: l.id });
    }
    if (want('attachments')) for (const fl of S.files) {
      if (!canViewFile(S, fl, user)) continue; if (f.user && fl.ownerId !== f.user) continue; if (!inDate(fl.createdAt)) continue;
      if (match(fl.name, (fl.tags || []).join(' '))) hit('attachments', fl.id, fl.name, fl.kind, fl.createdAt);
    }
    if (want('events')) for (const e of S.events) {
      if (!canViewEvent(e, user)) continue; if (f.user && e.assignedTo !== f.user && e.ownerId !== f.user) continue; if (!inDate(e.date)) continue;
      if (match(e.title, e.notes)) hit('events', e.id, e.title, e.date + ' ' + (e.time || ''), e.date);
    }
    if (want('debts')) for (const d of S.debts) {
      if (!(d.scope === 'household' || d.ownerId === user.id)) continue; if (f.visibility && (f.visibility === 'household') !== (d.scope === 'household')) continue; if (!inDate(d.date)) continue;
      if (match(d.party, d.notes)) hit('debts', d.id, d.party, F.fmtMoney(d.amount, d.currency, 'ar'), d.date);
    }
    if (want('goals')) for (const g of S.goals) {
      if (!(g.scope === 'household' || g.ownerId === user.id)) continue; if (f.visibility && (f.visibility === 'household') !== (g.scope === 'household')) continue;
      if (match(g.name)) hit('goals', g.id, g.name, F.fmtMoney(g.target, 'EGP', 'ar'));
    }
    return hits;
  }

  /* ---------- in-app notifications (computed from data; de-duplicated by key) ---------- */
  function computeNotifs(S, user, nowStr, prefs) {
    prefs = prefs || {}; nowStr = nowStr || today(); const out = []; const on = k => prefs[k] !== false;
    const add = (key, type, text, date) => { if (!S.notifs.some(n => n.key === key && n.userId === user.id)) out.push({ id: uid(), key, userId: user.id, type, text, date, at: new Date().toISOString(), read: false }); };
    if (on('tasks')) for (const t of S.tasks) {
      if (!canViewTask(t, user) || !(t.status === 'todo' || t.status === 'doing') || !t.due) continue;
      if (t.due === nowStr) add('task-today:' + t.id + nowStr, 'tasks', { k: 'n_task_today', title: t.title }, t.due);
      else if (t.due < nowStr) add('task-over:' + t.id, 'tasks', { k: 'n_task_over', title: t.title }, t.due);
    }
    if (on('budgets')) for (const b of S.budgets) {
      if (!b.active || (b.scope === 'personal' && b.ownerId !== user.id)) continue;
      const st = F.budgetStatus(S, user, b, nowStr); if (st.level) add('budget:' + b.id + ':' + F.monthOf(nowStr) + ':' + st.level, 'budgets', { k: 'n_budget', cat: b.categoryId, pct: st.pct }, nowStr);
    }
    if (on('bills')) for (const r of F.upcoming(S, user, nowStr, F.addDays(nowStr, 3))) { if (r.date <= F.addDays(nowStr, r.rule.remindDays == null ? 1 : r.rule.remindDays)) add('bill:' + r.rule.id + r.date, 'bills', { k: 'n_bill', title: r.rule.description || '', date: r.date }, r.date); }
    if (on('bills')) for (const r of F.dueList(S, user, nowStr)) add('billdue:' + r.rule.id + r.date, 'bills', { k: 'n_bill_due', title: r.rule.description || '', date: r.date }, r.date);
    if (on('debts')) for (const d of S.debts) { if (!(d.scope === 'household' || d.ownerId === user.id) || !d.due) continue; const st = F.debtStatus(S, d, nowStr); if (st.status === 'overdue') add('debt:' + d.id, 'debts', { k: 'n_debt_over', title: d.party }, d.due); else if (st.status !== 'paid' && d.due <= F.addDays(nowStr, 3)) add('debt-soon:' + d.id, 'debts', { k: 'n_debt_soon', title: d.party, date: d.due }, d.due); }
    if (on('goals')) for (const g of S.goals) { if (!(g.scope === 'household' || g.ownerId === user.id)) continue; if (F.goalStatus(S, g, nowStr).behind) add('goal:' + g.id + ':' + F.monthOf(nowStr), 'goals', { k: 'n_goal', title: g.name }, nowStr); }
    if (on('events')) for (const e of expandEvents(S, user, nowStr, F.addDays(nowStr, 1))) { if (e.src === 'event') add('ev:' + e.id + e.date, 'events', { k: 'n_event', title: e.title, date: e.date, time: e.time }, e.date); }
    return out;
  }

  return { stripHtml, norm, canViewNote, canEditNote, saveNote, deleteNote, listNotes, canViewFile, addFile, canViewTask, saveTask, taskView, PRIO, canViewList, saveList, saveItem,
    canViewEvent, saveEvent, expandEvents, search, computeNotifs };
});
