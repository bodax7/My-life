from playwright.sync_api import sync_playwright
import json
class Run:
    def __init__(self, lang='ar', w=390, h=844, scheme='light'):
        self.errs=[]
        self.p=sync_playwright().start()
        self.b=self.p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
        self.ctx=self.b.new_context(viewport={'width':w,'height':h}, permissions=['microphone'], color_scheme=scheme, accept_downloads=True)
        self.pg=self.ctx.new_page()
        self.pg.on('console', lambda m: self.errs.append(('console',m.type,m.text)) if m.type in ('error','warning') else None)
        self.pg.on('pageerror', lambda e: self.errs.append(('pageerror',str(e))))
        self.pg.on('dialog', lambda d: d.accept(d.default_value or 'test'))
    def open(self):
        self.pg.goto('http://localhost:8765/index.html'); self.pg.wait_for_timeout(300)
    def onboard(self, name='أحمد', pin='1234'):
        pg=self.pg; pg.wait_for_selector('.lock')
        pg.fill('.lock input[type=text], .lock input:not([type])', name)
        pg.fill('.lock input[type=password]', pin)
        pg.click('.lock .btn.primary'); pg.wait_for_selector('header.top')
    def ev(self, js): return self.pg.evaluate(js)
    def sheet_btn(self, text):
        self.pg.locator('.sheet button', has_text=text).first.click()
    def quick(self, label):
        self.pg.click('.fab'); self.pg.locator('.sheet .qa button', has_text=label).first.click(); self.pg.wait_for_selector('.sheet')
    def tx(self, kind_label, amount, acc_label=None, to_label=None, cat=None, desc=None):
        pg=self.pg
        self.quick(kind_label)
        pg.fill('.sheet .amount-input', str(amount))
        sels=pg.locator('.sheet select')
        if acc_label: sels.nth(0).select_option(label=acc_label)
        if to_label: pg.locator('.sheet select').nth(1).select_option(label=to_label)
        if cat: pg.locator('.sheet .cats button', has_text=cat).first.click()
        if desc: pg.locator('.sheet input[placeholder]').last.fill(desc)
        pg.locator('.sheet .btns .btn.primary').click(); pg.wait_for_timeout(400)
    def done(self):
        print(json.dumps(self.errs, ensure_ascii=False, indent=1)); self.b.close(); self.p.stop()
