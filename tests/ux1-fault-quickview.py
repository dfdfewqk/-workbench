"""Progressive fault form test without HTTP origin; real form model and browser DOM."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent / 'docs' / 'smart-maintenance'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1200, 'height': 900})
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content((ROOT/'index.html').read_text(encoding='utf-8'), wait_until='domcontentloaded')
    page.add_style_tag(content=(ROOT/'faults.css').read_text(encoding='utf-8'))
    page.add_script_tag(content=(ROOT/'fault-model.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=(ROOT/'repair-model.js').read_text(encoding='utf-8'))
    page.evaluate('''() => {
      window.__fault = {id:'case-1', equipmentId:'eq-1', status:'open', owner:'홍관리', priority:'high',
        operatingState:'unverified', repairDueDate:'2026-10-31', nextReviewDate:'2026-11-01', history:[]};
      window.SmartMaintenanceFaultUI = {updateSelected: async callback => {
        window.__fault=callback(window.__fault);
        window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',
          {detail:{fault:window.__fault, archived:false}}));
      }};
    }''')
    page.add_script_tag(content=(ROOT/'repair-ui.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=(ROOT/'fault-quickview.js').read_text(encoding='utf-8'))
    page.evaluate("document.querySelector('[data-panel=faults]').hidden=false; document.querySelector('#fault-detail').hidden=false")
    page.evaluate("window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:window.__fault, archived:false}}))")
    assert page.locator('.fault-quick-cell').count() == 7
    assert page.locator('.fault-quick-overview').inner_text().find('홍관리') >= 0
    assert page.locator('#fault-ui-fault-update-form').evaluate('(n)=>n.open') is False
    assert page.locator('#fault-ui-repair-create-form').evaluate('(n)=>n.open') is False
    page.locator('[data-fault-open="fault-update-form"]').click()
    assert page.locator('#fault-ui-fault-update-form').evaluate('(n)=>n.open')
    assert page.locator('#fault-actor').is_visible()
    page.locator('[data-fault-open="repair-create-form"]').click()
    assert page.locator('#fault-ui-repair-create-form').evaluate('(n)=>n.open')
    assert not page.locator('#fault-ui-fault-update-form').evaluate('(n)=>n.open')
    assert page.locator('[data-fault-open="repair-progress-form"]').is_disabled()
    page.locator('#repair-create-title').fill('모터 베어링 교체')
    page.locator('#repair-create-worker').fill('김정비')
    page.locator('#repair-create-role').fill('기계 정비')
    page.locator('#repair-create-reason').fill('베어링 마모')
    page.locator('#repair-create-form button[type=submit]').click()
    assert not page.locator('[data-fault-open="repair-progress-form"]').is_disabled()
    assert not page.locator('[data-fault-open="repair-confirm-form"]').is_disabled()
    page.locator('[data-fault-open="repair-progress-form"]').click()
    assert page.locator('#repair-progress-form').is_visible()
    assert not page.locator('#repair-create-form').is_visible()
    page.locator('[data-fault-open="fault-history-log"]').click()
    assert page.locator('#fault-ui-fault-history-log').evaluate('(n)=>n.open')
    # Ended faults have no interactive actions but preserve the history viewer.
    page.evaluate('''() => {
      window.__fault.status='closed';
      window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',
      {detail:{fault:window.__fault, archived:false}}));
    }''')
    for button in page.locator('.fault-quick-button').all():
        if button.get_attribute('data-fault-open') == 'fault-history-log':
            assert button.is_enabled()
        else:
            assert button.is_disabled(), button.inner_text()
    page.evaluate('''() => {
      window.__fault.status='open';
      window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',
      {detail:{fault:window.__fault, archived:true}}));
    }''')
    assert page.locator('[data-fault-open="fault-close-form"]').is_disabled()
    page.evaluate('''() => {window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',
      {detail:{fault:window.__fault, archived:false}}));}''')
    assert page.locator('[data-fault-open="fault-close-form"]').is_enabled()
    assert not errors, errors
    print('UX1_BROWSER_DOM_PASS: summary, fast navigation, form guard, real work task, closed and archive', errors)
    browser.close()
