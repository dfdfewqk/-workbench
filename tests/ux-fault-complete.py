"""Test contextual task cards and closure in Chromium DOM (without IndexedDB origin)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent/'docs'/'smart-maintenance'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1190,'height':850})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((root/'index.html').read_text(encoding='utf-8'),wait_until='domcontentloaded')
    for name in ['faults.css','repair.css']:
        page.add_style_tag(content=(root/name).read_text(encoding='utf-8'))
    for name in ['fault-model.js','repair-model.js']:
        page.add_script_tag(content=(root/name).read_text(encoding='utf-8'))
    page.evaluate('''() => {
      window.__fault={id:'f1',equipmentId:'m1',status:'open',owner:'책임자',priority:'high',operatingState:'unverified',repairDueDate:'',nextReviewDate:'2026-11-02',history:[]};
      window.SmartMaintenanceFaultUI={updateSelected:async callback=>{
        try {window.__fault=callback(window.__fault);
          window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:window.__fault,archived:false}}));
          return true;}catch(error){window.__testError=error.message;return false;}
      }};
      document.querySelector('[data-panel=faults]').hidden=false;
      document.getElementById('fault-detail').hidden=false;
    }''')
    for name in ['repair-ui.js','fault-quickview.js']:
        page.add_script_tag(content=(root/name).read_text(encoding='utf-8'))
    def send():
        page.evaluate("window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:window.__fault,archived:false}}))")
    send()
    assert not page.locator('[data-fault-open="repair-progress-form"]').is_enabled()
    assert page.locator('#fault-closure-preflight').text_content().find('운전 상태 미확인')>=0
    # Create one task, then verify its contextual options and write approval constraints.
    page.locator('[data-fault-open="repair-create-form"]').click()
    for loc,value in [('repair-create-title','모터 베어링 교체'),('repair-create-worker','기술자A'),('repair-create-role','기계'),('repair-create-reason','예방 정비')]:
        page.locator('#'+loc).fill(value)
    page.locator('#repair-create-form button[type=submit]').click()
    assert page.locator('.repair-card').count()==1
    assert page.locator('.repair-card-action').count()>=4
    assert '미완료·보류 작업 1건' in page.locator('#fault-closure-preflight').text_content()
    assert page.locator('#fault-close-ack').locator('xpath=..').get_attribute('hidden') is None
    # Add participant by task card; original owner-validation form is populated.
    page.locator('[data-repair-action="member"]').click()
    assert page.locator('#repair-member-form').is_visible()
    assert page.locator('#repair-member-task').input_value().startswith('task-')
    page.locator('#repair-member-name').fill('기술자B')
    page.locator('#repair-member-role').fill('전기')
    page.locator('#repair-member-reason').fill('협업')
    page.locator('#repair-member-form button[type=submit]').click()
    assert page.locator('.repair-workers').count()==0  # no parallel worker editor
    assert page.locator('[data-repair-action="finish"]').count()==2
    # Start first worker without auto-save; user explicitly saves progress.
    page.locator('[data-repair-action="start"]').first.click()
    assert page.locator('#repair-progress-form').is_visible()
    assert page.locator('#repair-progress-status').input_value()=='working'
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].participants[0].status")=='pending'
    page.locator('#repair-progress-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].participants[0].status")=='working'
    assert page.locator('[data-repair-action="progress"]').count()==1
    # Finish first; requires explicit work detail and the date auto-fills but is not stored until Save.
    page.locator('[data-repair-action="finish"]').first.click()
    assert page.locator('#repair-progress-status').input_value()=='done'
    assert page.locator('#repair-progress-date').input_value()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].participants[0].status")=='working'
    page.locator('#repair-progress-detail').fill('기존 베어링 분리·교환')
    page.locator('#repair-progress-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].participants[0].status")=='done'
    # Completed person gets correction button and the other person remains pending.
    assert page.locator('[data-repair-action="correct"]').count()==1
    assert page.locator('[data-repair-action="finish"]').count()==1
    # Finish other worker; task fully completed => hold/cancel hidden, closure ack not required.
    page.locator('[data-repair-action="finish"]').first.click()
    page.locator('#repair-progress-detail').fill('전기 안전 확인')
    page.locator('#repair-progress-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.taskStatus(window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0])")=='done'
    assert page.locator('[data-repair-action="hold"]').count()==0
    assert page.locator('#fault-close-ack').locator('xpath=..').get_attribute('hidden') is not None
    assert page.locator('[data-fault-open="repair-confirm-form"]').is_enabled()
    # Plan approval is distinct from fault closure.
    page.locator('[data-fault-open="repair-confirm-form"]').click()
    page.locator('#repair-confirm-reason').fill('작업 결과 확인')
    page.locator('#repair-confirm-form button[type=submit]').click()
    assert page.evaluate("window.__fault.workPlan.status")=='confirmed'
    assert page.evaluate("window.__fault.status")=='open'
    # Closed fault read-only; work cards actions disappear but audit log remains.
    page.evaluate("window.__fault.status='closed'")
    send()
    assert page.locator('.repair-card-action').count()==0
    assert page.locator('[data-fault-open="fault-history-log"]').is_enabled()
    assert page.locator('[data-fault-open="fault-close-form"]').is_disabled()
    # A second fault: hold/recheck/resume/cancel are state-scoped, and each requires owner reason.
    page.evaluate("window.__fault={id:'f2',equipmentId:'m1',status:'open',owner:'책임자',priority:'normal',operatingState:'stopped',nextReviewDate:'2026-11-02',history:[]}")
    send()
    page.locator('[data-fault-open="repair-create-form"]').click()
    for loc,value in [('repair-create-title','펌프 점검'),('repair-create-worker','기술자C'),('repair-create-role','기계'),('repair-create-reason','고장 조사')]:
        page.locator('#'+loc).fill(value)
    page.locator('#repair-create-form button[type=submit]').click()
    page.locator('[data-repair-action="hold"]').click()
    assert page.locator('#repair-action-form').is_visible()
    assert page.locator('#repair-action-kind').input_value()=='hold'
    page.locator('#repair-action-date').fill('2026-11-03')
    page.locator('#repair-action-reason').fill('자재 대기')
    page.locator('#repair-action-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].controlState")=='held'
    assert page.locator('[data-repair-action="finish"]').count()==0
    assert page.locator('[data-repair-action="check"]').count()==1
    page.locator('[data-repair-action="check"]').click()
    page.locator('#repair-action-date').fill('2026-11-04')
    page.locator('#repair-action-reason').fill('자재 입고 미정')
    page.locator('#repair-action-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].holdReviewDate")=='2026-11-04'
    page.locator('[data-repair-action="resume"]').click()
    page.locator('#repair-action-reason').fill('자재 확보')
    page.locator('#repair-action-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].controlState")=='active'
    assert page.locator('[data-repair-action="finish"]').count()==1
    page.locator('[data-repair-action="cancel"]').click()
    page.locator('#repair-action-reason').fill('교체 대신 예비 설비 사용')
    page.locator('#repair-action-form button[type=submit]').click()
    assert page.evaluate("window.SmartMaintenanceRepairModel.tasksOf(window.__fault)[0].controlState")=='canceled'
    assert page.locator('.repair-card-action').count()==0
    assert page.locator('#fault-close-ack').locator('xpath=..').get_attribute('hidden') is not None
    assert page.evaluate("window.__fault.status")=='open'
    assert errors==[],errors
    print('UX_FAULT_COMPLETE_PASS: per-task add/start/finish/correction, hold/check/resume/cancel, owner approval, closure, readonly',errors)
    browser.close()
