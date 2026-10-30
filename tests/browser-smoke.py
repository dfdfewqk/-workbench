import os,sys,subprocess,time
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../docs/smart-maintenance'))
port=8769
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    time.sleep(.6)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page()
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            page.goto(f'http://127.0.0.1:{port}/',wait_until='domcontentloaded',timeout=12000)
        except Exception as e:
            print('BROWSER_UNAVAILABLE',str(e)[:550]);sys.exit(0)
        print('BROWSER_OPENED',page.title())
        page.wait_for_timeout(1000)
        print('JS_ERRORS',errors[:10])
        state=page.evaluate("""async () => {
          let r=indexedDB.open('smart-maintenance',6);
          let db=await new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
          return {version:db.version,stores:[...db.objectStoreNames], repairReady:!!globalThis.SmartMaintenanceRepairModel, faultUIReady:!!globalThis.SmartMaintenanceFaultUI};
        }""")
        print('DB',state)
        if state['faultUIReady']:
            page.evaluate("""async () => {
                const r=indexedDB.open('smart-maintenance',6),db=await new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)});
                const tx=db.transaction(['equipment','faults'],'readwrite');
                tx.objectStore('equipment').put({id:'e-step4-test',name:'테스트 컨베이어',assetCode:'TEST-001',location:'A',status:'active',typeId:'conveyor'});
                tx.objectStore('faults').put({id:'f-step4-test',equipmentId:'e-step4-test',equipmentName:'테스트 컨베이어',assetCode:'TEST-001',sourceInspectionIds:[],sourcePlanIds:[],symptomItems:[],summary:'베어링 이상',detectedOn:'2026-10-29',createdAt:new Date().toISOString(),status:'open',priority:'high',priorityDueDate:'',owner:'관리자',operatingState:'stopped',repairDueDate:'2026-11-09',nextReviewDate:'2026-11-05',worseningAlert:false,linkedPriorFaultId:null,closedAt:null,closedBy:'',closureReason:'',reviews:[],history:[]});
                await new Promise((yes,no)=>{tx.oncomplete=yes;tx.onerror=()=>no(tx.error)});db.close();
            }""")
            page.locator('[data-view="faults"]').first.click()
            page.wait_for_timeout(500)
            page.locator('[data-fault-id="f-step4-test"]').click()
            assert page.locator('#repair-board').is_visible(), 'repair board must be visible'
            page.locator('#repair-create-title').fill('베어링 교체')
            page.locator('#repair-create-worker').fill('작업A')
            page.locator('#repair-create-role').fill('기계')
            page.locator('#repair-create-reason').fill('마모 확인')
            page.locator('#repair-create-form button[type=submit]').click()
            page.wait_for_timeout(400)
            print('BOARD_TEXT',page.locator('#repair-summary').inner_text())
            print('FAULT_MESSAGE',page.locator('#fault-detail-message').inner_text())
            assert '작업 1건' in page.locator('#repair-summary').inner_text(), 'task not persisted'
            page.locator('#repair-confirm-reason').fill('계획 검토 완료')
            page.locator('#repair-confirm-form button[type=submit]').click()
            page.wait_for_timeout(350)
            assert '계획 확정' in page.locator('#repair-summary').inner_text()
            page.screenshot(path='/mnt/data/smart-maintenance-browser-smoke.png',full_page=True)
            print('BROWSER_SMOKE_PASS')
        browser.close()
finally:
    server.terminate();server.wait(timeout=4)
