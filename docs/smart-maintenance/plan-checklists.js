(() => {
  'use strict';

  const DB_NAME = 'smart-maintenance';
  const DB_VERSION = 2;
  const panel = document.getElementById('equipment-plans-panel');
  const planList = document.getElementById('plans-list');
  if (!panel || !planList) return;

  let db;
  let selectedPlan = null;
  let selectedEquipment = null;
  let editingItemId = null;
  let busy = false;

  const el = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('점검표 데이터를 읽지 못했습니다.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('저장 작업이 취소되었습니다.'));
      transaction.onerror = () => {};
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => {
        db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('저장소를 열지 못했습니다.'));
      request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용 중입니다. 탭을 닫고 다시 시도해 주세요.'));
    });
  }

  const editor = el('section', 'plan-checklist-editor');
  editor.id = 'plan-checklist-editor';
  editor.hidden = true;
  editor.setAttribute('aria-labelledby', 'plan-checklist-heading');

  const heading = el('div', 'panel-heading plan-checklist-heading');
  const headingCopy = document.createElement('div');
  headingCopy.append(el('p', 'eyebrow', 'PLAN-SPECIFIC CHECKLIST'));
  const title = el('h3', '', '계획별 점검표');
  title.id = 'plan-checklist-heading';
  headingCopy.append(title);
  const meta = el('p', 'plan-checklist-meta', '');
  meta.id = 'plan-checklist-meta';
  headingCopy.append(meta);
  const closeButton = el('button', 'secondary-button', '닫기');
  closeButton.type = 'button';
  closeButton.addEventListener('click', closeEditor);
  heading.append(headingCopy, closeButton);
  editor.append(heading);

  const note = el('p', 'plan-checklist-note', '계획별 점검 항목은 설비 기본 점검표 및 다른 계획과 별도로 저장됩니다. 과거 점검·정비 이력은 변경되지 않습니다.');
  editor.append(note);

  const setup = el('div', 'plan-checklist-setup');
  setup.id = 'plan-checklist-setup';
  const setupCopy = el('p', '', '점검표 시작 방식을 선택하세요. 복사한 뒤에도 계획 점검표를 편집해도 원본은 바뀌지 않습니다.');
  const setupActions = el('div', 'plan-checklist-setup-actions');
  const copyButton = el('button', 'secondary-button', '설비 점검표 항목 복사');
  copyButton.type = 'button';
  copyButton.dataset.planChecklistSetup = 'copy';
  const blankButton = el('button', 'secondary-button', '빈 점검표로 시작');
  blankButton.type = 'button';
  blankButton.dataset.planChecklistSetup = 'blank';
  setupActions.append(copyButton, blankButton);
  setup.append(setupCopy, setupActions);
  editor.append(setup);

  const form = document.createElement('form');
  form.id = 'plan-checklist-form';
  form.noValidate = true;
  const fields = el('div', 'plan-checklist-fields');
  const nameWrap = el('div', 'plan-checklist-field');
  const nameLabel = el('label', 'field-label', '점검 항목 이름 *');
  nameLabel.htmlFor = 'plan-checklist-item-name';
  const nameInput = document.createElement('input');
  nameInput.id = 'plan-checklist-item-name';
  nameInput.type = 'text';
  nameInput.maxLength = 100;
  nameInput.autocomplete = 'off';
  nameInput.placeholder = '예: 누설 및 연결 상태';
  nameWrap.append(nameLabel, nameInput);
  const guidanceWrap = el('div', 'plan-checklist-field');
  const guidanceLabel = el('label', 'field-label', '확인 안내');
  guidanceLabel.htmlFor = 'plan-checklist-item-guidance';
  const guidanceInput = document.createElement('textarea');
  guidanceInput.id = 'plan-checklist-item-guidance';
  guidanceInput.maxLength = 300;
  guidanceInput.rows = 2;
  guidanceInput.placeholder = '확인할 사항 (선택)';
  guidanceWrap.append(guidanceLabel, guidanceInput);
  fields.append(nameWrap, guidanceWrap);
  form.append(fields);
  const formActions = el('div', 'plan-checklist-form-actions');
  const submitButton = el('button', 'primary-button', '항목 추가');
  submitButton.type = 'submit';
  const cancelEditButton = el('button', 'secondary-button', '수정 취소');
  cancelEditButton.type = 'button';
  cancelEditButton.hidden = true;
  cancelEditButton.addEventListener('click', resetItemForm);
  formActions.append(cancelEditButton, submitButton);
  form.append(formActions);
  const message = el('p', 'form-message', '');
  message.id = 'plan-checklist-message';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  form.append(message);
  form.addEventListener('submit', saveItem);
  editor.append(form);

  const listHeading = el('div', 'plan-checklist-list-heading');
  listHeading.append(el('h4', '', '점검 항목'));
  const count = el('span', 'subtle-label', '0개');
  count.id = 'plan-checklist-count';
  listHeading.append(count);
  editor.append(listHeading);
  const itemsList = el('ul', 'plan-checklist-items');
  itemsList.id = 'plan-checklist-items';
  editor.append(itemsList);
  panel.append(editor);

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function itemId() {
    return globalThis.crypto?.randomUUID
      ? `plan-item-${crypto.randomUUID()}`
      : `plan-item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function planHasChecklist(plan) {
    return Object.prototype.hasOwnProperty.call(plan, 'checklistItems') && Array.isArray(plan.checklistItems);
  }

  function renderItems() {
    const isArchived = selectedEquipment?.status === 'archived';
    const hasChecklist = selectedPlan && planHasChecklist(selectedPlan);
    setup.hidden = isArchived || hasChecklist;
    form.hidden = isArchived || !hasChecklist;
    itemsList.replaceChildren();
    const items = hasChecklist ? selectedPlan.checklistItems : [];
    count.textContent = `${items.length}개`;

    if (!hasChecklist) {
      itemsList.append(el('li', 'plan-checklist-empty', isArchived
        ? '이 계획에는 아직 별도 점검표가 설정되지 않았습니다.'
        : '복사 또는 빈 점검표 시작 방식을 선택하세요.'));
      return;
    }
    if (!items.length) {
      itemsList.append(el('li', 'plan-checklist-empty', isArchived
        ? '등록된 계획별 점검 항목이 없습니다.'
        : '등록된 항목이 없습니다. 위 양식에서 항목을 추가하세요.'));
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const row = el('li', 'plan-checklist-item');
      const copy = el('div', 'plan-checklist-item-copy');
      copy.append(el('strong', '', `${index + 1}. ${item.name || '이름 없는 항목'}`));
      if (item.guidance) copy.append(el('p', '', item.guidance));
      if (item.source === 'equipment-copy') copy.append(el('span', 'plan-checklist-source', '설비 점검표에서 복사됨'));
      row.append(copy);
      if (!isArchived) {
        const actions = el('div', 'plan-checklist-item-actions');
        const edit = el('button', 'plans-edit-button', '수정');
        edit.type = 'button';
        edit.dataset.planChecklistEdit = item.id;
        const remove = el('button', 'checklist-delete-button', '삭제');
        remove.type = 'button';
        remove.dataset.planChecklistDelete = item.id;
        actions.append(edit, remove);
        row.append(actions);
      }
      fragment.append(row);
    });
    itemsList.append(fragment);
  }

  function resetItemForm() {
    editingItemId = null;
    form.reset();
    submitButton.textContent = '항목 추가';
    cancelEditButton.hidden = true;
    showMessage('');
  }

  function closeEditor() {
    editor.hidden = true;
    selectedPlan = null;
    selectedEquipment = null;
    resetItemForm();
  }

  async function loadPlanAndEquipment(planId) {
    if (!db) throw new Error('저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
    const transaction = db.transaction(['plans', 'equipment'], 'readonly');
    const finished = transactionDone(transaction);
    const planPromise = requestValue(transaction.objectStore('plans').get(planId));
    const [plan] = await Promise.all([planPromise, finished]);
    if (!plan) throw new Error('점검 계획을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.');

    const assetTransaction = db.transaction('equipment', 'readonly');
    const assetFinished = transactionDone(assetTransaction);
    const assetPromise = requestValue(assetTransaction.objectStore('equipment').get(plan.equipmentId));
    const [asset] = await Promise.all([assetPromise, assetFinished]);
    if (!asset) throw new Error('점검 계획에 연결된 설비를 찾을 수 없습니다.');
    return { plan, asset };
  }

  async function openEditor(planId, button) {
    if (!db) throw new Error('저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
    if (button) button.disabled = true;
    try {
      const { plan, asset } = await loadPlanAndEquipment(planId);
      selectedPlan = plan;
      selectedEquipment = asset;
      resetItemForm();
      meta.textContent = `${asset.name} · ${asset.assetCode} · ${plan.name}`;
      note.textContent = asset.status === 'archived'
        ? '보관 설비의 계획별 점검표는 조회 전용입니다. 설비·계획·이력 데이터는 변경하지 않습니다.'
        : '이 점검표는 선택한 계획에만 저장됩니다. 설비 기본 점검표, 다른 계획과 과거 기록은 변경하지 않습니다.';
      renderItems();
      editor.hidden = false;
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function persistItems(items) {
    if (!selectedPlan || !selectedEquipment || selectedEquipment.status === 'archived') {
      throw new Error('보관 설비의 점검표는 조회만 할 수 있습니다.');
    }
    const transaction = db.transaction(['plans', 'equipment'], 'readwrite');
    const finished = transactionDone(transaction);
    const plans = transaction.objectStore('plans');
    const equipment = transaction.objectStore('equipment');
    let failure = null;
    let savedPlan = null;
    const planRequest = plans.get(selectedPlan.id);
    const equipmentRequest = equipment.get(selectedEquipment.id);
    const validateAndSave = () => {
      if (!planRequest.result || !equipmentRequest.result) {
        failure = new Error('설비 또는 계획을 찾을 수 없어 변경사항을 저장하지 않았습니다.');
        transaction.abort();
        return;
      }
      if (planRequest.result.equipmentId !== equipmentRequest.result.id) {
        failure = new Error('계획과 설비의 연결 정보가 달라 저장하지 않았습니다.');
        transaction.abort();
        return;
      }
      if (equipmentRequest.result.status === 'archived') {
        failure = new Error('보관된 설비의 점검표는 조회만 할 수 있습니다.');
        transaction.abort();
        return;
      }
      savedPlan = {
        ...planRequest.result,
        checklistItems: items.map((item) => ({ ...item })),
        updatedAt: new Date().toISOString()
      };
      plans.put(savedPlan);
    };
    let planReady = false;
    let equipmentReady = false;
    const maybeSave = () => {
      if (planReady && equipmentReady) validateAndSave();
    };
    planRequest.onsuccess = () => { planReady = true; maybeSave(); };
    equipmentRequest.onsuccess = () => { equipmentReady = true; maybeSave(); };
    planRequest.onerror = () => transaction.abort();
    equipmentRequest.onerror = () => transaction.abort();
    try {
      await finished;
      selectedPlan = savedPlan;
      return savedPlan;
    } catch (error) {
      throw failure || error;
    }
  }

  async function copyEquipmentChecklist() {
    if (!selectedEquipment || selectedEquipment.status === 'archived') return;
    const transaction = db.transaction('checklists', 'readonly');
    const finished = transactionDone(transaction);
    const store = transaction.objectStore('checklists');
    const personalizedPromise = requestValue(store.get(`equipment-checklist-${selectedEquipment.id}`));
    const [personalized] = await Promise.all([personalizedPromise, finished]);
    let sourceChecklist = personalized;
    if (!sourceChecklist) {
      const templateTransaction = db.transaction('checklists', 'readonly');
      const templateFinished = transactionDone(templateTransaction);
      const templatePromise = requestValue(templateTransaction.objectStore('checklists').get(`template-${selectedEquipment.typeId}`));
      const [template] = await Promise.all([templatePromise, templateFinished]);
      sourceChecklist = template;
    }
    if (!sourceChecklist) throw new Error('복사할 설비 점검표를 찾을 수 없습니다. 빈 점검표로 시작하거나 설비 점검표를 먼저 준비하세요.');
    const items = (Array.isArray(sourceChecklist.items) ? sourceChecklist.items : []).map((item) => ({
      id: itemId(),
      name: String(item.name ?? item.title ?? '').trim(),
      guidance: String(item.guidance || '').trim(),
      source: 'equipment-copy'
    })).filter((item) => item.name);
    await persistItems(items);
    renderItems();
    showMessage(`${items.length}개 항목을 복사했습니다. 이후 변경은 이 계획에만 적용됩니다.`);
  }

  async function startBlankChecklist() {
    await persistItems([]);
    renderItems();
    showMessage('빈 점검표를 시작했습니다. 항목을 추가할 수 있습니다.');
  }

  async function runSetup(button, action) {
    if (busy || !selectedEquipment || selectedEquipment.status === 'archived') return;
    busy = true;
    button.disabled = true;
    showMessage('점검표를 저장하고 있습니다.');
    try {
      await action();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '점검표를 저장하지 못했습니다.', true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  async function saveItem(event) {
    event.preventDefault();
    if (busy || !selectedPlan || selectedEquipment?.status === 'archived' || !planHasChecklist(selectedPlan)) return;
    const name = nameInput.value.trim();
    const guidance = guidanceInput.value.trim();
    if (!name) { showMessage('점검 항목 이름을 입력하세요.', true); nameInput.focus(); return; }
    if (name.length > 100 || guidance.length > 300) {
      showMessage('항목 이름은 100자, 확인 안내는 300자 이내로 입력하세요.', true);
      return;
    }
    const items = selectedPlan.checklistItems.map((item) => editingItemId === item.id
      ? { ...item, name, guidance, source: 'custom' }
      : { ...item });
    if (!editingItemId) items.push({ id: itemId(), name, guidance, source: 'custom' });
    busy = true;
    submitButton.disabled = true;
    try {
      await persistItems(items);
      resetItemForm();
      renderItems();
      showMessage('계획별 점검표를 저장했습니다.');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '점검표 항목을 저장하지 못했습니다.', true);
    } finally {
      busy = false;
      submitButton.disabled = false;
    }
  }

  setup.addEventListener('click', (event) => {
    const button = event.target.closest('[data-plan-checklist-setup]');
    if (!button) return;
    runSetup(button, button.dataset.planChecklistSetup === 'copy' ? copyEquipmentChecklist : startBlankChecklist);
  });

  itemsList.addEventListener('click', async (event) => {
    if (!selectedPlan || selectedEquipment?.status === 'archived') return;
    const edit = event.target.closest('[data-plan-checklist-edit]');
    if (edit) {
      const item = selectedPlan.checklistItems.find((entry) => entry.id === edit.dataset.planChecklistEdit);
      if (!item) return;
      editingItemId = item.id;
      nameInput.value = item.name || '';
      guidanceInput.value = item.guidance || '';
      submitButton.textContent = '변경사항 저장';
      cancelEditButton.hidden = false;
      showMessage('');
      nameInput.focus();
      return;
    }
    const remove = event.target.closest('[data-plan-checklist-delete]');
    if (!remove || busy) return;
    const item = selectedPlan.checklistItems.find((entry) => entry.id === remove.dataset.planChecklistDelete);
    if (!item || !globalThis.confirm(`“${item.name}” 계획 점검 항목을 삭제할까요?`)) return;
    busy = true;
    remove.disabled = true;
    try {
      const items = selectedPlan.checklistItems.filter((entry) => entry.id !== item.id);
      await persistItems(items);
      if (editingItemId === item.id) resetItemForm();
      renderItems();
      showMessage('계획별 점검 항목을 삭제했습니다.');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '점검 항목을 삭제하지 못했습니다.', true);
    } finally {
      busy = false;
      remove.disabled = false;
    }
  });

  function decoratePlanList() {
    for (const row of planList.querySelectorAll('.plan-item')) {
      if (row.querySelector('[data-plan-checklist-open]')) continue;
      const planId = row.dataset.planId;
      if (!planId) continue;
      const button = el('button', 'plan-checklist-open-button', '점검표');
      button.type = 'button';
      button.dataset.planChecklistOpen = planId;
      button.setAttribute('aria-label', `${row.querySelector('.plan-item-copy strong')?.textContent || '점검 계획'} 점검표 편집`);
      row.append(button);
    }
  }

  const observer = new MutationObserver(decoratePlanList);
  observer.observe(planList, { childList: true, subtree: true });
  decoratePlanList();

  planList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-plan-checklist-open]');
    if (!button) return;
    try {
      await openEditor(button.dataset.planChecklistOpen, button);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '계획별 점검표를 열지 못했습니다.', true);
      editor.hidden = false;
    }
  });

  openDatabase().catch((error) => {
    showMessage(error instanceof Error ? `점검표 저장소를 사용할 수 없습니다: ${error.message}` : '점검표 저장소를 사용할 수 없습니다.', true);
  });

  window.addEventListener('beforeunload', () => db?.close());
})();
