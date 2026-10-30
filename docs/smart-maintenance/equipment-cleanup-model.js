/* Pure deletion planner: no DB writes. Conservative cross-reference safety. */
(() => {
  'use strict';
  const STORES = Object.freeze(['equipmentTypes','checklists','equipment','plans','inspectionRecords','maintenanceRecords','faults','planDrafts','missedOccurrences','photos']);
  const LABELS = Object.freeze({equipment:'설비',checklists:'설비별 점검표',plans:'점검 계획',inspectionRecords:'점검 이력',maintenanceRecords:'정비 이력',faults:'고장 기록',planDrafts:'점검 임시저장',missedOccurrences:'미실시 기록',photos:'사진'});
  const REFERENCES = ['equipmentId','planId','recordId','faultId','linkedFaultId','linkedPriorFaultId','sourceInspectionIds','sourcePlanIds'];
  function plan(data, selectedIds) {
    if (!Array.isArray(selectedIds) || !selectedIds.length) throw Error('삭제할 테스트 설비를 선택하세요.');
    const ids = new Set(selectedIds);
    const equipment = new Map((data.equipment || []).map(row => [row.id,row]));
    for (const id of ids) if (!equipment.has(id)) throw Error('선택한 설비가 목록에서 변경되었습니다. 다시 조회하세요.');
    const ownPlanIds = new Set((data.plans||[]).filter(row=>ids.has(row.equipmentId)).map(row=>row.id));
    const removed = Object.fromEntries(STORES.map(name => [name,new Set()]));
    for (const [name,rows] of Object.entries(data)) {
      if (!Object.hasOwn(removed,name)) throw Error('알 수 없는 저장 영역이 있어 삭제를 중단했습니다: '+name);
      if (!Array.isArray(rows)) throw Error('저장 영역 데이터가 올바르지 않습니다: '+name);
      for (const row of rows) {
        if (!row || typeof row.id!=='string') throw Error('기록 ID가 불명확하여 삭제를 중단했습니다: '+name);
        if (name==='equipmentTypes') continue;
        if (name==='equipment' ? ids.has(row.id)
          : (ids.has(row.equipmentId) || (name==='checklists' && [...ids].some(id=>row.id==='equipment-checklist-'+id))
            || (['inspectionRecords','planDrafts','missedOccurrences'].includes(name) && ownPlanIds.has(row.planId)))) removed[name].add(row.id);
      }
    }
    const removedRecords = new Set(['inspectionRecords','maintenanceRecords','faults'].flatMap(name=>[...removed[name]]));
    for (const row of data.photos||[]) if (removedRecords.has(row.recordId)) removed.photos.add(row.id);
    const refersRemoved = (row)=> ids.has(row.equipmentId)||ownPlanIds.has(row.planId)||
      removedRecords.has(row.recordId)||removedRecords.has(row.faultId)||removedRecords.has(row.linkedFaultId)||
      removedRecords.has(row.linkedPriorFaultId)||
      (Array.isArray(row.sourceInspectionIds)&&row.sourceInspectionIds.some(id=>removedRecords.has(id)))||
      (Array.isArray(row.sourcePlanIds)&&row.sourcePlanIds.some(id=>ownPlanIds.has(id)));
    for (const [name,rows] of Object.entries(data)) for (const row of rows) {
      if (removed[name].has(row.id)) continue;
      if (refersRemoved(row)) throw Error('다른 설비의 기록이 선택한 설비와 연결돼 있어 안전상 삭제할 수 없습니다: '+name+' / '+row.id);
    }
    const counts=Object.fromEntries(Object.entries(removed).filter(([,keys])=>keys.size).map(([name,keys])=>[name,keys.size]));
    return {removed,counts,total:Object.values(counts).reduce((sum,count)=>sum+count,0),equipmentCount:ids.size};
  }
  // This signature detects changes relevant to matching and relationships, without copying image bytes.
  function signature(data) {
    const parts=[];
    for (const [name,rows] of Object.entries(data).sort(([a],[b])=>a.localeCompare(b))) {
      parts.push([name,rows.map(row=>[row.id,row.equipmentId,row.planId,row.recordId,row.faultId,row.linkedFaultId,
        row.linkedPriorFaultId,row.updatedAt,row.modifiedAt,row.status,row.assetCode,
        row.sourceInspectionIds,row.sourcePlanIds]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
    }
    return JSON.stringify(parts);
  }
  globalThis.SmartMaintenanceCleanupModel=Object.freeze({STORES,LABELS,REFERENCES,plan,signature});
})();
