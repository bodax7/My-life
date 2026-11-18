const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/finance.js');
const L = require('../js/life.js');
const M = s => F.parseMoney(s);

function setup() {
  const S = F.newState(); F.seedCategories(S);
  const h = { id: 'u1', name: 'Husband', role: 'admin' }, w = { id: 'u2', name: 'Wife', role: 'member' };
  S.users.push(h, w); return { S, h, w };
}

test('notes: private / household / custom visibility, search, sorting', () => {
  const { S, h, w } = setup();
  const p = L.saveNote(S, h, { title: 'سري', html: '<p>كلمة السر 1234</p>', visibility: 'private', tags: ['مهم'] });
  const hh = L.saveNote(S, h, { title: 'قائمة البيت', html: '<ul><li>سباكة</li></ul>', visibility: 'household', category: 'household' });
  const cu = L.saveNote(S, h, { title: 'مشترك معاكي', html: 'x', visibility: 'custom', sharedWith: ['u2'] });
  assert.deepEqual(L.listNotes(S, w).map(n => n.title).sort(), ['القائمة البيت'.replace('القائمة', 'قائمة'), 'مشترك معاكي'].sort());
  assert.equal(L.listNotes(S, w, { q: 'السر' }).length, 0);          // wife can't find the private note by searching
  assert.equal(L.listNotes(S, h, { q: 'السر' }).length, 1);
  assert.throws(() => L.saveNote(S, w, { id: p.id, title: 'hack' }), { code: 'FORBIDDEN' });
  L.saveNote(S, h, { id: hh.id, pinned: true });
  assert.equal(L.listNotes(S, h)[0].id, hh.id);                      // pinned first
  assert.equal(L.listNotes(S, h, { tag: 'مهم' }).length, 1);
  assert.throws(() => L.deleteNote(S, w, p.id), { code: 'FORBIDDEN' });
  assert.equal(L.search(S, w, 'السر').length, 0);
});

test('arabic-insensitive search normalisation (hamza, taa marbouta, diacritics)', () => {
  const { S, h } = setup();
  L.saveNote(S, h, { title: 'أدوية البيت', html: '', visibility: 'private' });
  assert.equal(L.listNotes(S, h, { q: 'ادويه' }).length, 1);
});

test('tasks: views, assignment, recurring creates next occurrence once, shared household tasks', () => {
  const { S, h, w } = setup();
  const t1 = L.saveTask(S, h, { title: 'دفع الإنترنت', due: '2026-11-18', scope: 'household', assignedTo: 'u2', priority: 'high' });
  L.saveTask(S, h, { title: 'قديمة', due: '2026-11-10', scope: 'personal' });
  L.saveTask(S, h, { title: 'قادمة', due: '2026-11-25', scope: 'household' });
  assert.deepEqual(L.taskView(S, w, 'today', '2026-11-18').map(t => t.title), ['دفع الإنترنت']);
  assert.equal(L.taskView(S, w, 'overdue', '2026-11-18').length, 0);   // wife doesn't see husband's personal task
  assert.equal(L.taskView(S, h, 'overdue', '2026-11-18').length, 1);
  assert.equal(L.taskView(S, w, 'assignedMe', '2026-11-18').length, 1);
  assert.equal(L.taskView(S, h, 'assignedOther', '2026-11-18').length, 1);
  L.saveTask(S, w, { id: t1.id, status: 'done' });                      // both can manage household tasks
  assert.equal(L.taskView(S, h, 'completed').length, 1);
  const r = L.saveTask(S, h, { title: 'أسبوعية', due: '2026-11-18', repeat: 'weekly' });
  L.saveTask(S, h, { id: r.id, status: 'done' });
  L.saveTask(S, h, { id: r.id, status: 'done' });
  assert.equal(S.tasks.filter(t => t.title === 'أسبوعية' && t.status === 'todo').length, 1);
  assert.equal(S.tasks.find(t => t.title === 'أسبوعية' && t.status === 'todo').due, '2026-11-25');
});

test('shopping lists: shared items, no access to others\' personal lists', () => {
  const { S, h, w } = setup();
  const shared = L.saveList(S, h, { name: 'بقالة', scope: 'household' });
  const mine = L.saveList(S, h, { name: 'شخصي', scope: 'personal' });
  L.saveItem(S, w, { listId: shared.id, name: 'لبن', qty: 2, estPrice: M('40') });
  assert.throws(() => L.saveItem(S, w, { listId: mine.id, name: 'x' }), { code: 'FORBIDDEN' });
  assert.equal(L.search(S, w, 'شخصي').length, 0);
  assert.equal(L.search(S, w, 'لبن').length, 1);
});

test('calendar: recurring events, task deadlines, bill and debt due dates appear', () => {
  const { S, h } = setup();
  const a = F.createAccount(S, h, { name: 'Bank', visibility: 'private', opening: M('100'), date: '2026-11-01' });
  L.saveEvent(S, h, { title: 'اجتماع أسبوعي', date: '2026-11-02', repeat: 'weekly', scope: 'household' });
  L.saveTask(S, h, { title: 'مهمة', due: '2026-11-20' });
  F.addRule(S, h, { kind: 'expense', amount: 100, accountId: a.id, freq: 'monthly', startDate: '2026-11-22', description: 'إنترنت' });
  F.addDebt(S, h, { direction: 'owe', party: 'علي', amount: M('50'), due: '2026-11-25' });
  const ev = L.expandEvents(S, h, '2026-11-01', '2026-11-30');
  assert.equal(ev.filter(e => e.title === 'اجتماع أسبوعي').length, 5);
  assert.ok(ev.some(e => e.src === 'task') && ev.some(e => e.src === 'bill' && e.title === 'إنترنت') && ev.some(e => e.src === 'debt'));
});

test('global search respects privacy across ALL modules', () => {
  const { S, h, w } = setup();
  const priv = F.createAccount(S, h, { name: 'سر الحساب', visibility: 'private', opening: M('1000'), date: '2026-11-01' });
  F.addTx(S, h, { type: 'expense', accountId: priv.id, amount: M('10'), description: 'سر معاملة', date: '2026-11-02' });
  F.addDebt(S, h, { direction: 'owe', party: 'سر دين', amount: 100, scope: 'personal' });
  F.addGoal(S, h, { name: 'سر هدف', target: 100, scope: 'personal' });
  L.saveTask(S, h, { title: 'سر مهمة', scope: 'personal' });
  L.saveEvent(S, h, { title: 'سر حدث', date: '2026-11-20', scope: 'personal' });
  L.addFile(S, h, { name: 'سر ملف.pdf' });
  assert.equal(L.search(S, w, 'سر').length, 0);
  assert.ok(L.search(S, h, 'سر').length >= 6);
  // filter by module
  assert.ok(L.search(S, h, 'سر', { module: 'tasks' }).every(x => x.module === 'tasks'));
});

test('file permissions follow the parent record', () => {
  const { S, h, w } = setup();
  const n = L.saveNote(S, h, { title: 'n', html: 'x', visibility: 'private' });
  const f = L.addFile(S, h, { name: 'a.png', parent: { kind: 'note', id: n.id } });
  assert.equal(L.canViewFile(S, f, w), false);
  L.saveNote(S, h, { id: n.id, visibility: 'household' });
  assert.equal(L.canViewFile(S, f, w), true);
});

test('notifications: computed from data, no repeats once stored', () => {
  const { S, h } = setup();
  L.saveTask(S, h, { title: 'اليوم', due: '2026-11-18' });
  const a = F.createAccount(S, h, { name: 'Cash', visibility: 'private', opening: M('1000'), date: '2026-11-01' });
  const b = F.addBudget(S, h, { categoryId: 'cat_food', amount: M('100'), scope: 'personal' });
  F.addTx(S, h, { type: 'expense', accountId: a.id, amount: M('95'), categoryId: 'cat_food', date: '2026-11-10' });
  const n1 = L.computeNotifs(S, h, '2026-11-18', {});
  assert.ok(n1.some(n => n.type === 'tasks') && n1.some(n => n.type === 'budgets'));
  n1.forEach(n => F.put(S, 'notifs', n));
  assert.equal(L.computeNotifs(S, h, '2026-11-18', {}).length, 0);
  assert.equal(L.computeNotifs({ ...S, notifs: [] }, h, '2026-11-18', { tasks: false, budgets: false, bills: false }).length, 0); // per-type opt-out
});
