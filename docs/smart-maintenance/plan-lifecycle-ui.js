/* Plan suspension/resumption; all changes persist in the existing 'plans' store. */
(()=>{'use strict';
  const list=document.getElementById('plans-list');if(!list)return;
  const policy=globalThis.SmartMaintenancePlanPolicy,eng=()=>globalThis.SmartMaintenanceScheduleEngine;
  let db,busy=false;
  const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('계획 조회 실패'));});
  const done=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error||Error('저장 취소'));t.onerror=()=>{};});
  function say(text,error=false){const target=document.getElementById('plans-message');if(target){target.textContent=text;target.classList.toggle('is-error',error);}}
  function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  async function open(){const r=indexedDB.open('smart-maintenance',6);return new Promise((resolve,reject)=>{r.onsuccess=()=>{db=r.result;db.onversionchange=()=>db.close();resolve();};r.onerror=()=>reject(r.error||Error('저장소 오류'));});}
  function draw(){for(const row of list.querySelectorAll('[data-plan-id]')){
    if(row.querySelector('[data-lifecycle]'))continue;
    const box=el('div');box.className='plan-lifecycle';box.dataset.lifecycle='';
    const actor=el('input');actor.placeholder='처리자';actor.maxLength=100;actor.dataset.lifecycleActor='';actor.setAttribute('aria-label','정지 또는 재개 처리자');
    const reason=el('input');reason.placeholder='정지/재개 사유';reason.maxLength=1000;reason.dataset.lifecycleReason='';reason.setAttribute('aria-label','정지 또는 재개 사유');
    const action=el('button','일시정지/재개');action.type='button';action.className='secondary-button';action.dataset.lifecycleToggle='';
    const audit=el('button','변경 이력');audit.type='button';audit.className='secondary-button';audit.dataset.lifecycleHistory='';
    const history=el('div');history.hidden=true;history.dataset.lifecycleLog='';
    const checkLabel=el('label');checkLabel.className='plan-resume-check';const check=el('input');check.type='checkbox';check.checked=true;check.dataset.resumeInspection='';checkLabel.append(check,el('span','재개 후 확인 점검 필요'));
    box.append(actor,reason,checkLabel,action,audit,history);row.append(box);
    // State is refreshed below from the store (the plan list only exposes IDs).
  }}
  async function refreshStates(){if(!db||document.getElementById('equipment-plans-panel')?.hidden)return;
    const t=db.transaction('plans','readonly'),finished=done(t),rows=await req(t.objectStore('plans').getAll());await finished;
    for(const row of list.querySelectorAll('[data-plan-id]')){const p=rows.find(x=>x.id===row.dataset.planId);if(!p)continue;
      const button=row.querySelector('[data-lifecycle-toggle]');if(button)button.textContent=policy.isCurrentlyPaused(p)?'점검 계획 재개':'점검 계획 일시정지';
      const history=row.querySelector('[data-lifecycle-log]');if(history&&!history.hidden)renderHistory(history,p);
    }
  }
  function renderHistory(target,p){target.replaceChildren();const events=[...(p.scheduleChanges||[]).map(x=>({at:x.at,actor:x.actor,text:`일정 변경 (적용 ${x.effectiveOn}) · ${x.reason} · 이전 ${x.before?.intervalCount}${x.before?.intervalUnit} → 변경 ${x.after?.intervalCount}${x.after?.intervalUnit}`})),...(p.pausePeriods||[]).flatMap(x=>[{at:x.at,actor:x.actor,text:`일시정지 (${x.startDate}) · ${x.reason}`},...(x.endDate?[{at:x.resumedAt,actor:x.resumedBy,text:`재개 (${x.endDate}) · ${x.resumeReason}`}]:[])])].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
    if(!events.length){target.append(el('p','변경 이력이 없습니다.'));return;}
    const ul=el('ul');for(const e of events)ul.append(el('li',`${e.at||'시각 미기록'} · ${e.actor||'처리자 미기록'} · ${e.text}`));target.append(ul);
  }
  async function getPlan(id){const tx=db.transaction('plans','readonly'),finished=done(tx),value=await req(tx.objectStore('plans').get(id));await finished;return value;}
  async function saveTransition(id,actor,reason,mode,needsInspection){const t=db.transaction(['plans','equipment'],'readwrite'),finished=done(t),ps=t.objectStore('plans'),es=t.objectStore('equipment');let error;
    const r=ps.get(id);r.onsuccess=()=>{const old=r.result;if(!old){error=Error('계획을 찾지 못했습니다.');t.abort();return;}const er=es.get(old.equipmentId);
      er.onsuccess=()=>{try{if(!er.result||er.result.status==='archived')throw Error('활성 설비 계획만 변경할 수 있습니다.');const now=new Date().toISOString(),today=eng().todayLocal();const next=mode==='pause'?policy.pause(old,actor,reason,today,now):policy.resume(old,actor,reason,today,now,needsInspection);ps.put(next);}catch(e){error=e;t.abort();}};er.onerror=()=>{error=er.error;t.abort();};};r.onerror=()=>{error=r.error;t.abort();};
    try{await finished;}catch(e){throw error||e;}
  }
  list.addEventListener('click',async e=>{
    const button=e.target.closest('[data-lifecycle-toggle], [data-lifecycle-history]');if(!button||!db||busy)return;
    const row=button.closest('[data-plan-id]');if(!row)return;
    if(button.matches('[data-lifecycle-history]')){const h=row.querySelector('[data-lifecycle-log]');h.hidden=!h.hidden;if(!h.hidden){try{const p=await getPlan(row.dataset.planId);if(p)renderHistory(h,p);}catch(err){say(err.message,true);}}return;}
    const actor=row.querySelector('[data-lifecycle-actor]')?.value.trim(),reason=row.querySelector('[data-lifecycle-reason]')?.value.trim();
    if(!actor||!reason){say('담당자 이름과 일시정지 또는 재개 사유를 입력하세요.',true);return;}
    busy=true;button.disabled=true;
    try{const p=await getPlan(row.dataset.planId),mode=policy.isCurrentlyPaused(p)?'resume':'pause';await saveTransition(p.id,actor,reason,mode,Boolean(row.querySelector('[data-resume-inspection]')?.checked));say(mode==='pause'?'점검 계획을 일시정지했습니다. 중지 중 회차는 미실시와 별도로 보존합니다.':'점검 계획을 재개했습니다. 재개 점검 필요 여부를 함께 저장했습니다.');window.dispatchEvent(new CustomEvent('smart-maintenance:plan-settings-updated',{detail:{planId:p.id}}));await refreshStates();}
    catch(err){say(err.message||'상태 변경 오류',true);}finally{busy=false;button.disabled=false;}
  });
  let queued=false;const queue=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;draw();refreshStates().catch(()=>{});});};
  new MutationObserver(queue).observe(list,{childList:true});new MutationObserver(queue).observe(document.getElementById('equipment-plans-panel'),{attributes:true,attributeFilter:['hidden']});
  open().then(queue).catch(e=>say(e.message||'계획 관리 저장소 오류',true));window.addEventListener('beforeunload',()=>db?.close());
})();
