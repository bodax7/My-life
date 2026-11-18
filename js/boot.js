/* MyLife — startup */
(async () => {
  const S = App.S;
  try {
    await DB.open(); await DB.loadAll(S);
    if (!S.categories.length && S.users.length) { Fin.seedCategories(S); await DB.flush(S); }
    App.lang = App.get('lang', 'ar');
    const sid = sessionStorage.getItem('mylife.user'); const u = sid && S.users.find(x => x.id === sid);
    if (u) { App.user = u; App.lang = App.get('lang_' + u.id, App.lang); }
    App.render(); if (App.user) App.refreshNotifs();
    setInterval(() => { if (App.user && !document.hidden) App.refreshNotifs(); }, 60000);
  } catch (e) {
    console.error(e);
    document.getElementById('app').textContent = 'MyLife: تعذّر فتح التخزين المحلي / local storage unavailable — ' + (e && e.message);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
