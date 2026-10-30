(() => {
  'use strict';

  const DB_NAME = 'smart-maintenance';
  const DB_VERSION = 4;
  const STORE = globalThis.SmartMaintenancePlanDraftStore;
  if (!STORE) return;
  const SAVE_DELAY_MS = 400;
  let db;
  let panel;
  let form;
  let status;
  let current = null;
  let openToken = 0;
  let timer = null;
  let pendingWrite = Promise.resolve();
  let writeError = null;
  const lastSaved = new Map();
  const queued = new Map();

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

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

  function openDatabase() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => {
        db = request.result;
        db.onversionchange = () => { db.close(); db = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('저장소를 열지 못했습니다.'));
      request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용 중입니다.'));
    });
  }

  function announce(text, isError = false) {
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  }

  function ensureStatus() {
    if (!panel) return;
    form = panel.querySelector('form');
    if (!form) return;
    status = panel.querySelector('.plan-draft-status');
    if (status) return;
    status = element('p', 'plan-draft-status', '임시 저장은 점검 완료 기록과 별개입니다.');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const note = panel.querySelector('.plan-execution-note');
    if (note) note.insertAdjacentElement('afterend', status);
    else form.prepend(status);
  }

  function startSeedFromClick(event) {
    const closeButton = event.target.closest?.('#plan-execution-panel button');
    if (closeButton && closeButton.textContent.trim() === '닫기') {
      void flushPendingDraft();
      return;
    }
    const button = event.target.closest?.('[data-plan-execution-start], [data-schedule-start]');
    if (!button) return;
    if (current?.plan && form && !panel?.hidden) {
      clearTimeout(timer);
      saveSnapshot();
    }
    const planId = button.dataset.planExecutionStart || button.dataset.scheduleStart;
    if (!planId) return;
    const guard=globalThis.SmartMaintenanceInspectionNavigation;
    if(guard?.approveStartClick && !guard.approveStartClick(planId)){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    current = {
      planId,
      dueDate: button.dataset.scheduleDueDate || '',
      token: ++openToken,
      preparingToken: null,
      preparedToken: null
    };
    writeError = null;
  }

  async function resolveScope(seed) {
    const database = await openDatabase();
    let tx = database.transaction('plans', 'readonly');
    let finished = transactionDone(tx);
    const planPromise = requestResult(tx.objectStore('plans').get(seed.planId));
    const [plan] = await Promise.all([planPromise, finished]);
    if (!plan) throw new Error('임시 저장할 점검 계획을 찾을 수 없습니다.');

    tx = database.transaction('equipment', 'readonly');
    finished = transactionDone(tx);
    const equipmentPromise = requestResult(tx.objectStore('equipment').get(plan.equipmentId));
    const [equipment] = await Promise.all([equipmentPromise, finished]);
    if (!equipment || equipment.status === 'archived') {
      throw new Error('활성 설비를 확인할 수 없어 임시 저장을 시작하지 않았습니다.');
    }
    if (!Array.isArray(plan.checklistItems) || !plan.checklistItems.length) {
      throw new Error('계획별 점검표를 확인할 수 없습니다.');
    }
    const items = plan.checklistItems.map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || '').trim(),
      guidance: String(item.guidance || '').trim()
    }));
    const checklistSignature = JSON.stringify(items.map((item) => [item.id, item.name, item.guidance]));
    return {
      plan,
      equipment,
      items,
      checklistSignature,
      dueDate: seed.dueDate || '',
      draftId: `${plan.id}::${equipment.id}::${seed.dueDate || 'unscheduled'}`
    };
  }

  function readAnswers(scope) {
    return scope.items.map((item, index) => ({
      itemId: item.id,
      name: item.name,
      result: form.querySelector(`input[name="result-${index}"]:checked`)?.value || '',
      memo: form.querySelector(`[data-item-memo="${index}"]`)?.value || ''
    }));
  }

  function makeDraft(scope) {
    return {
      id: scope.draftId,
      kind: STORE.OWNER,
      planId: scope.plan.id,
      equipmentId: scope.equipment.id,
      planName: scope.plan.name || '',
      equipmentName: scope.equipment.name || '',
      occurrenceDueDate: scope.dueDate,
      checklistSignature: scope.checklistSignature,
      completedAt: document.getElementById('plan-execution-date')?.value || '',
      inspector: document.getElementById('plan-execution-inspector')?.value || '',
      answers: readAnswers(scope),
      memo: document.getElementById('plan-execution-memo')?.value || '',
      actions: document.getElementById('plan-execution-actions')?.value || '',
      updatedAt: new Date().toISOString()
    };
  }

  function fingerprint(draft) {
    const { updatedAt, ...content } = draft;
    return JSON.stringify(content);
  }

  function canUseDraft(draft, scope) {
    return draft.kind === STORE.OWNER && draft.id === scope.draftId &&
      draft.planId === scope.plan.id && draft.equipmentId === scope.equipment.id &&
      (draft.occurrenceDueDate || '') === scope.dueDate;
  }

  function restoreDraft(draft, scope) {
    const date = document.getElementById('plan-execution-date');
    const inspector = document.getElementById('plan-execution-inspector');
    const memo = document.getElementById('plan-execution-memo');
    const actions = document.getElementById('plan-execution-actions');
    if (date && typeof draft.completedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.completedAt)) date.value = draft.completedAt;
    if (inspector && typeof draft.inspector === 'string') inspector.value = draft.inspector;
    if (memo && typeof draft.memo === 'string') memo.value = draft.memo;
    if (actions && typeof draft.actions === 'string') actions.value = draft.actions;
    for (let index = 0; index < scope.items.length; index += 1) {
      const saved = draft.answers?.[index];
      const item = scope.items[index];
      if (!saved || saved.itemId !== item.id || saved.name !== item.name) continue;
      if (['normal', 'caution', 'failure'].includes(saved.result)) {
        const radio = form.querySelector(`input[name="result-${index}"][value="${saved.result}"]`);
        if (radio) radio.checked = true;
      }
      const itemMemo = form.querySelector(`[data-item-memo="${index}"]`);
      if (itemMemo && typeof saved.memo === 'string') itemMemo.value = saved.memo;
    }
  }

  function setFormDisabled(disabled) {
    form?.querySelectorAll('input, textarea, button[type="submit"]').forEach((control) => {
      control.disabled = disabled;
    });
  }

  async function prepareDraft(seed) {
    ensureStatus();
    if (!form || seed.token !== openToken) return;
    seed.preparingToken = seed.token;
    setFormDisabled(true);
    announce('임시 저장 내용을 확인하고 있습니다.');
    try {
      const scope = await resolveScope(seed);
      if (seed.token !== openToken) return;
      current = { ...scope, token: seed.token, preparingToken: seed.token, preparedToken: seed.token };
      const loaded = await STORE.load(await openDatabase(), scope.draftId);
      if (seed.token !== openToken) return;
      if (loaded.conflict || (loaded.draft && !canUseDraft(loaded.draft, scope))) {
        announce('같은 저장 위치에 다른 용도의 임시 데이터가 있어 덮어쓰지 않았습니다.', true);
      } else if (loaded.draft && loaded.draft.checklistSignature !== scope.checklistSignature) {
        announce('기존 임시 저장은 다른 점검표 버전의 내용으로 보존했습니다. 현재 입력으로 덮어쓰지 않습니다.', true);
      } else if (loaded.draft) {
        restoreDraft(loaded.draft, scope);
        window.dispatchEvent(new CustomEvent('smart-maintenance:plan-draft-restored', { detail: { planId: scope.plan.id, equipmentId: scope.equipment.id } }));
        lastSaved.set(scope.draftId, fingerprint(loaded.draft));
        const savedAt = new Date(loaded.draft.updatedAt || Date.now()).toLocaleString('ko-KR');
        announce(`임시 저장 내용을 불러왔습니다 · ${savedAt}`);
      } else {
        // The draft may have been removed after a successful completion.
        // A stale in-memory fingerprint must not suppress the next new draft.
        lastSaved.delete(scope.draftId);
        announce('작성 내용은 자동 임시 저장됩니다. 임시 저장은 점검 완료 기록이나 일정을 변경하지 않습니다.');
      }
    } catch (error) {
      seed.preparedToken = seed.token;
      announce(`임시 저장을 준비하지 못했습니다: ${error.message || '저장소 오류'}`, true);
    } finally {
      if (seed.token === openToken) setFormDisabled(false);
    }
  }

  function saveSnapshot() {
    if (!current?.plan || !form || panel.hidden) return;
    const draft = makeDraft(current);
    const id = draft.id;
    const signature = fingerprint(draft);
    // A different value may already be in flight. If the user changes B back
    // to the last persisted A while B is queued, A must be queued again.
    if (queued.get(id) === signature ||
        (lastSaved.get(id) === signature && !queued.has(id))) return;
    queued.set(id, signature);
    announce('변경사항 임시 저장 중...');
    pendingWrite = pendingWrite.catch(() => {}).then(async () => {
      await STORE.save(await openDatabase(), draft);
      lastSaved.set(id, signature);
      if (queued.get(id) === signature) queued.delete(id);
      if (current?.draftId === id) {
        writeError = null;
        announce(`임시 저장됨 · ${new Date(draft.updatedAt).toLocaleTimeString('ko-KR')}`);
      }
    }).catch((error) => {
      if (queued.get(id) === signature) queued.delete(id);
      writeError = error;
      announce(`임시 저장에 실패했습니다. 입력 내용은 화면에 유지됩니다: ${error.message || '저장 오류'}`, true);
    });
  }

  function scheduleSave() {
    if (!current?.plan || !form || panel.hidden) return;
    announce('변경사항 저장 대기 중...');
    clearTimeout(timer);
    timer = setTimeout(saveSnapshot, SAVE_DELAY_MS);
  }

  async function flushPendingDraft() {
    clearTimeout(timer);
    if (current?.plan && form && !panel.hidden) saveSnapshot();
    await pendingWrite;
  }

  function onPanelMutation() {
    if (!panel) return;
    if (panel.hidden) {
      clearTimeout(timer);
      return;
    }
    ensureStatus();
    if (!current || current.plan || current.preparingToken === current.token || current.preparedToken === current.token) return;
    void prepareDraft(current);
  }

  function attachPanel() {
    const found = document.getElementById('plan-execution-panel');
    if (!found || found === panel) return;
    panel = found;
    ensureStatus();
    panel.addEventListener('input', scheduleSave);
    panel.addEventListener('change', scheduleSave);
    new MutationObserver(onPanelMutation).observe(panel, {
      attributes: true,
      attributeFilter: ['hidden'],
      childList: true,
      subtree: true
    });
  }

  document.addEventListener('click', startSeedFromClick, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-view], [data-go]') && current?.plan && form && !panel?.hidden) {
      void flushPendingDraft();
    }
  }, true);
  new MutationObserver(() => { if (!panel) attachPanel(); }).observe(document.documentElement, { childList: true, subtree: true });

  // A start from the plan list has no due date in the clicked button.
  // The execution engine resolves the actual scheduled occurrence after reading records.
  // Keep its autosave scope aligned with that occurrence instead of 'unscheduled'.
  window.addEventListener('smart-maintenance:plan-started', (event) => {
    const detail = event.detail || {};
    if (detail.autoAdvance) {
      // A programmatic next-plan transition has no click from which to seed
      // the draft scope. The old completed-plan cleanup may still be awaiting
      // IndexedDB, so use a distinct token and leave it untouched.
      clearTimeout(timer);
      current = {planId: detail.planId, dueDate: detail.dueDate || '',
        token: ++openToken, preparingToken: null, preparedToken: null};
      writeError = null;
      const seed = current;
      // The plan-execution panel is already open when auto-advancing, so the
      // hidden-attribute observer won't run a second time. Prepare explicitly.
      queueMicrotask(() => { if (seed.token === openToken) void prepareDraft(seed); });
      return;
    }
    if (current && !current.plan && current.planId === detail.planId) {
      current.dueDate = detail.dueDate || '';
    }
  });

  window.addEventListener('smart-maintenance:plan-completed', async (event) => {
    const detail = event.detail || {};
    if (!current?.plan || current.plan.id !== detail.planId || current.equipment.id !== detail.equipmentId) return;
    // Freeze the completed scope before awaiting. A new plan can start during
    // cleanup; never delete its draft or clear its active scope by accident.
    const finishedScope = current;
    const finishedWrite = pendingWrite;
    clearTimeout(timer);
    try {
      await finishedWrite.catch(() => {});
      const removed = await STORE.remove(await openDatabase(), makeDraft(finishedScope));
      if (current === finishedScope) {
        announce(removed
          ? '점검 완료 기록이 저장되어 해당 임시 저장을 정리했습니다.'
          : writeError
            ? '점검은 저장됐지만 임시 저장 정리는 실패했습니다. 임시 데이터가 남아 있을 수 있습니다.'
            : '점검 완료 기록이 저장되었습니다. 대응하는 임시 저장은 없었습니다.', Boolean(writeError));
      }
      lastSaved.delete(finishedScope.draftId);
      queued.delete(finishedScope.draftId);
    } catch (error) {
      if (current === finishedScope) announce(`점검은 완료 저장됐지만 임시 저장 정리에 실패했습니다: ${error.message || '정리 오류'}`, true);
      lastSaved.delete(finishedScope.draftId);
      queued.delete(finishedScope.draftId);
    } finally {
      if (current === finishedScope) current = null;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPendingDraft();
  });
  window.addEventListener('pagehide', () => { void flushPendingDraft(); });
})();
