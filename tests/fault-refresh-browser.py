"""Focused user-visible refresh + IndexedDB smoke test; uses temporary browser profile."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import subprocess,sys,time
root=Path(__file__).resolve().parent.parent/'docs'/'smart-maintenance'
server=subprocess.Popen([sys.executable,'-m','http.server','8781','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 time.sleep(.6)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page()
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto('http://127.0.0.1:8781',wait_until='domcontentloaded',timeout=15000)
  page.locator('[data-view="faults"]').first.click()
  page.locator('#fault-refresh').click()
  page.wait_for_function('document.querySelector("#fault-list-message")?.textContent.includes("새로 고침 완료")', timeout=10000)
  assert '전체 0건' in page.locator('#fault-list-message').inner_text(),page.locator('#fault-list-message').inner_text()
  assert '고장 기록이 없습니다' in page.locator('#fault-rows').inner_text()
  print('PASS zero faults: clickable refresh + feedback + empty state')
  # Add a real inspection and matching fault, simulating an existing persisted failure record.
  page.evaluate('''async () => {
   const request=indexedDB.open('smart-maintenance',6);
   const db=await new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error)});
   const tx=db.transaction(['equipment','inspectionRecords','faults'],'readwrite');
   tx.objectStore('equipment').put({id:'asset-refresh-test',name:'시험 컨베이어',assetCode:'CV-TEST',status:'active',typeId:'conveyor'});
   tx.objectStore('inspectionRecords').put({id:'inspection-refresh-test',equipmentId:'asset-refresh-test',inspectedAt:'2026-10-29',overallResult:'failure',inspector:'작업자',checklistItems:[{itemId:'bearing',name:'베어링',result:'failure'}],linkedFaultId:'fault-inspection-refresh-test'});
   tx.objectStore('faults').put({id:'fault-inspection-refresh-test',equipmentId:'asset-refresh-test',summary:'베어링 고장',createdAt:new Date().toISOString(),detectedOn:'2026-10-29',status:'open',priority:'unassessed',owner:'',operatingState:'unverified',nextReviewDate:'2026-11-05',sourceInspectionIds:['inspection-refresh-test'],history:[]});
   await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});
   db.close();
  }''')
  page.locator('#fault-refresh').click()
  page.wait_for_function('document.querySelector("#fault-list-message")?.textContent.includes("전체 1건")')
  assert page.locator('[data-fault-id="fault-inspection-refresh-test"]').count()==1
  page.locator('[data-fault-id="fault-inspection-refresh-test"]').click()
  assert '베어링 고장' in page.locator('#fault-detail-meta').inner_text()
  assert not errors,errors
  print('PASS persisted fault: refresh count, list, details, no JS errors')
  browser.close()
finally:
 server.terminate();server.wait(timeout=5)
