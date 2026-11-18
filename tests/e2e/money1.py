import sys; sys.path.insert(0,'/tmp/e2e')
from lib import Run
r=Run(); r.open(); r.onboard(); pg=r.pg
bal=lambda name: r.ev("(()=>{const a=App.S.accounts.find(a=>a.name==='%s');return Fin.balanceOf(App.S,a.id)})()"%name)
r.tx('دخل',15000,acc_label='نقدي شخصي (EGP) 🔒',cat='الراتب')
r.tx('دخل',8000,acc_label='نقدي البيت (EGP) 🏠',cat='دخل أعمال')
print('after incomes', bal('نقدي شخصي'), bal('نقدي البيت'))
r.tx('تحويل',3000,acc_label='نقدي شخصي (EGP) 🔒',to_label='نقدي البيت (EGP) 🏠')
print('after transfer personal/house (minor units):', bal('نقدي شخصي'), bal('نقدي البيت'), '(expect 1200000 / 1100000)')
r.tx('مصروف',200.5,acc_label='نقدي البيت (EGP) 🏠',cat='بقالة',desc='خضار')
print('after expense house:', bal('نقدي البيت'), '(expect 1079950)')
s=r.ev("(()=>{const rg=Fin.monthRange(Fin.monthOf(Fin.today()));const x=Fin.summarize(App.S,App.user,rg.from,rg.to,'all');return [x.income,x.expense,x.transfers,x.transferCount]})()")
print('summary income/expense/transfers/count:', s, '(expect income 2300000, expense 20050, transfers 300000, 1)')
# tabs
for tab in ['المعاملات','الميزانيات','المتكرر','الادخار','الديون','الإقفال','التقارير','الحسابات']:
    pg.click('nav.bottom button:has-text("المال")'); pg.locator('.chips .chip', has_text=tab).first.click(); pg.wait_for_timeout(150)
    pg.screenshot(path='/tmp/e2e/money_%s.png'%tab)
r.done()
