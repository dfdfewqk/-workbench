/* Post-completion correction: atomic update + immutable before/after audit snapshot. */
(()=>{'use strict';
  const labels={normal:'정상',caution:'주의',failure:'고장'},priority={normal:1,caution:2,failure:3};
  const engine=()=>globalThis.SmartMaintenanceScheduleEngine,policy=()=>globalThis.SmartMaintenancePlanPolicy;
  const el=(tag,txt)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;return n;};
  const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error||Error('저장소 조회 실패'));});
  const done=t=>new Promise((ok,no)=>{t.oncomplete=()=>ok();t.onabort=()=>no(t.error||Error('기록 수정 취소'));t.onerror=()=>{};});
  const pick=r=>({inspectedAt:r.inspectedAt,completedAt:r.completedAt,inspector:r.inspector,memo:r.memo,actions:r.actions,checklistItems:structuredClone(r.checklistItems||[]),overallResult:r.overallResult,scheduleCompletionEligible:r.scheduleCompletionEligible,scheduleOccurrenceDueDate:r.scheduleOccurrenceDueDate});
  const overall=items=>items.reduce((a,b)=>priority[b.result]>priority[a]?b.result:a,'normal');
  async function previewSchedule(record,newDate){
    const oldDate=record.inspectedAt||record.completedAt;
    if(!record.planId)return '독립 점검 기록이므로 정기 일정 변경은 없습니다.';
    const request=indexedDB.open('smart-maintenance',6);
    const db=await new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error||Error('저장소 조회 실패'));});
    let plan;
    try{const tx=db.transaction('plans','readonly');const finished=done(tx);plan=await req(tx.objectStore('plans').get(record.planId));await finished;}
    finally{db.close();}
    if(!plan)throw Error('점검 계획이 없어 변경된 일정을 확인할 수 없습니다. 기록을 정정하기 전에 계획을 복구하세요.');
    const before=policy()?.planAt(plan,oldDate)||plan,after=policy()?.planAt(plan,newDate)||plan;
    const calculator=globalThis.SmartMaintenanceDateCalculator;
    if(plan.scheduleBasis==='completion'){
      const a=calculator.calculateOccurrenceDate(oldDate,before.intervalUnit,before.intervalCount,1),
        b=calculator.calculateOccurrenceDate(newDate,after.intervalUnit,after.intervalCount,1);
      return `완료일 기준 다음 예정일: ${a} → ${b}.`;
    }
    if(plan.scheduleBasis==='fixed'&&record.scheduleOccurrenceDueDate){
      const remains=engine().withinCompletionWindow(after,record.scheduleOccurrenceDueDate,newDate);
      return `고정 일정 회차 ${record.scheduleOccurrenceDueDate}는 유지됩니다. ${remains?'완료 기록 연결도 유지됩니다.':'새 점검일은 허용 범위 밖이므로 이 회차의 완료 처리가 해제됩니다.'}`;
    }
    return '연결된 정기 회차가 없어 점검일만 수정됩니다.';
  }
  function mount(target,record){if(target.querySelector('[data-correction]'))return;
    const details=el('details');details.dataset.correction='';const summary=el('summary','완료 기록 정정 (변경 전후 이력 보존)');details.append(summary);
    const form=el('form');form.className='inspection-correction-form';const label=(name,input)=>{const l=el('label');l.append(el('span',name),input);form.append(l);return input;};
    const date=el('input');date.type='date';date.required=true;date.value=record.inspectedAt||record.completedAt||'';label('점검 완료일',date);
    const inspector=el('input');inspector.maxLength=100;inspector.required=true;inspector.value=record.inspector||'';label('점검자',inspector);
    const memo=el('textarea');memo.maxLength=2000;memo.value=record.memo||'';label('메모',memo);
    const actions=el('textarea');actions.maxLength=2000;actions.value=record.actions||'';label('조치 내용',actions);
    const selectRows=[];
    for(const item of record.checklistItems||[]){const select=el('select');for(const [value,label]of Object.entries(labels))select.add(new Option(label,value));select.value=item.result;label(`항목 판정 · ${item.name||'이름 없는 항목'}`,select);selectRows.push(select);}
    const actor=el('input');actor.maxLength=100;actor.required=true;label('정정 처리자',actor);
    const reason=el('textarea');reason.maxLength=1000;reason.required=true;label('정정 사유',reason);
    const submit=el('button','정정 저장');submit.className='primary-button';submit.type='submit';const message=el('p');message.setAttribute('role','status');form.append(submit,message);
    form.addEventListener('submit',async ev=>{ev.preventDefault();if(submit.disabled)return;const newDate=date.value,by=actor.value.trim(),why=reason.value.trim();
      if(!engine()?.isDateOnly(newDate)||!inspector.value.trim()||!by||!why){message.textContent='날짜·점검자·정정 처리자·사유를 확인하세요.';return;}
      const edits={inspectedAt:newDate,...(record.completedAt?{completedAt:newDate}:{}),inspector:inspector.value.trim(),memo:memo.value.trim(),actions:actions.value.trim(),checklistItems:(record.checklistItems||[]).map((i,k)=>({...i,result:selectRows[k].value}))};
      edits.overallResult=overall(edits.checklistItems);
      if(newDate!==(record.inspectedAt||record.completedAt)){
        try{const summary=await previewSchedule(record,newDate);if(!confirm(`점검일 정정: ${record.inspectedAt||record.completedAt} → ${newDate}.\n${summary}\n변경 전 기록은 정정 이력에 보존됩니다. 진행하시겠습니까?`))return;}
        catch(err){message.textContent=err.message||'다음 일정 계산 실패';return;}
      }
      submit.disabled=true;message.textContent='정정 기록을 저장 중입니다.';
      try{await correct(record.id,edits,by,why,record);message.textContent='정정 완료. 이전 값과 변경 사유는 상세 이력에 보존되었습니다.';window.dispatchEvent(new CustomEvent('smart-maintenance:plan-completed'));window.dispatchEvent(new CustomEvent('smart-maintenance:faults-updated'));window.dispatchEvent(new CustomEvent('smart-maintenance:plan-settings-updated'));}
      catch(err){message.textContent=err.message||'정정 저장 오류';submit.disabled=false;}
    });
    details.append(form);
    if((record.corrections||[]).length){const list=el('ol');for(const c of record.corrections){
      const entry=el('li');const summary=el('strong',`${c.at} · ${c.actor} · 사유: ${c.reason}`);entry.append(summary);
      const detail=el('details');detail.append(el('summary',`변경 전후 값 · ${c.before.inspectedAt||c.before.completedAt} / ${labels[c.before.overallResult]||c.before.overallResult} → ${c.after.inspectedAt||c.after.completedAt} / ${labels[c.after.overallResult]||c.after.overallResult}`));
      const pretty=v=>JSON.stringify(v,null,2);detail.append(el('pre',`변경 전:\n${pretty(c.before)}\n\n변경 후:\n${pretty(c.after)}`));entry.append(detail);list.append(entry);
    }details.append(list);}
    target.append(details);
  }
  async function correct(id,edited,actor,reason,expectedOriginal=null){const request=indexedDB.open('smart-maintenance',6),db=await new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error||Error('DB 열기 실패'));});
    try{const tx=db.transaction(['inspectionRecords','plans','equipment','faults'],'readwrite'),finished=done(tx),store=tx.objectStore('inspectionRecords'),pstore=tx.objectStore('plans'),estore=tx.objectStore('equipment'),fstore=tx.objectStore('faults');let fail;
      const r=store.get(id);r.onsuccess=()=>{const previous=r.result;if(!previous){fail=Error('원본 점검 기록을 찾지 못했습니다.');tx.abort();return;}
        // A correction form can remain open while another tab changes the record.
        // Refuse to overwrite newer persisted values with a stale form.
        if(expectedOriginal && (JSON.stringify(pick(previous))!==JSON.stringify(pick(expectedOriginal)) ||
            (previous.corrections||[]).length!==(expectedOriginal.corrections||[]).length)){
          fail=Error('다른 화면에서 점검 기록이 변경됐습니다. 이력을 새로 열어 다시 정정하세요.');tx.abort();return;
        }
        const a=estore.get(previous.equipmentId);a.onsuccess=()=>{if(!a.result||a.result.status==='archived'){fail=Error('보관된 설비의 기록은 수정할 수 없습니다.');tx.abort();return;}
          const readPlan=previous.planId?pstore.get(previous.planId):null;
          const write=plan=>{try{
            if(plan&&plan.equipmentId!==previous.equipmentId)throw Error('다른 설비의 점검 계획을 참조합니다.');
            if(edited.inspectedAt>engine().todayLocal())throw Error('미래 날짜로 완료 기록을 수정할 수 없습니다.');
            if(!Array.isArray(previous.checklistItems)||edited.checklistItems.length!==previous.checklistItems.length)throw Error('기존 점검 항목과 수정 내용이 다릅니다.');
            const now=new Date().toISOString(),before=pick(previous),updated={...previous,...edited};
            // Completion-based schedules use the corrected inspectedAt; fixed-mode due dates stay immutable.
            if(plan&&previous.scheduleOccurrenceDueDate){
              const effective=policy()?.planAt(plan,previous.scheduleOccurrenceDueDate)||plan;
              updated.scheduleCompletionEligible=engine().withinCompletionWindow(effective,previous.scheduleOccurrenceDueDate,edited.inspectedAt);
            }
            const after=pick(updated);if(JSON.stringify(before)===JSON.stringify(after))throw Error('수정된 내용이 없습니다.');
            updated.corrections=[...(previous.corrections||[]),{at:now,actor,reason,before,after}];updated.correctedAt=now;
            const oldBad=previous.overallResult==='failure'||(previous.overallResult==='caution'&&previous.cautionFaultRequested);
            const nowBad=updated.overallResult==='failure'||(updated.overallResult==='caution'&&updated.cautionFaultRequested);
            const faultId=previous.linkedFaultId;
            if(faultId){const f=fstore.get(faultId);f.onsuccess=()=>{const fault=f.result;
              if(!fault||fault.equipmentId!==previous.equipmentId){fail=Error('연결된 고장 기록을 찾지 못했습니다.');tx.abort();return;}
              if(oldBad&&!nowBad){fault.recheckRequired=true;fault.history=[...(fault.history||[]),{at:now,actor,type:'inspection-corrected',inspectionId:id,note:`${reason} · 고장/주의 → 정상 정정. 책임자 재검토 필요`}];fault.updatedAt=now;fstore.put(fault);}
              else if(before.overallResult!==after.overallResult){fault.history=[...(fault.history||[]),{at:now,actor,type:'inspection-corrected',inspectionId:id,note:`${reason} · 점검 판정 변경. 고장 상태 수동 검토 필요`}];fault.recheckRequired=true;fault.updatedAt=now;fstore.put(fault);}
              store.put(updated);
            };f.onerror=()=>tx.abort();}
            else if(!oldBad&&nowBad){ // A correction from normal to failure is a new incident, not an automatic close/reopen.
              const all=fstore.getAll();all.onsuccess=()=>{try{const outcome=globalThis.SmartMaintenanceFaultModel.resolveInspection(updated,all.result||[]);if(outcome.action==='add')fstore.add(outcome.fault);if(outcome.action==='put')fstore.put(outcome.fault);store.put(updated);}catch(err){fail=err;tx.abort();}};all.onerror=()=>tx.abort();
            } else store.put(updated);
          }catch(err){fail=err;tx.abort();}};
          if(readPlan){readPlan.onsuccess=()=>write(readPlan.result);readPlan.onerror=()=>tx.abort();}else write(null);
        };a.onerror=()=>tx.abort();
      };r.onerror=()=>tx.abort();
      try{await finished;}catch(err){throw fail||err;}
    }finally{db.close();}
  }
  window.SmartMaintenanceCorrections=Object.freeze({mount,correct});
})();
