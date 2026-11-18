import sys, json; sys.path.insert(0,'/tmp/e2e')
from lib import Run
r=Run(w=1100,h=800); r.open(); r.onboard('أحمد','1234'); pg=r.pg
def nav(t): pg.locator('nav.bottom button', has_text=t).click(); pg.wait_for_timeout(200)
r.tx('دخل',500,acc_label='نقدي شخصي (EGP) 🔒',cat='هدايا',desc='هدية عيد')
pg.screenshot(path='/tmp/e2e/desktop_home.png')
# ---- receipt scan (no internet -> OCR unavailable -> manual confirmation; never auto-saves) ----
r.ev("""(async()=>{const c=document.createElement('canvas');c.width=300;c.height=400;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,300,400);x.fillStyle='#000';x.font='24px sans-serif';x.fillText('TOTAL 100.00',20,200);
 const b=await new Promise(r=>c.toBlob(r,'image/png'));window.__f=new File([b],'r.png',{type:'image/png'});App.scanReceipt(window.__f);})()"""); pg.wait_for_selector('.sheet canvas')
pg.screenshot(path='/tmp/e2e/scan.png')
before=r.ev("App.S.transactions.length")
pg.locator('.sheet .btn.primary', has_text='استخراج').click(); pg.wait_for_timeout(6000)
print('toast:', pg.locator('.toast').all_inner_texts()[-1:], 'tx sheet open w/ attachment chip:', pg.locator('.sheet .chip', has_text='receipt').count(), 'tx count unchanged:', before==r.ev("App.S.transactions.length"))
pg.fill('.sheet input[inputmode=decimal]','100'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(600)
print('saved after confirm:', r.ev("App.S.transactions.length-%d"%before), r.ev("App.S.files.filter(f=>f.kind==='image').length"))
# ---- search ----
r.ev("App.go('more','search')"); pg.fill('input[type=search]','هدية'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300); print('search results:', pg.locator('.card .row .title').all_inner_texts()); pg.screenshot(path='/tmp/e2e/search.png')
# ---- dashboard customize ----
r.ev("App.go('home')"); pg.locator('.btn', has_text='تخصيص اللوحة').click(); pg.locator('.sheet input[type=checkbox]').first.uncheck(); pg.locator('.sheet .btn.primary').click(); pg.wait_for_timeout(300)
print('dash hidden:', r.ev("App.get('dash_'+App.user.id).hidden"))
# ---- notifications ----
r.ev("(async()=>{Life.saveTask(App.S,App.user,{title:'مهمة اليوم',due:Fin.today()});await DB.flush(App.S);await App.refreshNotifs()})()"); pg.wait_for_timeout(500)
print('unread badge:', pg.locator('header.top .dot').inner_text()); pg.locator('header.top .iconbtn').nth(1).click(); pg.wait_for_selector('.sheet'); print('notif text:', pg.locator('.sheet .row .title').all_inner_texts()); pg.screenshot(path='/tmp/e2e/notifs.png')
r.done()
