/* Local-only fault management. No automated safety judgement or network actions. */
(() => {
  'use strict';
  const M = globalThis.SmartMaintenanceFaultModel;
  const $ = id => document.getElementById(id);
  if (!M || !$('fault-rows')) return;
  const text = (tag, value, className='') => { const el=document.createElement(tag);el.textContent=String(value ?? '');if(className)el.className=className;return el; };
  const add = (parent, tag, value, className='') => { const el=text(tag,value,className);parent.append(el);return el; };
  const req = r => new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error||Error('저장소 조회에 실패했습니다.'));});
  const done = t => new Promise((yes,no)=>{t.oncomplete=()=>yes();t.onabort=()=>no(t.error||Error('변경 내용을 저장하지 못했습니다.'));t.onerror=()=>{};});
  const sel = selector => document.querySelector(selector);
  let db, faults=[], assets=[], selectedId=null, selectedRevision=null, busy=false, refreshing=false, latestLoad=0;
  const open = () => new Promise((yes,no)=>{
    if (!globalThis.indexedDB) { no(Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.')); return; }
    if (db) { yes(); return; }
    const r=indexedDB.open('smart-maintenance',6);
    r.onsuccess=()=>{db=r.result;db.onversionchange=()=>{db.close();db=null;message('fault-list-message','저장소가 갱신되었습니다. 새로 고침을 눌러 목록을 다시 불러오세요.',true);};yes();};
    r.onerror=()=>no(r.error||Error('고장 관리 저장소를 열지 못했습니다.'));
    r.onblocked=()=>no(Error('다른 Smart Maintenance 탭을 닫은 후 다시 실행하세요.'));
  });
  const message = (target,value,error=false) => {const el=$(target);if(!el)return;el.textContent=value;el.classList.toggle('fault-error',error);};
  const pad = value => value || '미지정';
  const localTimestamp = value => {
    const time=new Date(value || '');
    return Number.isNaN(time.getTime()) ? '시각 미상' : new Intl.DateTimeFormat('ko-KR',
      {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(time);
  };
  const faultName = f => assets.find(a=>a.id===f.equipmentId)?.name || f.equipmentName || '설비 기록 없음';
  function status(f) {
    if(f.status==='closed') return '종료';
    const flags=M.flags(f);
    return flags.worsening?'미해결 · 악화':flags.needsOwner?'미해결 · 담당자 미지정':'미해결';
  }
  function makeTag(parent,label,alert=false) {add(parent,'span',label,alert?'fault-alert':'');}
  function renderList() {
    const body=$('fault-rows');body.replaceChildren();
    const query=$('fault-query').value,priority=$('fault-priority-filter').value;
    const filtered=faults.filter(f=>($('fault-filter').value==='all'||f.status===$('fault-filter').value) &&
      (!priority||f.priority===priority) && globalThis.SmartMaintenanceRecordSearch.matches(
        [faultName(f),f.assetCode,f.summary,f.owner,...(f.symptomItems||[]).map(i=>i.name)],query))
      .sort((a,b)=>Number(a.status==='closed')-Number(b.status==='closed')||String(b.createdAt).localeCompare(String(a.createdAt)));
    $('faults-count').textContent=`${filtered.length}건 / 전체 ${faults.length}건`;
    for (const f of filtered) {
      const row=document.createElement('tr');
      const c1=document.createElement('td');add(c1,'strong',faultName(f));add(c1,'div',f.summary||'점검 이상','fault-muted');
      if(f.linkedPriorFaultId)add(c1,'small','이전 종료 고장과 재발 연결','fault-muted');
      const c2=text('td',pad(f.owner));
      const c3=document.createElement('td');add(c3,'div',M.PRIORITIES[f.priority]||'미평가');add(c3,'small',M.OPERATIONS[f.operatingState]||'확인 필요','fault-muted');
      const c4=document.createElement('td');
      if(f.repairDueDate)add(c4,'div',`조치 목표 ${f.repairDueDate}`);
      else add(c4,'div','조치일 미지정');
      if(f.nextReviewDate)add(c4,'small',`재확인 ${f.nextReviewDate}`);
      if(M.flags(f).reviewLate)add(c4,'div','재확인 지연','fault-error');
      if(M.flags(f).repairLate)add(c4,'div','조치 지연','fault-error');
      if(M.flags(f).priorityLate)add(c4,'div','우선순위 평가 지연','fault-error');
      const c5=document.createElement('td');add(c5,'div',status(f));
      const repairModel=globalThis.SmartMaintenanceRepairModel;
      if(repairModel && f.status==='open'){
        const plan=repairModel.metrics(f);
        if(plan.planStatus==='needed')add(c5,'small','조치 계획 필요','fault-error');
        else if(plan.planStatus==='review')add(c5,'small','계획 재확정 필요','fault-error');
        else add(c5,'small',`${repairModel.PLAN_STATUS[plan.planStatus]||'계획 작성 중'} · 남은 작업 ${plan.pending}건`,'fault-muted');
      }
      const c6=document.createElement('td');const button=text('button','상세 보기','secondary-button');button.type='button';button.dataset.faultId=f.id;c6.append(button);
      row.append(c1,c2,c3,c4,c5,c6);body.append(row);
    }
    if(!filtered.length){const tr=document.createElement('tr');const reason=faults.length===0?'고장 기록이 없습니다. 점검에서 고장으로 판정하고 기록을 저장하면 여기에 표시됩니다.':'검색 조건에 맞는 고장이 없습니다. 검색 초기화 또는 전체 상태를 선택해 보세요.';const td=text('td',reason);td.colSpan=6;tr.append(td);body.append(tr);}
  }
  function renderDetail() {
    const f=faults.find(item=>item.id===selectedId);
    $('fault-detail').hidden=!f;
    if(!f){window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:null}}));return;}
    window.dispatchEvent(new CustomEvent('smart-maintenance:fault-selected',{detail:{fault:f,archived:assets.find(a=>a.id===f.equipmentId)?.status==='archived'}}));
    selectedRevision=JSON.stringify(f);
    $('fault-detail-heading').textContent=`${faultName(f)} · ${status(f)}`;
    $('fault-detail-meta').textContent=`관리번호 ${f.assetCode||'미입력'} · ${f.summary||'이상 판정'}\n최초 발견 ${f.detectedOn||'미상'} · 연결된 점검 ${f.sourceInspectionIds?.length||0}건${f.linkedPriorFaultId?`\n이전 종료 고장: ${f.linkedPriorFaultId}`:''}`;
    const flags=M.flags(f),tags=$('fault-flags');tags.replaceChildren();
    if(f.status==='open') {
      if(flags.needsOwner)makeTag(tags,'담당자 지정 필요',true);
      if(flags.needsPriority)makeTag(tags,'우선순위 미평가',true);
      if(flags.needsOperation)makeTag(tags,'운전 상태 확인 필요',true);
      if(flags.priorityLate)makeTag(tags,'평가 지연',true);
      if(flags.reviewLate)makeTag(tags,'재확인 지연',true);
      if(flags.repairLate)makeTag(tags,'조치 지연',true);
      if(flags.correctionReview)makeTag(tags,'점검 정정 후 재검토 필요',true);
      if(flags.worsening)makeTag(tags,'악화 경고 · 운전 상태/계획 재검토',true);
      const repair=globalThis.SmartMaintenanceRepairModel;
      if(repair){const r=repair.metrics(f);
        if(r.planStatus==='needed')makeTag(tags,'조치 계획 필요',true);
        if(r.planStatus==='review')makeTag(tags,'조치 계획 재확정 필요',true);
        if(r.holdOverdue)makeTag(tags,`보류 재확인 지연 ${r.holdOverdue}건`,true);
      }
    } else makeTag(tags,`종료 ${f.closedAt?.slice(0,10)||''} · ${f.closedBy||''}`);
    $('fault-history-summary').textContent=f.status==='closed'?`종료 사유: ${f.closureReason||'없음'}`:'';
    const set=(id,value)=>{const el=$(id);if(el)el.value=value||'';};
    set('fault-actor',f.owner);set('fault-owner',f.owner);set('fault-priority',f.priority);set('fault-priority-date',f.priorityDueDate);
    set('fault-operation',f.operatingState);set('fault-repair-date',f.repairDueDate);set('fault-review-date',f.nextReviewDate);
    set('fault-change-reason','');set('fault-review-actor',f.owner);set('fault-review-level','unchanged');
    set('fault-review-detail','');set('fault-review-next',M.addDays(M.localToday(),7));
    set('fault-dismiss-actor',f.owner);set('fault-dismiss-reason','');set('fault-close-actor',f.owner);set('fault-close-reason','');$('fault-close-ack').checked=false;
    for(const id of ['fault-update-form','fault-review-form','fault-close-form']) $(id).hidden=f.status==='closed'||assets.find(a=>a.id===f.equipmentId)?.status==='archived';
    $('fault-worsening-controls').hidden=f.status==='closed'||!f.worseningAlert||assets.find(a=>a.id===f.equipmentId)?.status==='archived';
    const log=$('fault-log');log.replaceChildren();
    for(const event of [...(f.history||[])].reverse()){
      const li=document.createElement('li');
      const fields=event.changes?Object.entries(event.changes).map(([key,values])=>`${key}: ${values.before||'미지정'} → ${values.after||'미지정'}`).join('; '):'';
      li.textContent=`${localTimestamp(event.at)} · ${event.actor||'기록 없음'} · ${event.type}\n${event.note||''}${fields?`\n${fields}`:''}`;log.append(li);
    }
    message('fault-detail-message','');
  }
  async function read() {
    const sequence=++latestLoad;
    if(!db)await open();
    let tx;
    try {tx=db.transaction(['faults','equipment','inspectionRecords'],'readonly');}
    catch (error) {
      // A version change can close a stale connection between the open and transaction.
      db?.close();db=null;await open();
      tx=db.transaction(['faults','equipment','inspectionRecords'],'readonly');
    }
    const complete=done(tx);
    const [f,a,inspections]=await Promise.all([
      req(tx.objectStore('faults').getAll()),
      req(tx.objectStore('equipment').getAll()),
      req(tx.objectStore('inspectionRecords').getAll())
    ]);
    await complete;
    if(sequence!==latestLoad)return {stale:true};
    faults=f;assets=a;
    const staleSelection=selectedId&&!faults.some(item=>item.id===selectedId);
    if(staleSelection){selectedId=null;selectedRevision=null;}
    renderList();
    // Do not discard unsaved edits when a background notification refreshes an unchanged record.
    const selected=faults.find(item=>item.id===selectedId);
    if(staleSelection||!selected||JSON.stringify(selected)!==selectedRevision)renderDetail();
    const linked=new Set(faults.flatMap(item=>item.sourceInspectionIds||[]));
    const orphaned=inspections.filter(r=>M.requiresFault(r)&&!linked.has(r.id));
    return {count:faults.length,open:faults.filter(item=>item.status==='open').length,closed:faults.filter(item=>item.status==='closed').length,orphaned:orphaned.length};
  }
  async function refreshFromButton() {
    if(refreshing)return;
    refreshing=true;
    const button=$('fault-refresh');
    button.disabled=true;button.textContent='불러오는 중...';
    message('fault-list-message','고장 기록을 다시 조회하고 있습니다.');
    try {
      let result=await read();
      if(result?.stale)result=await read();
      if(!result?.stale){
        const stamp=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        const orphanInfo=result.orphaned?` · 연결되지 않은 고장/주의 점검 ${result.orphaned}건(기록 확인 필요)`:'';
        message('fault-list-message',`새로 고침 완료 (${stamp}) · 전체 ${result.count}건 · 미해결 ${result.open}건 · 종료 ${result.closed}건${orphanInfo}`);
      }
    } catch(error){
      message('fault-list-message',`고장 목록 새로 고침 실패: ${error.message||'저장소 오류'}. 브라우저 데이터를 삭제하지 말고 다시 시도하세요.`,true);
    } finally {refreshing=false;button.disabled=false;button.textContent='새로 고침';}
  }
  async function updateSelected(callback) {
    if(busy||!selectedId){message('fault-detail-message','이전 저장이 진행 중이거나 고장 기록을 선택하지 않았습니다.',true);return false;}
    busy=true;
    try {
      if(!db)await open();
      const tx=db.transaction('faults','readwrite'),complete=done(tx),store=tx.objectStore('faults');
      let error;
      const request=store.get(selectedId);
      request.onsuccess=()=>{
        try {
          if(!request.result)throw Error('고장 기록이 존재하지 않습니다.');
          if(JSON.stringify(request.result)!==selectedRevision)throw Error('다른 화면에서 변경된 기록입니다. 새로 고침 후 다시 시도하세요.');
          store.put(callback(request.result));
        } catch(e){error=e;tx.abort();}
      };
      request.onerror=()=>tx.abort();
      try {await complete;}catch(e){throw error||e;}
      await read();window.dispatchEvent(new CustomEvent('smart-maintenance:faults-updated'));
      message('fault-detail-message','변경 내용과 담당자·시각·사유를 저장했습니다.');
      return true;
    }catch(e){message('fault-detail-message',e.message||'고장 기록 저장 실패',true);return false;}
    finally{busy=false;}
  }
  globalThis.SmartMaintenanceFaultUI=Object.freeze({updateSelected});
  $('fault-refresh').addEventListener('click',()=>void refreshFromButton());
  $('fault-filter').addEventListener('change',renderList);
  $('fault-query').addEventListener('input', renderList);
  $('fault-priority-filter').addEventListener('change', renderList);
  $('fault-filter-reset').addEventListener('click', () => {
    $('fault-query').value='';$('fault-filter').value='open';$('fault-priority-filter').value='';renderList();$('fault-query').focus();
  });
  $('fault-rows').addEventListener('click',e=>{
    const button=e.target.closest('[data-fault-id]');if(!button)return;
    selectedId=button.dataset.faultId;renderDetail();$('fault-detail').scrollIntoView({block:'start',behavior:'smooth'});
  });
  $('fault-update-form').addEventListener('submit',e=>{
    e.preventDefault();const values={owner:$('fault-owner').value,priority:$('fault-priority').value,priorityDueDate:$('fault-priority-date').value,
      operatingState:$('fault-operation').value,repairDueDate:$('fault-repair-date').value,nextReviewDate:$('fault-review-date').value};
    void updateSelected(prev=>M.updateFault(prev,values,$('fault-actor').value,$('fault-change-reason').value));
  });
  $('fault-review-form').addEventListener('submit',e=>{
    e.preventDefault();void updateSelected(prev=>M.addReview(prev,$('fault-review-actor').value,$('fault-review-level').value,$('fault-review-detail').value,$('fault-review-next').value));
  });
  $('fault-dismiss-form').addEventListener('submit',e=>{
    e.preventDefault();void updateSelected(prev=>M.dismissWorsening(prev,$('fault-dismiss-actor').value,$('fault-dismiss-reason').value));
  });
  $('fault-close-form').addEventListener('submit',e=>{
    e.preventDefault();
    const summary=globalThis.SmartMaintenanceRepairModel?.metrics(faults.find(f=>f.id===selectedId)||{})||{pending:0};
    if(summary.pending>0 && !$('fault-close-ack').checked){message('fault-detail-message',`미완료·보류 작업 ${summary.pending}건이 있습니다. 종료 사유와 예외 종료 확인에 동의해야 합니다.`,true);return;}
    if(!confirm(`${summary.pending?`미완료·보류 작업 ${summary.pending}건이 남아 있습니다.\n`:''}고장 상태를 종료하시겠습니까? 점검·정비 완료와는 별개이며 종료 사유는 이력에 보존됩니다.`))return;
    void updateSelected(prev=>M.closeFault(prev,$('fault-close-actor').value,$('fault-close-reason').value,$('fault-close-ack').checked));
  });
  // Link a new failure inspection to an explicitly chosen existing open fault,
  // or register it as a new fault. Caution inspections require opt-in.
  function attachInspectionSelector(formId) {
    const form=$(formId);if(!form||form.querySelector('[data-fault-controls]'))return;
    const box=document.createElement('div');box.className='fault-concern';box.dataset.faultControls='true';
    add(box,'strong','고장 관리 연결');
    const caution=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.faultCaution='true';
    caution.append(check,document.createTextNode(' 주의 판정도 고장 관리 대상으로 등록 (선택)'));
    const choiceLabel=document.createElement('label');choiceLabel.textContent='고장 관리 방식';
    const select=document.createElement('select');select.dataset.faultLink='true';select.setAttribute('aria-label','미해결 고장 연결 선택');choiceLabel.append(select);
    const suggestion=add(box,'p','','fault-link-suggestion');suggestion.setAttribute('role','status');suggestion.setAttribute('aria-live','polite');box.append(caution,choiceLabel);
    const submit=form.querySelector('[type="submit"]');if(submit)submit.parentElement.before(box);else form.append(box);
    const update=()=>{
      const failure=Boolean(form.querySelector('input[value="failure"]:checked'));
      const hasCaution=Boolean(form.querySelector('input[value="caution"]:checked'));
      caution.hidden=!hasCaution||failure;box.hidden=!failure&&!hasCaution;choiceLabel.hidden=!failure&&!(hasCaution&&check.checked);
    };
    form.addEventListener('change',update);
    update();
    return {select,check,update,suggestion,requestSerial:0};
  }
  const selectors={inspection:attachInspectionSelector('inspection-form'),plan:attachInspectionSelector('plan-execution-form')};
  async function showChoices(kind,equipmentId) {
    const widget=selectors[kind];if(!widget||!equipmentId)return;
    const serial=++widget.requestSerial;
    widget.select.replaceChildren(new Option('새 고장으로 등록',''));
    widget.select.value='';widget.check.checked=false;
    widget.suggestion.textContent='같은 설비의 미해결 고장을 확인 중입니다.';
    widget.update();
    try {
      if(!db)await open();
      const tx=db.transaction('faults','readonly'),finished=done(tx);
      const list=await req(tx.objectStore('faults').getAll());await finished;
      if(serial!==widget.requestSerial)return;
      const active=list.filter(f=>f.equipmentId===equipmentId&&f.status==='open');
      for(const fault of active){widget.select.add(new Option(`기존 미해결 고장 연결 추천: ${fault.summary||fault.id} (${fault.id.slice(0,20)})`,fault.id));}
      widget.suggestion.textContent=active.length?`같은 설비의 미해결 고장 ${active.length}건이 있습니다. 같은 문제라면 기존 고장에 연결하고 다른 문제라면 '새 고장으로 등록'을 유지하세요. 자동 연결되지는 않습니다.`:'같은 설비의 미해결 고장이 없습니다. 새 고장으로 등록할 수 있습니다.';
      widget.update();
    } catch(error) {
      if(serial===widget.requestSerial)widget.suggestion.textContent='기존 고장 목록을 확인하지 못했습니다. 연결 여부를 확인한 후 저장하세요.';
      throw error;
    }
  }
  window.addEventListener('smart-maintenance:inspection-started',e=>{
    void showChoices('inspection',e.detail?.equipmentId).catch(err=>message('fault-list-message',`고장 연결 목록 조회 실패: ${err.message}`,true));
  });
  window.addEventListener('smart-maintenance:plan-started',e=>{
    void showChoices('plan',e.detail?.equipmentId).catch(err=>message('fault-list-message',`고장 연결 목록 조회 실패: ${err.message}`,true));
  });
  window.addEventListener('smart-maintenance:faults-updated',()=>{
    if(!document.querySelector('[data-panel="faults"]')?.hidden)void read().catch(err=>message('fault-list-message',err.message,true));
  });
  document.querySelectorAll('[data-view="faults"]').forEach(b=>b.addEventListener('click',()=>void read().catch(e=>message('fault-list-message',e.message,true))));
  refreshFromButton();
  window.addEventListener('beforeunload',()=>db?.close());
})();
