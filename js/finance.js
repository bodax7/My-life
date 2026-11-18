/* MyLife — finance core (pure logic, no DOM).
 * Money is ALWAYS an integer in minor units (piastres/cents). No floats in balances.
 * Works in browser (window.Fin) and Node (module.exports) so it can be unit-tested. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fin = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE = 'EGP';
  const BUILTIN_CUR = { EGP: 'ج.م', USD: '$', EUR: '€', SAR: 'ر.س' };

  /* ---------- helpers ---------- */
  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function err(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

  // "1,234.50" / "١٢٣٤٫٥٠" -> 123450 (integer minor units). Returns null if invalid.
  function parseMoney(str) {
    if (typeof str === 'number') str = String(str);
    if (typeof str !== 'string') return null;
    let s = str.trim()
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/٫/g, '.').replace(/[٬,\s]/g, '');
    const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    const v = Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0') || 0);
    if (!Number.isSafeInteger(v)) return null;
    return m[1] ? -v : v;
  }
  function fmtMoney(minor, cur, lang) {
    const neg = minor < 0; const a = Math.abs(minor);
    const whole = Math.floor(a / 100), frac = a % 100;
    let w;
    try { w = whole.toLocaleString(lang === 'en' ? 'en-US' : 'ar-EG'); } catch (e) { w = String(whole); }
    let f = String(frac).padStart(2, '0');
    if (lang !== 'en') f = f.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
    const sym = lang === 'en' ? ({ USD: '$', EUR: '€' }[cur] || cur || '') : (BUILTIN_CUR[cur] || cur || '');
    const dot = lang === 'en' ? '.' : '٫';
    return (neg ? '-' : '') + w + dot + f + ' ' + sym;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today(now) { return dstr(now ? new Date(now) : new Date()); }
  function parseD(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function monthOf(s) { return s.slice(0, 7); }
  function monthRange(ym) {
    const [y, m] = ym.split('-').map(Number);
    return { from: ym + '-01', to: ym + '-' + pad(new Date(y, m, 0).getDate()) };
  }
  function addMonthsClamped(dateStr, n, anchorDay) {
    const d = parseD(dateStr); const day = anchorDay || d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return dstr(t);
  }
  function addDays(dateStr, n) { const d = parseD(dateStr); d.setDate(d.getDate() + n); return dstr(d); }
  function weekStart(dateStr, startDay) { // startDay: 0=Sun..6=Sat (Egypt default Saturday)
    const d = parseD(dateStr); const diff = (d.getDay() - startDay + 7) % 7; d.setDate(d.getDate() - diff); return dstr(d);
  }

  /* ---------- state ---------- */
  const STORES = ['accounts', 'transactions', 'categories', 'budgets', 'recurring', 'goals', 'contribs',
    'debts', 'debtPays', 'closings', 'recons', 'audit', 'rates', 'notes', 'tasks', 'shopLists', 'shopItems',
    'events', 'files', 'notifs'];

  function newState() {
    const S = { users: [], settings: {}, dirty: [], removed: [] };
    STORES.forEach(k => S[k] = []);
    return S;
  }
  function put(S, store, rec) {
    const arr = S[store]; const i = arr.findIndex(r => r.id === rec.id);
    if (i >= 0) arr[i] = rec; else arr.push(rec);
    S.dirty.push([store, rec.id]); return rec;
  }
  function remove(S, store, id) {
    S[store] = S[store].filter(r => r.id !== id); S.removed.push([store, id]);
  }
  function get(S, store, id) { return S[store].find(r => r.id === id); }
  function audit(S, user, action, entity, entityId, before, after) {
    put(S, 'audit', { id: uid(), at: new Date().toISOString(), by: user.id, action, entity, entityId,
      before: before ? JSON.parse(JSON.stringify(before)) : null, after: after ? JSON.parse(JSON.stringify(after)) : null });
  }

  /* ---------- default categories ---------- */
  const DEFAULT_CATS = [
    ['income', 'salary', 'الراتب', 'Salary', '💼', '#16a34a'],
    ['income', 'business', 'دخل أعمال', 'Business Income', '🏢', '#0d9488'],
    ['income', 'gifts', 'هدايا', 'Gifts', '🎁', '#db2777'],
    ['income', 'contribution', 'مساهمة للبيت', 'Household Contribution', '🏠', '#2563eb'],
    ['income', 'other_in', 'دخل آخر', 'Other Income', '➕', '#64748b'],
    ['expense', 'groceries', 'بقالة', 'Groceries', '🛒', '#ea580c'],
    ['expense', 'food', 'أكل وشرب', 'Food and Drinks', '🍽️', '#f59e0b'],
    ['expense', 'transport', 'مواصلات', 'Transportation', '🚗', '#0284c7'],
    ['expense', 'electricity', 'كهرباء', 'Electricity', '💡', '#eab308'],
    ['expense', 'water', 'مياه', 'Water', '💧', '#06b6d4'],
    ['expense', 'internet', 'إنترنت', 'Internet', '📶', '#6366f1'],
    ['expense', 'rent', 'إيجار', 'Rent', '🏘️', '#8b5cf6'],
    ['expense', 'maintenance', 'صيانة', 'Maintenance', '🔧', '#78716c'],
    ['expense', 'furniture', 'أثاث', 'Furniture', '🛋️', '#a16207'],
    ['expense', 'shopping', 'تسوق', 'Shopping', '🛍️', '#d946ef'],
    ['expense', 'medical', 'طبي', 'Medical', '🩺', '#dc2626'],
    ['expense', 'entertainment', 'ترفيه', 'Entertainment', '🎬', '#c026d3'],
    ['expense', 'subscriptions', 'اشتراكات', 'Subscriptions', '🔁', '#4f46e5'],
    ['expense', 'other', 'أخرى', 'Other', '📦', '#64748b'],
    ['system', 'debt', 'سداد/تحصيل دين', 'Debt flow', '🤝', '#475569'],
    ['system', 'adjust', 'تسوية', 'Adjustment', '⚖️', '#475569'],
  ];
  function seedCategories(S) {
    if (S.categories.length) return;
    DEFAULT_CATS.forEach(([kind, key, ar, en, icon, color]) =>
      put(S, 'categories', { id: 'cat_' + key, key, kind, name_ar: ar, name_en: en, icon, color, system: kind === 'system' }));
  }

  /* ---------- permissions ---------- */
  const isAdmin = u => u && u.role === 'admin';
  function canView(a, u) { return !!a && (a.visibility === 'household' || a.ownerId === u.id); }
  function canWrite(a, u) { return !!a && a.active !== false && (a.visibility === 'household' || a.ownerId === u.id); }
  function visibleAccounts(S, u) { return S.accounts.filter(a => canView(a, u)); }
  function inScope(a, u, scope) {
    if (!canView(a, u)) return false;
    if (scope === 'personal') return a.visibility === 'private';
    if (scope === 'household') return a.visibility === 'household';
    return true;
  }

  /* ---------- rates ---------- */
  function rateFor(S, cur, onDate) {
    if (cur === BASE) return 1;
    const list = S.rates.filter(r => r.currency === cur && (!onDate || r.date <= onDate)).sort((a, b) => a.date < b.date ? 1 : -1);
    return list.length ? list[0].rate : null;
  }
  function setRate(S, user, currency, rate, date) {
    if (!(rate > 0)) throw err('BAD_RATE', 'سعر الصرف غير صالح');
    if (currency === BASE) throw err('BAD_RATE', 'العملة الأساسية سعرها 1');
    return put(S, 'rates', { id: uid(), currency, rate: Number(rate), date: date || today(), by: user.id });
  }
  function toBase(amount, rate) { return Math.round(amount * rate); }

  /* ---------- accounts ---------- */
  function createAccount(S, user, o) {
    if (!o.name || !o.name.trim()) throw err('NAME_REQUIRED', 'اسم الحساب مطلوب');
    const vis = o.visibility === 'household' ? 'household' : 'private';
    if (vis === 'household' && !isAdmin(user)) throw err('FORBIDDEN', 'إنشاء حساب مشترك للمسؤول فقط');
    const cur = o.currency || BASE;
    const a = put(S, 'accounts', { id: o.id || uid(), name: o.name.trim(), type: o.type || 'cash', ownerId: user.id,
      householdId: vis === 'household' ? 'h1' : null, currency: cur, visibility: vis, active: true,
      description: o.description || '', createdAt: new Date().toISOString() });
    audit(S, user, 'create', 'account', a.id, null, a);
    const opening = o.opening | 0;
    if (opening !== 0) addTx(S, user, { type: 'opening', accountId: a.id, amount: opening, date: o.date || today(),
      description: 'رصيد افتتاحي', opId: 'open:' + a.id }, { skipClosed: true });
    return a;
  }
  function updateAccount(S, user, id, patch) {
    const a = get(S, 'accounts', id);
    if (!a || !canWrite(a, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (a.visibility === 'household' && !isAdmin(user)) throw err('FORBIDDEN', 'تعديل الحساب المشترك للمسؤول فقط');
    const before = { ...a };
    ['name', 'type', 'description', 'active'].forEach(k => { if (k in patch) a[k] = patch[k]; });
    put(S, 'accounts', a); audit(S, user, 'update', 'account', id, before, a); return a;
  }

  /* ---------- transactions ---------- */
  function effect(tx, accountId) {
    if (tx.deleted) return 0;
    switch (tx.type) {
      case 'opening': case 'income': case 'refund': case 'adjustment': return tx.accountId === accountId ? tx.amount : 0;
      case 'expense': return tx.accountId === accountId ? -tx.amount : 0;
      case 'transfer':
        if (tx.accountId === accountId) return -tx.amount;
        if (tx.toAccountId === accountId) return tx.toAmount != null ? tx.toAmount : tx.amount;
        return 0;
      default: return 0;
    }
  }
  function balanceOf(S, accountId, upTo) {
    let b = 0;
    for (const t of S.transactions) { if (upTo && t.date.slice(0, 10) > upTo) continue; b += effect(t, accountId); }
    return b;
  }
  function isClosed(S, account, date) {
    const ym = monthOf(date);
    return S.closings.some(c => c.status === 'closed' && c.month === ym &&
      (account.visibility === 'household' ? c.scope === 'household' : (c.scope === 'personal' && c.ownerId === account.ownerId)));
  }
  function refundedSoFar(S, origId, exceptId) {
    return S.transactions.filter(t => t.type === 'refund' && t.refundOf === origId && !t.deleted && t.id !== exceptId)
      .reduce((s, t) => s + t.amount, 0);
  }

  function validateTx(S, user, tx, opts) {
    opts = opts || {};
    const types = ['income', 'expense', 'transfer', 'refund', 'opening', 'adjustment'];
    if (!types.includes(tx.type)) throw err('BAD_TYPE', 'نوع المعاملة غير صالح');
    if (!Number.isInteger(tx.amount)) throw err('BAD_AMOUNT', 'المبلغ غير صالح');
    if (tx.type === 'adjustment' || tx.type === 'opening') { if (tx.amount === 0) throw err('BAD_AMOUNT', 'المبلغ لا يمكن أن يكون صفراً'); }
    else if (tx.amount <= 0) throw err('BAD_AMOUNT', 'المبلغ يجب أن يكون أكبر من صفر');
    if (!/^\d{4}-\d{2}-\d{2}/.test(tx.date || '')) throw err('BAD_DATE', 'التاريخ غير صالح');
    const acc = get(S, 'accounts', tx.accountId);
    if (!acc) throw err('NO_ACCOUNT', 'الحساب غير موجود');
    if (!canWrite(acc, user)) throw err('FORBIDDEN', 'ليس لديك صلاحية على هذا الحساب');
    tx.currency = acc.currency;
    // base amount for reporting
    if (acc.currency === BASE) { tx.rate = 1; tx.baseAmount = tx.amount; }
    else {
      const r = tx.rate || rateFor(S, acc.currency, tx.date.slice(0, 10));
      if (!r) throw err('NO_RATE', 'أدخل سعر الصرف لهذه العملة أولاً');
      tx.rate = Number(r); tx.baseAmount = toBase(tx.amount, tx.rate);
    }
    if (tx.type === 'transfer') {
      const to = get(S, 'accounts', tx.toAccountId);
      if (!to) throw err('NO_ACCOUNT', 'الحساب المحوَّل إليه غير موجود');
      if (to.id === acc.id) throw err('SAME_ACCOUNT', 'لا يمكن التحويل لنفس الحساب');
      if (!canWrite(to, user)) throw err('FORBIDDEN', 'ليس لديك صلاحية على الحساب المحوَّل إليه');
      if (to.currency === acc.currency) tx.toAmount = tx.amount;
      else if (!Number.isInteger(tx.toAmount) || tx.toAmount <= 0) throw err('NEED_TO_AMOUNT', 'حدد المبلغ المستلم (عملتان مختلفتان)');
      tx.toCurrency = to.currency;
      tx.categoryId = null;
    }
    if (tx.type === 'refund') {
      if (tx.refundOf) {
        const o = get(S, 'transactions', tx.refundOf);
        if (!o || o.deleted || o.type !== 'expense') throw err('BAD_REFUND', 'يمكن استرداد معاملة مصروف فقط');
        if (o.accountId !== tx.accountId) throw err('BAD_REFUND', 'الاسترداد يكون على نفس حساب المعاملة الأصلية');
        if (refundedSoFar(S, o.id, opts.selfId) + tx.amount > o.amount) throw err('REFUND_TOO_BIG', 'مبلغ الاسترداد أكبر من المتبقي من المعاملة الأصلية');
        if (!tx.categoryId) tx.categoryId = o.categoryId;
      }
    }
    if (!opts.skipClosed) {
      const dates = [tx.date]; if (opts.oldDate) dates.push(opts.oldDate);
      for (const d of dates) {
        if (isClosed(S, acc, d) && tx.type !== 'adjustment') throw err('PERIOD_CLOSED', 'هذه الفترة مقفلة. استخدم قيد تسوية.');
        if (tx.type === 'transfer') {
          const to = get(S, 'accounts', tx.toAccountId);
          if (isClosed(S, to, d)) throw err('PERIOD_CLOSED', 'فترة الحساب المحوَّل إليه مقفلة.');
        }
      }
      if (tx.type === 'adjustment' && isClosed(S, acc, tx.date)) tx.postClose = true;
    }
    return acc;
  }

  function addTx(S, user, o, opts) {
    opts = opts || {};
    const tx = {
      id: uid(), opId: o.opId || uid(), type: o.type, accountId: o.accountId, toAccountId: o.toAccountId || null,
      amount: o.amount, toAmount: o.toAmount != null ? o.toAmount : null, date: o.date || (today() + 'T' + new Date().toTimeString().slice(0, 5)),
      description: (o.description || '').trim(), notes: o.notes || '', categoryId: o.categoryId || null,
      paymentMethod: o.paymentMethod || '', refundOf: o.refundOf || null, isDebt: !!o.isDebt, rate: o.rate || null,
      attachments: o.attachments || [], createdBy: user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleted: false,
    };
    if (S.transactions.some(t => t.opId === tx.opId)) throw err('DUPLICATE', 'هذه المعاملة مسجلة بالفعل');
    validateTx(S, user, tx, opts);
    put(S, 'transactions', tx);
    audit(S, user, 'create', 'transaction', tx.id, null, tx);
    return tx;
  }

  function editTx(S, user, id, patch) {
    const old = get(S, 'transactions', id);
    if (!old || old.deleted) throw err('NOT_FOUND', 'المعاملة غير موجودة');
    const acc = get(S, 'accounts', old.accountId);
    if (!canWrite(acc, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (old.type === 'opening') throw err('LOCKED', 'عدّل الرصيد الافتتاحي بقيد تسوية');
    if (old.type === 'expense' && S.transactions.some(t => t.type === 'refund' && t.refundOf === id && !t.deleted) &&
      ((patch.amount != null && patch.amount !== old.amount) || (patch.accountId != null && patch.accountId !== old.accountId))) throw err('HAS_REFUND', 'هذه المعاملة عليها استرداد؛ احذف الاسترداد أولاً');
    const before = JSON.parse(JSON.stringify(old));
    const next = { ...old };
    ['amount', 'toAmount', 'date', 'description', 'notes', 'categoryId', 'paymentMethod', 'accountId', 'toAccountId', 'attachments', 'rate']
      .forEach(k => { if (k in patch) next[k] = patch[k]; });
    if ('accountId' in patch || 'amount' in patch || 'date' in patch) next.rate = patch.rate || null;
    validateTx(S, user, next, { oldDate: old.date, selfId: id });
    // closed check on the old account too
    if (isClosed(S, acc, old.date) && next.type !== 'adjustment') throw err('PERIOD_CLOSED', 'هذه الفترة مقفلة. استخدم قيد تسوية.');
    next.updatedAt = new Date().toISOString();
    put(S, 'transactions', next);
    audit(S, user, 'update', 'transaction', id, before, next);
    return next;
  }

  function deleteTx(S, user, id) {
    const t = get(S, 'transactions', id);
    if (!t || t.deleted) throw err('NOT_FOUND', 'المعاملة غير موجودة');
    const acc = get(S, 'accounts', t.accountId);
    if (!canWrite(acc, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (t.type === 'opening') throw err('LOCKED', 'لا يمكن حذف الرصيد الافتتاحي');
    if (S.transactions.some(r => r.type === 'refund' && r.refundOf === id && !r.deleted)) throw err('HAS_REFUND', 'احذف الاسترداد المرتبط أولاً');
    if (isClosed(S, acc, t.date) && t.type !== 'adjustment') throw err('PERIOD_CLOSED', 'هذه الفترة مقفلة');
    if (t.type === 'transfer' && isClosed(S, get(S, 'accounts', t.toAccountId), t.date)) throw err('PERIOD_CLOSED', 'فترة الحساب الآخر مقفلة');
    const before = { ...t };
    const next = { ...t, deleted: true, deletedAt: new Date().toISOString(), deletedBy: user.id };
    put(S, 'transactions', next); audit(S, user, 'delete', 'transaction', id, before, next);
    // un-link debt payment / shopping item so they can be re-recorded
    S.debtPays.filter(p => p.txId === id).forEach(p => put(S, 'debtPays', { ...p, txId: null }));
    S.shopItems.filter(i => i.expenseTxId === id).forEach(i => put(S, 'shopItems', { ...i, expenseTxId: null }));
    return next;
  }

  /* ---------- visibility of transactions ---------- */
  function visibleTx(S, user) {
    return S.transactions.filter(t => {
      if (t.deleted) return false;
      const a = get(S, 'accounts', t.accountId); const b = t.toAccountId ? get(S, 'accounts', t.toAccountId) : null;
      return canView(a, user) || (b && canView(b, user));
    });
  }
  // masks the counterpart of a transfer the user is not allowed to see
  function txView(S, user, t) {
    const a = get(S, 'accounts', t.accountId); const b = t.toAccountId ? get(S, 'accounts', t.toAccountId) : null;
    return { ...t,
      fromName: a ? (canView(a, user) ? a.name : null) : null,
      toName: b ? (canView(b, user) ? b.name : null) : null,
      masked: (a && !canView(a, user)) || (b && !canView(b, user)) };
  }
  function ledger(S, user, accountId) {
    const a = get(S, 'accounts', accountId);
    if (!canView(a, user)) throw err('FORBIDDEN', 'غير مسموح');
    const rows = S.transactions.filter(t => !t.deleted && effect(t, accountId) !== 0)
      .sort((x, y) => (x.date + x.createdAt) < (y.date + y.createdAt) ? -1 : 1);
    let run = 0;
    return rows.map(t => { const e = effect(t, accountId); run += e; return { ...txView(S, user, t), effect: e, balance: run }; }).reverse();
  }

  /* ---------- reports ---------- */
  // Net expense: expenses minus refunds. Transfers/opening/adjustments/debt flows are NOT income or expense.
  function summarize(S, user, from, to, scope) {
    scope = scope || 'all';
    const r = { income: 0, expense: 0, byCat: {}, incomeByCat: {}, transfers: 0, transferCount: 0, adjustments: 0, debtIn: 0, debtOut: 0 };
    for (const t of S.transactions) {
      if (t.deleted) continue;
      const d = t.date.slice(0, 10); if (d < from || d > to) continue;
      const a = get(S, 'accounts', t.accountId);
      if (t.type === 'transfer') {
        const b = get(S, 'accounts', t.toAccountId);
        if (inScope(a, user, scope) || inScope(b, user, scope)) { r.transferCount++; r.transfers += t.baseAmount; }
        continue;
      }
      if (!inScope(a, user, scope)) continue;
      if (t.type === 'opening') continue;
      if (t.type === 'adjustment') { r.adjustments += t.baseAmount; continue; }
      if (t.isDebt) { if (t.type === 'income') r.debtIn += t.baseAmount; else if (t.type === 'expense') r.debtOut += t.baseAmount; continue; }
      const c = t.categoryId || 'cat_other';
      if (t.type === 'income') { r.income += t.baseAmount; r.incomeByCat[c] = (r.incomeByCat[c] || 0) + t.baseAmount; }
      else if (t.type === 'expense') { r.expense += t.baseAmount; r.byCat[c] = (r.byCat[c] || 0) + t.baseAmount; }
      else if (t.type === 'refund') { r.expense -= t.baseAmount; r.byCat[c] = (r.byCat[c] || 0) - t.baseAmount; }
    }
    r.net = r.income - r.expense;
    r.savingsRate = r.income > 0 ? Math.round((r.net * 1000) / r.income) / 10 : null;
    return r;
  }
  function totalBalance(S, user, scope) {
    // current value in reporting currency using the latest stored rate (informational; originals kept per account)
    let tot = 0; const per = [];
    for (const a of S.accounts) {
      if (!inScope(a, user, scope) || a.active === false) continue;
      const bal = balanceOf(S, a.id); const rate = rateFor(S, a.currency) || 0;
      per.push({ account: a, balance: bal, base: toBase(bal, rate) });
      tot += toBase(bal, rate);
    }
    return { total: tot, per };
  }
  function trend(S, user, months, scope, nowStr) {
    const out = []; let ym = monthOf(nowStr || today());
    for (let i = 0; i < months; i++) {
      const rg = monthRange(ym); const s = summarize(S, user, rg.from, rg.to, scope);
      out.unshift({ month: ym, income: s.income, expense: s.expense });
      ym = monthOf(addMonthsClamped(rg.from, -1, 1));
    }
    return out;
  }
  function periodRange(kind, dateStr, weekStartDay) {
    const d = parseD(dateStr);
    if (kind === 'month') return monthRange(monthOf(dateStr));
    if (kind === 'quarter') { const q = Math.floor(d.getMonth() / 3) * 3; return { from: dstr(new Date(d.getFullYear(), q, 1)), to: dstr(new Date(d.getFullYear(), q + 3, 0)) }; }
    if (kind === 'year') return { from: d.getFullYear() + '-01-01', to: d.getFullYear() + '-12-31' };
    if (kind === 'week') { const f = weekStart(dateStr, weekStartDay == null ? 6 : weekStartDay); return { from: f, to: addDays(f, 6) }; }
    throw err('BAD_PERIOD');
  }

  /* ---------- budgets ---------- */
  function addBudget(S, user, o) {
    if (!(o.amount > 0)) throw err('BAD_AMOUNT', 'مبلغ الميزانية غير صالح');
    const scope = o.scope === 'household' ? 'household' : 'personal';
    if (scope === 'household' && !isAdmin(user)) throw err('FORBIDDEN', 'الميزانية المشتركة للمسؤول فقط');
    const b = put(S, 'budgets', { id: uid(), categoryId: o.categoryId, amount: o.amount, period: o.period || 'monthly', start: o.start || null, end: o.end || null,
      scope, ownerId: user.id, thresholds: o.thresholds || [75, 90, 100], active: true });
    audit(S, user, 'create', 'budget', b.id, null, b); return b;
  }
  function budgetStatus(S, user, b, nowStr, weekStartDay) {
    nowStr = nowStr || today();
    let rg;
    if (b.period === 'weekly') rg = periodRange('week', nowStr, weekStartDay);
    else if (b.period === 'custom') rg = { from: b.start, to: b.end };
    else rg = monthRange(monthOf(nowStr));
    const s = summarize(S, user, rg.from, rg.to, b.scope);
    const spent = Math.max(0, s.byCat[b.categoryId] || 0);
    const pct = Math.floor((spent * 100) / b.amount);
    const hit = (b.thresholds || []).filter(t => pct >= t).sort((x, y) => y - x)[0] || null;
    return { range: rg, spent, remaining: b.amount - spent, pct, level: hit };
  }

  /* ---------- recurring ---------- */
  function occurrence(rule, n) {
    const f = rule.freq, k = rule.interval || 1;
    if (f === 'daily') return addDays(rule.startDate, n * k);
    if (f === 'weekly') return addDays(rule.startDate, n * 7 * k);
    if (f === 'custom') return addDays(rule.startDate, n * k);
    const months = f === 'monthly' ? 1 : f === 'quarterly' ? 3 : f === 'yearly' ? 12 : null;
    if (!months) throw err('BAD_FREQ');
    return addMonthsClamped(rule.startDate, n * k * months, parseD(rule.startDate).getDate());
  }
  function addRule(S, user, o) {
    if (!(o.amount > 0)) throw err('BAD_AMOUNT', 'المبلغ غير صالح');
    const acc = get(S, 'accounts', o.accountId); if (!canWrite(acc, user)) throw err('FORBIDDEN', 'غير مسموح');
    const r = put(S, 'recurring', { id: uid(), kind: o.kind === 'income' ? 'income' : 'expense', amount: o.amount, accountId: o.accountId, categoryId: o.categoryId || null,
      freq: o.freq || 'monthly', interval: o.interval || 1, startDate: o.startDate, endDate: o.endDate || null, cursor: 0, active: true,
      description: o.description || '', remindDays: o.remindDays == null ? 1 : o.remindDays, ownerId: user.id });
    audit(S, user, 'create', 'recurring', r.id, null, r); return r;
  }
  function nextDue(rule) { const d = occurrence(rule, rule.cursor); return rule.endDate && d > rule.endDate ? null : d; }
  // preview: what would be generated up to `upTo` (nothing is recorded until the user confirms)
  function dueList(S, user, upTo) {
    const out = [];
    for (const r of S.recurring) {
      if (!r.active) continue;
      const a = get(S, 'accounts', r.accountId); if (!canView(a, user)) continue;
      const d = nextDue(r); if (d && d <= upTo) out.push({ rule: r, date: d });
    }
    return out.sort((x, y) => x.date < y.date ? -1 : 1);
  }
  function upcoming(S, user, fromStr, toStr) {
    const out = [];
    for (const r of S.recurring) {
      if (!r.active) continue;
      const a = get(S, 'accounts', r.accountId); if (!canView(a, user)) continue;
      for (let n = r.cursor; n < r.cursor + 60; n++) {
        const d = occurrence(r, n); if (r.endDate && d > r.endDate) break; if (d > toStr) break;
        if (d >= fromStr || n === r.cursor) out.push({ rule: r, date: d });
      }
    }
    return out.sort((x, y) => x.date < y.date ? -1 : 1);
  }
  function confirmDue(S, user, ruleId, o) {
    const r = get(S, 'recurring', ruleId); if (!r || !r.active) throw err('NOT_FOUND');
    const d = nextDue(r); if (!d) throw err('ENDED', 'القاعدة انتهت');
    const tx = addTx(S, user, { type: r.kind, accountId: r.accountId, categoryId: r.categoryId, amount: (o && o.amount) || r.amount,
      date: d, description: r.description, opId: 'rec:' + r.id + ':' + d, recurringId: r.id }); // opId prevents duplicate generation
    tx.recurringId = r.id; put(S, 'transactions', tx);
    put(S, 'recurring', { ...r, cursor: r.cursor + 1 });
    return tx;
  }
  function skipDue(S, user, ruleId) {
    const r = get(S, 'recurring', ruleId); if (!r) throw err('NOT_FOUND');
    put(S, 'recurring', { ...r, cursor: r.cursor + 1 }); audit(S, user, 'skip', 'recurring', r.id, null, { skipped: nextDue(r) });
  }

  /* ---------- savings goals ---------- */
  function addGoal(S, user, o) {
    if (!(o.target > 0)) throw err('BAD_AMOUNT', 'مبلغ الهدف غير صالح');
    const scope = o.scope === 'household' ? 'household' : 'personal';
    const g = put(S, 'goals', { id: uid(), name: o.name, target: o.target, accountId: o.accountId || null, targetDate: o.targetDate || null,
      startDate: o.startDate || today(), scope, ownerId: user.id, icon: o.icon || '🎯' });
    audit(S, user, 'create', 'goal', g.id, null, g); return g;
  }
  function goalCurrent(S, goalId) { return S.contribs.filter(c => c.goalId === goalId).reduce((s, c) => s + c.amount, 0); }
  function contribute(S, user, goalId, amount, date, note) {
    const g = get(S, 'goals', goalId); if (!g) throw err('NOT_FOUND');
    if (g.scope === 'personal' && g.ownerId !== user.id) throw err('FORBIDDEN', 'غير مسموح');
    if (!Number.isInteger(amount) || amount === 0) throw err('BAD_AMOUNT', 'المبلغ غير صالح');
    if (goalCurrent(S, goalId) + amount < 0) throw err('OVER_WITHDRAW', 'لا يمكن سحب أكثر من الرصيد المدخر');
    const c = put(S, 'contribs', { id: uid(), goalId, amount, date: date || today(), note: note || '', by: user.id });
    audit(S, user, 'contribute', 'goal', goalId, null, c); return c;
  }
  function goalStatus(S, g, nowStr) {
    nowStr = nowStr || today();
    const cur = goalCurrent(S, g.id); const pct = Math.min(100, Math.floor((cur * 100) / g.target));
    let planned = null, behind = false;
    if (g.targetDate && g.targetDate > g.startDate) {
      const tot = parseD(g.targetDate) - parseD(g.startDate), el = Math.min(Math.max(parseD(nowStr) - parseD(g.startDate), 0), tot);
      planned = Math.floor((el * 100) / tot); behind = pct < planned - 5 && cur < g.target;
    }
    return { current: cur, pct, remaining: Math.max(0, g.target - cur), plannedPct: planned, behind };
  }

  /* ---------- debts ---------- */
  function addDebt(S, user, o) {
    if (!(o.amount > 0)) throw err('BAD_AMOUNT', 'المبلغ غير صالح');
    if (!o.party || !o.party.trim()) throw err('NAME_REQUIRED', 'اسم الطرف مطلوب');
    const d = put(S, 'debts', { id: uid(), direction: o.direction === 'owed' ? 'owed' : 'owe', party: o.party.trim(), amount: o.amount, currency: o.currency || BASE,
      date: o.date || today(), due: o.due || null, notes: o.notes || '', scope: o.scope === 'household' ? 'household' : 'personal', ownerId: user.id,
      installments: o.installments || 0, installmentAmount: o.installmentAmount || 0, attachments: [] });
    audit(S, user, 'create', 'debt', d.id, null, d); return d;
  }
  function debtPaid(S, id) { return S.debtPays.filter(p => p.debtId === id).reduce((s, p) => s + p.amount, 0); }
  function debtStatus(S, d, nowStr) {
    const paid = debtPaid(S, d.id), rem = d.amount - paid;
    const st = rem <= 0 ? 'paid' : (d.due && d.due < (nowStr || today())) ? 'overdue' : paid > 0 ? 'partial' : 'open';
    return { paid, remaining: rem, status: st };
  }
  // Recording a payment is separate from the cash movement; createTx (optional) records the cash side exactly once.
  function payDebt(S, user, debtId, o) {
    const d = get(S, 'debts', debtId); if (!d) throw err('NOT_FOUND');
    if (d.scope === 'personal' && d.ownerId !== user.id) throw err('FORBIDDEN', 'غير مسموح');
    const st = debtStatus(S, d);
    if (!(o.amount > 0)) throw err('BAD_AMOUNT', 'المبلغ غير صالح');
    if (o.amount > st.remaining) throw err('OVER_PAY', 'المبلغ أكبر من المتبقي');
    // build the payment first; create the cash movement BEFORE saving anything so a failure leaves no partial state
    let p = { id: uid(), debtId, amount: o.amount, date: o.date || today(), txId: null, by: user.id, note: o.note || '' };
    if (o.accountId) {
      const tx = addTx(S, user, { type: d.direction === 'owe' ? 'expense' : 'income', accountId: o.accountId, amount: o.amount, date: p.date,
        categoryId: 'cat_debt', isDebt: true, description: (d.direction === 'owe' ? 'سداد دين: ' : 'تحصيل دين: ') + d.party, opId: 'debtpay:' + p.id });
      p.txId = tx.id;
    }
    put(S, 'debtPays', p);
    audit(S, user, 'pay', 'debt', debtId, null, p); return p;
  }

  /* ---------- shopping → expense (exactly once) ---------- */
  function recordItemExpense(S, user, itemId, accountId, categoryId) {
    const it = get(S, 'shopItems', itemId); if (!it) throw err('NOT_FOUND');
    if (it.expenseTxId) { const t = get(S, 'transactions', it.expenseTxId); if (t && !t.deleted) throw err('DUPLICATE', 'تم تسجيل مصروف هذا الصنف من قبل'); }
    if (!(it.actualPrice > 0)) throw err('BAD_AMOUNT', 'أدخل السعر الفعلي أولاً');
    const tx = addTx(S, user, { type: 'expense', accountId, categoryId: categoryId || 'cat_groceries', amount: it.actualPrice, date: today(), description: it.name, opId: 'shop:' + it.id });
    put(S, 'shopItems', { ...it, expenseTxId: tx.id, purchased: true }); return tx;
  }

  /* ---------- reconciliation & monthly closing ---------- */
  function reconcile(S, user, accountId, monthEnd, actual, o) {
    o = o || {};
    const a = get(S, 'accounts', accountId); if (!canWrite(a, user)) throw err('FORBIDDEN', 'غير مسموح');
    if (!Number.isInteger(actual)) throw err('BAD_AMOUNT', 'الرصيد الفعلي غير صالح');
    const system = balanceOf(S, accountId, monthEnd), diff = actual - system;
    let adj = null;
    if (diff !== 0 && o.adjust) {
      if (!o.note || !o.note.trim()) throw err('NOTE_REQUIRED', 'اكتب سبب التسوية');
      adj = addTx(S, user, { type: 'adjustment', accountId, amount: diff, date: monthEnd, categoryId: 'cat_adjust', description: 'تسوية: ' + o.note.trim(), opId: 'recon:' + accountId + ':' + monthEnd + ':' + Date.now() });
    }
    const rec = put(S, 'recons', { id: uid(), accountId, date: monthEnd, system, actual, diff, adjustmentTxId: adj ? adj.id : null,
      status: diff === 0 ? 'matched' : adj ? 'adjusted' : 'unresolved', note: o.note || '', by: user.id, at: new Date().toISOString() });
    audit(S, user, 'reconcile', 'account', accountId, null, rec);
    return { system, actual, diff, adjustment: adj, status: rec.status, record: rec };
  }
  function closeMonth(S, user, ym, scope) {
    scope = scope === 'household' ? 'household' : 'personal';
    if (scope === 'household' && !isAdmin(user)) throw err('FORBIDDEN', 'إقفال الشهر المشترك للمسؤول فقط');
    if (S.closings.some(c => c.status === 'closed' && c.month === ym && c.scope === scope && (scope === 'household' || c.ownerId === user.id))) throw err('ALREADY', 'الشهر مقفل بالفعل');
    const rg = monthRange(ym);
    const accts = S.accounts.filter(a => (scope === 'household' ? a.visibility === 'household' : (a.visibility === 'private' && a.ownerId === user.id)));
    const balances = accts.map(a => {
      const rc = S.recons.filter(r => r.accountId === a.id && r.date === rg.to).sort((x, y) => x.at < y.at ? 1 : -1)[0];
      return { accountId: a.id, name: a.name, currency: a.currency, balance: balanceOf(S, a.id, rg.to), reconciled: !!rc && rc.status !== 'unresolved' };
    });
    const sum = summarize(S, user, rg.from, rg.to, scope);
    const c = put(S, 'closings', { id: uid(), month: ym, scope, ownerId: user.id, status: 'closed', closedAt: new Date().toISOString(), closedBy: user.id, snapshot: { balances, summary: sum }, history: [] });
    audit(S, user, 'close', 'month', c.id, null, { ym, scope }); return c;
  }
  function reopenMonth(S, user, closingId, confirm) {
    const c = get(S, 'closings', closingId); if (!c) throw err('NOT_FOUND');
    if (confirm !== true) throw err('CONFIRM', 'يلزم التأكيد الصريح');
    if (c.scope === 'household' ? !isAdmin(user) : c.ownerId !== user.id) throw err('FORBIDDEN', 'غير مسموح بإعادة فتح هذه الفترة');
    const next = { ...c, status: 'open', history: [...c.history, { reopenedAt: new Date().toISOString(), by: user.id }] };
    put(S, 'closings', next); audit(S, user, 'reopen', 'month', c.id, c, next); return next;
  }
  // Re-computes the closing snapshot from ledger entries dated within the closed period and compares.
  function verifyClosing(S, c) {
    const rg = monthRange(c.month); const bad = [];
    for (const b of c.snapshot.balances) {
      const now = S.transactions.reduce((s, t) => (t.deleted || t.date.slice(0, 10) > rg.to || t.postClose) ? s : s + effect(t, b.accountId), 0);
      if (now !== b.balance) bad.push({ accountId: b.accountId, snapshot: b.balance, recomputed: now });
    }
    return { ok: bad.length === 0, mismatches: bad };
  }

  /* ---------- insights (only from stored data, no predictions) ---------- */
  function insights(S, user, nowStr) {
    nowStr = nowStr || today(); const out = [];
    const cur = periodRange('month', nowStr); const prev = monthRange(monthOf(addMonthsClamped(cur.from, -1, 1)));
    const a = summarize(S, user, cur.from, cur.to, 'all'), b = summarize(S, user, prev.from, prev.to, 'all');
    for (const c of Object.keys(a.byCat)) {
      const p = b.byCat[c] || 0, n = a.byCat[c];
      if (p > 0 && n > 0) { const ch = Math.round(((n - p) * 100) / p); if (Math.abs(ch) >= 10) out.push({ code: ch > 0 ? 'cat_up' : 'cat_down', cat: c, pct: Math.abs(ch) }); }
    }
    const ah = summarize(S, user, cur.from, cur.to, 'household'), bh = summarize(S, user, prev.from, prev.to, 'household');
    if (bh.expense > 0 && ah.expense > bh.expense) out.push({ code: 'hh_over_prev' });
    for (const bg of S.budgets) {
      if (!bg.active || (bg.scope === 'personal' && bg.ownerId !== user.id)) continue;
      const st = budgetStatus(S, user, bg, nowStr);
      if (st.pct >= 100) out.push({ code: 'budget_over', cat: bg.categoryId, pct: st.pct });
      else if (st.pct >= 75) out.push({ code: 'budget_near', cat: bg.categoryId, pct: st.pct });
    }
    for (const g of S.goals) { if (g.scope === 'personal' && g.ownerId !== user.id) continue; if (goalStatus(S, g, nowStr).behind) out.push({ code: 'goal_behind', goal: g.name }); }
    return out;
  }

  /* ---------- OCR text parsing (pure; OCR engine itself runs in the browser) ---------- */
  function parseReceiptText(text) {
    const norm = String(text || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
    const lines = norm.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const merchant = lines.find(l => /[A-Za-z؀-ۿ]{3,}/.test(l) && !/^\d/.test(l) && !/(tax|vat|total|receipt|فاتورة|ضريبة|اجمالي|إجمالي)/i.test(l)) || '';
    let date = null;
    const dm = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(norm) || null;
    const dm2 = /(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(norm) || null;
    if (dm) date = dm[1] + '-' + pad(+dm[2]) + '-' + pad(+dm[3]); else if (dm2) date = dm2[3] + '-' + pad(+dm2[2]) + '-' + pad(+dm2[1]);
    const numIn = l => { const m = l.match(/\d[\d,]*\.\d{1,2}|\d[\d,]*/g); return m ? m.map(x => parseMoney(x.replace(/,/g, ''))).filter(x => x != null) : []; };
    let total = null, tax = null;
    for (const l of lines) {
      if (/(grand\s*total|total|amount due|اجمالي|إجمالي|المجموع|الصافي)/i.test(l) && !/sub\s*total/i.test(l)) { const n = numIn(l); if (n.length) total = Math.max(...n); }
      if (/(vat|tax|ضريبة)/i.test(l)) { const n = numIn(l); if (n.length) tax = n[n.length - 1]; }
    }
    if (total == null) { const all = lines.flatMap(numIn).filter(x => x > 0); if (all.length) total = Math.max(...all); }
    let currency = BASE; if (/\bUSD\b|\$/.test(norm)) currency = 'USD'; else if (/\bEUR\b|€/.test(norm)) currency = 'EUR'; else if (/\bSAR\b|ر\.?\s?س/.test(norm)) currency = 'SAR';
    const low = norm.toLowerCase(); let cat = 'cat_other';
    if (/(market|مول|هايبر|سوبر|carrefour|كارفور|spinneys|بقالة|مخبز)/i.test(low)) cat = 'cat_groceries';
    else if (/(restaurant|cafe|coffee|مطعم|كافيه|قهوة)/i.test(low)) cat = 'cat_food';
    else if (/(pharmacy|صيدلية|clinic|عيادة)/i.test(low)) cat = 'cat_medical';
    else if (/(uber|careem|petrol|fuel|بنزين|اوبر|كريم)/i.test(low)) cat = 'cat_transport';
    else if (/(electric|كهرباء)/i.test(low)) cat = 'cat_electricity';
    return { merchant, date, total, tax, currency, categoryId: cat, confidence: [merchant ? 1 : 0, date ? 1 : 0, total != null ? 1 : 0].reduce((a, b) => a + b, 0) / 3 };
  }

  return { BASE, BUILTIN_CUR, STORES, uid, err, parseMoney, fmtMoney, today, dstr, parseD, monthOf, monthRange, addMonthsClamped, addDays, weekStart,
    newState, put, remove, get, audit, seedCategories, DEFAULT_CATS, isAdmin, canView, canWrite, visibleAccounts, inScope,
    rateFor, setRate, toBase, createAccount, updateAccount, effect, balanceOf, isClosed, addTx, editTx, deleteTx, visibleTx, txView, ledger,
    summarize, totalBalance, trend, periodRange, addBudget, budgetStatus, occurrence, addRule, nextDue, dueList, upcoming, confirmDue, skipDue,
    addGoal, goalCurrent, contribute, goalStatus, addDebt, debtPaid, debtStatus, payDebt, recordItemExpense, reconcile, closeMonth, reopenMonth,
    verifyClosing, insights, parseReceiptText };
});
