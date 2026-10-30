(() => {
  'use strict';

  const DB_NAME = 'smart-maintenance';
  const DB_VERSION = 1;
  const RESULT_LABELS = { normal: '정상', caution: '주의', failure: '고장' };
  const PRIORITY = { normal: 1, caution: 2, failure: 3 };
  let db;
  let activeContext = null;
  let saving = false;
  let expandedRecordId = null;
  let historyEquipmentId = null;

  const byId = (id) => document.getElementById(id);
  const equipmentBody = byId('equipment-list');
  const archivedBody = byId('archived-equipment-list');
  const equipmentView = document.querySelector('[data-panel="equipment"]');
  const historyView = document.querySelector('[data-panel="history"]');

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

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('데이터를 읽지 못했습니다.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('저장 작업이 취소되었습니다.'));
      transaction.onerror = () => {};
    });
  }

  function createId() {
    return globalThis.crypto?.randomUUID
      ? `inspection-${crypto.randomUUID()}`
      : `inspection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function makeItemId() {
    return globalThis.crypto?.randomUUID
      ? `item-${crypto.randomUUID()}`
      : `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function localToday() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildInspectionPanel() {
    const panel = makeElement('section', 'panel inspection-panel');
    panel.id = 'inspection-panel';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'inspection-heading');

    const heading = makeElement('div', 'panel-heading inspection-heading');
    const headingCopy = document.createElement('div');
    headingCopy.append(makeElement('p', 'eyebrow', 'INSPECTION ENTRY'));
    headingCopy.append(makeElement('h2', '', '점검 결과 입력'));
    headingCopy.lastChild.id = 'inspection-heading';
    headingCopy.append(makeElement('p', 'inspection-equipment-meta', ''));
    headingCopy.lastChild.id = 'inspection-equipment-meta';
    const close = makeElement('button', 'secondary-button inspection-close', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => {
      panel.hidden = true;
      activeContext = null;
    });
    heading.append(headingCopy, close);
    panel.append(heading);

    panel.append(makeElement('div', 'inspection-notice', '기본 점검 항목은 참고용입니다. 실제 기준과 안전 판단은 제조사 지침 및 적용 기준을 확인하고 담당자가 수행해야 합니다.'));

    const form = document.createElement('form');
    form.id = 'inspection-form';
    form.noValidate = true;
    const fields = makeElement('div', 'inspection-fields');
    const dateWrap = makeElement('div', 'inspection-field');
    const dateLabel = makeElement('label', 'field-label', '점검일 *');
    dateLabel.htmlFor = 'inspection-date';
    const dateInput = document.createElement('input');
    dateInput.type = 'date'; dateInput.id = 'inspection-date'; dateInput.name = 'inspectedAt'; dateInput.required = true;
    dateWrap.append(dateLabel, dateInput);
    const inspectorWrap = makeElement('div', 'inspection-field');
    const inspectorLabel = makeElement('label', 'field-label', '점검자 *');
    inspectorLabel.htmlFor = 'inspection-inspector';
    const inspectorInput = document.createElement('input');
    inspectorInput.type = 'text'; inspectorInput.id = 'inspection-inspector'; inspectorInput.name = 'inspector';
    inspectorInput.maxLength = 100; inspectorInput.autocomplete = 'name'; inspectorInput.placeholder = '점검자 이름'; inspectorInput.required = true;
    inspectorWrap.append(inspectorLabel, inspectorInput);
    fields.append(dateWrap, inspectorWrap);
    form.append(fields);

    const itemHeading = makeElement('div', 'inspection-items-heading');
    itemHeading.append(makeElement('h3', '', '항목별 판정'), makeElement('span', 'subtle-label', '모든 항목 필수'));
    form.append(itemHeading);
    const itemList = makeElement('div', 'inspection-items');
    itemList.id = 'inspection-items';
    form.append(itemList);

    const notes = makeElement('div', 'inspection-notes');
    const memoWrap = makeElement('div', 'inspection-field');
    const memoLabel = makeElement('label', 'field-label', '메모'); memoLabel.htmlFor = 'inspection-memo';
    const memo = document.createElement('textarea'); memo.id = 'inspection-memo'; memo.name = 'memo'; memo.maxLength = 2000; memo.rows = 3; memo.placeholder = '점검 관련 메모 (선택)';
    memoWrap.append(memoLabel, memo);
    const actionWrap = makeElement('div', 'inspection-field');
    const actionLabel = makeElement('label', 'field-label', '조치 내용'); actionLabel.htmlFor = 'inspection-actions';
    const actions = document.createElement('textarea'); actions.id = 'inspection-actions'; actions.name = 'actions'; actions.maxLength = 2000; actions.rows = 3; actions.placeholder = '조치 또는 후속 확인 내용 (선택)';
    actionWrap.append(actionLabel, actions);
    notes.append(memoWrap, actionWrap);
    form.append(notes);

    const footer = makeElement('div', 'inspection-form-footer');
    const message = makeElement('p', 'form-message', '');
    message.id = 'inspection-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    const submit = makeElement('button', 'primary-button', '점검 기록 저장');
    submit.type = 'submit'; submit.id = 'inspection-submit';
    footer.append(message, submit);
    form.append(footer);
    form.addEventListener('submit', submitInspection);
    panel.append(form);

    const checklistEditor = byId('checklist-editor');
    if (checklistEditor?.parentElement) checklistEditor.parentElement.insertBefore(panel, checklistEditor.nextSibling);
    else equipmentView?.append(panel);
    return panel;
  }

  const inspectionPanel = buildInspectionPanel();

  function insertActionButtons(list, archived) {
    if (!list) return;
    for (const row of list.querySelectorAll('tr')) {
      const checklistButton = row.querySelector('[data-checklist-id]');
      const actionCell = row.lastElementChild;
      if (!checklistButton || !actionCell) continue;
      const selector = archived ? '[data-history-equipment]' : '[data-inspection-start]';
      if (actionCell.querySelector(selector)) continue;
      const assetId = checklistButton.dataset.checklistId;
      const button = makeElement('button', archived ? 'history-equipment-button' : 'inspection-start-button', archived ? '이력 보기' : '점검 입력');
      button.type = 'button';
      button.dataset[archived ? 'historyEquipment' : 'inspectionStart'] = assetId;
      button.setAttribute('aria-label', archived ? `${row.cells[0]?.textContent || '설비'} 기존 점검 이력 보기` : `${row.cells[0]?.textContent || '설비'} 점검 결과 입력`);
      actionCell.append(button);
    }
  }

  const rowObserver = new MutationObserver(() => {
    insertActionButtons(equipmentBody, false);
    insertActionButtons(archivedBody, true);
  });
  if (equipmentBody) rowObserver.observe(equipmentBody, { childList: true, subtree: true });
  if (archivedBody) rowObserver.observe(archivedBody, { childList: true, subtree: true });
  insertActionButtons(equipmentBody, false);
  insertActionButtons(archivedBody, true);

  async function loadAssetChecklist(assetId) {
    const transaction = db.transaction(['equipment', 'checklists'], 'readwrite');
    const finished = transactionDone(transaction);
    const equipmentStore = transaction.objectStore('equipment');
    const checklistStore = transaction.objectStore('checklists');
    let output;
    let failure;
    const assetRequest = equipmentStore.get(assetId);
    assetRequest.onsuccess = () => {
      const asset = assetRequest.result;
      if (!asset) { failure = new Error('설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'); transaction.abort(); return; }
      if (asset.status === 'archived') { failure = new Error('보관된 설비는 새 점검을 시작할 수 없습니다.'); transaction.abort(); return; }
      const personalId = `equipment-checklist-${asset.id}`;
      const checklistRequest = checklistStore.get(personalId);
      checklistRequest.onsuccess = () => {
        if (checklistRequest.result) { output = { asset, checklist: checklistRequest.result }; return; }
        const templateRequest = checklistStore.get(`template-${asset.typeId}`);
        templateRequest.onsuccess = () => {
          const template = templateRequest.result;
          if (!template) { failure = new Error('설비 점검표를 찾을 수 없습니다. 먼저 점검표를 열어 주세요.'); transaction.abort(); return; }
          const now = new Date().toISOString();
          const checklist = {
            id: personalId, typeId: asset.typeId, equipmentId: asset.id, isTemplate: false,
            items: (template.items || []).map((item) => ({ id: makeItemId(), name: item.name, guidance: item.guidance || '', source: item.source === 'default' ? 'default' : 'custom' })),
            createdAt: now, updatedAt: now
          };
          output = { asset, checklist };
          checklistStore.add(checklist);
        };
        templateRequest.onerror = () => transaction.abort();
      };
      checklistRequest.onerror = () => transaction.abort();
    };
    assetRequest.onerror = () => transaction.abort();
    try {
      await finished;
      if (!output) throw failure || new Error('설비 점검표를 불러오지 못했습니다.');
      return output;
    } catch (error) {
      throw failure || error;
    }
  }

  function showInspectionMessage(message, isError = false) {
    const element = byId('inspection-message');
    element.textContent = message;
    element.classList.toggle('is-error', isError);
  }

  function renderInspectionItems(items) {
    const list = byId('inspection-items');
    list.replaceChildren();
    if (!items.length) {
      list.append(makeElement('p', 'inspection-empty', '점검 항목이 없습니다. 점검표에 항목을 먼저 추가하세요.'));
      byId('inspection-submit').disabled = true;
      return;
    }
    byId('inspection-submit').disabled = false;
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const fieldset = makeElement('fieldset', 'inspection-item');
      fieldset.append(makeElement('legend', 'inspection-item-name', `${index + 1}. ${item.name}`));
      if (item.guidance) fieldset.append(makeElement('p', 'inspection-guidance', item.guidance));
      const choices = makeElement('div', 'inspection-choices');
      for (const [value, label] of Object.entries(RESULT_LABELS)) {
        const choiceLabel = makeElement('label', `inspection-choice choice-${value}`);
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = `result-${index}`; radio.value = value; radio.required = true;
        choiceLabel.append(radio, makeElement('span', '', label));
        choices.append(choiceLabel);
      }
      fieldset.append(choices);
      fragment.append(fieldset);
    });
    list.append(fragment);
  }

  async function beginInspection(assetId, button) {
    if (!db) throw new Error('저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
    button.disabled = true;
    showInspectionMessage('점검표를 불러오는 중입니다.');
    try {
      const { asset, checklist } = await loadAssetChecklist(assetId);
      const items = (checklist.items || []).map((item) => ({ id: item.id, name: String(item.name || ''), guidance: String(item.guidance || '') }));
      activeContext = { asset, items };
      byId('inspection-equipment-meta').textContent = `${asset.name} · ${asset.assetCode} · ${asset.location}`;
      const form = byId('inspection-form');
      form.reset();
      byId('inspection-date').value = localToday();
      byId('inspection-submit').disabled = false;
      byId('inspection-submit').textContent = '점검 기록 저장';
      showInspectionMessage('');
      renderInspectionItems(items);
      inspectionPanel.hidden = false;
      window.dispatchEvent(new CustomEvent('smart-maintenance:inspection-started', {detail:{equipmentId:asset.id}}));
      inspectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('click', async (event) => {
    const startButton = event.target.closest('[data-inspection-start]');
    if (startButton) {
      try { await beginInspection(startButton.dataset.inspectionStart, startButton); }
      catch (error) {
        showInspectionMessage(error instanceof Error ? error.message : '점검을 시작하지 못했습니다.', true);
        inspectionPanel.hidden = false;
      }
      return;
    }
    const archivedHistoryButton = event.target.closest('[data-history-equipment]');
    if (archivedHistoryButton) {
      const assetId = archivedHistoryButton.dataset.historyEquipment;
      document.querySelector('[data-view="history"]')?.click();
      historyEquipmentId = assetId;
      expandedRecordId = null;
      await renderHistory();
    }
  });

  function isValidDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function overallResult(items) {
    return items.reduce((highest, item) => PRIORITY[item.result] > PRIORITY[highest] ? item.result : highest, 'normal');
  }

  async function saveRecord(record) {
    const tx = db.transaction(['equipment', 'inspectionRecords', 'faults'], 'readwrite');
    const finished = transactionDone(tx);
    let failure;
    const assetReq = tx.objectStore('equipment').get(record.equipmentId);
    const faultsReq = tx.objectStore('faults').getAll();
    let assetReady = false, faultsReady = false, asset, faults;
    const process = () => {
      if (!assetReady || !faultsReady) return;
      if (!asset || asset.status === 'archived') { failure = Error('활성 설비를 찾을 수 없습니다.'); tx.abort(); return; }
      try {
        const outcome = window.SmartMaintenanceFaultModel.resolveInspection(record, faults);
        tx.objectStore('inspectionRecords').add(record);
        if (outcome.action === 'add') tx.objectStore('faults').add(outcome.fault);
        if (outcome.action === 'put') tx.objectStore('faults').put(outcome.fault);
      } catch (e) { failure = e; tx.abort(); }
    };
    assetReq.onsuccess = () => { asset=assetReq.result; assetReady=true; process(); };
    faultsReq.onsuccess = () => { faults=faultsReq.result; faultsReady=true; process(); };
    assetReq.onerror = faultsReq.onerror = () => tx.abort();
    try { await finished; } catch (error) { throw failure || error; }
    window.dispatchEvent(new CustomEvent('smart-maintenance:faults-updated'));
  }

  function recordCautionOptIn(id) { return Boolean(document.querySelector(`#${id} [data-fault-caution]`)?.checked); }
  function faultSelection(id) { return document.querySelector(`#${id} [data-fault-link]`)?.value || ''; }

  async function submitInspection(event) {
    event.preventDefault();
    if (saving) return;
    if (!activeContext || activeContext.asset.status === 'archived') {
      showInspectionMessage('활성 설비를 선택한 뒤 점검을 시작하세요.', true);
      return;
    }
    const date = byId('inspection-date').value;
    const inspector = byId('inspection-inspector').value.trim();
    if (!isValidDateOnly(date)) { showInspectionMessage('올바른 점검일을 입력하세요.', true); byId('inspection-date').focus(); return; }
    if (!inspector || inspector.length > 100) { showInspectionMessage('점검자를 입력하세요. (최대 100자)', true); byId('inspection-inspector').focus(); return; }
    const itemResults = activeContext.items.map((item, index) => ({
      itemId: item.id,
      name: item.name,
      guidance: item.guidance,
      result: byId('inspection-form').querySelector(`input[name="result-${index}"]:checked`)?.value || ''
    }));
    if (!itemResults.length || itemResults.some((item) => !Object.hasOwn(RESULT_LABELS, item.result))) {
      showInspectionMessage('점검을 완료하려면 모든 항목을 정상·주의·고장 중 하나로 판정하세요.', true);
      return;
    }
    const memo = byId('inspection-memo').value.trim();
    const actions = byId('inspection-actions').value.trim();
    if (memo.length > 2000 || actions.length > 2000) { showInspectionMessage('메모와 조치 내용은 각각 2,000자 이내로 입력하세요.', true); return; }

    const record = {
      id: createId(),
      equipmentId: activeContext.asset.id,
      equipmentName: activeContext.asset.name,
      assetCode: activeContext.asset.assetCode,
      equipmentTypeId: activeContext.asset.typeId,
      inspectedAt: date,
      inspector,
      memo,
      actions,
      overallResult: overallResult(itemResults),
      checklistItems: itemResults,
      cautionFaultRequested: recordCautionOptIn('inspection-form'),
      faultLinkId: faultSelection('inspection-form'),
      createdAt: new Date().toISOString()
    };
    saving = true;
    const submit = byId('inspection-submit');
    submit.disabled = true;
    submit.textContent = '저장 중...';
    showInspectionMessage('점검 기록을 저장하고 있습니다.');
    try {
      await saveRecord(record);
      submit.textContent = '저장 완료';
      showInspectionMessage(record.linkedFaultId ? '점검 기록과 고장 관리 기록을 저장했습니다. 고장 관리 메뉴에서 확인하세요.' : '점검 기록을 저장했습니다. 점검 이력에서 확인할 수 있습니다.');
      expandedRecordId = null;
      await renderHistory();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = '점검 기록 저장';
      showInspectionMessage(error instanceof Error ? error.message : '점검 기록을 저장하지 못했습니다.', true);
    } finally {
      saving = false;
    }
  }

  function resultLabel(value) { return RESULT_LABELS[value] || '알 수 없음'; }
  function resultPill(value) { return makeElement('span', `pill result-${value}`, resultLabel(value)); }

  function localDateLabel(value) {
    if (!isValidDateOnly(String(value || ''))) return value || '날짜 없음';
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(year, month - 1, day));
  }

  function setHistoryLoading(text, isError = false) {
    const target = byId('history-table-body');
    if (!target) return;
    target.replaceChildren();
    const row = document.createElement('tr');
    const cell = makeElement('td', 'empty-table-cell history-empty', text);
    cell.colSpan = 5;
    if (isError) cell.classList.add('is-error');
    row.append(cell); target.append(row);
  }

  function buildHistoryPanel() {
    historyView.replaceChildren();
    const panel = makeElement('section', 'panel table-panel history-record-panel');
    const heading = makeElement('div', 'panel-heading history-heading');
    const copy = document.createElement('div');
    copy.append(makeElement('p', 'eyebrow', 'INSPECTION RECORDS'));
    copy.append(makeElement('h2', '', '저장된 점검 이력'));
    const controls = makeElement('div', 'history-controls');
    const count = makeElement('span', 'subtle-label', '불러오는 중...'); count.id = 'history-record-count';
    const clearFilter = makeElement('button', 'history-filter-clear', '전체 이력');
    clearFilter.type = 'button'; clearFilter.id = 'history-filter-clear'; clearFilter.hidden = true;
    clearFilter.addEventListener('click', () => { historyEquipmentId = null; expandedRecordId = null; renderHistory(); });
    controls.append(count, clearFilter);
    heading.append(copy, controls);
    const tableWrap = makeElement('div', 'table-wrap');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['점검일', '설비', '종합 결과', '점검자', '상세']) headerRow.append(makeElement('th', '', label));
    thead.append(headerRow);
    const tbody = document.createElement('tbody'); tbody.id = 'history-table-body';
    table.append(thead, tbody); tableWrap.append(table);
    panel.append(heading, tableWrap);
    const note = makeElement('p', 'view-note', '점검 기록은 작성 당시의 설비 정보, 점검 항목명 및 판정 결과를 함께 보존합니다. 점검 주기 계산 및 알림 기능은 아직 포함되지 않습니다.');
    historyView.append(panel, note);
    setHistoryLoading('저장된 점검 이력을 불러오는 중...');
  }

  function appendRecordDetails(row, record) {
    const detailRow = document.createElement('tr'); detailRow.className = 'history-detail-row';
    const cell = document.createElement('td'); cell.colSpan = 5;
    const detail = makeElement('div', 'history-detail');
    const resultList = makeElement('ul', 'history-item-results');
    (Array.isArray(record.checklistItems) ? record.checklistItems : []).forEach((item) => {
      const result = makeElement('li', 'history-item-result');
      result.append(makeElement('span', 'history-item-name', item.name || '이름 없는 항목'), resultPill(item.result));
      if (item.guidance) result.append(makeElement('small', 'history-guidance', item.guidance));
      resultList.append(result);
    });
    detail.append(makeElement('h3', '', '점검 항목 판정'), resultList);
    const extras = makeElement('div', 'history-extra-fields');
    const memo = makeElement('section', 'history-extra');
    memo.append(makeElement('strong', '', '메모'), makeElement('p', '', record.memo || '기록 없음'));
    const actions = makeElement('section', 'history-extra');
    actions.append(makeElement('strong', '', '조치 내용'), makeElement('p', '', record.actions || '기록 없음'));
    extras.append(memo, actions); detail.append(extras);
    detail.append(makeElement('p', 'history-created-at', `기록 저장 시각: ${record.createdAt ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.createdAt)) : '정보 없음'}`));
    cell.append(detail); detailRow.append(cell); row.after(detailRow);
  }

  async function renderHistory() {
    if (!db || !byId('history-table-body')) return;
    setHistoryLoading('저장된 점검 이력을 불러오는 중...');
    const count = byId('history-record-count');
    const clearFilter = byId('history-filter-clear');
    if (clearFilter) clearFilter.hidden = !historyEquipmentId;
    try {
      const transaction = db.transaction(['inspectionRecords'], 'readonly');
      const finished = transactionDone(transaction);
      const recordsPromise = requestValue(transaction.objectStore('inspectionRecords').getAll());
      const [allRecords] = await Promise.all([recordsPromise, finished]);
      const records = allRecords.filter((record) => !historyEquipmentId || record.equipmentId === historyEquipmentId);
      records.sort((a, b) => String(b.inspectedAt || '').localeCompare(String(a.inspectedAt || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      if (count) count.textContent = historyEquipmentId ? `${records.length}건 · 선택 설비` : `${records.length}건`;
      const tbody = byId('history-table-body'); tbody.replaceChildren();
      if (!records.length) {
        const row = document.createElement('tr');
        const cell = makeElement('td', 'empty-table-cell history-empty', '저장된 점검 기록이 없습니다.'); cell.colSpan = 5;
        row.append(cell); tbody.append(row); return;
      }
      for (const record of records) {
        const row = document.createElement('tr');
        row.append(makeElement('td', '', localDateLabel(record.inspectedAt)));
        const asset = makeElement('td', 'primary-cell', record.equipmentName || record.assetCode || '알 수 없는 설비');
        if (record.assetCode) asset.append(makeElement('small', 'history-asset-code', record.assetCode));
        const resultCell = document.createElement('td'); resultCell.append(resultPill(record.overallResult));
        row.append(asset, resultCell, makeElement('td', '', record.inspector || '기록 없음'));
        const detailCell = document.createElement('td');
        const detailButton = makeElement('button', 'history-detail-button', expandedRecordId === record.id ? '상세 닫기' : '상세 보기');
        detailButton.type = 'button'; detailButton.dataset.recordDetail = record.id;
        detailCell.append(detailButton); row.append(detailCell); tbody.append(row);
        if (expandedRecordId === record.id) appendRecordDetails(row, record);
      }
    } catch (error) {
      if (count) count.textContent = '불러오기 실패';
      setHistoryLoading(error instanceof Error ? `이력을 불러오지 못했습니다: ${error.message}` : '점검 이력을 불러오지 못했습니다.', true);
    }
  }

  buildHistoryPanel();
  historyView.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-record-detail]');
    if (!button) return;
    expandedRecordId = expandedRecordId === button.dataset.recordDetail ? null : button.dataset.recordDetail;
    await renderHistory();
  });
  for (const button of document.querySelectorAll('[data-view="history"]')) {
    button.addEventListener('click', () => {
      // Keep equipment scoping when revisiting; explicit '전체 이력' clears it.
      renderHistory();
    });
  }

  const banner = document.querySelector('.demo-banner');
  if (banner) banner.textContent = '대시보드·점검 일정은 화면 예시입니다. 설비와 점검 이력은 이 브라우저의 IndexedDB에 저장됩니다.';

  openDatabase()
    .then(() => renderHistory())
    .catch((error) => {
      setHistoryLoading(error instanceof Error ? `저장소를 열지 못했습니다: ${error.message}` : '저장소를 사용할 수 없습니다.', true);
    });

  // Plan-based inspections write the same inspectionRecords store, but they
  // do not submit this legacy form. Refresh its history after a plan completes
  // so the unified history (which watches this table) also updates promptly.
  window.addEventListener('smart-maintenance:plan-completed', () => {
    void renderHistory();
  });

  window.addEventListener('beforeunload', () => db?.close());
})();
