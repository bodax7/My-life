from playwright.sync_api import sync_playwright
import sys, json
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    ctx=b.new_context(viewport={'width':390,'height':844}, permissions=['microphone'])
    pg=ctx.new_page()
    pg.on('console', lambda m: errs.append(('console',m.type,m.text)) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_selector('.lock')
    pg.screenshot(path='/tmp/e2e/01_onboarding.png')
    pg.fill('input[placeholder="مثال: أحمد"]','أحمد')
    pg.fill('input[type=password]','1234')
    pg.click('text=ابدأ')
    pg.wait_for_selector('header.top')
    pg.wait_for_timeout(500)
    pg.screenshot(path='/tmp/e2e/02_home.png')
    print('title:', pg.inner_text('header.top h1'))
    print('accounts seeded:', pg.evaluate("App.S.accounts.map(a=>a.name+':'+a.visibility)"))
    print('dir:', pg.evaluate("document.documentElement.dir"))
    print(json.dumps(errs, ensure_ascii=False, indent=1))
    b.close()
