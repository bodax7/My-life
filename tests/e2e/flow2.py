import sys; sys.path.insert(0,'/tmp/e2e')
from lib import Run
r=Run(); r.open(); r.onboard('أحمد','1234'); pg=r.pg
def nav(t): pg.locator('nav.bottom button', has_text=t).click(); pg.wait_for_timeout(200)
# ---- notes (husband, private) ----
r.quick('ملاحظة')
pg.fill('.sheet input[placeholder="العنوان"]','كلمة سر الواي فاي')
pg.click('.sheet .editor'); pg.keyboard.type('الباسورد 12345 سري')
pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(300)
# household note
r.quick('ملاحظة'); pg.fill('.sheet input[placeholder="العنوان"]','قائمة صيانة البيت'); pg.click('.sheet .editor'); pg.keyboard.type('سباك ثم كهربائي')
pg.locator('.sheet .seg button', has_text='البيت').click(); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(300)
print('notes:', r.ev("App.S.notes.map(n=>n.title+':'+n.visibility)"))
nav('ملاحظات'); pg.screenshot(path='/tmp/e2e/notes.png')
# ---- voice ----
r.quick('تسجيل صوتي'); pg.locator('.sheet .btn.primary', has_text='ابدأ التسجيل').click(); pg.wait_for_timeout(1200)
pg.locator('.sheet .btn', has_text='إيقاف مؤقت').click(); pg.wait_for_timeout(300); pg.locator('.sheet .btn', has_text='استئناف').click(); pg.wait_for_timeout(1000)
pg.screenshot(path='/tmp/e2e/voice_rec.png')
pg.locator('.sheet .btn.danger', has_text='إيقاف').click(); pg.wait_for_selector('.sheet audio'); pg.screenshot(path='/tmp/e2e/voice_stop.png')
pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(500)
print('voice file:', r.ev("(async()=>{const f=App.S.files.find(f=>f.kind==='audio');const b=await DB.getBlob(f.id);return [f.recording,f.duration>1,b&&b.size>500,f.mime]})()"))
# ---- tasks ----
r.quick('مهمة'); pg.fill('.sheet input[placeholder="عنوان المهمة"]','دفع فاتورة الكهرباء'); pg.locator('.sheet .seg button', has_text='البيت').first.click()
pg.locator('.sheet input[type=date]').first.fill(r.ev("Fin.today()")); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(300)
nav('مهام'); print('tasks today:', pg.locator('.card .row .title').all_inner_texts())
pg.screenshot(path='/tmp/e2e/tasks.png')
# ---- shopping + expense once ----
r.quick('صنف تسوق'); pg.fill('.sheet input[placeholder="اسم الصنف"]','لبن'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(300)
nav('المزيد'); pg.locator('.card.row', has_text='التسوق').click(); pg.wait_for_timeout(200)
pg.locator('.row .iconbtn').first.click(); pg.wait_for_selector('.sheet'); pg.fill('.sheet .amount-input','45')
pg.locator('.sheet select').first.select_option(label='نقدي البيت 🏠'); pg.locator('.sheet .btn.primary', has_text='تسجيل المصروف').click(); pg.wait_for_timeout(400)
print('shop expense tx:', r.ev("App.S.transactions.filter(t=>t.opId.startsWith('shop:')).map(t=>t.amount)"))
# second attempt: unmark then mark again must not double-record
pg.locator('.row .iconbtn').first.click(); pg.wait_for_timeout(300)   # un-purchase
pg.locator('.row .iconbtn').first.click(); pg.wait_for_selector('.sheet'); print('banner already recorded:', pg.locator('.sheet .banner').count())
pg.keyboard.press('Escape'); pg.locator('.sheet .btn', has_text='موافق').click(); pg.wait_for_timeout(200)
print('shop expense tx after retry:', r.ev("App.S.transactions.filter(t=>t.opId.startsWith('shop:')&&!t.deleted).length"))
pg.screenshot(path='/tmp/e2e/shopping.png')
# ---- calendar ----
nav('المزيد'); pg.locator('.card.row', has_text='التقويم').click(); pg.wait_for_timeout(200)
pg.locator('.btns .btn.primary', has_text='حدث جديد').click(); pg.fill('.sheet input[placeholder="عنوان الحدث"]','موعد الطبيب'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(300)
pg.screenshot(path='/tmp/e2e/calendar.png')
print('events:', r.ev("App.S.events.map(e=>e.title)"))
# ---- add wife ----
nav('المزيد'); pg.locator('.card.row', has_text='الإعدادات').click(); pg.wait_for_timeout(200)
pg.locator('.btn.primary', has_text='إضافة عضو').click(); pg.fill('.sheet input[type=text], .sheet input:not([type])','سارة'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(500)
print('users:', r.ev("App.S.users.map(u=>u.name+':'+u.role)"), 'wife accounts:', r.ev("App.S.accounts.filter(a=>a.ownerId!==App.user.id).map(a=>a.name+':'+a.visibility)"))
# switch to wife
nav('المزيد'); pg.locator('.btn', has_text='قفل').first.click(); pg.wait_for_selector('.lock')
pg.locator('.lock .card', has_text='سارة').click(); pg.wait_for_selector('header.top')
print('now user:', r.ev("App.user.name"))
vis=r.ev("""(()=>{const S=App.S,u=App.user;return {
 accounts:Fin.visibleAccounts(S,u).map(a=>a.name),
 tx:Fin.visibleTx(S,u).map(t=>t.type+':'+(t.description||'')),
 notes:Life.listNotes(S,u).map(n=>n.title),
 search_secret:Life.search(S,u,'الباسورد').length, search_wifi:Life.search(S,u,'الواي فاي').length, search_house:Life.search(S,u,'صيانة').length,
 personal_total:Fin.totalBalance(S,u,'all').total, tasksToday:Life.taskView(S,u,'today',Fin.today()).map(t=>t.title)}})()""")
import json; print(json.dumps(vis,ensure_ascii=False))
nav('المال'); pg.screenshot(path='/tmp/e2e/wife_money.png')
# wife records a shared expense, husband can see it
r.tx('مصروف',60,acc_label='نقدي البيت (EGP) 🏠',cat='كهرباء',desc='فاتورة')
print('wife tx created_by:', r.ev("App.S.transactions.filter(t=>t.description==='فاتورة').map(t=>App.userName(t.createdBy))"))
r.done()
