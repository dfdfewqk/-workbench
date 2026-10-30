(() => {
  'use strict';
  const DB_NAME = 'smart-maintenance', DB_VERSION = 4;
  const UNITS = { day: { label: '일', plural: '일' }, week: { label: '주', plural: '주' }, month: { label: '개월', plural: '개월' }, year: { label: '년', plural: '년' } };
  const BASIS = { fixed: '고정 일정 기준', completion: '실제 완료일 기준' };
  const DEFAULT_EARLY_DAYS = { day: 0, week: 2, month: 7, year: 30 };
  let db, currentEquipment = null, editingPlanId = null, saving = false;
  const equipmentBody = document.getElementById('equipment-list'), archivedBody = document.getElementById('archived-equipment-list'), equipmentView = document.querySelector('[data-panel="equipment"]');
  function makeId() { return globalThis.crypto?.randomUUID ? `plan-${crypto.randomUUID()}` : `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
  function requestValue(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('점검 계획 데이터를 읽지 못했습니다.')); }); }
  function transactionDone(tx) { return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('저장 작업이 취소되었습니다.')); tx.onerror = () => {}; }); }
  function openDatabase() { if (!globalThis.indexedDB) return Promise.reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.')); return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, DB_VERSION); request.onsuccess = () => { db = request.result; db.onversionchange = () => db.close(); resolve(db); }; request.onerror = () => reject(request.error || new Error('저장소를 열지 못했습니다.')); request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용 중입니다. 탭을 닫고 다시 시도해 주세요.')); }); }
  function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  function field(labelText, input, id, required = true) { const wrap = node('div', 'plan-field'), label = node('label', 'field-label', labelText + (required ? ' *' : '')); label.htmlFor = id; input.id = id; input.required = required; wrap.append(label, input); return wrap; }
  function buildPanel() {
    const panel = node('section', 'panel plans-panel'); panel.id = 'equipment-plans-panel'; panel.hidden = true; panel.setAttribute('aria-labelledby', 'plans-heading');
    const heading = node('div', 'panel-heading plans-heading'), copy = document.createElement('div'); copy.append(node('p', 'eyebrow', 'EQUIPMENT INSPECTION PLANS')); const h2 = node('h2', '', '점검 계획 관리'); h2.id = 'plans-heading'; copy.append(h2); const meta = node('p', 'plans-equipment-meta', ''); meta.id = 'plans-equipment-meta'; copy.append(meta); const close = node('button', 'secondary-button plans-close', '닫기'); close.type = 'button'; close.addEventListener('click', closePanel); heading.append(copy, close); panel.append(heading);
    panel.append(node('p', 'plans-note', '고정 일정은 최초 기준 날짜와 주기를 유지합니다. 조기 점검 허용 기간 기본값은 일일 0일·주간 2일·월간 7일·연간 30일이며 수정할 수 있습니다. 미실시 회차는 계획 추적 시작일 이후만 표시합니다.'));
    const form = document.createElement('form'); form.id = 'inspection-plan-form'; form.noValidate = true; const grid = node('div', 'plans-fields');
    const name = document.createElement('input'); name.type = 'text'; name.name = 'name'; name.maxLength = 100; name.autocomplete = 'off'; name.placeholder = '예: 주간 운전 상태 점검'; grid.append(field('계획 이름', name, 'plan-name'));
    const unit = document.createElement('select'); unit.name = 'intervalUnit'; unit.add(new Option('주기를 선택하세요', '')); for (const [v, x] of Object.entries(UNITS)) unit.add(new Option(x.label, v)); grid.append(field('점검 주기 단위', unit, 'plan-unit'));
    const interval = document.createElement('input'); interval.type = 'number'; interval.name = 'intervalCount'; interval.min = '1'; interval.max = '9999'; interval.step = '1'; grid.append(field('간격', interval, 'plan-interval'));
    const baseDate = document.createElement('input'); baseDate.type = 'date'; baseDate.name = 'baseDate'; grid.append(field('최초 기준 날짜', baseDate, 'plan-base-date'));
    const basis = document.createElement('select'); basis.name = 'scheduleBasis'; basis.add(new Option('계산 방식을 선택하세요', '')); basis.add(new Option(BASIS.fixed, 'fixed')); basis.add(new Option(BASIS.completion, 'completion')); const basisField = field('다음 점검일 계산 방식', basis, 'plan-schedule-basis'); basisField.append(node('small', 'plan-field-hint', '기존 계획의 미지정 방식은 임의로 변경하지 않습니다.')); grid.append(basisField); form.append(grid);
    const audit=node('div','plans-audit-fields');audit.id='plans-audit-fields';audit.hidden=true;
    const actor=document.createElement('input');actor.id='plan-change-actor';actor.maxLength=100;actor.placeholder='계획 변경 담당자';audit.append(field('계획 변경 담당자',actor,actor.id,false));
    const reason=document.createElement('textarea');reason.id='plan-change-reason';reason.maxLength=1000;reason.rows=2;reason.placeholder='변경 사유';audit.append(field('주기·기준일 변경 사유',reason,reason.id,false));
    const effective=document.createElement('input');effective.type='date';effective.id='plan-change-effective';audit.append(field('변경 효력 발생일',effective,effective.id,false));
    form.append(audit);
    const footer = node('div', 'plans-form-footer'), msg = node('p', 'form-message', ''); msg.id = 'plans-message'; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite'); const actions = node('div', 'plans-form-actions'), submit = node('button', 'primary-button', '계획 등록'); submit.type = 'submit'; submit.id = 'plans-submit'; submit.disabled = true; const cancel = node('button', 'secondary-button', '수정 취소'); cancel.type = 'button'; cancel.id = 'plans-cancel-edit'; cancel.hidden = true; cancel.addEventListener('click', resetForm); actions.append(cancel, submit); footer.append(msg, actions); form.append(footer); form.addEventListener('submit', savePlan); panel.append(form);
    const lh = node('div', 'plans-list-heading'); lh.append(node('h3', '', '등록된 점검 계획')); const count = node('span', 'subtle-label', '0개'); count.id = 'plans-count'; lh.append(count); panel.append(lh); const list = node('ul', 'plans-list'); list.id = 'plans-list'; panel.append(list);
    const checklist = document.getElementById('checklist-editor'); if (checklist?.parentElement) checklist.parentElement.insertBefore(panel, checklist.nextSibling); else equipmentView?.append(panel); return panel;
  }
  const panel=buildPanel(),form=document.getElementById('inspection-plan-form'),nameInput=document.getElementById('plan-name'),unitInput=document.getElementById('plan-unit'),intervalInput=document.getElementById('plan-interval'),dateInput=document.getElementById('plan-base-date'),basisInput=document.getElementById('plan-schedule-basis'),submitButton=document.getElementById('plans-submit'),cancelButton=document.getElementById('plans-cancel-edit'),listElement=document.getElementById('plans-list'),messageElement=document.getElementById('plans-message');
  function showMessage(text,error=false){messageElement.textContent=text;messageElement.classList.toggle('is-error',error);}
  function insertPlanButtons(list,archived){if(!list||archived)return;for(const row of list.querySelectorAll('tr')){const assetButton=row.querySelector('[data-checklist-id]'),cell=row.lastElementChild;if(!assetButton||!cell||cell.querySelector('[data-plans-open]'))continue;const button=node('button','plans-open-button','점검 계획');button.type='button';button.dataset.plansOpen=assetButton.dataset.checklistId;button.setAttribute('aria-label',`${row.cells[0]?.textContent||'설비'} 점검 계획 관리`);cell.append(button);}}
  const observer=new MutationObserver(()=>{insertPlanButtons(equipmentBody,false);insertPlanButtons(archivedBody,true);});if(equipmentBody)observer.observe(equipmentBody,{childList:true,subtree:true});if(archivedBody)observer.observe(archivedBody,{childList:true,subtree:true});insertPlanButtons(equipmentBody,false);
  function validDateOnly(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00.000Z`);return!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}
  function dateLabel(value){return validDateOnly(value)?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date(`${value}T00:00:00.000Z`)):'날짜 확인 필요';}
  function frequencyLabel(plan){const u=UNITS[plan.intervalUnit];return u&&Number.isSafeInteger(plan.intervalCount)&&plan.intervalCount>0?`${plan.intervalCount} ${u.plural}마다`:'주기 정보 확인 필요';}
  function nextFixedDate(plan){plan=globalThis.SmartMaintenancePlanPolicy?.planAt(plan,globalThis.SmartMaintenanceScheduleEngine?.todayLocal()||'9999-12-31')||plan;const calc=globalThis.SmartMaintenanceDateCalculator,engine=globalThis.SmartMaintenanceScheduleEngine;if(!calc?.calculateOccurrenceDate||!engine?.firstOccurrenceOnOrAfter)throw Error('날짜 계산 모듈을 불러오지 못했습니다.');if(!validDateOnly(plan.baseDate)||!UNITS[plan.intervalUnit]||!Number.isSafeInteger(plan.intervalCount)||plan.intervalCount<1)throw Error('날짜 또는 주기 설정을 확인하세요.');const index=engine.firstOccurrenceOnOrAfter(plan,engine.todayLocal(),plan.baseDate);return calc.calculateOccurrenceDate(plan.baseDate,plan.intervalUnit,plan.intervalCount,index);}
  function scheduleDisplay(plan){const engine=globalThis.SmartMaintenanceScheduleEngine;plan=globalThis.SmartMaintenancePlanPolicy?.planAt(plan,engine?.todayLocal()||'9999-12-31')||plan;if(plan.scheduleBasis!=='fixed'&&plan.scheduleBasis!=='completion')return{basis:'계산 방식 설정 필요',due:'설정 필요',className:'plan-status-unset'};if(plan.scheduleBasis==='completion')return{basis:BASIS.completion,due:'실제 완료 기록 연동 대기',className:'plan-status-pending'};try{const due=nextFixedDate(plan),early=engine?.earlyDays(plan)??DEFAULT_EARLY_DAYS[plan.intervalUnit]??0,remaining=engine.daysBetween(engine.todayLocal(),due);return{basis:BASIS.fixed,due:`${dateLabel(due)}${remaining>0&&remaining<=early?` · 조기 점검 가능 (${remaining}일 전)`:''}`,className:'plan-status-fixed'};}catch(error){return{basis:BASIS.fixed,due:`계산 오류: ${error.message||'날짜를 확인하세요.'}`,className:'plan-status-error'};}}
  async function renderPlans(plans){listElement.replaceChildren();document.getElementById('plans-count').textContent=`${plans.length}개`;if(!plans.length){listElement.append(node('li','plans-empty','등록된 점검 계획이 없습니다. 위 양식에서 새 계획을 등록하세요.'));return;}const fragment=document.createDocumentFragment();for(const plan of plans){const item=node('li','plan-item');item.dataset.planId=plan.id;const copy=node('div','plan-item-copy');copy.append(node('strong','',plan.name||'이름 없는 계획'),node('span','plan-frequency',frequencyLabel(plan)));const display=scheduleDisplay(plan);if(globalThis.SmartMaintenancePlanPolicy?.isCurrentlyPaused(plan))copy.append(node('span','plan-status-unset','일시정지 중 · 점검 일정 추적 보류'));if(plan.resumeInspectionRequired)copy.append(node('span','plan-status-pending','재개 전 점검 필요'));copy.append(node('span','plan-basis',`계산 방식 · ${display.basis}`),node('span',`plan-next-date ${display.className}`,`다음 점검 예정일 · ${display.due}`));const edit=node('button','plans-edit-button','수정');edit.type='button';edit.dataset.planEdit=plan.id;item.append(copy,edit);fragment.append(item);}listElement.append(fragment);}
  async function loadPlans(){if(!currentEquipment||!db)return;const tx=db.transaction('plans','readonly'),finished=transactionDone(tx),promise=requestValue(tx.objectStore('plans').getAll()).then(rows=>rows.filter(plan=>plan.equipmentId===currentEquipment.id));const[rows]=await Promise.all([promise,finished]);rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko'));await renderPlans(rows);}
  async function openForEquipment(equipmentId,button){if(!db)throw Error('저장소 준비 중입니다.');if(button)button.disabled=true;try{const tx=db.transaction('equipment','readonly'),finished=transactionDone(tx),promise=requestValue(tx.objectStore('equipment').get(equipmentId)),[asset]=await Promise.all([promise,finished]);if(!asset)throw Error('설비를 찾을 수 없습니다.');if(asset.status==='archived')throw Error('보관 설비에는 계획을 수정할 수 없습니다.');currentEquipment=asset;resetForm();document.getElementById('plans-equipment-meta').textContent=`${asset.name} · ${asset.assetCode} · ${asset.location}`;await loadPlans();panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});}finally{if(button)button.disabled=false;}}
  function closePanel(){panel.hidden=true;currentEquipment=null;resetForm();}function resetForm(){form.reset();document.getElementById('plans-audit-fields').hidden=true;editingPlanId=null;submitButton.textContent='계획 등록';cancelButton.hidden=true;showMessage('');}
  function startEditing(id){const tx=db.transaction('plans','readonly'),finished=transactionDone(tx),p=requestValue(tx.objectStore('plans').get(id));Promise.all([p,finished]).then(([plan])=>{if(!plan||plan.equipmentId!==currentEquipment?.id){showMessage('수정할 점검 계획을 찾을 수 없습니다.',true);return;}editingPlanId=plan.id;document.getElementById('plans-audit-fields').hidden=false;document.getElementById('plan-change-effective').value=globalThis.SmartMaintenanceScheduleEngine?.todayLocal()||'';nameInput.value=plan.name||'';unitInput.value=plan.intervalUnit||'';intervalInput.value=String(plan.intervalCount??'');dateInput.value=plan.baseDate||'';basisInput.value=['fixed','completion'].includes(plan.scheduleBasis)?plan.scheduleBasis:'';submitButton.textContent='변경사항 저장';cancelButton.hidden=false;showMessage(plan.scheduleBasis?'':'계산 방식 설정이 필요합니다.');}).catch(e=>showMessage(e.message||'계획을 불러오지 못했습니다.',true));}
  async function savePlan(event){
    event.preventDefault();
    if(saving)return;
    if(!db){showMessage('점검 계획 저장소를 준비하는 중입니다. 잠시 후 다시 시도하세요.',true);return;}
    if(!currentEquipment||currentEquipment.status==='archived'){showMessage('활성 설비를 선택하세요.',true);return;}
    const name=nameInput.value.trim(),unit=unitInput.value,count=Number(intervalInput.value),baseDate=dateInput.value,basis=basisInput.value;
    if(!name||name.length>100){showMessage('계획 이름을 입력하세요.',true);return;}
    if(!UNITS[unit]||!Number.isSafeInteger(count)||count<1||count>9999){showMessage('점검 주기와 간격을 확인하세요.',true);return;}
    if(!validDateOnly(baseDate)||!BASIS[basis]){showMessage('기준 날짜와 계산 방식을 확인하세요.',true);return;}
    const id=editingPlanId||makeId(),editing=Boolean(editingPlanId),now=new Date().toISOString();
    const actor=document.getElementById('plan-change-actor').value.trim(),reason=document.getElementById('plan-change-reason').value.trim(),effective=document.getElementById('plan-change-effective').value;
    const policy=globalThis.SmartMaintenancePlanPolicy,today=globalThis.SmartMaintenanceScheduleEngine?.todayLocal()||new Date().toISOString().slice(0,10);
    const changes={id,equipmentId:currentEquipment.id,name,intervalUnit:unit,intervalCount:count,baseDate,scheduleBasis:basis,updatedAt:now};
    if(basis==='fixed')try{nextFixedDate(changes);}catch(error){showMessage(error.message||'기준 날짜와 주기 설정을 확인하세요.',true);return;}
    saving=true;submitButton.disabled=true;
    let failure=null,tx;
    const abortWith=error=>{failure=error instanceof Error?error:new Error('점검 계획 저장에 실패했습니다.');try{tx?.abort();}catch(_){/* 이미 종료된 트랜잭션은 별도 처리하지 않습니다. */}};
    try{
      tx=db.transaction(['equipment','plans'],'readwrite');
      const finished=transactionDone(tx),es=tx.objectStore('equipment'),ps=tx.objectStore('plans'),ar=es.get(currentEquipment.id);
      ar.onsuccess=()=>{
        try{
          if(!ar.result||ar.result.status==='archived'){abortWith(Error('활성 설비를 찾지 못했습니다.'));return;}
          if(editing){
            const r=ps.get(id);
            r.onsuccess=()=>{try{if(!r.result||r.result.equipmentId!==currentEquipment.id){abortWith(Error('수정할 계획을 찾지 못했습니다.'));return;}const old=r.result;
              const newSchedule={intervalUnit:unit,intervalCount:count,baseDate,scheduleBasis:basis};
              const compare=policy?.planAt(old,today)||old;
              const changed=Object.keys(newSchedule).some(key=>compare[key]!==newSchedule[key]);
              let updated={...old,name,updatedAt:now,createdAt:old.createdAt||now,trackingStartedOn:old.trackingStartedOn||today};
              if(changed){
                if(!policy)throw Error('계획 이력 관리 모듈을 불러오지 못했습니다.');
                updated=policy.changeSchedule(updated,newSchedule,actor,reason,effective,now,today);
              }
              const putRequest=ps.put(updated);putRequest.onerror=()=>abortWith(putRequest.error||Error('점검 계획을 수정하지 못했습니다.'));}catch(error){abortWith(error);}};
            r.onerror=()=>abortWith(r.error||Error('점검 계획을 읽지 못했습니다.'));
          }else{const addRequest=ps.add({...changes,createdAt:now,trackingStartedOn:globalThis.SmartMaintenanceScheduleEngine?.todayLocal()||new Date().toISOString().slice(0,10),earlyDays:DEFAULT_EARLY_DAYS[unit]});addRequest.onerror=()=>abortWith(addRequest.error||Error('점검 계획을 등록하지 못했습니다.'));}
        }catch(error){abortWith(error);}
      };
      ar.onerror=()=>abortWith(ar.error||Error('설비 정보를 읽지 못했습니다.'));
      await finished;
    }catch(error){showMessage(failure?.message||error.message||'계획을 저장하지 못했습니다.',true);return;}
    finally{saving=false;submitButton.disabled=false;}
    resetForm();
    try{await loadPlans();showMessage(editing?'점검 계획 변경을 저장했습니다. 주기 변경은 효력 발생일부터 적용됩니다.':'점검 계획을 등록했습니다.');}
    catch(error){showMessage(`점검 계획은 저장됐지만 목록을 새로 고치지 못했습니다: ${error.message||'조회 오류'}`,true);}
    window.dispatchEvent(new CustomEvent('smart-maintenance:plan-settings-updated',{detail:{planId:id}}));
  }
  equipmentBody?.addEventListener('click',async e=>{const button=e.target.closest('[data-plans-open]');if(!button)return;try{await openForEquipment(button.dataset.plansOpen,button);}catch(error){const n=document.getElementById('equipment-message');if(n){n.textContent=error.message||'계획을 열지 못했습니다.';n.classList.add('is-error');}}});listElement.addEventListener('click',e=>{const b=e.target.closest('[data-plan-edit]');if(b)startEditing(b.dataset.planEdit);});openDatabase().then(()=>{submitButton.disabled=false;}).catch(error=>{submitButton.disabled=true;showMessage(`점검 계획 저장소 오류: ${error.message||'IndexedDB를 열지 못했습니다.'}`,true);const n=document.getElementById('equipment-message');if(n){n.textContent=`점검 계획 저장소 오류: ${error.message||'IndexedDB를 열지 못했습니다.'}`;n.classList.add('is-error');}});window.addEventListener('smart-maintenance:plan-settings-updated',()=>{if(currentEquipment&&!panel.hidden)void loadPlans();});window.addEventListener('beforeunload',()=>db?.close());
})();
