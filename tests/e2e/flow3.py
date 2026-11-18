import sys, json; sys.path.insert(0,'/tmp/e2e')
from lib import Run
r=Run(); r.open(); r.onboard('أحمد','1234'); pg=r.pg
def nav(t): pg.locator('nav.bottom button', has_text=t).click(); pg.wait_for_timeout(200)
def tab(t): nav('المال'); pg.locator('.chips .chip', has_text=t).first.click(); pg.wait_for_timeout(200)
today=r.ev("Fin.today()")
r.tx('دخل',10000,acc_label='نقدي شخصي (EGP) 🔒',cat='الراتب')
r.tx('مصروف',300,acc_label='نقدي شخصي (EGP) 🔒',cat='بقالة',desc='سوبر ماركت')
# ---- budget via UI ----
tab('الميزانيات'); pg.locator('.btns .btn.primary', has_text='إضافة ميزانية').click(); pg.fill('.sheet .amount-input','400'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
print('budget status:', r.ev("(()=>{const b=App.S.budgets[0];const s=Fin.budgetStatus(App.S,App.user,b,Fin.today());return [b.categoryId,s.spent,s.remaining,s.pct,s.level]})()"), '(expect groceries 30000 / 10000 / 75 / 75)')
pg.screenshot(path='/tmp/e2e/budgets.png')
# ---- refund via UI ----
tab('المعاملات'); pg.locator('.row', has_text='سوبر ماركت').first.click(); pg.wait_for_selector('.sheet'); pg.locator('.sheet .btn', has_text='استرداد').click(); pg.wait_for_selector('.sheet .amount-input'); pg.fill('.sheet .amount-input','50'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
print('balance after refund (expect 974...):', r.ev("Fin.balanceOf(App.S,App.S.accounts.find(a=>a.name==='نقدي شخصي').id)"), '(expect 975000-? => 10000-300+50=9750 => 975000)')
# ---- edit via UI: description of a refunded expense (allowed) and amount of the salary income ----
pg.locator('.row', has_text='سوبر ماركت').first.click(); pg.wait_for_selector('.sheet'); pg.locator('.sheet .btn', has_text='تعديل').click(); pg.wait_for_selector('.sheet .amount-input'); pg.locator('.sheet input[placeholder]').last.fill('هايبر'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
print('desc edit ok:', r.ev("App.S.transactions.some(t=>t.description==='هايبر')"), 'sheet closed:', pg.locator('.sheet').count()==0)
pg.locator('.row', has_text='الراتب').first.click(); pg.wait_for_selector('.sheet'); pg.locator('.sheet .btn', has_text='تعديل').click(); pg.wait_for_selector('.sheet .amount-input'); pg.fill('.sheet .amount-input','12000'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
print('after salary 12000 (expect 12000-300+50=11750 => 1175000):', r.ev("Fin.balanceOf(App.S,App.S.accounts.find(a=>a.name==='نقدي شخصي').id)"))
# ---- recurring via UI ----
tab('المتكرر'); pg.locator('.btns .btn.primary', has_text='إضافة التزام').click(); pg.fill('.sheet .amount-input','150'); pg.fill('.sheet input[placeholder="مثال: خضار"]','إنترنت')
pg.locator('.sheet input[type=date]').first.fill(today); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
print('rule due today shown:', pg.locator('.card', has_text='مستحق الآن').count(), 'balance unchanged until confirm:', r.ev("Fin.balanceOf(App.S,App.S.accounts.find(a=>a.name==='نقدي شخصي').id)"))
pg.locator('.btn', has_text='تأكيد الدفع').first.click(); pg.wait_for_timeout(500)
print('after confirm (−150):', r.ev("Fin.balanceOf(App.S,App.S.accounts.find(a=>a.name==='نقدي شخصي').id)"), 'next:', r.ev("Fin.nextDue(App.S.recurring[0])"))
pg.screenshot(path='/tmp/e2e/recurring.png')
# ---- goal ----
tab('الادخار'); pg.locator('.btns .btn.primary', has_text='إضافة هدف').click(); pg.fill('.sheet input[type=text]:not(.amount-input)','سيارة'); pg.fill('.sheet .amount-input','50000'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
pg.locator('.card.tap', has_text='سيارة').click(); pg.wait_for_selector('.sheet'); pg.locator('.sheet .btn.primary', has_text='إيداع').click(); pg.fill('.sheet .amount-input','5000'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
print('goal:', r.ev("(()=>{const g=App.S.goals[0];return Fin.goalStatus(App.S,g,Fin.today())})()"))
# ---- debt with cash movement ----
tab('الديون'); pg.locator('.btns .btn.primary', has_text='إضافة دين').click(); pg.fill('.sheet input[type=text]:not(.amount-input)','محمد'); pg.fill('.sheet .amount-input','1000'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
pg.locator('.card.tap', has_text='محمد').click(); pg.wait_for_selector('.sheet'); pg.locator('.sheet .btn.primary', has_text='تسجيل سداد').click(); pg.fill('.sheet .amount-input','400'); pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(500)
print('debt:', r.ev("(()=>{const d=App.S.debts[0];const st=Fin.debtStatus(App.S,d);const x=Fin.summarize(App.S,App.user,Fin.monthRange(Fin.monthOf(Fin.today())).from,Fin.monthRange(Fin.monthOf(Fin.today())).to,'all');return [st.remaining,st.status,x.debtOut,x.expense]})()"))
pg.screenshot(path='/tmp/e2e/debts.png')
# ---- reconcile + close ----
tab('الإقفال'); 
cur=r.ev("Fin.monthOf(Fin.today())")
# default month = current (today day>10) or previous; force current for the test
r.ev("(()=>{App.go('money','close')})()")
pg.screenshot(path='/tmp/e2e/close.png')
r.done()
