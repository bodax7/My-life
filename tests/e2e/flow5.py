import sys, json; sys.path.insert(0,'/tmp/e2e')
from lib import Run
# ---- restore into a fresh browser profile ----
r=Run(); r.open(); pg=r.pg; pg.wait_for_selector('.lock')
with pg.expect_file_chooser() as fc: pg.locator('.btn.ghost', has_text='استعادة').click()
fc.value.set_files('/tmp/e2e/backup.mylife'); pg.wait_for_selector('.lock .card, .lock .box'); pg.wait_for_timeout(600)
print('users after restore:', r.ev("App.S.users.map(u=>u.name)"))
pg.locator('.lock .card', has_text='أحمد').click(); pg.fill('.lock input[type=password]','1234'); pg.click('.lock .btn.primary'); pg.wait_for_selector('header.top')
print('balance restored (88000):', r.ev("Fin.balanceOf(App.S,App.S.accounts.find(a=>a.name==='نقدي شخصي').id)"), 'tx:', r.ev("App.S.transactions.length"))
print('wrong pin test:'); r.ev("App.logout()"); pg.locator('.lock .card', has_text='أحمد').click(); pg.fill('.lock input[type=password]','0000'); pg.click('.lock .btn.primary'); pg.wait_for_timeout(300); print(pg.locator('.toast.err').all_inner_texts())
pg.fill('.lock input[type=password]','1234'); pg.click('.lock .btn.primary'); pg.wait_for_selector('header.top')
# ---- offline: reload with network off, data + app still work (service worker) ----
pg.wait_for_timeout(1200)
print('sw controlling:', r.ev("navigator.serviceWorker.controller!==null") )
r.ctx.set_offline(True); pg.reload(); pg.wait_for_selector('header.top, .lock', timeout=8000)
print('offline reload ok, user session persisted:', pg.locator('header.top').count()==1, 'badge:', pg.locator('header.top .badge').inner_text())
r.tx('مصروف',20,acc_label='نقدي شخصي (EGP) 🔒',cat='أكل',desc='عمل أوفلاين')
print('offline tx saved:', r.ev("App.S.transactions.some(t=>t.description==='عمل أوفلاين')"))
pg.screenshot(path='/tmp/e2e/offline.png'); r.ctx.set_offline(False)
# ---- English + dark mode ----
r.ev("(async()=>{App.lang='en';App.set('lang_'+App.user.id,'en');App.set('theme','dark');await DB.flush(App.S);App.render()})()"); pg.wait_for_timeout(300)
print('dir:', r.ev("document.documentElement.dir"), 'theme:', r.ev("document.documentElement.dataset.theme"))
pg.screenshot(path='/tmp/e2e/en_dark_home.png')
for tab in ['Money','Notes','Tasks','More']:
    pg.locator('nav.bottom button', has_text=tab).click(); pg.wait_for_timeout(200)
pg.locator('nav.bottom button', has_text='Money').click(); pg.screenshot(path='/tmp/e2e/en_dark_money.png')
r.done()
