"""DOM interaction smoke without an HTTP origin/IndexedDB; the separate Node tests cover pure lifecycle rules."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent/'docs'/'smart-maintenance'
html=(ROOT/'index.html').read_text(encoding='utf-8')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    page.add_script_tag(content=(ROOT/'repair-model.js').read_text(encoding='utf-8'))
    page.evaluate("""() => {
      window.__testFault={id:'f1',status:'open',owner:'관리자',equipmentId:'eq1',repairDueDate:'2026-11-03',history:[]};
      window.SmartMaintenanceFaultUI={updateSelected: async fn => {
        try { window.__testFault=fn(window.__testFault);
          window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:window.__testFault,archived:false}}));
        } catch(e) {window.__testError=e.message;throw e;}
      }};
    }""")
    page.add_script_tag(content=(ROOT/'repair-ui.js').read_text(encoding='utf-8'))
    page.evaluate("window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:window.__testFault,archived:false}}));document.querySelector('[data-panel=faults]').hidden=false;document.querySelector('#fault-detail').hidden=false")
    assert page.locator('#repair-board').is_visible()
    page.locator('#repair-create-title').fill('베어링 교체')
    page.locator('#repair-create-worker').fill('작업A')
    page.locator('#repair-create-role').fill('기계')
    page.locator('#repair-create-reason').fill('마모 확인')
    page.locator('#repair-create-form button[type=submit]').click()
    page.wait_for_timeout(100)
    assert '작업 1건' in page.locator('#repair-summary').inner_text()
    page.locator('#repair-confirm-reason').fill('정비 계획 승인')
    page.locator('#repair-confirm-form button[type=submit]').click()
    page.wait_for_timeout(100)
    assert '계획 확정' in page.locator('#repair-summary').inner_text()
    page.locator('#repair-member-task').select_option(index=1)
    page.locator('#repair-member-name').fill('작업B')
    page.locator('#repair-member-role').fill('전기')
    page.locator('#repair-member-reason').fill('전기 지원')
    page.locator('#repair-member-form button[type=submit]').click()
    page.wait_for_timeout(100)
    assert '참여자 2명' in page.locator('#repair-summary').inner_text()
    assert '계획 재확정 필요' in page.locator('#repair-summary').inner_text()
    page.locator('#repair-action-task').select_option(index=1)
    page.locator('#repair-action-kind').select_option('hold')
    page.locator('#repair-action-date').fill('2026-10-02')
    page.locator('#repair-action-reason').fill('부품 대기')
    page.locator('#repair-action-form button[type=submit]').click()
    page.wait_for_timeout(100)
    assert '보류' in page.locator('#repair-tasks').inner_text()
    print('DOM_SMOKE_PASS: task, approval, participant, hold forms',errors)
    assert not errors,errors
    browser.close()
