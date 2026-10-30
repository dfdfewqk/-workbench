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
  // Compare EVERY serializable field, including names, notes and photo base64 data.
  // Hash the stream to avoid materializing multi-megabyte photo payloads in the preview.
  // Any edit invalidates an earlier preview; deletion remains in one readwrite transaction.
  function signature(data) {
    let a=2166136261>>>0, b=0x811c9dc5>>>0, size=0;
    const emit=(value)=>{for(let i=0;i<value.length;i++){
      const ch=value.charCodeAt(i);a=Math.imul(a^ch,16777619)>>>0;
      b=(Math.imul(b^ch,2246822519)+3266489917)>>>0;size++;
    }};
    const seen=new WeakSet();
    function walk(value){
      if(value===null){emit('null;');return;}
      const kind=typeof value;
      if(kind==='string'){emit('str:'+value.length+':');emit(value);emit(';');return;}
      if(kind==='number'||kind==='boolean'||kind==='bigint'||kind==='undefined'){emit(kind+':'+String(value)+';');return;}
      if(kind!=='object')throw Error('서명할 수 없는 데이터 형식입니다.');
      if(seen.has(value))throw Error('순환 참조 데이터는 삭제할 수 없습니다.');
      seen.add(value);
      if(Array.isArray(value)){emit('array:'+value.length+'[');for(const item of value)walk(item);emit(']');}
      else if(value instanceof Date){emit('date:'+value.toISOString()+';');}
      else if(typeof Blob!=='undefined'&&value instanceof Blob){
        // Browser photo storage uses base64 strings; Blob payload is unsupported for a safe preview.
        throw Error('Blob 형식의 사진 데이터는 안전하게 비교할 수 없어 삭제를 중단합니다.');
      }
      else if(ArrayBuffer.isView(value)) {emit('typed:'+value.constructor.name+':');for(const num of new Uint8Array(value.buffer,value.byteOffset,value.byteLength))emit(String.fromCharCode(num));emit(';');}
      else if(value instanceof ArrayBuffer){emit('buffer:');for(const num of new Uint8Array(value))emit(String.fromCharCode(num));emit(';');}
      else {const keys=Object.keys(value).sort();emit('object:'+keys.length+'{');for(const key of keys){walk(key);walk(value[key]);}emit('}');}
      seen.delete(value);
    }
    for(const name of Object.keys(data).sort()){
      walk(name);
      const rows=data[name];if(!Array.isArray(rows))throw Error('저장 영역이 올바르지 않습니다: '+name);
      const ordered=rows.slice().sort((x,y)=>String(x?.id||'').localeCompare(String(y?.id||'')));
      walk(ordered);
    }
    return `${size}:${a.toString(16).padStart(8,'0')}:${b.toString(16).padStart(8,'0')}`;
  }
  globalThis.SmartMaintenanceCleanupModel=Object.freeze({STORES,LABELS,REFERENCES,plan,signature});
})();
