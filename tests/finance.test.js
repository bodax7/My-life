// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/finance.js');

const M = s => F.parseMoney(s);
function setup() {
  const S = F.newState(); F.seedCategories(S);
  const husband = { id: 'u1', name: 'Husband', role: 'admin' };
  const wife = { id: 'u2', name: 'Wife', role: 'member' };
  S.users.push(husband, wife);
  return { S, husband, wife };
}

test('parseMoney: exact integer minor units, Arabic digits, invalid input', () => {
  assert.equal(M('1,234.50'), 123450);
  assert.equal(M('١٢٣٤٫٥٠'), 123450);
  assert.equal(M('0.1'), 10);
  assert.equal(M('abc'), null);
  assert.equal(M('1.234'), null);
  assert.equal(M('-5'), -500);
  assert.equal(M('0.10') + M('0.20'), M('0.30')); // no float drift
});

test('opening balances + the PRD transfer example (15,000 / 8,000, move 3,000)', () => {
  const { S, husband } = setup();
  const personal = F.createAccount(S, husband, { name: 'نقدي شخصي', visibility: 'private', opening: M('15000'), date: '2026-11-01' });
  const house = F.createAccount(S, husband, { name: 'نقدي البيت', visibility: 'household', opening: M('8000'), date: '2026-11-01' });
  assert.equal(F.balanceOf(S, personal.id), M('15000'));
  assert.equal(F.balanceOf(S, house.id), M('8000'));
  F.addTx(S, husband, { type: 'transfer', accountId: personal.id, toAccountId: house.id, amount: M('3000'), date: '2026-11-05' });
  assert.equal(F.balanceOf(S, personal.id), M('12000'));
  assert.equal(F.balanceOf(S, house.id), M('11000'));
  // transfers are NOT income or expense, in any scope
  for (const scope of ['personal', 'household', 'all']) {
    const r = F.summarize(S, husband, '2026-11-01', '2026-11-30', scope);
    assert.equal(r.income, 0); assert.equal(r.expense, 0);
  }
  const r = F.summarize(S, husband, '2026-11-01', '2026-11-30', 'household');
  assert.equal(r.transferCount, 1);
});

test('income / expense / refund affect balances and reports correctly', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Bank', visibility: 'private', opening: M('1000'), date: '2026-11-01' });
  F.addTx(S, husband, { type: 'income', accountId: a.id, amount: M('500'), categoryId: 'cat_salary', date: '2026-11-02' });
  const e = F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('200'), categoryId: 'cat_groceries', date: '2026-11-03' });
  assert.equal(F.balanceOf(S, a.id), M('1300'));
  F.addTx(S, husband, { type: 'refund', accountId: a.id, amount: M('50'), refundOf: e.id, date: '2026-11-04' });
  assert.equal(F.balanceOf(S, a.id), M('1350'));
  const r = F.summarize(S, husband, '2026-11-01', '2026-11-30', 'all');
  assert.equal(r.income, M('500'));
  assert.equal(r.expense, M('150')); // net of refund
  assert.equal(r.byCat.cat_groceries, M('150'));
  // refund cannot exceed original
  assert.throws(() => F.addTx(S, husband, { type: 'refund', accountId: a.id, amount: M('151'), refundOf: e.id, date: '2026-11-05' }), { code: 'REFUND_TOO_BIG' });
  // cannot delete original while refund exists
  assert.throws(() => F.deleteTx(S, husband, e.id), { code: 'HAS_REFUND' });
});

test('editing and deleting recompute balances; audit trail kept', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('100'), date: '2026-11-01' });
  const t = F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('30'), date: '2026-11-02' });
  assert.equal(F.balanceOf(S, a.id), M('70'));
  F.editTx(S, husband, t.id, { amount: M('45') });
  assert.equal(F.balanceOf(S, a.id), M('55'));
  F.deleteTx(S, husband, t.id);
  assert.equal(F.balanceOf(S, a.id), M('100'));
  const acts = S.audit.filter(x => x.entityId === t.id).map(x => x.action);
  assert.deepEqual(acts, ['create', 'update', 'delete']);
});

test('duplicate prevention by operation id', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: 0 });
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: 100, opId: 'op-1', date: '2026-11-02' });
  assert.throws(() => F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: 100, opId: 'op-1', date: '2026-11-02' }), { code: 'DUPLICATE' });
  assert.equal(F.balanceOf(S, a.id), -100);
});

test('validation: zero/negative amounts, same-account transfer', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'A', visibility: 'private' });
  assert.throws(() => F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: 0, date: '2026-11-02' }), { code: 'BAD_AMOUNT' });
  assert.throws(() => F.addTx(S, husband, { type: 'income', accountId: a.id, amount: -5, date: '2026-11-02' }), { code: 'BAD_AMOUNT' });
  assert.throws(() => F.addTx(S, husband, { type: 'income', accountId: a.id, amount: 1.5, date: '2026-11-02' }), { code: 'BAD_AMOUNT' });
  assert.throws(() => F.addTx(S, husband, { type: 'transfer', accountId: a.id, toAccountId: a.id, amount: 5, date: '2026-11-02' }), { code: 'SAME_ACCOUNT' });
});

test('privacy: wife cannot see husband personal accounts / transactions; masked transfer counterpart', () => {
  const { S, husband, wife } = setup();
  const mine = F.createAccount(S, husband, { name: 'My secret', visibility: 'private', opening: M('15000'), date: '2026-11-01' });
  const house = F.createAccount(S, husband, { name: 'House', visibility: 'household', opening: M('8000'), date: '2026-11-01' });
  F.addTx(S, husband, { type: 'expense', accountId: mine.id, amount: M('99'), description: 'private purchase', date: '2026-11-02' });
  F.addTx(S, husband, { type: 'transfer', accountId: mine.id, toAccountId: house.id, amount: M('3000'), date: '2026-11-03' });
  assert.deepEqual(F.visibleAccounts(S, wife).map(a => a.id), [house.id]);
  const seen = F.visibleTx(S, wife);
  assert.ok(!seen.some(t => t.description === 'private purchase'));
  const tr = seen.find(t => t.type === 'transfer');
  assert.ok(tr, 'wife sees the transfer into the household account');
  const view = F.txView(S, wife, tr);
  assert.equal(view.fromName, null); assert.equal(view.toName, 'House'); assert.equal(view.masked, true);
  assert.throws(() => F.ledger(S, wife, mine.id), { code: 'FORBIDDEN' });
  assert.throws(() => F.addTx(S, wife, { type: 'expense', accountId: mine.id, amount: 100, date: '2026-11-04' }), { code: 'FORBIDDEN' });
  assert.throws(() => F.editTx(S, wife, S.transactions.find(t => t.description === 'private purchase').id, { amount: 1 }), { code: 'FORBIDDEN' });
  // totals for wife never include husband's private money
  assert.equal(F.totalBalance(S, wife, 'all').total, M('11000'));
  assert.equal(F.summarize(S, wife, '2026-11-01', '2026-11-30', 'all').expense, 0);
});

test('roles: members record on shared accounts but cannot create shared accounts or budgets', () => {
  const { S, husband, wife } = setup();
  assert.throws(() => F.createAccount(S, wife, { name: 'X', visibility: 'household' }), { code: 'FORBIDDEN' });
  const house = F.createAccount(S, husband, { name: 'House', visibility: 'household', opening: M('100') });
  const t = F.addTx(S, wife, { type: 'expense', accountId: house.id, amount: M('10'), categoryId: 'cat_groceries', date: '2026-11-02' });
  assert.equal(t.createdBy, 'u2');
  assert.throws(() => F.addBudget(S, wife, { categoryId: 'cat_groceries', amount: 100, scope: 'household' }), { code: 'FORBIDDEN' });
  assert.throws(() => F.closeMonth(S, wife, '2026-11', 'household'), { code: 'FORBIDDEN' });
});

test('multi-currency: original kept, converted amount fixed at entry, later rate change does not rewrite history', () => {
  const { S, husband } = setup();
  const usd = F.createAccount(S, husband, { name: 'USD', visibility: 'private', currency: 'USD' });
  assert.throws(() => F.addTx(S, husband, { type: 'income', accountId: usd.id, amount: M('100'), date: '2026-11-02' }), { code: 'NO_RATE' });
  F.setRate(S, husband, 'USD', 50, '2026-11-01');
  const t = F.addTx(S, husband, { type: 'income', accountId: usd.id, amount: M('100'), categoryId: 'cat_salary', date: '2026-11-02' });
  assert.equal(t.amount, M('100')); assert.equal(t.currency, 'USD'); assert.equal(t.rate, 50); assert.equal(t.baseAmount, M('5000'));
  F.setRate(S, husband, 'USD', 55, '2026-11-10');
  assert.equal(F.get(S, 'transactions', t.id).baseAmount, M('5000'));
  assert.equal(F.summarize(S, husband, '2026-11-01', '2026-11-30', 'all').income, M('5000'));
  assert.equal(F.balanceOf(S, usd.id), M('100'));
  assert.equal(F.totalBalance(S, husband, 'all').total, M('5500')); // current value at latest rate
  // cross-currency transfer needs the received amount
  const egp = F.createAccount(S, husband, { name: 'EGP', visibility: 'private' });
  assert.throws(() => F.addTx(S, husband, { type: 'transfer', accountId: usd.id, toAccountId: egp.id, amount: M('10'), date: '2026-11-11' }), { code: 'NEED_TO_AMOUNT' });
  F.addTx(S, husband, { type: 'transfer', accountId: usd.id, toAccountId: egp.id, amount: M('10'), toAmount: M('540'), date: '2026-11-11' });
  assert.equal(F.balanceOf(S, usd.id), M('90')); assert.equal(F.balanceOf(S, egp.id), M('540'));
});

test('budgets: spent / remaining / percent / threshold levels', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('10000'), date: '2026-11-01' });
  const b = F.addBudget(S, husband, { categoryId: 'cat_groceries', amount: M('4000'), scope: 'personal' });
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('3100'), categoryId: 'cat_groceries', date: '2026-11-05' });
  let st = F.budgetStatus(S, husband, b, '2026-11-10');
  assert.equal(st.spent, M('3100')); assert.equal(st.remaining, M('900')); assert.equal(st.pct, 77); assert.equal(st.level, 75);
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('900'), categoryId: 'cat_groceries', date: '2026-11-06' });
  st = F.budgetStatus(S, husband, b, '2026-11-10'); assert.equal(st.pct, 100); assert.equal(st.level, 100);
  // other month not counted
  assert.equal(F.budgetStatus(S, husband, b, '2026-12-10').spent, 0);
});

test('recurring: preview, confirm once, no duplicates, month-end anchor', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Bank', visibility: 'private', opening: M('1000'), date: '2026-01-01' });
  const r = F.addRule(S, husband, { kind: 'expense', amount: M('100'), accountId: a.id, categoryId: 'cat_internet', freq: 'monthly', startDate: '2026-01-31' });
  assert.equal(F.occurrence(r, 1), '2026-02-28'); assert.equal(F.occurrence(r, 2), '2026-03-31');
  assert.equal(F.dueList(S, husband, '2026-02-28').length, 1);
  assert.equal(F.balanceOf(S, a.id), M('1000')); // nothing recorded until confirmed
  F.confirmDue(S, husband, r.id);
  assert.equal(F.balanceOf(S, a.id), M('900'));
  assert.equal(F.nextDue(F.get(S, 'recurring', r.id)), '2026-02-28');
  // forcing the same occurrence again is blocked by the idempotent op id
  const rr = F.get(S, 'recurring', r.id); F.put(S, 'recurring', { ...rr, cursor: 0 });
  assert.throws(() => F.confirmDue(S, husband, r.id), { code: 'DUPLICATE' });
  F.put(S, 'recurring', { ...rr, cursor: 1 });
  F.skipDue(S, husband, r.id); assert.equal(F.nextDue(F.get(S, 'recurring', r.id)), '2026-03-31');
  const w = F.addRule(S, husband, { kind: 'income', amount: 5, accountId: a.id, freq: 'weekly', startDate: '2026-11-01', endDate: '2026-11-20' });
  assert.equal(F.upcoming(S, husband, '2026-11-01', '2026-12-31').filter(x => x.rule.id === w.id).length, 3);
});

test('savings goals: contribute, withdraw limits, progress vs plan', () => {
  const { S, husband } = setup();
  const g = F.addGoal(S, husband, { name: 'Car', target: M('1000'), startDate: '2026-01-01', targetDate: '2026-12-31' });
  F.contribute(S, husband, g.id, M('250'), '2026-03-01');
  assert.throws(() => F.contribute(S, husband, g.id, -M('300')), { code: 'OVER_WITHDRAW' });
  F.contribute(S, husband, g.id, -M('50'));
  const st = F.goalStatus(S, g, '2026-11-18');
  assert.equal(st.current, M('200')); assert.equal(st.pct, 20); assert.equal(st.remaining, M('800'));
  assert.ok(st.plannedPct > 80); assert.equal(st.behind, true);
});

test('debts: partial payments, over-payment blocked, cash side recorded exactly once, flows excluded from income/expense', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('1000'), date: '2026-11-01' });
  const d = F.addDebt(S, husband, { direction: 'owe', party: 'Ahmed', amount: M('500'), due: '2026-11-30' });
  F.payDebt(S, husband, d.id, { amount: M('200'), date: '2026-11-05', accountId: a.id });
  assert.equal(F.balanceOf(S, a.id), M('800'));
  const st = F.debtStatus(S, d, '2026-11-10'); assert.equal(st.remaining, M('300')); assert.equal(st.status, 'partial');
  assert.throws(() => F.payDebt(S, husband, d.id, { amount: M('301') }), { code: 'OVER_PAY' });
  F.payDebt(S, husband, d.id, { amount: M('300'), date: '2026-11-06' }); // recorded without cash movement
  assert.equal(F.balanceOf(S, a.id), M('800'));
  assert.equal(F.debtStatus(S, d).status, 'paid');
  const r = F.summarize(S, husband, '2026-11-01', '2026-11-30', 'all');
  assert.equal(r.expense, 0); assert.equal(r.debtOut, M('200'));
  assert.equal(F.debtStatus(S, { ...d, amount: M('500') }, '2026-12-31').status, 'paid');
});

test('shopping item expense is recorded only once', () => {
  const { S, husband } = setup();
  const house = F.createAccount(S, husband, { name: 'House', visibility: 'household', opening: M('500'), date: '2026-11-01' });
  F.put(S, 'shopItems', { id: 'i1', name: 'Milk', actualPrice: M('40') });
  F.recordItemExpense(S, husband, 'i1', house.id);
  assert.equal(F.balanceOf(S, house.id), M('460'));
  assert.throws(() => F.recordItemExpense(S, husband, 'i1', house.id), { code: 'DUPLICATE' });
  assert.equal(F.balanceOf(S, house.id), M('460'));
});

test('reconciliation + monthly closing: snapshot, locked period, adjustments, reopen, verification', () => {
  const { S, husband, wife } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('1000'), date: '2026-10-01' });
  const t = F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('100'), categoryId: 'cat_food', date: '2026-10-15T20:30' });
  const rc = F.reconcile(S, husband, a.id, '2026-10-31', M('880'), { adjust: false });
  assert.equal(rc.system, M('900')); assert.equal(rc.diff, -M('20')); assert.equal(rc.status, 'unresolved');
  assert.throws(() => F.reconcile(S, husband, a.id, '2026-10-31', M('880'), { adjust: true }), { code: 'NOTE_REQUIRED' });
  const rc2 = F.reconcile(S, husband, a.id, '2026-10-31', M('880'), { adjust: true, note: 'مصروف منسي' });
  assert.equal(rc2.status, 'adjusted'); assert.equal(F.balanceOf(S, a.id, '2026-10-31'), M('880'));
  assert.equal(F.reconcile(S, husband, a.id, '2026-10-31', M('880'), {}).status, 'matched');
  const c = F.closeMonth(S, husband, '2026-10', 'personal');
  assert.equal(c.snapshot.balances[0].balance, M('880'));
  assert.equal(c.snapshot.summary.expense, M('100')); // adjustment is not an expense
  assert.deepEqual(F.verifyClosing(S, c), { ok: true, mismatches: [] });
  // closed period is locked
  assert.throws(() => F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: 5, date: '2026-10-20' }), { code: 'PERIOD_CLOSED' });
  assert.throws(() => F.editTx(S, husband, t.id, { amount: 1 }), { code: 'PERIOD_CLOSED' });
  assert.throws(() => F.deleteTx(S, husband, t.id), { code: 'PERIOD_CLOSED' });
  assert.throws(() => F.closeMonth(S, husband, '2026-10', 'personal'), { code: 'ALREADY' });
  // controlled adjustment inside closed period is flagged and does not alter the snapshot
  const adj = F.addTx(S, husband, { type: 'adjustment', accountId: a.id, amount: -M('5'), date: '2026-10-31', description: 'تصحيح' });
  assert.equal(adj.postClose, true);
  assert.equal(F.verifyClosing(S, c).ok, true);
  // new month still open
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: 5, date: '2026-11-02' });
  // reopening needs explicit confirm + permission
  assert.throws(() => F.reopenMonth(S, husband, c.id, false), { code: 'CONFIRM' });
  assert.throws(() => F.reopenMonth(S, wife, c.id, true), { code: 'FORBIDDEN' });
  F.reopenMonth(S, husband, c.id, true);
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: 5, date: '2026-10-20' });
  assert.equal(S.audit.filter(x => x.action === 'reopen').length, 1);
});

test('summaries: quarter/year ranges and trend', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('1000'), date: '2026-01-01' });
  F.addTx(S, husband, { type: 'income', accountId: a.id, amount: M('100'), categoryId: 'cat_salary', date: '2026-02-10' });
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('40'), categoryId: 'cat_food', date: '2026-11-10' });
  const q = F.periodRange('quarter', '2026-02-10'); assert.deepEqual(q, { from: '2026-01-01', to: '2026-03-31' });
  assert.equal(F.summarize(S, husband, q.from, q.to, 'all').income, M('100'));
  const y = F.periodRange('year', '2026-06-01'); assert.equal(F.summarize(S, husband, y.from, y.to, 'all').net, M('60'));
  const tr = F.trend(S, husband, 3, 'all', '2026-11-18'); assert.equal(tr.length, 3); assert.equal(tr[2].month, '2026-11'); assert.equal(tr[2].expense, M('40'));
  assert.equal(F.summarize(S, husband, y.from, y.to, 'all').savingsRate, 60);
});

test('insights are derived from stored data only', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('10000'), date: '2026-09-01' });
  assert.deepEqual(F.insights(S, husband, '2026-11-18'), []); // nothing stored => no insights
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('1000'), categoryId: 'cat_groceries', date: '2026-10-10' });
  F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('1150'), categoryId: 'cat_groceries', date: '2026-11-10' });
  const ins = F.insights(S, husband, '2026-11-18');
  assert.ok(ins.some(i => i.code === 'cat_up' && i.cat === 'cat_groceries' && i.pct === 15));
});

test('receipt text parsing (Arabic/English) — heuristic suggestions only', () => {
  const r = F.parseReceiptText('Carrefour Market\n2026-11-16 18:20\nMilk 40.00\nVAT 14% 12.50\nTOTAL 100.00');
  assert.equal(r.total, 10000); assert.equal(r.date, '2026-11-16'); assert.equal(r.tax, 1250); assert.equal(r.categoryId, 'cat_groceries');
  const ar = F.parseReceiptText('صيدلية العزبي\n١٦/١١/٢٠٢٦\nالإجمالي ٢٥٠٫٥٠');
  assert.equal(ar.total, 25050); assert.equal(ar.date, '2026-11-16'); assert.equal(ar.categoryId, 'cat_medical');
});

test('no floating point drift across many small transactions', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private' });
  for (let i = 0; i < 1000; i++) F.addTx(S, husband, { type: 'income', accountId: a.id, amount: M('0.10'), date: '2026-11-02' });
  assert.equal(F.balanceOf(S, a.id), M('100.00'));
});

test('editing description/category of a refunded expense is allowed; changing its amount is not', () => {
  const { S, husband } = setup();
  const a = F.createAccount(S, husband, { name: 'Cash', visibility: 'private', opening: M('1000'), date: '2026-11-01' });
  const e = F.addTx(S, husband, { type: 'expense', accountId: a.id, amount: M('100'), categoryId: 'cat_food', date: '2026-11-02' });
  F.addTx(S, husband, { type: 'refund', accountId: a.id, amount: M('10'), refundOf: e.id, date: '2026-11-03' });
  F.editTx(S, husband, e.id, { amount: M('100'), description: 'عشاء', categoryId: 'cat_groceries' });
  assert.equal(F.get(S, 'transactions', e.id).description, 'عشاء');
  assert.throws(() => F.editTx(S, husband, e.id, { amount: M('120') }), { code: 'HAS_REFUND' });
  assert.equal(F.balanceOf(S, a.id), M('910'));
});
