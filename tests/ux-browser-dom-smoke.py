from pathlib import Path
import re
from playwright.sync_api import sync_playwright
site=Path(__file__).resolve().parents[1]/'docs/smart-maintenance'
html=(site/'index.html').read_text()
html=re.sub(r'<script\s+src="[^"]+"\s+defer></script>','',html)
html=re.sub(r'<link rel="stylesheet" href="[^"]+">','',html)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 try:
  page=b.new_page(viewport={'width':1366,'height':900})
  errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded',timeout=12000)
  names=re.findall(r'<link rel="stylesheet" href="([^"]+)">',(site/'index.html').read_text())
  for name in names:
   page.add_style_tag(content=(site/name).read_text())
  page.add_script_tag(content=(site/'app.js').read_text())
  def check(selector, expected=True):
   val=page.locator(selector).is_visible()
   assert val==expected,(selector,expected,val)
  check('[data-panel=dashboard]')
  page.locator('.sidebar [data-group=inspection]').click()
  check('[data-panel=schedule]')
  page.locator('.sidebar [data-view=plans]').click()
  check('[data-panel=equipment]')
  check('.plan-mode-note')
  check('.equipment-form-panel',False)
  page.locator('.sidebar [data-group=admin]').click()
  check('.equipment-form-panel')
  page.locator('.sidebar [data-view=photos]').click()
  check('[data-panel=photos]')
  page.locator('.sidebar [data-view=backup]').click()
  check('[data-panel=backup]')
  desktop=page.locator('#page-title').inner_text()
  
  mobile=b.new_page(viewport={'width':390,'height':844})
  mobile.set_content(html,wait_until='domcontentloaded',timeout=12000)
  names=re.findall(r'<link rel="stylesheet" href="([^"]+)">',(site/'index.html').read_text())
  for name in names:
   mobile.add_style_tag(content=(site/name).read_text())
  mobile.add_script_tag(content=(site/'app.js').read_text())
  assert mobile.locator('.mobile-nav').is_visible()
  mobile.locator('.mobile-nav [data-group=inspection]').click()
  assert mobile.locator('.workspace-subnav [data-view=schedule]').is_visible()
  mobile.locator('.workspace-subnav [data-view=history]').click()
  assert mobile.locator('[data-panel=history]').is_visible()
  
  print('BROWSER DOM SMOKE: PASS; desktop groups/plan mode/photos/backup, mobile tabs/history; title',desktop)
  print('PAGE JS ERRORS:',errors[:4])
 finally:b.close()
