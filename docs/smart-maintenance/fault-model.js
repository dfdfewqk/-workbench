/* Fault lifecycle rules shared by inspection writers and the management screen.
 * This module is deliberately independent of DOM/IndexedDB for regression tests. */
(() => {
  'use strict';
  const PRIORITIES = Object.freeze({unassessed:'미평가',emergency:'긴급',high:'높음',normal:'보통'});
  const OPERATIONS = Object.freeze({unverified:'운전 상태 확인 필요',operable:'운전 가능',restricted:'제한 운전',stopped:'운전 중지'});
  const LEVELS = Object.freeze({improving:'호전',unchanged:'변화 없음',worsening:'악화'});
  const dateOnly = v => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v;
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const addDays = (day, count) => { if (!dateOnly(day)) throw Error('날짜를 확인하세요.'); return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0,10); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const name = v => String(v || '').trim();
  const faultItems = r => (r.checklistItems || []).filter(x => x.result === 'failure' || (r.overallResult === 'caution' && x.result === 'caution'));
  function requiresFault(record) {
    return record?.overallResult === 'failure' || (record?.overallResult === 'caution' && record.cautionFaultRequested === true);
  }
  function newFault(record, allFaults = []) {
    if (!requiresFault(record) || !name(record.id) || !name(record.equipmentId)) throw Error('고장 등록 대상 점검 기록을 확인하세요.');
    const notable = faultItems(record);
    const closed = allFaults.filter(f => f.equipmentId === record.equipmentId && f.status === 'closed' &&
      notable.some(i => (f.symptomItems || []).some(old => old.name === i.name)) && f.id !== `fault-${record.id}`)
      .sort((a,b) => String(b.closedAt || b.createdAt || '').localeCompare(String(a.closedAt || a.createdAt || '')));
    return {
      id: `fault-${record.id}`, equipmentId: record.equipmentId, equipmentName: record.equipmentName || '', assetCode: record.assetCode || '',
      sourceInspectionIds: [record.id], sourcePlanIds: record.planId ? [record.planId] : [],
      symptomItems: notable.map(i=>({itemId:i.itemId || '', name:i.name || '', result:i.result})),
      summary: notable.map(i=>i.name).join(', ') || (record.overallResult==='failure' ? '점검 고장 판정' : '주의 항목 관리'),
      detectedOn: record.inspectedAt || record.completedAt || localToday(),
      createdAt: new Date().toISOString(), status: 'open', priority: 'unassessed', priorityDueDate: '',
      owner: '', operatingState: 'unverified', repairDueDate: '', nextReviewDate: addDays(localToday(), 7),
      worseningAlert: false, linkedPriorFaultId: closed[0]?.id || null, closedAt: null, closedBy: '', closureReason: '',
      reviews: [], history: [{at:new Date().toISOString(),actor:name(record.inspector)||'점검자',type:'created',note:'점검 결과에서 고장 관리 항목 자동 등록', inspectionId:record.id}]
    };
  }
  function resolveInspection(record, allFaults = []) {
    if (!requiresFault(record)) { delete record.faultLinkId; return {record, fault: null, action:'none'}; }
    if (record.faultLinkId) {
      const existing = allFaults.find(f=>f.id===record.faultLinkId);
      if (!existing || existing.status !== 'open' || existing.equipmentId !== record.equipmentId) throw Error('연결할 미해결 고장이 없거나 다른 설비의 고장입니다. 새로 선택해 주세요.');
      if ((existing.sourceInspectionIds || []).includes(record.id)) throw Error('이미 연결된 점검 기록입니다.');
      const fault = copy(existing);
      fault.sourceInspectionIds = [...(fault.sourceInspectionIds || []), record.id];
      if (record.planId && !(fault.sourcePlanIds || []).includes(record.planId)) fault.sourcePlanIds = [...(fault.sourcePlanIds||[]), record.planId];
      fault.history.push({at:new Date().toISOString(),actor:name(record.inspector)||'점검자',type:'inspection-linked',note:'기존 미해결 고장에 새 점검 결과 연결',inspectionId:record.id});
      fault.updatedAt = new Date().toISOString();
      record.linkedFaultId = fault.id;
      return {record, fault, action:'put'};
    }
    const fault = newFault(record, allFaults);
    if (allFaults.some(f=>f.id===fault.id)) throw Error('이미 등록된 점검 고장입니다. 중복 생성하지 않았습니다.');
    record.linkedFaultId = fault.id;
    return {record, fault, action:'add'};
  }
  const overdue = (due, today=localToday()) => dateOnly(due) && due < today;
  function flags(fault,today=localToday()) {
    return {
      needsOwner: !name(fault.owner), needsPriority: fault.priority==='unassessed', needsOperation: fault.operatingState==='unverified',
      priorityLate: fault.priority==='unassessed'&&overdue(fault.priorityDueDate,today),
      repairLate: fault.status==='open'&&overdue(fault.repairDueDate,today),
      reviewLate: fault.status==='open'&&overdue(fault.nextReviewDate,today),
      worsening: Boolean(fault.worseningAlert), correctionReview: Boolean(fault.recheckRequired)
    };
  }
  function updateFault(previous, input, actor, reason) {
    if (previous.status !== 'open') throw Error('종료한 고장은 수정할 수 없습니다. 재발 시 새 고장을 등록하세요.');
    actor=name(actor); reason=name(reason);
    if (!actor || !reason) throw Error('변경 담당자와 변경 사유를 입력하세요.');
    const next=copy(previous);
    const keys=['owner','priority','priorityDueDate','operatingState','repairDueDate','nextReviewDate'];
    const desired={...input,priorityDueDate:input.priority==='unassessed'?input.priorityDueDate:''};
    const changes={};
    for (const key of keys) {
      const value=name(desired[key]);
      if (String(next[key]||'')!==value) {changes[key]={before:next[key]||'',after:value};next[key]=value;}
    }
    if (Object.keys(changes).length===0) throw Error('변경된 항목이 없습니다.');
    if (!name(next.owner)) throw Error('고장 관리 책임자 1명을 지정하세요.');
    if (!(next.priority in PRIORITIES) || !(next.operatingState in OPERATIONS)) throw Error('우선순위 또는 운전 상태를 확인하세요.');
    if (next.priority==='unassessed' && !dateOnly(next.priorityDueDate)) throw Error('미평가 상태라면 우선순위 평가 예정일을 지정하세요.');
    if (next.operatingState !== previous.operatingState && !reason) throw Error('운전 상태 변경 사유가 필요합니다.');
    if (next.repairDueDate && !dateOnly(next.repairDueDate)) throw Error('정비 목표일을 확인하세요.');
    if (!next.repairDueDate && !dateOnly(next.nextReviewDate)) throw Error('정비 목표일 미지정 시 다음 재확인일이 필요합니다.');
    if (next.nextReviewDate && !dateOnly(next.nextReviewDate)) throw Error('재확인일을 확인하세요.');
    if (previous.owner && previous.owner!==next.owner && actor!==previous.owner) throw Error('책임자 변경은 기존 책임자 이름으로 처리하세요.');
    if (previous.owner && previous.owner===next.owner && actor!==previous.owner) throw Error('현재 관리 책임자 이름으로 변경을 처리하세요.');
    next.history.push({at:new Date().toISOString(),actor,type:'updated',note:reason,changes});
    next.updatedAt=new Date().toISOString();
    return next;
  }
  function addReview(previous, actor, level, detail, nextDate) {
    if (previous.status!=='open') throw Error('종료된 고장은 재확인할 수 없습니다.');
    if (name(actor)!==name(previous.owner) || !name(actor)) throw Error('현재 관리 책임자가 재확인 내용을 기록해야 합니다.');
    if (!(level in LEVELS) || !name(detail) || !dateOnly(nextDate)) throw Error('재확인 결과·내용·다음 확인일을 입력하세요.');
    const next=copy(previous);const review={at:new Date().toISOString(),actor,level,detail:name(detail),nextReviewDate:nextDate};
    next.reviews.push(review);next.nextReviewDate=nextDate;
    if(level==='worsening') next.worseningAlert=true;
    next.history.push({at:review.at,actor,type:'reviewed',note:`${LEVELS[level]}: ${name(detail)}`,nextReviewDate:nextDate});next.updatedAt=review.at;
    return next;
  }
  function dismissWorsening(previous, actor, reason) {
    if (previous.status!=='open'||!previous.worseningAlert) throw Error('해제할 악화 경고가 없습니다.');
    if (!name(actor) || actor!==previous.owner || !name(reason)) throw Error('현재 책임자와 경고 해제 사유를 입력하세요.');
    const next=copy(previous); next.worseningAlert=false; next.updatedAt=new Date().toISOString();
    next.history.push({at:next.updatedAt,actor,type:'worsening-dismissed',note:name(reason)});return next;
  }
  function closeFault(previous, actor, reason, acknowledgedIncomplete=false) {
    if (previous.status!=='open') throw Error('이미 종료된 고장입니다.');
    if (!name(previous.owner)||name(actor)!==name(previous.owner)||!name(reason)) throw Error('현재 관리 책임자 이름과 종료 사유를 입력하세요.');
    const repair = globalThis.SmartMaintenanceRepairModel;
    const report = repair ? repair.metrics(previous) : {pending:0,held:0};
    if(report.pending>0 && acknowledgedIncomplete!==true) throw Error(`미완료·보류 작업 ${report.pending}건을 확인하고 예외 종료에 동의해야 합니다.`);
    const next=copy(previous);next.status='closed';next.closedAt=new Date().toISOString();next.closedBy=actor;next.closureReason=name(reason);next.updatedAt=next.closedAt;
    if(report.pending>0) next.closureIncompleteTasks={count:report.pending,held:report.held,acknowledgedBy:actor,acknowledgedAt:next.closedAt};
    next.history.push({at:next.closedAt,actor,type:'closed',note:name(reason)});return next;
  }
  globalThis.SmartMaintenanceFaultModel = Object.freeze({PRIORITIES,OPERATIONS,LEVELS,dateOnly,localToday,addDays,requiresFault,newFault,resolveInspection,flags,updateFault,addReview,dismissWorsening,closeFault});
})();
