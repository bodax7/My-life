/* MyLife — money screens: accounts, transactions, budgets, recurring, goals, debts, closing, reports */
(() => {
  const { h, t, S } = App;
  const SUBS = ['accounts', 'transactions', 'budgets', 'recurring', 'goals', 'debts', 'close', 'reports'];
  const parseM = s => Fin.parseMoney(s);
  const curOptions = () => ['EGP', 'USD', 'EUR', 'SAR', ...App.get('customCur', [])].map(c => [c, c]);
  const typeLabel = ty => t('tt_' + ty);

  App.screens.money = (sub, p) => {
    sub = sub || 'accounts';
    return h('div', {}, App.chips(SUBS.map(s => [s, t('m_' + s)]), sub, v => App.go('money', v)), (M[sub] || M.accounts)(p || {}));
  };

  /* ---------- transaction rows / details ---------- */
  function txRow(tv, accountId) {
    const isT = tv.type === 'transfer'; const eff = accountId ? tv.effect : (tv.type === 'income' || tv.type === 'refund' ? tv.amount : tv.type === 'expense' ? -tv.amount : tv.amount);
    const title = tv.description || (isT ? t('tt_transfer') : App.catName(tv.categoryId));
    const sub = isT ? (tv.fromName || t('private_account')) + ' → ' + (tv.toName || t('private_account')) : App.catName(tv.categoryId) + ' · ' + App.accName(tv.accountId);
    const cls = isT ? 'neutral' : eff >= 0 ? 'in' : 'out';
    const shown = isT && accountId ? tv.effect : isT ? tv.amount : eff;
    return h('div', { class: 'row tap', onclick: () => txDetail(tv.id) },
      h('div', { class: 'avatar' }, isT ? '🔄' : tv.type === 'adjustment' ? '⚖️' : tv.type === 'opening' ? '🏁' : App.catIcon(tv.categoryId)),
      h('div', { class: 'grow' }, h('div', { class: 'title' }, title, tv.attachments && tv.attachments.length ? ' 📎' : ''), h('div', { class: 'sub' }, sub + (tv.createdBy !== App.user.id ? ' · ' + App.userName(tv.createdBy) : ''))),
      h('div', { style: { textAlign: 'end' } }, h('div', { class: 'amt ' + cls }, (shown > 0 && !isT ? '+' : '') + Fin.fmtMoney(shown, tv.currency, App.lang)), accountId ? h('div', { class: 'small muted' }, Fin.fmtMoney(tv.balance, tv.currency, App.lang)) : null));
  }
  function groupByDay(rows, mk) {
    const out = []; let last = '';
    rows.forEach(r => { const d = r.date.slice(0, 10); if (d !== last) { out.push(h('div', { class: 'day' }, App.date(d))); last = d; } out.push(mk(r)); });
    return out;
  }

  function txDetail(id) {
    const tx = Fin.get(S, 'transactions', id); if (!tx) return; const tv = Fin.txView(S, App.user, tx);
    const acc = App.acc(tx.accountId); const canEdit = Fin.canWrite(acc, App.user) && tx.type !== 'opening';
    const refunded = S.transactions.filter(r => r.type === 'refund' && r.refundOf === id && !r.deleted).reduce((s, r) => s + r.amount, 0);
    const files = S.files.filter(f => f.parent && f.parent.kind === 'tx' && f.parent.id === id);
    const line = (k, v) => v ? h('div', { class: 'row' }, h('div', { class: 'muted', style: { width: '38%' } }, k), h('div', { class: 'grow', style: { whiteSpace: 'normal' } }, v)) : null;
    App.sheet(typeLabel(tx.type), s => h('div', {},
      h('div', { style: { textAlign: 'center', fontSize: '30px', fontWeight: 800, margin: '6px 0' } }, App.money(tx.amount, tx.currency)),
      tx.currency !== Fin.BASE ? h('div', { class: 'muted small', style: { textAlign: 'center' } }, t('rate_used', { rate: tx.rate, base: App.moneyTxt(tx.baseAmount) })) : null,
      line(t('description'), tx.description), line(t('date'), App.date(tx.date.slice(0, 10))),
      line(t('account'), tx.type === 'transfer' ? (tv.fromName || t('private_account')) + ' → ' + (tv.toName || t('private_account')) : App.accName(tx.accountId)),
      tx.type === 'transfer' && tx.toAmount !== tx.amount ? line(t('received'), Fin.fmtMoney(tx.toAmount, tx.toCurrency, App.lang)) : null,
      line(t('category'), tx.type === 'transfer' ? '' : App.catName(tx.categoryId)), line(t('notes'), tx.notes), line(t('created_by'), App.userName(tx.createdBy) + ' · ' + App.dateTime(tx.createdAt)),
      tx.postClose ? h('div', { class: 'banner' }, t('post_close_note')) : null,
      refunded ? line(t('refunded'), App.moneyTxt(refunded, tx.currency)) : null,
      files.length ? h('div', { class: 'chips' }, files.map(f => h('button', { class: 'chip', onclick: () => App.viewFile(f) }, '📎 ' + f.name))) : null,
      h('div', { class: 'btns' },
        canEdit ? h('button', { class: 'btn', onclick: () => { s.close(); App.txSheet({ tx }); } }, t('edit')) : null,
        canEdit && tx.type === 'expense' && refunded < tx.amount ? h('button', { class: 'btn', onclick: () => { s.close(); refundSheet(tx); } }, t('refund')) : null,
        canEdit ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete_tx'), { danger: true, ok: t('delete') })) { const r = await App.act(() => Fin.deleteTx(S, App.user, id), t('deleted')); if (r.ok) { s.close(); App.render(); } } } }, t('delete')) : null)));
  }

  App.txDetail = txDetail;
  function refundSheet(tx) {
    const left = tx.amount - S.transactions.filter(r => r.type === 'refund' && r.refundOf === tx.id && !r.deleted).reduce((s, r) => s + r.amount, 0);
    const amt = App.moneyInput(left, { big: true }), date = App.input('date', { value: App.today() }); const opId = Fin.uid();
    App.sheet(t('refund'), s => h('div', {}, h('p', { class: 'muted' }, t('refund_of', { name: tx.description || App.catName(tx.categoryId) })), App.field(t('amount'), amt), App.field(t('date'), date),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        const m = parseM(amt.value); if (!m) return App.toast(t('err_BAD_AMOUNT'), 'err');
        const r = await App.act(() => Fin.addTx(S, App.user, { type: 'refund', accountId: tx.accountId, amount: m, refundOf: tx.id, date: date.value, description: t('refund') + ': ' + tx.description, opId }), t('saved')); if (r.ok) { s.close(); App.render(); }
      } }, t('save')), h('button', { class: 'btn', onclick: s.close }, t('cancel')))));
  }

  /* ---------- add / edit transaction ---------- */
  App.txSheet = (o) => {
    o = o || {}; const edit = o.tx || null; const st = {
      type: edit ? edit.type : (o.type || 'expense'), opId: Fin.uid(), amount: edit ? (edit.amount / 100).toFixed(2).replace(/\.00$/, '') : (o.amount != null ? String(o.amount / 100) : ''), accountId: edit ? edit.accountId : (o.accountId || null),
      toAccountId: edit ? edit.toAccountId : null, toAmount: edit && edit.toAmount != null && edit.toAmount !== edit.amount ? (edit.toAmount / 100).toString() : '', categoryId: edit ? edit.categoryId : (o.categoryId || null),
      date: edit ? edit.date.slice(0, 10) : (o.date || App.today()), description: edit ? edit.description : (o.description || ''), notes: edit ? edit.notes : (o.notes || ''), rate: edit && edit.currency !== Fin.BASE ? String(edit.rate) : '', files: o.files || [],
    };
    const writable = App.accountsFor(App.user, true); if (!writable.length) return App.toast(t('no_accounts'), 'err');
    if (!st.accountId || !writable.some(a => a.id === st.accountId)) { const last = App.get('lastAcc_' + (st.type === 'income' ? 'income' : 'expense')); st.accountId = writable.some(a => a.id === last) ? last : writable[0].id; }
    App.sheet(edit ? t('edit_tx') : t('new_tx'), s => {
      const box = h('div'); let saving = false;
      const draw = () => {
        const acc = App.acc(st.accountId), to = st.toAccountId ? App.acc(st.toAccountId) : null; const foreign = acc && acc.currency !== Fin.BASE;
        const kind = st.type === 'income' ? 'income' : 'expense';
        if (st.type !== 'transfer' && !st.categoryId) st.categoryId = (App.get('recentCats_' + kind, [])[0]) || (S.categories.find(c => c.kind === kind) || {}).id;
        const amount = App.moneyInput(null, { big: true }); amount.value = st.amount; amount.addEventListener('input', () => st.amount = amount.value);
        const accSel = App.select(App.accOptions(true), st.accountId); accSel.addEventListener('change', () => { st.accountId = accSel.value; if (st.toAccountId === st.accountId) st.toAccountId = null; draw(); });
        const children = [];
        if (!edit) children.push(App.seg([['expense', t('tt_expense')], ['income', t('tt_income')], ['transfer', t('tt_transfer')]], st.type, v => { st.type = v; st.categoryId = null; draw(); }));
        children.push(h('div', { class: 'field' }, amount), App.field(st.type === 'transfer' ? t('from_account') : t('account'), accSel));
        if (st.type === 'transfer') {
          const opts = App.accOptions(true).filter(([id]) => id !== st.accountId); if (!st.toAccountId || st.toAccountId === st.accountId) st.toAccountId = opts[0] && opts[0][0];
          const toSel = App.select(opts, st.toAccountId); toSel.addEventListener('change', () => { st.toAccountId = toSel.value; draw(); }); children.push(App.field(t('to_account'), toSel));
          if (to && acc && to.currency !== acc.currency) { const ta = App.moneyInput(null); ta.value = st.toAmount; ta.addEventListener('input', () => st.toAmount = ta.value); children.push(App.field(t('received_amount') + ' (' + to.currency + ')', ta, t('received_hint'))); }
        } else {
          const cp = App.catPicker(kind, st.categoryId); cp.addEventListener('click', () => { st.categoryId = cp.value; }); children.push(App.field(t('category'), cp));
        }
        if (foreign) { const rate = App.input('text', { mode: 'decimal' }); rate.value = st.rate || (Fin.rateFor(S, acc.currency) || ''); st.rate = rate.value; rate.addEventListener('input', () => st.rate = rate.value); children.push(App.field(t('exchange_rate') + ' (1 ' + acc.currency + ' = ? EGP)', rate)); }
        const date = App.input('date', { value: st.date }); date.addEventListener('change', () => st.date = date.value);
        const desc = App.input('text', { ph: t('description_ph'), value: st.description }); desc.addEventListener('input', () => st.description = desc.value);
        const notes = h('textarea', { placeholder: t('notes') }); notes.value = st.notes; notes.addEventListener('input', () => st.notes = notes.value);
        children.push(App.field(t('date'), date), App.field(t('description'), desc), App.field(t('notes'), notes));
        const fl = h('div', { class: 'chips' }, st.files.map((f, i) => h('button', { class: 'chip', onclick: () => { st.files.splice(i, 1); draw(); } }, '📎 ' + f.name + ' ✕')),
          h('button', { class: 'chip', onclick: async () => { const f = await App.pickFile('image/*', 'environment'); if (f) { st.files.push(f); draw(); } } }, '📷 ' + t('camera')),
          h('button', { class: 'chip', onclick: async () => { const f = await App.pickFile('image/*,application/pdf'); if (f) { st.files.push(f); draw(); } } }, '🖼️ ' + t('gallery_file')));
        children.push(fl);
        const save = h('button', { class: 'btn primary', onclick: async () => {
          if (saving) return; const amt = parseM(st.amount); if (!amt) return App.toast(t('err_BAD_AMOUNT'), 'err');
          const tAmt = st.toAmount ? parseM(st.toAmount) : null; const rate = st.rate ? Number(String(st.rate).replace(',', '.')) : null; saving = true; save.disabled = true;
          const r = await App.act(async () => {
            const data = { type: st.type, accountId: st.accountId, toAccountId: st.type === 'transfer' ? st.toAccountId : null, amount: amt, toAmount: tAmt, categoryId: st.type === 'transfer' ? null : st.categoryId, date: st.date, description: st.description, notes: st.notes, rate, opId: st.opId };
            const a2 = App.acc(st.accountId); if (a2 && a2.currency !== Fin.BASE && rate) { const known = Fin.rateFor(S, a2.currency, st.date); if (known !== rate) Fin.setRate(S, App.user, a2.currency, rate, st.date); }
            let tx = edit ? Fin.editTx(S, App.user, edit.id, data) : Fin.addTx(S, App.user, data);
            for (const f of st.files) { const rec = await App.saveAttachment(f, { kind: 'tx', id: tx.id }); tx = { ...tx, attachments: [...(tx.attachments || []), rec.id] }; Fin.put(S, 'transactions', tx); }
            return tx;
          }, t('saved'));
          saving = false; save.disabled = false;
          if (r.ok) { if (st.type !== 'transfer') { App.set('lastAcc_' + (st.type === 'income' ? 'income' : 'expense'), st.accountId); const k = st.type === 'income' ? 'income' : 'expense'; App.set('recentCats_' + k, [st.categoryId, ...App.get('recentCats_' + k, []).filter(x => x !== st.categoryId)].slice(0, 6)); await DB.flush(S); } s.close(); App.render(); }
        } }, t('save'));
        children.push(h('div', { class: 'btns' }, save, h('button', { class: 'btn', onclick: s.close }, t('cancel'))));
        box.replaceChildren(...children);
      };
      draw(); setTimeout(() => { const i = box.querySelector('.amount-input'); i && !edit && i.focus(); }, 80); return box;
    });
  };

  /* ---------- accounts ---------- */
  const M = {};
  function accountSheet(acc) {
    const nm = App.input('text', { value: acc ? acc.name : '' }), ty = App.select([['cash', t('at_cash')], ['bank', t('at_bank')], ['wallet', t('at_wallet')], ['savings', t('at_savings')], ['other', t('at_other')]], acc ? acc.type : 'cash');
    const cur = App.select(curOptions(), acc ? acc.currency : 'EGP'); cur.disabled = !!acc;
    const opening = App.moneyInput(null); const vis = App.seg([['private', '🔒 ' + t('private')], ...(Fin.isAdmin(App.user) ? [['household', '🏠 ' + t('household')]] : [])], acc ? acc.visibility : 'private'); const desc = App.input('text', { value: acc ? acc.description : '' });
    App.sheet(acc ? t('edit_account') : t('add_account'), s => h('div', {}, App.field(t('name'), nm), App.field(t('type'), ty), App.field(t('currency'), cur,
      !acc ? h('button', { class: 'btn sm ghost', onclick: async () => { const code = (prompt(t('custom_currency_prompt')) || '').trim().toUpperCase(); if (/^[A-Z]{3,5}$/.test(code)) { App.set('customCur', [...new Set([...App.get('customCur', []), code])]); await DB.flush(S); s.close(); accountSheet(acc); } } }, '+ ' + t('custom_currency')) : null),
      !acc ? App.field(t('opening_balance'), opening) : null, acc ? null : App.field(t('visibility'), vis), App.field(t('description'), desc),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        const r = await App.act(() => acc ? Fin.updateAccount(S, App.user, acc.id, { name: nm.value, type: ty.value, description: desc.value }) : Fin.createAccount(S, App.user, { name: nm.value, type: ty.value, currency: cur.value, opening: opening.value ? parseM(opening.value) : 0, visibility: vis.value, description: desc.value }), t('saved'));
        if (r.ok) { s.close(); App.render(); } } }, t('save')), acc ? h('button', { class: 'btn', onclick: async () => { const r = await App.act(() => Fin.updateAccount(S, App.user, acc.id, { active: acc.active === false })); if (r.ok) { s.close(); App.go('money', 'accounts'); } } }, acc.active === false ? t('activate') : t('deactivate')) : null)));
  }

  function reconcileSheet(acc) {
    const today = App.today(); const defEnd = Fin.monthRange(Fin.monthOf(Fin.addMonthsClamped(today, -1, 1))).to;
    const date = App.input('date', { value: defEnd }); const actual = App.moneyInput(null, { big: true }); const note = App.input('text', { ph: t('adjust_reason') }); const out = h('div', { class: 'card' });
    const upd = () => { const sys = Fin.balanceOf(S, acc.id, date.value); const a = parseM(actual.value); out.replaceChildren(h('div', { class: 'row' }, h('div', { class: 'grow' }, t('system_balance')), h('b', {}, App.money(sys, acc.currency))), h('div', { class: 'row' }, h('div', { class: 'grow' }, t('actual_balance')), h('b', {}, a == null ? '—' : App.money(a, acc.currency))), h('div', { class: 'row' }, h('div', { class: 'grow' }, t('difference')), a == null ? '—' : h('b', { class: 'amt ' + (a - sys === 0 ? 'in' : 'out') }, App.money(a - sys, acc.currency))), a != null ? h('span', { class: 'badge ' + (a === sys ? 'ok' : 'bad') }, a === sys ? t('rs_matched') : t('rs_unresolved')) : null); };
    date.addEventListener('change', upd); actual.addEventListener('input', upd); upd();
    App.sheet(t('reconcile') + ' — ' + acc.name, s => h('div', {}, App.field(t('as_of'), date), App.field(t('actual_balance'), actual), out, App.field(t('adjust_reason'), note),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: async () => { const a = parseM(actual.value); if (a == null) return App.toast(t('err_BAD_AMOUNT'), 'err'); const r = await App.act(() => Fin.reconcile(S, App.user, acc.id, date.value, a, { adjust: false }), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('record_only')),
        h('button', { class: 'btn primary', onclick: async () => { const a = parseM(actual.value); if (a == null) return App.toast(t('err_BAD_AMOUNT'), 'err'); const r = await App.act(() => Fin.reconcile(S, App.user, acc.id, date.value, a, { adjust: true, note: note.value }), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('record_adjustment')))));
  }

  M.accounts = (p) => {
    if (p.acc) return ledgerView(p.acc);
    const row = a => { const bal = Fin.balanceOf(S, a.id); return h('div', { class: 'row tap', onclick: () => App.go('money', 'accounts', { acc: a.id }) }, h('div', { class: 'avatar' }, { cash: '💵', bank: '🏦', wallet: '📱', savings: '🐷' }[a.type] || '💳'), h('div', { class: 'grow' }, h('div', { class: 'title' }, a.name, a.active === false ? ' ⏸' : ''), h('div', { class: 'sub' }, a.currency + (a.currency !== Fin.BASE ? ' · ≈ ' + App.moneyTxt(Fin.toBase(bal, Fin.rateFor(S, a.currency) || 0)) : ''))), h('div', { class: 'amt' }, App.money(bal, a.currency))); };
    const mine = S.accounts.filter(a => a.visibility === 'private' && Fin.canView(a, App.user)), hh = S.accounts.filter(a => a.visibility === 'household');
    const pt = Fin.totalBalance(S, App.user, 'personal'), ht = Fin.totalBalance(S, App.user, 'household');
    return h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'stat hero' }, h('small', {}, '🔒 ' + t('personal_total')), h('b', {}, App.money(pt.total))), h('div', { class: 'stat' }, h('small', {}, '🏠 ' + t('household_total')), h('b', {}, App.money(ht.total)))),
      h('div', { class: 'small muted', style: { margin: '6px 4px' } }, t('totals_note')),
      h('div', { class: 'card' }, h('h3', {}, '🔒 ' + t('personal_accounts')), mine.length ? mine.map(row) : App.empty(t('no_accounts'))),
      h('div', { class: 'card' }, h('h3', {}, '🏠 ' + t('household_accounts')), hh.length ? hh.map(row) : App.empty(t('no_accounts'))),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => accountSheet() }, '+ ' + t('add_account')), h('button', { class: 'btn', onclick: () => ratesSheet() }, '💱 ' + t('exchange_rates'))));
  };
  function ledgerView(id) {
    const acc = App.acc(id); if (!acc || !Fin.canView(acc, App.user)) return App.empty(t('err_FORBIDDEN'));
    const rows = Fin.ledger(S, App.user, id); const bal = Fin.balanceOf(S, id);
    return h('div', {}, h('button', { class: 'btn sm ghost', onclick: () => App.go('money', 'accounts') }, (App.lang === 'ar' ? '→ ' : '← ') + t('back')),
      h('div', { class: 'stat hero', style: { margin: '8px 0' } }, h('small', {}, acc.name + (acc.visibility === 'household' ? ' 🏠' : ' 🔒')), h('b', {}, App.money(bal, acc.currency))),
      h('div', { class: 'btns' }, Fin.canWrite(acc, App.user) ? h('button', { class: 'btn primary', onclick: () => App.txSheet({ accountId: id }) }, '+ ' + t('new_tx')) : null, Fin.canWrite(acc, App.user) ? h('button', { class: 'btn', onclick: () => reconcileSheet(acc) }, '⚖️ ' + t('reconcile')) : null, (Fin.isAdmin(App.user) || acc.ownerId === App.user.id) ? h('button', { class: 'btn', onclick: () => accountSheet(acc) }, t('edit')) : null),
      h('div', { class: 'card' }, rows.length ? groupByDay(rows.slice(0, 150), r => txRow(r, id)) : App.empty(t('no_tx'))));
  }
  function ratesSheet() {
    const cur = App.select(curOptions().filter(([c]) => c !== 'EGP'), 'USD'); const rate = App.input('text', { mode: 'decimal', ph: '0.00' });
    App.sheet(t('exchange_rates'), s => h('div', {}, h('p', { class: 'muted small' }, t('rates_note')),
      S.rates.length ? [...new Set(S.rates.map(r => r.currency))].map(c => h('div', { class: 'row' }, h('div', { class: 'grow' }, '1 ' + c), h('b', {}, App.num(Fin.rateFor(S, c)) + ' EGP'))) : null,
      App.field(t('currency'), cur), App.field(t('rate_to_egp'), rate), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const r = await App.act(() => Fin.setRate(S, App.user, cur.value, Number(rate.value.replace(',', '.')), App.today()), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')), h('button', { class: 'btn', onclick: s.close }, t('close')))));
  }

  /* ---------- transactions list ---------- */
  const TF = { q: '', acc: '', cat: '', type: '', user: '', from: '', to: '', limit: 60 };
  App.exportTx = (rows, fmt) => {
    const head = ['id', 'date', 'type', 'account', 'to_account', 'category', 'description', 'amount', 'currency', 'rate', 'amount_egp', 'created_by', 'notes'];
    const data = rows.map(r => { const tv = Fin.txView(S, App.user, r); return [r.id, r.date, r.type, tv.fromName || '', tv.toName || '', r.categoryId ? App.catName(r.categoryId) : '', r.description, (r.amount / 100).toFixed(2), r.currency, r.rate, (r.baseAmount / 100).toFixed(2), App.userName(r.createdBy), r.notes]; });
    if (fmt === 'xls') { const esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); App.download('mylife-transactions.xls', '<html dir="rtl"><head><meta charset="utf-8"></head><body><table border="1"><tr>' + head.map(x => '<th>' + x + '</th>').join('') + '</tr>' + data.map(r => '<tr>' + r.map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</table></body></html>', 'application/vnd.ms-excel'); return; }
    const q = x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"';
    App.download('mylife-transactions.csv', '﻿' + [head, ...data].map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  function filteredTx() {
    return Fin.visibleTx(S, App.user).filter(tx => {
      if (TF.acc && tx.accountId !== TF.acc && tx.toAccountId !== TF.acc) return false; if (TF.cat && tx.categoryId !== TF.cat) return false; if (TF.type && tx.type !== TF.type) return false;
      if (TF.user && tx.createdBy !== TF.user) return false; if (TF.from && tx.date.slice(0, 10) < TF.from) return false; if (TF.to && tx.date.slice(0, 10) > TF.to) return false;
      if (TF.q) { const q = Life.norm(TF.q); if (!Life.norm(tx.description + ' ' + tx.notes + ' ' + App.catName(tx.categoryId)).includes(q)) return false; } return true;
    }).sort((a, b) => (a.date + a.createdAt) < (b.date + b.createdAt) ? 1 : -1);
  }
  M.transactions = () => {
    const rows = filteredTx(); const wrap = h('div');
    const q = App.input('search', { ph: t('search_tx'), value: TF.q }); q.addEventListener('change', () => { TF.q = q.value; App.render(); });
    const mk = (k, opts, ph) => { const s = App.select([['', ph], ...opts], TF[k]); s.addEventListener('change', () => { TF[k] = s.value; TF.limit = 60; App.render(); }); return s; };
    const from = App.input('date', { value: TF.from }), to = App.input('date', { value: TF.to }); from.addEventListener('change', () => { TF.from = from.value; App.render(); }); to.addEventListener('change', () => { TF.to = to.value; App.render(); });
    const preset = (k) => { const n = App.today(); if (k === 'month') { const r = Fin.monthRange(Fin.monthOf(n)); TF.from = r.from; TF.to = r.to; } else if (k === 'last') { const r = Fin.monthRange(Fin.monthOf(Fin.addMonthsClamped(n, -1, 1))); TF.from = r.from; TF.to = r.to; } else { TF.from = ''; TF.to = ''; } App.render(); };
    const income = rows.filter(r => r.type === 'income' && !r.isDebt).reduce((s, r) => s + r.baseAmount, 0), exp = rows.filter(r => r.type === 'expense' && !r.isDebt).reduce((s, r) => s + r.baseAmount, 0) - rows.filter(r => r.type === 'refund').reduce((s, r) => s + r.baseAmount, 0);
    wrap.append(q, h('div', { class: 'chips' }, h('button', { class: 'chip', onclick: () => preset('month') }, t('this_month')), h('button', { class: 'chip', onclick: () => preset('last') }, t('last_month')), h('button', { class: 'chip', onclick: () => preset('all') }, t('all_time'))),
      h('div', { class: 'grid2' }, App.field(t('from'), from), App.field(t('to'), to)),
      h('div', { class: 'grid2' }, mk('acc', App.accountsFor(App.user).map(a => [a.id, a.name]), t('all_accounts')), mk('cat', S.categories.filter(c => c.kind !== 'system').map(c => [c.id, c.icon + ' ' + (App.lang === 'ar' ? c.name_ar : c.name_en)]), t('all_categories'))),
      h('div', { class: 'grid2' }, mk('type', ['income', 'expense', 'transfer', 'refund', 'adjustment'].map(x => [x, typeLabel(x)]), t('all_types')), mk('user', S.users.map(u => [u.id, u.name]), t('all_users'))),
      h('div', { class: 'card' }, h('div', { class: 'grid2' }, h('div', {}, h('small', { class: 'muted' }, t('income')), h('div', { class: 'amt in' }, App.money(income))), h('div', {}, h('small', { class: 'muted' }, t('expenses')), h('div', { class: 'amt out' }, App.money(exp)))), h('div', { class: 'small muted' }, t('transfers_excluded'))),
      h('div', { class: 'card' }, rows.length ? groupByDay(rows.slice(0, TF.limit), r => txRow(Fin.txView(S, App.user, r))) : App.empty(t('no_tx')), rows.length > TF.limit ? h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { TF.limit += 60; App.render(); } }, t('show_more'))) : null),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => App.txSheet({}) }, '+ ' + t('new_tx')), h('button', { class: 'btn', onclick: () => App.exportTx(rows, 'csv') }, 'CSV'), h('button', { class: 'btn', onclick: () => App.exportTx(rows, 'xls') }, 'Excel')));
    return wrap;
  };

  /* ---------- budgets ---------- */
  function budgetSheet(b) {
    const cat = App.select(S.categories.filter(c => c.kind === 'expense').map(c => [c.id, c.icon + ' ' + (App.lang === 'ar' ? c.name_ar : c.name_en)]), b ? b.categoryId : 'cat_groceries'); const amt = App.moneyInput(b ? b.amount : null, { big: true });
    const per = App.select([['monthly', t('monthly')], ['weekly', t('weekly')], ['custom', t('custom')]], b ? b.period : 'monthly'); const st = App.input('date', { value: b && b.start || App.today() }), en = App.input('date', { value: b && b.end || Fin.addDays(App.today(), 30) });
    const sc = App.seg([['personal', '🔒 ' + t('personal')], ...(Fin.isAdmin(App.user) ? [['household', '🏠 ' + t('household')]] : [])], b ? b.scope : 'personal'); const th = (b ? b.thresholds : [75, 90, 100]).map(v => App.input('number', { value: v, min: 1, max: 200 }));
    const customBox = h('div', { class: 'grid2' }, App.field(t('from'), st), App.field(t('to'), en)); const upd = () => customBox.hidden = per.value !== 'custom'; per.addEventListener('change', upd); upd();
    App.sheet(b ? t('edit_budget') : t('add_budget'), s => h('div', {}, App.field(t('category'), cat), App.field(t('budget_amount'), amt), App.field(t('period'), per), customBox, b ? null : App.field(t('scope'), sc), App.field(t('alert_thresholds'), h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' } }, th), t('thresholds_hint')),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        const m = parseM(amt.value); const thr = th.map(x => Number(x.value)).filter(x => x > 0).sort((a, c) => a - c);
        const r = await App.act(() => { if (b) { Fin.put(S, 'budgets', { ...b, categoryId: cat.value, amount: m, period: per.value, start: st.value, end: en.value, thresholds: thr }); } else Fin.addBudget(S, App.user, { categoryId: cat.value, amount: m, period: per.value, start: st.value, end: en.value, scope: sc.value, thresholds: thr }); }, t('saved')); if (r.ok) { s.close(); App.render(); }
      } }, t('save')), b ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete'), { danger: true, ok: t('delete') })) { await App.act(() => Fin.remove(S, 'budgets', b.id)); s.close(); App.render(); } } }, t('delete')) : null)));
  }
  M.budgets = () => {
    const mine = S.budgets.filter(b => b.scope === 'household' || b.ownerId === App.user.id);
    const card = b => { const st = Fin.budgetStatus(S, App.user, b, App.today()); const lvl = st.pct >= 100 ? 'bad' : st.pct >= 75 ? 'warn' : ''; return h('div', { class: 'card tap', onclick: () => (b.scope === 'household' && !Fin.isAdmin(App.user)) ? null : budgetSheet(b) },
      h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('b', {}, App.catIcon(b.categoryId) + ' ' + App.catName(b.categoryId) + (b.scope === 'household' ? ' 🏠' : ' 🔒')), h('span', { class: 'badge ' + (lvl === 'bad' ? 'bad' : lvl === 'warn' ? 'warn' : 'ok') }, App.num(st.pct) + '%')), App.progress(st.pct, lvl),
      h('div', { class: 'grid2 small', style: { marginTop: '8px' } }, h('div', {}, t('budget_amount'), ': ', App.money(b.amount)), h('div', {}, t('spent'), ': ', App.money(st.spent)), h('div', {}, t('remaining'), ': ', App.money(st.remaining)), h('div', { class: 'muted' }, App.date(st.range.from) + ' → ' + App.date(st.range.to)))); };
    return h('div', {}, mine.length ? mine.map(card) : App.empty(t('no_budgets')), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => budgetSheet() }, '+ ' + t('add_budget'))));
  };

  /* ---------- recurring ---------- */
  function ruleSheet(r) {
    const kind = App.seg([['expense', t('tt_expense')], ['income', t('tt_income')]], r ? r.kind : 'expense'), amt = App.moneyInput(r ? r.amount : null, { big: true }), acc = App.select(App.accOptions(true), r ? r.accountId : null);
    const cat = App.select(S.categories.filter(c => c.kind !== 'system').map(c => [c.id, c.icon + ' ' + (App.lang === 'ar' ? c.name_ar : c.name_en)]), r ? r.categoryId : 'cat_internet'); const fq = App.select(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'].map(x => [x, t('f_' + x)]), r ? r.freq : 'monthly');
    const iv = App.input('number', { value: r ? r.interval : 1, min: 1 }), sd = App.input('date', { value: r ? r.startDate : App.today() }), ed = App.input('date', { value: r && r.endDate || '' }), ds = App.input('text', { value: r ? r.description : '', ph: t('description_ph') }), rd = App.input('number', { value: r ? r.remindDays : 1, min: 0 });
    const prev = h('div', { class: 'small muted' }); const upd = () => { try { const tmp = { freq: fq.value, interval: Number(iv.value) || 1, startDate: sd.value }; prev.textContent = t('preview') + ': ' + [0, 1, 2].map(n => App.date(Fin.occurrence(tmp, n))).join(' · '); } catch (e) { prev.textContent = ''; } }; [fq, iv, sd].forEach(x => x.addEventListener('input', upd)); upd();
    App.sheet(r ? t('edit_rule') : t('add_rule'), s => h('div', {}, kind, h('div', { class: 'field' }, amt), App.field(t('account'), acc), App.field(t('category'), cat), App.field(t('frequency'), fq), App.field(t('every_n'), iv), App.field(t('start_date'), sd), prev, App.field(t('end_date') + ' (' + t('optional') + ')', ed), App.field(t('description'), ds), App.field(t('remind_days_before'), rd),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        const m = parseM(amt.value); const res = await App.act(() => { const o = { kind: kind.value, amount: m, accountId: acc.value, categoryId: cat.value, freq: fq.value, interval: Number(iv.value) || 1, startDate: sd.value, endDate: ed.value || null, description: ds.value, remindDays: Number(rd.value) };
          if (r) { if (!(m > 0)) throw Fin.err('BAD_AMOUNT'); Fin.put(S, 'recurring', { ...r, ...o }); } else Fin.addRule(S, App.user, o); }, t('saved')); if (res.ok) { s.close(); App.render(); } } }, t('save')),
        r ? h('button', { class: 'btn', onclick: async () => { await App.act(() => Fin.put(S, 'recurring', { ...r, active: !r.active })); s.close(); App.render(); } }, r.active ? t('pause') : t('resume')) : null,
        r ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete'), { danger: true, ok: t('delete') })) { await App.act(() => Fin.remove(S, 'recurring', r.id)); s.close(); App.render(); } } }, t('delete')) : null)));
  }
  M.recurring = () => {
    const due = Fin.dueList(S, App.user, App.today()); const up = Fin.upcoming(S, App.user, App.today(), Fin.addDays(App.today(), 45)).filter(x => !due.some(d => d.rule.id === x.rule.id && d.date === x.date));
    const rules = S.recurring.filter(r => { const a = App.acc(r.accountId); return Fin.canView(a, App.user); });
    const amt = x => h('div', { class: 'amt ' + (x.rule.kind === 'income' ? 'in' : 'out') }, App.money(x.rule.amount, (App.acc(x.rule.accountId) || {}).currency));
    return h('div', {}, h('div', { class: 'banner' }, t('recurring_note')),
      due.length ? h('div', { class: 'card' }, h('h3', {}, '⏰ ' + t('due_now')), due.map(x => h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('div', { class: 'grow' }, h('div', { class: 'title' }, x.rule.description || App.catName(x.rule.categoryId)), h('div', { class: 'sub' }, App.date(x.date) + ' · ' + App.accName(x.rule.accountId))), amt(x),
        h('div', { class: 'btns', style: { width: '100%', marginTop: 0 } }, h('button', { class: 'btn sm primary', onclick: async () => { await App.act(() => Fin.confirmDue(S, App.user, x.rule.id), t('recorded')); App.render(); } }, '✓ ' + t('confirm_paid')), h('button', { class: 'btn sm', onclick: async () => { await App.act(() => Fin.skipDue(S, App.user, x.rule.id)); App.render(); } }, t('skip')))))) : null,
      h('div', { class: 'card' }, h('h3', {}, t('scheduled') + ' (' + t('not_yet_recorded') + ')'), up.length ? up.slice(0, 12).map(x => h('div', { class: 'row' }, h('div', { class: 'avatar' }, '🗓️'), h('div', { class: 'grow' }, h('div', { class: 'title' }, x.rule.description || App.catName(x.rule.categoryId)), h('div', { class: 'sub' }, App.date(x.date))), amt(x))) : App.empty(t('nothing_scheduled'))),
      h('div', { class: 'card' }, h('h3', {}, t('rules')), rules.length ? rules.map(r => h('div', { class: 'row tap', onclick: () => ruleSheet(r) }, h('div', { class: 'avatar' }, r.kind === 'income' ? '💵' : '🔁'), h('div', { class: 'grow' }, h('div', { class: 'title' }, r.description || App.catName(r.categoryId), r.active ? '' : ' ⏸'), h('div', { class: 'sub' }, t('f_' + r.freq) + ' · ' + t('next') + ': ' + (Fin.nextDue(r) ? App.date(Fin.nextDue(r)) : '—'))), amt({ rule: r }))) : App.empty(t('no_rules'))),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => ruleSheet() }, '+ ' + t('add_rule'))));
  };

  /* ---------- goals ---------- */
  function goalSheet(g) {
    const nm = App.input('text', { value: g ? g.name : '' }), tg = App.moneyInput(g ? g.target : null, { big: true }), td = App.input('date', { value: g && g.targetDate || '' }), ac = App.select([['', t('none')], ...App.accOptions(false)], g ? g.accountId || '' : ''); const sc = App.seg([['personal', '🔒 ' + t('personal')], ['household', '🏠 ' + t('household')]], g ? g.scope : 'personal'); const ic = App.input('text', { value: g ? g.icon : '🎯', maxlength: 4 });
    App.sheet(g ? t('edit_goal') : t('add_goal'), s => h('div', {}, App.field(t('goal_name'), nm), App.field(t('icon'), ic), App.field(t('target_amount'), tg), App.field(t('target_date'), td), App.field(t('linked_account'), ac), g ? null : App.field(t('scope'), sc),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const m = parseM(tg.value); const r = await App.act(() => { if (!nm.value.trim()) throw Fin.err('NAME_REQUIRED'); if (g) { if (!(m > 0)) throw Fin.err('BAD_AMOUNT'); Fin.put(S, 'goals', { ...g, name: nm.value, target: m, targetDate: td.value || null, accountId: ac.value || null, icon: ic.value }); } else Fin.addGoal(S, App.user, { name: nm.value, target: m, targetDate: td.value || null, accountId: ac.value || null, scope: sc.value, icon: ic.value }); }, t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')),
        g ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete'), { danger: true, ok: t('delete') })) { await App.act(() => { S.contribs.filter(c => c.goalId === g.id).forEach(c => Fin.remove(S, 'contribs', c.id)); Fin.remove(S, 'goals', g.id); }); s.close(); App.render(); } } }, t('delete')) : null)));
  }
  function contribSheet(g, withdraw) {
    const amt = App.moneyInput(null, { big: true }), d = App.input('date', { value: App.today() }), nt = App.input('text', { ph: t('notes') });
    App.sheet(withdraw ? t('withdraw') : t('contribute'), s => h('div', {}, h('div', { class: 'field' }, amt), App.field(t('date'), d), App.field(t('notes'), nt), h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const m = parseM(amt.value); if (!m) return App.toast(t('err_BAD_AMOUNT'), 'err'); const r = await App.act(() => Fin.contribute(S, App.user, g.id, withdraw ? -m : m, d.value, nt.value), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')), h('button', { class: 'btn', onclick: s.close }, t('cancel')))));
  }
  function goalDetail(g) {
    const st = Fin.goalStatus(S, g, App.today()); const cs = S.contribs.filter(c => c.goalId === g.id).sort((a, b) => a.date < b.date ? 1 : -1);
    App.sheet(g.icon + ' ' + g.name, s => h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'stat' }, h('small', {}, t('current_amount')), h('b', {}, App.money(st.current))), h('div', { class: 'stat' }, h('small', {}, t('remaining')), h('b', {}, App.money(st.remaining)))),
      h('div', { style: { margin: '10px 0' } }, App.progress(st.pct, st.behind ? 'warn' : '', st.plannedPct), h('div', { class: 'small muted' }, t('progress') + ': ' + App.num(st.pct) + '%' + (st.plannedPct != null ? ' · ' + t('planned') + ': ' + App.num(st.plannedPct) + '%' : ''), st.behind ? ' ⚠️ ' + t('behind_plan') : '')),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => { s.close(); contribSheet(g, false); } }, '+ ' + t('contribute')), h('button', { class: 'btn', onclick: () => { s.close(); contribSheet(g, true); } }, '− ' + t('withdraw')), h('button', { class: 'btn', onclick: () => { s.close(); goalSheet(g); } }, t('edit'))),
      h('h3', { class: 'muted' }, t('contribution_history')), cs.length ? cs.map(c => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, App.date(c.date)), h('div', { class: 'sub' }, App.userName(c.by) + (c.note ? ' · ' + c.note : ''))), h('div', { class: 'amt ' + (c.amount > 0 ? 'in' : 'out') }, App.moneyTxt(c.amount)))) : App.empty(t('no_contribs'))));
  }
  M.goals = () => {
    const gs = S.goals.filter(g => g.scope === 'household' || g.ownerId === App.user.id);
    return h('div', {}, gs.length ? gs.map(g => { const st = Fin.goalStatus(S, g, App.today()); return h('div', { class: 'card tap', onclick: () => goalDetail(g) }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('b', {}, g.icon + ' ' + g.name + (g.scope === 'household' ? ' 🏠' : ' 🔒')), h('span', { class: 'badge ' + (st.behind ? 'warn' : 'ok') }, App.num(st.pct) + '%')), App.progress(st.pct, st.behind ? 'warn' : '', st.plannedPct), h('div', { class: 'small muted', style: { marginTop: '6px' } }, App.moneyTxt(st.current) + ' / ' + App.moneyTxt(g.target) + (g.targetDate ? ' · ' + App.date(g.targetDate) : ''))); }) : App.empty(t('no_goals')),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => goalSheet() }, '+ ' + t('add_goal'))));
  };

  /* ---------- debts ---------- */
  let debtDir = 'owe';
  function debtSheet(d) {
    const dir = App.seg([['owe', t('i_owe')], ['owed', t('owed_to_me')]], d ? d.direction : debtDir), pt = App.input('text', { value: d ? d.party : '' }), am = App.moneyInput(d ? d.amount : null, { big: true }), cu = App.select(curOptions(), d ? d.currency : 'EGP'), dt = App.input('date', { value: d ? d.date : App.today() }), du = App.input('date', { value: d && d.due || '' }), nt = App.input('text', { value: d ? d.notes : '', ph: t('notes') });
    const sc = App.seg([['personal', '🔒 ' + t('personal')], ['household', '🏠 ' + t('household')]], d ? d.scope : 'personal'); const ni = App.input('number', { value: d ? d.installments : 0, min: 0 });
    App.sheet(d ? t('edit_debt') : t('add_debt'), s => h('div', {}, dir, App.field(t('party'), pt), h('div', { class: 'field' }, am), App.field(t('currency'), cu), App.field(t('date'), dt), App.field(t('due_date'), du), App.field(t('installments_count'), ni, t('installments_hint')), App.field(t('notes'), nt), d ? null : App.field(t('scope'), sc),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const m = parseM(am.value); const r = await App.act(() => { const n = Number(ni.value) || 0; if (d) { if (!(m > 0)) throw Fin.err('BAD_AMOUNT'); Fin.put(S, 'debts', { ...d, direction: dir.value, party: pt.value, amount: m, currency: cu.value, date: dt.value, due: du.value || null, notes: nt.value, installments: n, installmentAmount: n ? Math.ceil(m / n) : 0 }); } else Fin.addDebt(S, App.user, { direction: dir.value, party: pt.value, amount: m, currency: cu.value, date: dt.value, due: du.value || null, notes: nt.value, scope: sc.value, installments: n, installmentAmount: n ? Math.ceil(m / n) : 0 }); }, t('saved')); if (r.ok) { debtDir = dir.value; s.close(); App.render(); } } }, t('save')),
        d ? h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_delete_debt'), { danger: true, ok: t('delete') })) { await App.act(() => { S.debtPays.filter(p => p.debtId === d.id).forEach(p => Fin.remove(S, 'debtPays', p.id)); Fin.remove(S, 'debts', d.id); }); s.close(); App.render(); } } }, t('delete')) : null)));
  }
  function debtPaySheet(d) {
    const st = Fin.debtStatus(S, d, App.today()); const am = App.moneyInput(d.installmentAmount && d.installmentAmount < st.remaining ? d.installmentAmount : st.remaining, { big: true }), dt = App.input('date', { value: App.today() }), nt = App.input('text', { ph: t('notes') });
    const cashChk = h('input', { type: 'checkbox', checked: true }); const accs = App.accOptions(true).filter(([id]) => (App.acc(id) || {}).currency === d.currency); const as = App.select(accs, accs[0] && accs[0][0]); const wrap = h('div', {}, h('div', { class: 'switch' }, h('label', {}, cashChk, ' ' + t('also_record_cash')), ''), App.field(t('account'), as), h('div', { class: 'small muted' }, d.direction === 'owe' ? t('will_be_expense_note') : t('will_be_income_note')));
    cashChk.addEventListener('change', () => as.parentElement.hidden = !cashChk.checked);
    App.sheet(d.direction === 'owe' ? t('record_payment') : t('record_collection'), s => h('div', {}, h('p', { class: 'muted' }, d.party + ' — ' + t('remaining') + ': ' + App.moneyTxt(st.remaining, d.currency)), h('div', { class: 'field' }, am), App.field(t('date'), dt), App.field(t('notes'), nt), accs.length ? wrap : h('div', { class: 'banner' }, t('no_account_same_currency')),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { const m = parseM(am.value); if (!m) return App.toast(t('err_BAD_AMOUNT'), 'err'); const r = await App.act(() => Fin.payDebt(S, App.user, d.id, { amount: m, date: dt.value, note: nt.value, accountId: accs.length && cashChk.checked ? as.value : null }), t('saved')); if (r.ok) { s.close(); App.render(); } } }, t('save')), h('button', { class: 'btn', onclick: s.close }, t('cancel')))));
  }
  function debtDetail(d) {
    const st = Fin.debtStatus(S, d, App.today()); const ps = S.debtPays.filter(p => p.debtId === d.id).sort((a, b) => a.date < b.date ? 1 : -1);
    App.sheet(d.party, s => h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'stat' }, h('small', {}, t('original_amount')), h('b', {}, App.money(d.amount, d.currency))), h('div', { class: 'stat' }, h('small', {}, t('remaining')), h('b', {}, App.money(st.remaining, d.currency)))),
      h('div', { style: { margin: '10px 0' } }, App.progress(Math.floor(st.paid * 100 / d.amount)), h('span', { class: 'badge ' + (st.status === 'paid' ? 'ok' : st.status === 'overdue' ? 'bad' : 'warn') }, t('ds_' + st.status)), d.due ? h('span', { class: 'small muted' }, ' ' + t('due_date') + ': ' + App.date(d.due)) : null, d.installments ? h('div', { class: 'small muted' }, t('installments_info', { n: App.num(d.installments), amt: App.moneyTxt(d.installmentAmount, d.currency) })) : null, d.notes ? h('div', { class: 'small' }, d.notes) : null),
      h('div', { class: 'btns' }, st.remaining > 0 ? h('button', { class: 'btn primary', onclick: () => { s.close(); debtPaySheet(d); } }, d.direction === 'owe' ? t('record_payment') : t('record_collection')) : null, h('button', { class: 'btn', onclick: () => { s.close(); debtSheet(d); } }, t('edit'))),
      h('h3', { class: 'muted' }, t('payment_history')), ps.length ? ps.map(p => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, App.date(p.date)), h('div', { class: 'sub' }, (p.txId ? '💱 ' + t('cash_recorded') : t('no_cash_movement')) + (p.note ? ' · ' + p.note : ''))), h('div', { class: 'amt' }, App.moneyTxt(p.amount, d.currency)))) : App.empty(t('no_payments'))));
  }
  M.debts = () => {
    const ds = S.debts.filter(d => (d.scope === 'household' || d.ownerId === App.user.id) && d.direction === debtDir);
    const tot = ds.reduce((s, d) => s + (d.currency === Fin.BASE ? Fin.debtStatus(S, d).remaining : Fin.toBase(Fin.debtStatus(S, d).remaining, Fin.rateFor(S, d.currency) || 0)), 0);
    return h('div', {}, App.seg([['owe', t('i_owe')], ['owed', t('owed_to_me')]], debtDir, v => { debtDir = v; App.render(); }), h('div', { class: 'stat', style: { margin: '10px 0' } }, h('small', {}, t('total_remaining')), h('b', {}, App.money(tot))), h('div', { class: 'small muted' }, t('debt_not_cash_note')),
      ds.length ? ds.map(d => { const st = Fin.debtStatus(S, d, App.today()); return h('div', { class: 'card tap', onclick: () => debtDetail(d) }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('b', {}, d.party + (d.scope === 'household' ? ' 🏠' : '')), h('span', { class: 'badge ' + (st.status === 'paid' ? 'ok' : st.status === 'overdue' ? 'bad' : 'warn') }, t('ds_' + st.status))), App.progress(Math.floor(st.paid * 100 / d.amount)), h('div', { class: 'small muted', style: { marginTop: '6px' } }, App.moneyTxt(st.remaining, d.currency) + ' / ' + App.moneyTxt(d.amount, d.currency) + (d.due ? ' · ' + App.date(d.due) : ''))); }) : App.empty(t('no_debts')),
      h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => debtSheet() }, '+ ' + t('add_debt'))));
  };

  /* ---------- monthly closing & reconciliation ---------- */
  const CL = { month: null, scope: 'personal' };
  M.close = () => {
    if (!CL.month) { const n = App.today(); CL.month = Number(n.slice(8, 10)) <= 10 ? Fin.monthOf(Fin.addMonthsClamped(n, -1, 1)) : Fin.monthOf(n); }
    const rg = Fin.monthRange(CL.month); const isAdm = Fin.isAdmin(App.user);
    const closing = S.closings.find(c => c.month === CL.month && c.scope === CL.scope && c.status === 'closed' && (CL.scope === 'household' || c.ownerId === App.user.id));
    const accts = S.accounts.filter(a => CL.scope === 'household' ? a.visibility === 'household' : (a.visibility === 'private' && a.ownerId === App.user.id));
    const sum = Fin.summarize(S, App.user, rg.from, rg.to, CL.scope); const trs = S.transactions.filter(x => !x.deleted && x.type === 'transfer' && x.date.slice(0, 10) >= rg.from && x.date.slice(0, 10) <= rg.to && accts.some(a => a.id === x.accountId || a.id === x.toAccountId));
    const shift = n => { CL.month = Fin.monthOf(Fin.addMonthsClamped(rg.from, n, 1)); App.render(); };
    const hist = S.closings.filter(c => c.scope === 'household' ? true : c.ownerId === App.user.id).sort((a, b) => a.month < b.month ? 1 : -1);
    return h('div', {},
      h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, h('button', { class: 'btn sm', onclick: () => shift(App.lang === 'ar' ? 1 : -1) }, '‹'), h('b', {}, App.monthName(CL.month)), h('button', { class: 'btn sm', onclick: () => shift(App.lang === 'ar' ? -1 : 1) }, '›')),
      App.seg([['personal', '🔒 ' + t('personal')], ['household', '🏠 ' + t('household')]], CL.scope, v => { CL.scope = v; App.render(); }),
      closing ? h('div', { class: 'banner', style: { background: 'rgba(21,128,61,.15)', color: 'var(--income)' } }, '🔐 ' + t('month_closed_on', { d: App.dateTime(closing.closedAt) })) : null,
      h('div', { class: 'card' }, h('h3', {}, t('step1_review')), h('div', { class: 'grid2' }, h('div', {}, h('small', { class: 'muted' }, t('income')), h('div', { class: 'amt in' }, App.money(sum.income))), h('div', {}, h('small', { class: 'muted' }, t('expenses')), h('div', { class: 'amt out' }, App.money(sum.expense))), h('div', {}, h('small', { class: 'muted' }, t('transfers')), h('div', { class: 'amt neutral' }, t('transfers_count', { n: App.num(trs.length) }))), h('div', {}, h('small', { class: 'muted' }, t('adjustments')), h('div', { class: 'amt' }, App.money(sum.adjustments))))),
      h('div', { class: 'card' }, h('h3', {}, t('step2_reconcile')), accts.length ? accts.map(a => { const sys = closing ? ((closing.snapshot.balances.find(b => b.accountId === a.id) || {}).balance) : Fin.balanceOf(S, a.id, rg.to); const rc = S.recons.filter(r => r.accountId === a.id && r.date === rg.to).sort((x, y) => x.at < y.at ? 1 : -1)[0];
        return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, a.name), h('div', { class: 'sub', style: { whiteSpace: 'normal' } }, t('system_balance') + ': ' + App.moneyTxt(sys, a.currency) + (rc ? ' · ' + t('actual_balance') + ': ' + App.moneyTxt(rc.actual, a.currency) : ''))), rc ? h('span', { class: 'badge ' + (rc.status === 'unresolved' ? 'bad' : 'ok') }, t('rs_' + rc.status)) : h('span', { class: 'badge warn' }, t('not_reconciled')), !closing && Fin.canWrite(a, App.user) ? h('button', { class: 'btn sm', onclick: () => reconcileDate(a, rg.to) }, t('reconcile')) : null); }) : App.empty(t('no_accounts'))),
      !closing ? h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => {
        const unrec = accts.filter(a => { const rc = S.recons.filter(r => r.accountId === a.id && r.date === rg.to).sort((x, y) => x.at < y.at ? 1 : -1)[0]; return !rc || rc.status === 'unresolved'; }).length;
        if (!(await App.confirm(unrec ? t('confirm_close_unreconciled', { n: App.num(unrec) }) : t('confirm_close'), { ok: t('close_month') }))) return;
        const r = await App.act(() => Fin.closeMonth(S, App.user, CL.month, CL.scope), t('month_closed')); r.ok && App.render(); } }, '🔐 ' + t('close_month'))) : h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => { const v = Fin.verifyClosing(S, closing); App.toast(v.ok ? t('verify_ok') : t('verify_bad'), v.ok ? 'ok' : 'err'); } }, '✔ ' + t('verify_closing')), h('button', { class: 'btn danger', onclick: async () => { if (await App.confirm(t('confirm_reopen'), { danger: true, ok: t('reopen') })) { const r = await App.act(() => Fin.reopenMonth(S, App.user, closing.id, true), t('reopened')); r.ok && App.render(); } } }, t('reopen'))),
      h('div', { class: 'card' }, h('h3', {}, t('closing_history')), hist.length ? hist.map(c => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, App.monthName(c.month) + (c.scope === 'household' ? ' 🏠' : ' 🔒')), h('div', { class: 'sub' }, App.dateTime(c.closedAt) + ' · ' + App.userName(c.closedBy))), h('span', { class: 'badge ' + (c.status === 'closed' ? 'ok' : 'warn') }, c.status === 'closed' ? t('closed') : t('reopened_status')))) : App.empty(t('no_closings'))));
  };
  function reconcileDate(acc, date) { // opens the reconcile sheet fixed to the month end
    const actual = App.moneyInput(null, { big: true }), note = App.input('text', { ph: t('adjust_reason') }); const sys = Fin.balanceOf(S, acc.id, date); const out = h('div', { class: 'card' });
    const upd = () => { const a = parseM(actual.value); out.replaceChildren(h('div', { class: 'row' }, h('div', { class: 'grow' }, t('system_balance')), h('b', {}, App.money(sys, acc.currency))), h('div', { class: 'row' }, h('div', { class: 'grow' }, t('difference')), h('b', { class: 'amt ' + (a == null ? '' : a - sys === 0 ? 'in' : 'out') }, a == null ? '—' : App.money(a - sys, acc.currency)))); }; actual.addEventListener('input', upd); upd();
    const go = (adjust) => async () => { const a = parseM(actual.value); if (a == null) return App.toast(t('err_BAD_AMOUNT'), 'err'); const r = await App.act(() => Fin.reconcile(S, App.user, acc.id, date, a, { adjust, note: note.value }), t('saved')); if (r.ok) { box.close(); App.render(); } };
    let box; box = App.sheet(t('reconcile') + ' — ' + acc.name + ' (' + App.date(date) + ')', s => h('div', {}, App.field(t('actual_balance'), actual), out, App.field(t('adjust_reason'), note), h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: go(false) }, t('record_only')), h('button', { class: 'btn primary', onclick: go(true) }, t('record_adjustment')))));
  }

  /* ---------- reports & analytics ---------- */
  const RP = { kind: 'month', off: 0, scope: 'all' };
  function shiftDate(kind, off) { const n = App.today(); return kind === 'month' ? Fin.addMonthsClamped(n, off, 1) : kind === 'quarter' ? Fin.addMonthsClamped(n, off * 3, 1) : Fin.addMonthsClamped(n, off * 12, 1); }
  function trendChart(data) {
    const w = 320, hgt = 150, max = Math.max(1, ...data.flatMap(d => [d.income, d.expense])); const bw = 16, gap = (w - data.length * bw * 2) / (data.length + 1);
    const bars = data.map((d, i) => { const x = gap + i * (bw * 2 + gap); const hi = Math.round(d.income / max * 100), he = Math.round(d.expense / max * 100); return `<rect x="${x}" y="${120 - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--income)"/><rect x="${x + bw + 2}" y="${120 - he}" width="${bw}" height="${he}" rx="3" fill="var(--expense)"/><text x="${x + bw}" y="140" text-anchor="middle">${d.month.slice(5)}</text>`; }).join('');
    return h('div', { class: 'svgchart', html: `<svg viewBox="0 0 ${w} ${hgt}" width="100%" role="img" aria-label="${t('income_vs_expense')}">${bars}</svg>` });
  }
  M.reports = () => {
    const ref = shiftDate(RP.kind, RP.off); const rg = Fin.periodRange(RP.kind, ref); const r = Fin.summarize(S, App.user, rg.from, rg.to, RP.scope);
    const prevRef = shiftDate(RP.kind, RP.off - 1); const prg = Fin.periodRange(RP.kind, prevRef); const pr = Fin.summarize(S, App.user, prg.from, prg.to, RP.scope);
    const cats = Object.entries(r.byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); const total = cats.reduce((s, [, v]) => s + v, 0) || 1;
    const label = RP.kind === 'month' ? App.monthName(Fin.monthOf(rg.from)) : RP.kind === 'quarter' ? 'Q' + (Math.floor(Number(rg.from.slice(5, 7)) / 3) + 1) + ' ' + rg.from.slice(0, 4) : rg.from.slice(0, 4);
    const cmp = (a, b) => b > 0 ? Math.round((a - b) * 100 / b) : null; const ec = cmp(r.expense, pr.expense), ic = cmp(r.income, pr.income);
    const orig = {}; S.transactions.forEach(x => { if (x.deleted || x.isDebt || x.currency === Fin.BASE || (x.type !== 'income' && x.type !== 'expense')) return; const d = x.date.slice(0, 10); if (d < rg.from || d > rg.to) return; const a = App.acc(x.accountId); if (!Fin.inScope(a, App.user, RP.scope)) return; orig[x.currency] = orig[x.currency] || { in: 0, out: 0 }; orig[x.currency][x.type === 'income' ? 'in' : 'out'] += x.amount; });
    const bs = S.budgets.filter(b => b.active && (b.scope === 'household' || b.ownerId === App.user.id));
    const ins = App.get('insights_off_' + App.user.id, false) ? [] : Fin.insights(S, App.user, App.today());
    const dOwe = S.debts.filter(d => (d.scope === 'household' || d.ownerId === App.user.id)); const owe = dOwe.filter(d => d.direction === 'owe').reduce((s, d) => s + Fin.debtStatus(S, d).remaining, 0), owed = dOwe.filter(d => d.direction === 'owed').reduce((s, d) => s + Fin.debtStatus(S, d).remaining, 0);
    return h('div', {},
      App.seg([['month', t('monthly')], ['quarter', t('quarterly')], ['year', t('yearly')]], RP.kind, v => { RP.kind = v; RP.off = 0; App.render(); }),
      h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, h('button', { class: 'btn sm', onclick: () => { RP.off += App.lang === 'ar' ? 1 : -1; App.render(); } }, '‹'), h('b', {}, label), h('button', { class: 'btn sm', onclick: () => { RP.off += App.lang === 'ar' ? -1 : 1; App.render(); } }, '›')),
      App.seg([['all', t('all')], ['personal', '🔒 ' + t('personal')], ['household', '🏠 ' + t('household')]], RP.scope, v => { RP.scope = v; App.render(); }),
      h('div', { class: 'grid2', style: { marginTop: '10px' } }, h('div', { class: 'stat' }, h('small', {}, t('income')), h('b', { class: 'amt in' }, App.money(r.income)), ic != null ? h('small', {}, (ic >= 0 ? '▲ ' : '▼ ') + App.num(Math.abs(ic)) + '% ' + t('vs_previous')) : null), h('div', { class: 'stat' }, h('small', {}, t('expenses')), h('b', { class: 'amt out' }, App.money(r.expense)), ec != null ? h('small', {}, (ec >= 0 ? '▲ ' : '▼ ') + App.num(Math.abs(ec)) + '% ' + t('vs_previous')) : null),
        h('div', { class: 'stat' }, h('small', {}, t('net')), h('b', {}, App.money(r.net))), h('div', { class: 'stat' }, h('small', {}, t('savings_rate')), h('b', {}, r.savingsRate == null ? '—' : App.num(r.savingsRate) + '%'))),
      h('div', { class: 'small muted', style: { margin: '6px 4px' } }, t('report_note', { n: App.num(r.transferCount) })),
      Object.keys(orig).length ? h('div', { class: 'card' }, h('h3', {}, t('original_amounts')), Object.entries(orig).map(([c, v]) => h('div', { class: 'row' }, h('div', { class: 'grow' }, c), h('div', { class: 'amt in' }, '+' + App.moneyTxt(v.in, c)), h('div', { class: 'amt out' }, '−' + App.moneyTxt(v.out, c)))), h('div', { class: 'small muted' }, t('converted_note'))) : null,
      ins.length ? h('div', { class: 'card' }, h('h3', {}, '💡 ' + t('insights')), ins.map(i => h('div', { class: 'row' }, h('div', { class: 'grow small', style: { whiteSpace: 'normal' } }, App.insightText(i))))) : null,
      h('div', { class: 'card' }, h('h3', {}, t('income_vs_expense') + ' (' + t('last_6_months') + ')'), trendChart(Fin.trend(S, App.user, 6, RP.scope, App.today())), h('div', { class: 'small muted' }, '🟩 ' + t('income') + '  🟥 ' + t('expenses'))),
      h('div', { class: 'card' }, h('h3', {}, t('expense_distribution')), cats.length ? cats.map(([id, v]) => h('div', { class: 'row', style: { display: 'block' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, App.catIcon(id) + ' ' + App.catName(id)), h('span', { class: 'small' }, App.moneyTxt(v) + ' · ' + App.num(Math.round(v * 100 / total)) + '%')), App.progress(Math.round(v * 100 / total)))) : App.empty(t('no_data'))),
      bs.length ? h('div', { class: 'card' }, h('h3', {}, t('budget_performance')), bs.map(b => { const st = Fin.budgetStatus(S, App.user, b, App.today()); return h('div', { class: 'row' }, h('div', { class: 'grow' }, App.catIcon(b.categoryId) + ' ' + App.catName(b.categoryId)), h('span', { class: 'small' }, App.moneyTxt(st.spent) + ' / ' + App.moneyTxt(b.amount)), h('span', { class: 'badge ' + (st.pct >= 100 ? 'bad' : st.pct >= 75 ? 'warn' : 'ok') }, App.num(st.pct) + '%')); })) : null,
      h('div', { class: 'card' }, h('h3', {}, t('debt_overview')), h('div', { class: 'grid2' }, h('div', {}, h('small', { class: 'muted' }, t('i_owe')), h('div', { class: 'amt out' }, App.money(owe))), h('div', {}, h('small', { class: 'muted' }, t('owed_to_me')), h('div', { class: 'amt in' }, App.money(owed))))),
      S.goals.filter(g => g.scope === 'household' || g.ownerId === App.user.id).length ? h('div', { class: 'card' }, h('h3', {}, t('goal_progress')), S.goals.filter(g => g.scope === 'household' || g.ownerId === App.user.id).map(g => { const st = Fin.goalStatus(S, g, App.today()); return h('div', { class: 'row', style: { display: 'block' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, g.icon + ' ' + g.name), h('span', { class: 'small' }, App.num(st.pct) + '%')), App.progress(st.pct, st.behind ? 'warn' : '', st.plannedPct)); })) : null,
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => window.print() }, '🖨️ ' + t('print_pdf')), h('button', { class: 'btn', onclick: () => App.exportTx(Fin.visibleTx(S, App.user).filter(x => x.date.slice(0, 10) >= rg.from && x.date.slice(0, 10) <= rg.to), 'csv') }, 'CSV')));
  };
})();
