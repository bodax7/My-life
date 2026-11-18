/* MyLife — dashboard */
(() => {
  const { h, t, S } = App;
  const WIDGETS = ['balances', 'month', 'insights', 'budgets', 'upcoming', 'tasks', 'events', 'shopping', 'notes', 'voice'];

  function card(title, body, onMore) { return h('div', { class: 'card' }, h('h3', {}, title, onMore ? h('button', { class: 'btn sm ghost', onclick: onMore }, t('see_all')) : null), body); }

  const W = {
    balances() {
      const u = App.user, per = Fin.totalBalance(S, u, 'personal'), hh = Fin.totalBalance(S, u, 'household');
      const group = (title, tot) => card(title, h('div', {}, tot.per.length ? tot.per.map(p => h('div', { class: 'row tap', onclick: () => App.go('money', 'accounts', { acc: p.account.id }) }, h('div', { class: 'avatar' }, { cash: '💵', bank: '🏦', wallet: '📱', savings: '🐷' }[p.account.type] || '💳'), h('div', { class: 'grow' }, h('div', { class: 'title' }, p.account.name), p.account.currency !== Fin.BASE ? h('div', { class: 'sub' }, '≈ ' + App.moneyTxt(p.base))
        : null), h('div', { class: 'amt' }, App.money(p.balance, p.account.currency)))) : App.empty(t('no_accounts'))), () => App.go('money', 'accounts'));
      return h('div', {}, h('div', { class: 'grid2' },
        h('div', { class: 'stat hero' }, h('small', {}, t('personal_total')), h('b', {}, App.money(per.total))),
        h('div', { class: 'stat' }, h('small', {}, t('household_total')), h('b', {}, App.money(hh.total)))),
        group('🔒 ' + t('personal_accounts'), per), group('🏠 ' + t('household_accounts'), hh));
    },
    month() {
      const rg = Fin.monthRange(Fin.monthOf(App.today())); const r = Fin.summarize(S, App.user, rg.from, rg.to, 'all');
      const rem = S.budgets.filter(b => b.active && (b.scope === 'household' || b.ownerId === App.user.id)).reduce((s, b) => { const st = Fin.budgetStatus(S, App.user, b, App.today()); return s + Math.max(0, st.remaining); }, 0);
      const hasB = S.budgets.some(b => b.active && (b.scope === 'household' || b.ownerId === App.user.id));
      return card(t('this_month') + ' — ' + App.monthName(Fin.monthOf(App.today())), h('div', { class: 'grid2' },
        h('div', {}, h('small', { class: 'muted' }, t('income')), h('div', { class: 'amt in' }, App.money(r.income))),
        h('div', {}, h('small', { class: 'muted' }, t('expenses')), h('div', { class: 'amt out' }, App.money(r.expense))),
        h('div', {}, h('small', { class: 'muted' }, t('net')), h('div', { class: 'amt' }, App.money(r.net))),
        h('div', {}, h('small', { class: 'muted' }, t('available_budget')), h('div', { class: 'amt' }, hasB ? App.money(rem) : '—'))), () => App.go('money', 'reports'));
    },
    insights() {
      if (App.get('insights_off_' + App.user.id, false)) return null;
      const ins = Fin.insights(S, App.user, App.today()).slice(0, 4); if (!ins.length) return null;
      return card('💡 ' + t('insights'), h('div', {}, ins.map(i => h('div', { class: 'row' }, h('div', { class: 'grow small', style: { whiteSpace: 'normal' } }, App.insightText(i))))));
    },
    budgets() {
      const bs = S.budgets.filter(b => b.active && (b.scope === 'household' || b.ownerId === App.user.id)).slice(0, 4); if (!bs.length) return null;
      return card('📊 ' + t('budgets'), h('div', {}, bs.map(b => { const st = Fin.budgetStatus(S, App.user, b, App.today()); return h('div', { class: 'row', style: { display: 'block' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, App.catIcon(b.categoryId) + ' ' + App.catName(b.categoryId)), h('span', { class: 'small muted' }, App.num(st.pct) + '%')), App.progress(st.pct, st.pct >= 100 ? 'bad' : st.pct >= 75 ? 'warn' : '')); })), () => App.go('money', 'budgets'));
    },
    upcoming() {
      const to = Fin.addDays(App.today(), 14); const due = Fin.dueList(S, App.user, App.today()); const up = Fin.upcoming(S, App.user, App.today(), to).filter(x => !due.some(d => d.rule.id === x.rule.id && d.date === x.date)).slice(0, 5);
      if (!due.length && !up.length) return null;
      const row = (x, isDue) => h('div', { class: 'row tap', onclick: () => App.go('money', 'recurring') }, h('div', { class: 'avatar' }, x.rule.kind === 'income' ? '💵' : '🔁'), h('div', { class: 'grow' }, h('div', { class: 'title' }, x.rule.description || App.catName(x.rule.categoryId)), h('div', { class: 'sub' }, App.date(x.date) + (isDue ? ' · ' + t('due_now') : ''))), h('div', { class: 'amt ' + (x.rule.kind === 'income' ? 'in' : 'out') }, App.money(x.rule.amount, (App.acc(x.rule.accountId) || {}).currency)));
      return card('🔁 ' + t('upcoming_payments'), h('div', {}, due.map(x => row(x, true)), up.map(x => row(x, false))), () => App.go('money', 'recurring'));
    },
    tasks() {
      const td = Life.taskView(S, App.user, 'today', App.today()), ov = Life.taskView(S, App.user, 'overdue', App.today()), up = Life.taskView(S, App.user, 'upcoming', App.today()).slice(0, 3);
      const list = [...ov.map(x => [x, 'bad']), ...td.map(x => [x, 'ok']), ...up.map(x => [x, ''])].slice(0, 6);
      return card('✅ ' + t('tasks_overview'), list.length ? h('div', {}, list.map(([x, k]) => h('div', { class: 'row tap', onclick: () => App.taskSheet(x) }, h('div', { class: 'grow' }, h('div', { class: 'title' }, x.title), h('div', { class: 'sub' }, App.date(x.due))), k ? h('span', { class: 'badge ' + k }, k === 'bad' ? t('overdue') : t('today')) : null))) : App.empty(t('no_tasks_today')), () => App.go('tasks'));
    },
    events() {
      const ev = Life.expandEvents(S, App.user, App.today(), Fin.addDays(App.today(), 7)).slice(0, 5); if (!ev.length) return null;
      return card('📅 ' + t('upcoming_events'), h('div', {}, ev.map(e => h('div', { class: 'row' }, h('div', { class: 'avatar' }, { task: '✅', bill: '🔁', event: '📅' }[e.src] || '📅'), h('div', { class: 'grow' }, h('div', { class: 'title' }, e.title), h('div', { class: 'sub' }, App.date(e.date) + (e.time ? ' ' + e.time : '')))))), () => App.go('more', 'calendar'));
    },
    shopping() {
      const lists = S.shopLists.filter(l => Life.canViewList(l, App.user)); if (!lists.length) return null;
      const items = S.shopItems.filter(i => lists.some(l => l.id === i.listId)); const pend = items.filter(i => !i.purchased).length;
      return card('🛒 ' + t('shopping'), h('div', { class: 'row tap', onclick: () => App.go('more', 'shopping') }, h('div', { class: 'grow' }, h('div', { class: 'title' }, t('pending_items', { n: App.num(pend) })), h('div', { class: 'sub' }, t('bought_items', { n: App.num(items.length - pend) })))));
    },
    notes() {
      const ns = Life.listNotes(S, App.user, {}).filter(n => n.pinned || n.favorite).slice(0, 3); if (!ns.length) return null;
      return card('⭐ ' + t('important_notes'), h('div', {}, ns.map(n => h('div', { class: 'row tap', onclick: () => App.noteEditor(n) }, h('div', { class: 'avatar' }, n.pinned ? '📌' : '⭐'), h('div', { class: 'grow' }, h('div', { class: 'title' }, n.title || Life.stripHtml(n.html).slice(0, 30)), h('div', { class: 'sub' }, Life.stripHtml(n.html).slice(0, 50)))))), () => App.go('notes'));
    },
    voice() {
      const vs = S.files.filter(f => f.kind === 'audio' && f.recording && Life.canViewFile(S, f, App.user)).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 3); if (!vs.length) return null;
      return card('🎙️ ' + t('recent_voice'), h('div', {}, vs.map(v => h('div', { class: 'row tap', onclick: () => App.viewFile(v) }, h('div', { class: 'avatar' }, '🎙️'), h('div', { class: 'grow' }, h('div', { class: 'title' }, v.name), h('div', { class: 'sub' }, App.dateTime(v.createdAt) + ' · ' + App.fmtDur(v.duration)))))), () => App.go('notes', 'voice'));
    },
  };

  App.insightText = i => {
    const p = { cat: i.cat ? App.catName(i.cat) : '', pct: App.num(i.pct || 0), goal: i.goal || '' };
    return t('ins_' + i.code, p);
  };
  App.fmtDur = s => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function customize() {
    const key = 'dash_' + App.user.id; let order = App.get(key, { order: WIDGETS, hidden: [] });
    order = { order: [...order.order.filter(w => WIDGETS.includes(w)), ...WIDGETS.filter(w => !order.order.includes(w))], hidden: order.hidden || [] };
    App.sheet(t('customize_dashboard'), s => {
      const list = h('div'); const draw = () => {
        list.replaceChildren(...order.order.map((w, i) => h('div', { class: 'switch' },
          h('label', { style: { flex: 1 } }, h('input', { type: 'checkbox', checked: !order.hidden.includes(w), onchange: e => { order.hidden = e.target.checked ? order.hidden.filter(x => x !== w) : [...order.hidden, w]; } }), ' ' + t('w_' + w)),
          h('button', { class: 'btn sm', disabled: i === 0, onclick: () => { [order.order[i - 1], order.order[i]] = [order.order[i], order.order[i - 1]]; draw(); } }, '↑'),
          h('button', { class: 'btn sm', disabled: i === order.order.length - 1, onclick: () => { [order.order[i + 1], order.order[i]] = [order.order[i], order.order[i + 1]]; draw(); } }, '↓'))));
      }; draw();
      return h('div', {}, list, h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: async () => { App.set(key, order); await DB.flush(S); s.close(); App.render(); } }, t('save')), h('button', { class: 'btn', onclick: s.close }, t('cancel'))));
    });
  }

  App.screens.home = () => {
    const cfg = App.get('dash_' + App.user.id, { order: WIDGETS, hidden: [] });
    const order = [...cfg.order.filter(w => WIDGETS.includes(w)), ...WIDGETS.filter(w => !cfg.order.includes(w))];
    const run = Fin.dueList(S, App.user, App.today());
    return h('div', {},
      h('div', { style: { margin: '2px 4px 6px' } }, h('span', { class: 'muted' }, t('hello')), ' ', h('b', {}, App.user.name)),
      h('div', { class: 'card' }, h('h3', {}, t('quick_actions')), h('div', { class: 'qa' }, App.quickActions().map(([ic, k, fn]) => h('button', { onclick: fn }, h('span', { class: 'ic' }, ic), t(k))))),
      run.length ? h('div', { class: 'banner', onclick: () => App.go('money', 'recurring'), style: { cursor: 'pointer' } }, '🔁 ' + t('recurring_waiting', { n: App.num(run.length) })) : null,
      ...order.filter(w => !(cfg.hidden || []).includes(w)).map(w => W[w]()),
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: customize }, '⚙️ ' + t('customize_dashboard'))));
  };
})();
