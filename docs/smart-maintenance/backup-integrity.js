/* Restore preflight: verify imported records do not point at records missing from the proposed final database. */
(() => {
  'use strict';
  const LINKED_EQUIPMENT = new Set(['plans', 'inspectionRecords', 'maintenanceRecords', 'faults', 'planDrafts', 'missedOccurrences', 'photos']);
  function verify(proposed, affected) {
    const contains = (store, id) => Boolean(id && proposed[store]?.has(id));
    for (const { name, record } of affected) {
      const label = `${name} / ${record.id}`;
      const equipmentId = record.equipmentId;
      if (LINKED_EQUIPMENT.has(name) && !contains('equipment', equipmentId))
        throw Error(`${label}: 연결된 설비가 없어 복원할 수 없습니다.`);
      if (name === 'checklists' && equipmentId && !contains('equipment', equipmentId))
        throw Error(`${label}: 점검표의 설비가 존재하지 않습니다.`);
      if (['inspectionRecords', 'planDrafts', 'missedOccurrences'].includes(name) && record.planId) {
        const plan = proposed.plans?.get(record.planId);
        if (!plan || plan.equipmentId !== equipmentId)
          throw Error(`${label}: 점검 계획이 없거나 다른 설비에 속합니다.`);
      }
      if (name === 'inspectionRecords' && record.linkedFaultId) {
        const fault = proposed.faults?.get(record.linkedFaultId);
        if (!fault || fault.equipmentId !== equipmentId)
          throw Error(`${label}: 연결된 고장 기록이 없거나 다른 설비에 속합니다.`);
      }
      if (name === 'faults') {
        for (const inspectionId of record.sourceInspectionIds || []) {
          const inspection = proposed.inspectionRecords?.get(inspectionId);
          if (!inspection || inspection.equipmentId !== equipmentId)
            throw Error(`${label}: 연결된 점검 기록이 없거나 다른 설비에 속합니다.`);
        }
        for (const planId of record.sourcePlanIds || []) {
          const plan = proposed.plans?.get(planId);
          if (!plan || plan.equipmentId !== equipmentId)
            throw Error(`${label}: 연결된 점검 계획이 없거나 다른 설비에 속합니다.`);
        }
        if (record.linkedPriorFaultId) {
          const prior = proposed.faults?.get(record.linkedPriorFaultId);
          if (!prior || prior.equipmentId !== equipmentId)
            throw Error(`${label}: 연결된 이전 고장 기록이 없거나 다른 설비에 속합니다.`);
        }
      }
      if (name === 'photos') {
        const sourceName = {inspection:'inspectionRecords',fault:'faults',maintenance:'maintenanceRecords'}[record.recordType];
        const source = sourceName && proposed[sourceName]?.get(record.recordId);
        if (!source || source.equipmentId !== equipmentId)
          throw Error(`${label}: 사진에 연결된 원본 기록이 없거나 다른 설비에 속합니다.`);
      }
    }
  }
  globalThis.SmartMaintenanceBackupIntegrity = Object.freeze({verify});
})();
