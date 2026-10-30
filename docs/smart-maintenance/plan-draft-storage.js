(() => {
  'use strict';

  const OWNER = 'plan-execution-draft-v1';

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('임시 저장 데이터를 읽지 못했습니다.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('임시 저장 작업이 취소되었습니다.'));
      transaction.onerror = () => {};
    });
  }

  function owns(row, draft) {
    return Boolean(row && row.kind === OWNER && row.id === draft.id &&
      row.planId === draft.planId && row.equipmentId === draft.equipmentId &&
      row.occurrenceDueDate === draft.occurrenceDueDate &&
      row.checklistSignature === draft.checklistSignature);
  }

  async function load(database, id) {
    const transaction = database.transaction('planDrafts', 'readonly');
    const finished = transactionDone(transaction);
    const value = requestResult(transaction.objectStore('planDrafts').get(id));
    const [row] = await Promise.all([value, finished]);
    if (!row) return { draft: null, conflict: false };
    if (row.kind !== OWNER || row.id !== id) return { draft: null, conflict: true };
    return { draft: row, conflict: false };
  }

  async function save(database, draft) {
    if (!draft || draft.kind !== OWNER) throw new TypeError('임시 저장 데이터 형식이 올바르지 않습니다.');
    const transaction = database.transaction('planDrafts', 'readwrite');
    const finished = transactionDone(transaction);
    const store = transaction.objectStore('planDrafts');
    let failure = null;
    const read = store.get(draft.id);
    read.onsuccess = () => {
      if (read.result && !owns(read.result, draft)) {
        failure = new Error('같은 저장 위치에 다른 용도의 데이터 또는 점검표 버전이 있어 덮어쓰지 않았습니다.');
        transaction.abort();
        return;
      }
      try {
        store.put(draft);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    read.onerror = () => {
      failure = read.error || new Error('기존 임시 저장 여부를 확인하지 못했습니다.');
      transaction.abort();
    };
    try {
      await finished;
    } catch (error) {
      throw failure || error;
    }
  }

  async function remove(database, draft) {
    if (!draft || draft.kind !== OWNER) return false;
    const transaction = database.transaction('planDrafts', 'readwrite');
    const finished = transactionDone(transaction);
    const store = transaction.objectStore('planDrafts');
    let removed = false;
    const read = store.get(draft.id);
    read.onsuccess = () => {
      if (owns(read.result, draft)) {
        store.delete(draft.id);
        removed = true;
      }
    };
    read.onerror = () => transaction.abort();
    await finished;
    return removed;
  }

  globalThis.SmartMaintenancePlanDraftStore = Object.freeze({ OWNER, load, save, remove });
})();
