import sys, json; sys.path.insert(0,'/tmp/e2e')
from lib import Run
r=Run(); r.open(); r.onboard('أحمد','1234'); pg=r.pg
def nav(t): pg.locator('nav.bottom button', has_text=t).click(); pg.wait_for_timeout(200)
def tab(t): nav('المال'); pg.locator('.chips .chip', has_text=t).first.click(); pg.wait_for_timeout(200)
r.tx('دخل',1000,acc_label='نقدي شخصي (EGP) 🔒',cat='الراتب'); r.tx('مصروف',100,acc_label='نقدي شخصي (EGP) 🔒',cat='أكل',desc='غداء')
# ---- closing via UI ----
tab('الإقفال'); pg.screenshot(path='/tmp/e2e/close0.png')
pg.locator('.row', has_text='نقدي شخصي').locator('.btn', has_text='مطابقة').click(); pg.wait_for_selector('.sheet .amount-input')
pg.fill('.sheet .amount-input','880'); pg.fill('.sheet input[placeholder="سبب التسوية"]','مصروف منسي'); pg.screenshot(path='/tmp/e2e/reconcile.png'); pg.locator('.sheet .btn.primary', has_text='تسجيل قيد تسوية').click(); pg.wait_for_timeout(500)
print('after adjustment balance (expect 88000):', r.ev("Fin.balanceOf(App.S,App.S.accounts.find(a=>a.name==='نقدي شخصي').id)"))
pg.locator('.btn.primary', has_text='إقفال الشهر').click(); pg.wait_for_selector('.sheet'); pg.screenshot(path='/tmp/e2e/close_confirm.png'); pg.locator('.sheet .btn.primary').click(); pg.wait_for_timeout(500)
print('closed:', r.ev("App.S.closings.map(c=>c.month+':'+c.status)"), 'verify:', r.ev("Fin.verifyClosing(App.S,App.S.closings[0])"))
pg.screenshot(path='/tmp/e2e/closed.png')
# blocked add in closed month
r.quick('مصروف'); pg.fill('.sheet .amount-input','5'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(300)
print('blocked toast:', pg.locator('.toast.err').all_inner_texts()); 
pg.locator('.sheet .btn', has_text='إلغاء').click()
# reopen
tab('الإقفال'); pg.locator('.btn.danger', has_text='إعادة فتح').click(); pg.locator('.sheet .btn.danger').click(); pg.wait_for_timeout(400)
print('after reopen:', r.ev("App.S.closings.map(c=>c.status)"))
# ---- reports period kinds ----
tab('التقارير')
for k in ['ربع سنوي','سنوي','شهري']: pg.locator('.seg button', has_text=k).first.click(); pg.wait_for_timeout(150)
# ---- backup create / verify ----
nav('المزيد'); pg.locator('.card.row', has_text='نسخ احتياطي').click(); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/e2e/backup.png')
with pg.expect_download() as dl: pg.locator('.btn.primary', has_text='إنشاء نسخة').click()
d=dl.value; d.save_as('/tmp/e2e/backup.mylife'); print('backup file:', d.suggested_filename)
import os; print('backup size', os.path.getsize('/tmp/e2e/backup.mylife'))
r.done()
