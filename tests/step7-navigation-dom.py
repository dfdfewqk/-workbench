from pathlib import Path
import re
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'docs'/'smart-maintenance'
html=(root/'index.html').read_text(encoding='utf-8')
html=re.sub(r'<script\s+src="[^"]+"\s+defer></script>','',html)
html=re.sub(r'<link\s+rel="stylesheet"\s+href="[^"]+">','',html)
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1360,'height':850})
    page.set_content(html,wait_until='domcontentloaded')
    for path in root.glob('*.css'):page.add_style_tag(content=path.read_text(encoding='utf-8'))
    page.add_script_tag(content=(root/'app.js').read_text(encoding='utf-8'))
    def visible():return page.locator('[data-panel]').evaluate_all('(xs)=>xs.filter(x=>getComputedStyle(x).display!=="none").map(x=>x.dataset.panel)')
    assert visible()==['dashboard'],visible()
    for name in ['equipment','schedule','history','faults','photos','backup']:
        page.locator(f'.sidebar [data-view="{name}"]').click()
        assert visible()==[name], (name,visible())
    # Dynamically appended plan inspection form must not bleed across menu tabs.
    page.evaluate("""()=>{ const form=document.createElement('section');form.id='plan-execution-panel';form.hidden=false;document.querySelector('main.content').append(form); }""")
    page.locator('.sidebar [data-view="dashboard"]').click()
    assert page.locator('#plan-execution-panel').is_hidden()
    assert visible()==['dashboard']
    print('PASS: initial dashboard only, seven navigation panels isolated, floating inspection form closes on navigation')
    browser.close()
