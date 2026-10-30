(() => {
  'use strict';

  const EQUIPMENT_DB = 'smart-maintenance';
  const DATABASE_VERSION = 2;
  const MAINTENANCE_STORE = 'maintenanceRecords';
  const TYPE_LABELS = { general: '일반', major: '주요', special: '특수정비' };
  let equipmentDb;
  let maintenanceDb;
  let selectedEquipment = null;
  let saving = false;

  const byId = (id) => document.getElementById(id);
  const equipmentList = byId('equipment-list');
  const archivedList = byId('archived-equipment-list');
  const equipmentPanel = document.querySelector('[data-panel="equipment"]');
  const historyPanel = document.querySelector('[data-panel="history"]');

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeId() {
    return globalThis.crypto?.randomUUID
      ? `maintenance-${crypto.randomUUID()}`
      : `maintenance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function localToday() {
    const now = new Date();
    const pad = (number) => String(number).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function isDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function openEquipmentDatabase() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
      const request = indexedDB.open(EQUIPMENT_DB, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('equipmentTypes')) db.createObjectStore('equipmentTypes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('checklists')) {
          const store = db.createObjectStore('checklists', { keyPath: 'id' });
          store.createIndex('typeId', 'typeId', { unique: false });
        }
        if (!db.objectStoreNames.contains('equipment')) {
          const store = db.createObjectStore('equipment', { keyPath: 'id' });
          store.createIndex('typeId', 'typeId', { unique: false });
        }
        if (!db.objectStoreNames.contains('plans')) {
          const store = db.createObjectStore('plans', { keyPath: 'id' });
          store.createIndex('equipmentId', 'equipmentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('inspectionRecords')) {
          const store = db.createObjectStore('inspectionRecords', { keyPath: 'id' });
          store.createIndex('equipmentId', 'equipmentId', { unique: false });
          store.createIndex('inspectedAt', 'inspectedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(MAINTENANCE_STORE)) {
          const store = db.createObjectStore(MAINTENANCE_STORE, { keyPath: 'id' });
          store.createIndex('equipmentId', 'equipmentId', { unique: false });
          store.createIndex('maintainedAt', 'maintainedAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        equipmentDb = request.result;
        equipmentDb.onversionchange = () => equipmentDb.close();
        resolve(equipmentDb);
      };
      request.onerror = () => reject(request.error || new Error('설비 저장소를 열지 못했습니다.'));
      request.onblocked = () => reject(new Error('설비 저장소가 다른 탭에서 사용 중입니다.'));
    });
  }

  function openMaintenanceDatabase() {
    return openEquipmentDatabase().then((db) => {
      maintenanceDb = db;
      return db;
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('데이터를 불러오지 못했습니다.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('저장 작업이 취소되었습니다.'));
      transaction.onerror = () => {};
    });
  }

  function setMessage(text, isError = false) {
    const message = byId('maintenance-message');
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('is-error', isError);
  }

  function buildMaintenancePanel() {
    const panel = element('section', 'panel maintenance-panel');
    panel.id = 'maintenance-panel';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'maintenance-heading');

    const heading = element('div', 'panel-heading maintenance-heading');
    const copy = document.createElement('div');
    copy.append(element('p', 'eyebrow', 'MAINTENANCE RECORD'));
    copy.append(element('h2', '', '정비 이력'));
    copy.lastChild.id = 'maintenance-heading';
    copy.append(element('p', 'maintenance-equipment-meta', ''));
    copy.lastChild.id = 'maintenance-equipment-meta';
    const close = element('button', 'secondary-button maintenance-close', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => { panel.hidden = true; selectedEquipment = null; });
    heading.append(copy, close);
    panel.append(heading);

    const form = document.createElement('form');
    form.id = 'maintenance-form';
    form.noValidate = true;
    const fields = element('div', 'maintenance-fields');
    fields.append(field('정비일 *', 'maintenance-date', 'date', true));
    const typeWrap = element('div', 'maintenance-field');
    const typeLabel = element('label', 'field-label', '정비 유형 *');
    typeLabel.htmlFor = 'maintenance-type';
    const type = document.createElement('select');
    type.id = 'maintenance-type'; type.name = 'maintenanceType'; type.required = true;
    type.append(new Option('정비 유형을 선택하세요', ''));
    for (const [value, label] of Object.entries(TYPE_LABELS)) type.add(new Option(label, value));
    typeWrap.append(typeLabel, type);
    fields.append(typeWrap);
    fields.append(field('작업자 *', 'maintenance-worker', 'text', true, '작업자 이름'));
    form.append(fields);

    const textFields = element('div', 'maintenance-text-fields');
    textFields.append(textareaField('고장 증상', 'maintenance-symptoms', '발생한 증상 또는 확인된 고장 내용을 입력하세요.'));
    textFields.append(textareaField('작업 내용 *', 'maintenance-work', '수행한 정비 작업과 조치 내용을 입력하세요.', true));
    textFields.append(textareaField('교체 부품', 'maintenance-parts', '교체한 부품명, 규격 또는 수량을 입력하세요.'));
    form.append(textFields);

    const footer = element('div', 'maintenance-form-footer');
    const message = element('p', 'form-message', '');
    message.id = 'maintenance-message';
    message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    const submit = element('button', 'primary-button', '정비 기록 저장');
    submit.type = 'submit'; submit.id = 'maintenance-submit';
    footer.append(message, submit);
    form.append(footer);
    form.addEventListener('submit', saveMaintenanceRecord);
    panel.append(form);

    const archivedNote = element('p', 'maintenance-archived-note', '보관 설비의 정비 이력은 조회 전용입니다.');
    archivedNote.id = 'maintenance-archived-note'; archivedNote.hidden = true;
    panel.append(archivedNote);

    const subheading = element('div', 'maintenance-list-heading');
    subheading.append(element('h3', '', '설비별 정비 이력'));
    const count = element('span', 'subtle-label', '0건'); count.id = 'maintenance-equipment-count';
    subheading.append(count);
    panel.append(subheading);
    const wrap = element('div', 'table-wrap');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['정비일', '정비 유형', '고장 증상', '작업 내용', '교체 부품', '작업자', '보존 구분']) headerRow.append(element('th', '', label));
    head.append(headerRow);
    const body = document.createElement('tbody'); body.id = 'maintenance-equipment-records';
    table.append(head, body); wrap.append(table); panel.append(wrap);
    panel.append(element('p', 'maintenance-retention-note', '주요·특수정비는 중요 기록 및 장기 보존 대상으로 구분합니다. 기록은 자동 삭제되지 않습니다.'));

    const checklist = byId('checklist-editor');
    const inspection = byId('inspection-panel');
    const anchor = inspection || checklist;
    if (anchor?.parentElement) anchor.parentElement.insertBefore(panel, anchor.nextSibling);
    else equipmentPanel?.append(panel);
    return panel;
  }

  function field(labelText, id, type, required, placeholder = '') {
    const wrap = element('div', 'maintenance-field');
    const label = element('label', 'field-label', labelText);
    label.htmlFor = id;
    const input = document.createElement('input');
    input.id = id; input.name = id.replace('maintenance-', ''); input.type = type;
    input.required = required; input.maxLength = 100;
    if (placeholder) input.placeholder = placeholder;
    wrap.append(label, input);
    return wrap;
  }

  function textareaField(labelText, id, placeholder, required = false) {
    const wrap = element('div', 'maintenance-field');
    const label = element('label', 'field-label', labelText);
    label.htmlFor = id;
    const input = document.createElement('textarea');
    input.id = id; input.name = id.replace('maintenance-', ''); input.maxLength = 2000;
    input.rows = 3; input.placeholder = placeholder; input.required = required;
    wrap.append(label, input);
    return wrap;
  }

  const maintenancePanel = buildMaintenancePanel();

  function addRowActionButtons(list, archived) {
    if (!list) return;
    for (const row of list.querySelectorAll('tr')) {
      const checklistButton = row.querySelector('[data-checklist-id]');
      const actionCell = row.lastElementChild;
      if (!checklistButton || !actionCell) continue;
      const attr = archived ? 'data-maintenance-history' : 'data-maintenance-start';
      if (actionCell.querySelector(`[${attr}]`)) continue;
      const button = element('button', 'maintenance-row-button', archived ? '정비 이력' : '정비 기록');
      button.type = 'button';
      button.setAttribute(archived ? 'data-maintenance-history' : 'data-maintenance-start', checklistButton.dataset.checklistId);
      button.setAttribute('aria-label', `${row.cells[0]?.textContent || '설비'} ${archived ? '정비 이력 조회' : '정비 기록 등록'}`);
      actionCell.append(button);
    }
  }

  const equipmentObserver = new MutationObserver(() => {
    addRowActionButtons(equipmentList, false);
    addRowActionButtons(archivedList, true);
  });
  if (equipmentList) equipmentObserver.observe(equipmentList, { childList: true, subtree: true });
  if (archivedList) equipmentObserver.observe(archivedList, { childList: true, subtree: true });
  addRowActionButtons(equipmentList, false);
  addRowActionButtons(archivedList, true);

  function dateLabel(value) {
    if (!isDateOnly(String(value || ''))) return String(value || '날짜 없음');
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(year, month - 1, day));
  }

  function importantBadge(record) {
    if (!record.important) return element('span', 'maintenance-retention-standard', '일반 보존');
    return element('span', 'maintenance-important-badge', '중요 · 장기 보존');
  }

  function renderEquipmentRecords(records) {
    const body = byId('maintenance-equipment-records');
    const count = byId('maintenance-equipment-count');
    body.replaceChildren();
    count.textContent = `${records.length}건`;
    if (!records.length) {
      const row = document.createElement('tr');
      const cell = element('td', 'empty-table-cell', '등록된 정비 기록이 없습니다.');
      cell.colSpan = 7; row.append(cell); body.append(row); return;
    }
    for (const record of records) {
      const row = document.createElement('tr');
      row.append(element('td', '', dateLabel(record.maintainedAt)));
      const type = element('td', '', TYPE_LABELS[record.maintenanceType] || '알 수 없음');
      if (record.important) type.append(element('span', 'maintenance-inline-important', '중요'));
      row.append(type,
        element('td', 'maintenance-long-cell', record.symptoms || '—'),
        element('td', 'maintenance-long-cell', record.workDescription || '—'),
        element('td', 'maintenance-long-cell', record.replacedParts || '—'),
        element('td', '', record.worker || '—'));
      const retention = document.createElement('td'); retention.append(importantBadge(record)); row.append(retention);
      body.append(row);
    }
  }

  async function loadRecords(equipmentId) {
    if (!maintenanceDb) return [];
    const transaction = maintenanceDb.transaction(MAINTENANCE_STORE, 'readonly');
    const finished = transactionDone(transaction);
    const store = transaction.objectStore(MAINTENANCE_STORE);
    const request = equipmentId
      ? store.index('equipmentId').getAll(equipmentId)
      : store.getAll();
    const [records] = await Promise.all([requestValue(request), finished]);
    return records.sort((a, b) => String(b.maintainedAt || '').localeCompare(String(a.maintainedAt || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async function showForEquipment(equipmentId, allowEntry) {
    if (!equipmentDb || !maintenanceDb) throw new Error('저장소를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
    const transaction = equipmentDb.transaction('equipment', 'readonly');
    const finished = transactionDone(transaction);
    const [asset] = await Promise.all([requestValue(transaction.objectStore('equipment').get(equipmentId)), finished]);
    if (!asset) throw new Error('설비를 찾을 수 없습니다. 설비 목록을 새로고침해 주세요.');
    selectedEquipment = asset;
    const archived = asset.status === 'archived';
    byId('maintenance-equipment-meta').textContent = `${asset.name} · ${asset.assetCode} · ${asset.location}${archived ? ' · 보관 설비' : ''}`;
    byId('maintenance-form').hidden = archived || !allowEntry;
    byId('maintenance-archived-note').hidden = !archived;
    byId('maintenance-form').reset();
    byId('maintenance-date').value = localToday();
    byId('maintenance-submit').disabled = false;
    byId('maintenance-submit').textContent = '정비 기록 저장';
    setMessage(archived ? '기존 기록 조회만 가능합니다. 보관 설비에는 신규 정비 기록을 등록할 수 없습니다.' : '');
    renderEquipmentRecords(await loadRecords(asset.id));
    maintenancePanel.hidden = false;
    maintenancePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function checkEquipmentStillActive(equipmentId) {
    const transaction = equipmentDb.transaction('equipment', 'readonly');
    const finished = transactionDone(transaction);
    const [asset] = await Promise.all([requestValue(transaction.objectStore('equipment').get(equipmentId)), finished]);
    if (!asset) throw new Error('설비를 찾을 수 없습니다. 기록을 저장하지 않았습니다.');
    if (asset.status === 'archived') throw new Error('보관된 설비에는 새 정비 기록을 등록할 수 없습니다.');
    return asset;
  }

  async function addRecord(record) {
    const transaction = maintenanceDb.transaction(MAINTENANCE_STORE, 'readwrite');
    const finished = transactionDone(transaction);
    transaction.objectStore(MAINTENANCE_STORE).add(record);
    await finished;
  }

  async function saveMaintenanceRecord(event) {
    event.preventDefault();
    if (saving) return;
    if (!selectedEquipment || selectedEquipment.status === 'archived') {
      setMessage('활성 설비에서만 새 정비 기록을 등록할 수 있습니다.', true);
      return;
    }
    const maintainedAt = byId('maintenance-date').value;
    const maintenanceType = byId('maintenance-type').value;
    const worker = byId('maintenance-worker').value.trim();
    const symptoms = byId('maintenance-symptoms').value.trim();
    const workDescription = byId('maintenance-work').value.trim();
    const replacedParts = byId('maintenance-parts').value.trim();
    if (!isDateOnly(maintainedAt)) { setMessage('올바른 정비일을 입력하세요.', true); byId('maintenance-date').focus(); return; }
    if (!Object.hasOwn(TYPE_LABELS, maintenanceType)) { setMessage('정비 유형을 선택하세요.', true); byId('maintenance-type').focus(); return; }
    if (!worker) { setMessage('작업자를 입력하세요.', true); byId('maintenance-worker').focus(); return; }
    if (!workDescription) { setMessage('작업 내용을 입력하세요.', true); byId('maintenance-work').focus(); return; }
    if (worker.length > 100 || symptoms.length > 2000 || workDescription.length > 2000 || replacedParts.length > 2000) {
      setMessage('작업자는 100자, 증상·작업 내용·교체 부품은 각각 2,000자 이내로 입력하세요.', true); return;
    }

    const important = maintenanceType === 'major' || maintenanceType === 'special';
    const now = new Date().toISOString();
    const record = {
      id: makeId(), equipmentId: selectedEquipment.id,
      equipmentName: selectedEquipment.name, assetCode: selectedEquipment.assetCode,
      maintenanceType, maintainedAt, symptoms, workDescription, replacedParts, worker,
      important, retentionClass: important ? 'long-term' : 'standard',
      createdAt: now, updatedAt: now
    };
    saving = true;
    const submit = byId('maintenance-submit');
    submit.disabled = true; submit.textContent = '저장 중...';
    setMessage('정비 기록을 저장하고 있습니다.');
    try {
      await checkEquipmentStillActive(record.equipmentId);
      await addRecord(record);
      submit.textContent = '저장 완료';
      setMessage('정비 기록을 저장했습니다. 중요 정비 기록은 장기 보존 대상으로 표시됩니다.');
      renderEquipmentRecords(await loadRecords(record.equipmentId));
      await renderGlobalHistory();
    } catch (error) {
      submit.disabled = false; submit.textContent = '정비 기록 저장';
      setMessage(error instanceof Error ? error.message : '정비 기록을 저장하지 못했습니다.', true);
    } finally {
      saving = false;
    }
  }

  function buildGlobalHistoryPanel() {
    const section = element('section', 'panel table-panel maintenance-global-panel');
    section.id = 'maintenance-global-panel';
    const heading = element('div', 'panel-heading');
    const copy = document.createElement('div');
    copy.append(element('p', 'eyebrow', 'MAINTENANCE RECORDS'));
    copy.append(element('h2', '', '정비 이력'));
    const count = element('span', 'subtle-label', '불러오는 중...'); count.id = 'maintenance-global-count';
    heading.append(copy, count); section.append(heading);
    const wrap = element('div', 'table-wrap');
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const row = document.createElement('tr');
    for (const label of ['정비일', '설비', '정비 유형', '고장 증상', '작업 내용', '교체 부품', '작업자', '보존 구분']) row.append(element('th', '', label));
    head.append(row);
    const body = document.createElement('tbody'); body.id = 'maintenance-global-records';
    table.append(head, body); wrap.append(table); section.append(wrap);
    section.append(element('p', 'maintenance-retention-note', '주요·특수정비 기록은 중요·장기 보존 대상으로 분류됩니다. 정비 기록은 자동으로 삭제되지 않습니다.'));
    return section;
  }

  function ensureGlobalHistoryPanel() {
    if (!historyPanel || byId('maintenance-global-panel')) return;
    historyPanel.append(buildGlobalHistoryPanel());
    renderGlobalHistory();
  }

  async function renderGlobalHistory() {
    const body = byId('maintenance-global-records');
    if (!body || !maintenanceDb) return;
    try {
      const records = await loadRecords(null);
      body.replaceChildren();
      byId('maintenance-global-count').textContent = `${records.length}건`;
      if (!records.length) {
        const row = document.createElement('tr');
        const cell = element('td', 'empty-table-cell', '저장된 정비 기록이 없습니다.');
        cell.colSpan = 8; row.append(cell); body.append(row); return;
      }
      for (const record of records) {
        const row = document.createElement('tr');
        row.append(element('td', '', dateLabel(record.maintainedAt)));
        row.append(element('td', 'primary-cell', `${record.equipmentName || '알 수 없는 설비'}${record.assetCode ? ` · ${record.assetCode}` : ''}`));
        const type = element('td', '', TYPE_LABELS[record.maintenanceType] || '알 수 없음');
        if (record.important) type.append(element('span', 'maintenance-inline-important', '중요'));
        row.append(type,
          element('td', 'maintenance-long-cell', record.symptoms || '—'),
          element('td', 'maintenance-long-cell', record.workDescription || '—'),
          element('td', 'maintenance-long-cell', record.replacedParts || '—'),
          element('td', '', record.worker || '—'));
        const retention = document.createElement('td'); retention.append(importantBadge(record)); row.append(retention);
        body.append(row);
      }
    } catch (error) {
      const row = document.createElement('tr');
      const cell = element('td', 'empty-table-cell', error instanceof Error ? `정비 이력을 불러오지 못했습니다: ${error.message}` : '정비 이력을 불러오지 못했습니다.');
      cell.colSpan = 8; row.append(cell); body.replaceChildren(row);
    }
  }

  const historyObserver = new MutationObserver(() => ensureGlobalHistoryPanel());
  if (historyPanel) historyObserver.observe(historyPanel, { childList: true });
  ensureGlobalHistoryPanel();

  document.addEventListener('click', async (event) => {
    const recordButton = event.target.closest('[data-maintenance-start]');
    const historyButton = event.target.closest('[data-maintenance-history]');
    const button = recordButton || historyButton;
    if (!button) return;
    button.disabled = true;
    try {
      await showForEquipment(button.getAttribute(recordButton ? 'data-maintenance-start' : 'data-maintenance-history'), Boolean(recordButton));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '정비 이력을 불러오지 못했습니다.', true);
      maintenancePanel.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  Promise.all([openEquipmentDatabase(), openMaintenanceDatabase()])
    .then(() => renderGlobalHistory())
    .catch((error) => {
      const message = error instanceof Error ? error.message : '정비 이력 저장소를 초기화하지 못했습니다.';
      setMessage(`저장소를 사용할 수 없습니다: ${message}`, true);
      const body = byId('maintenance-global-records');
      if (body) {
        const row = document.createElement('tr');
        const cell = element('td', 'empty-table-cell', message); cell.colSpan = 8;
        row.append(cell); body.replaceChildren(row);
      }
    });

  window.addEventListener('beforeunload', () => {
    equipmentDb?.close();
    maintenanceDb?.close();
  });
})();
