(() => {
  'use strict';

  const DB_NAME = 'smart-maintenance';
  const DB_VERSION = 2;
  const TYPE_LABELS = { general: '일반 정비', major: '주요정비', special: '특수정비' };
  const RESULT_LABELS = { normal: '정상', caution: '주의', failure: '고장' };
  const historyView = document.querySelector('[data-panel="history"]');
  if (!historyView || !globalThis.indexedDB) return;

  let db;
  let records = [];
  let equipmentRows = [];
  let expandedKey = null;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function buildHistoryView() {
    // maintenance.js가 감시하는 루트 ID를 유지해 중복 정비 이력 패널 생성을 막습니다.
    let panel = document.getElementById('maintenance-global-panel');
    if (!panel) panel = make('section', 'panel table-panel unified-history-panel');
    panel.replaceChildren();
    panel.classList.add('unified-history-panel');

    const heading = make('div', 'panel-heading unified-history-heading');
    const title = document.createElement('div');
    title.append(make('p', 'eyebrow', 'MAINTENANCE HISTORY'));
    title.append(make('h2', '', '점검·정비 통합 이력'));
    const count = make('span', 'subtle-label', '불러오는 중...');
    count.id = 'unified-history-count';
    heading.append(title, count);
    panel.append(heading);

    const filters = make('div', 'unified-history-filters');
    filters.append(selectField('설비', 'unified-filter-equipment', [['', '전체 설비']]));
    filters.append(selectField('기록 유형', 'unified-filter-type', [
      ['', '전체 유형'], ['inspection', '점검'], ['maintenance', '독립 정비 기록'], ['repair', '고장별 정비 작업']
    ]));
    filters.append(dateField('시작일', 'unified-filter-from'));
    filters.append(dateField('종료일', 'unified-filter-to'));
    const clear = make('button', 'secondary-button unified-filter-reset', '필터 초기화');
    clear.type = 'button';
    clear.id = 'unified-filter-reset';
    filters.append(clear);
    panel.append(filters);

    const message = make('p', 'unified-history-message', '');
    message.id = 'unified-history-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    panel.append(message);

    const wrap = make('div', 'table-wrap');
    const table = document.createElement('table');
    table.className = 'unified-history-table';
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['날짜', '설비', '기록 유형', '결과 / 정비 유형', '작성자 / 작업자', '상세']) {
      headerRow.append(make('th', '', label));
    }
    head.append(headerRow);
    const body = document.createElement('tbody');
    body.id = 'unified-history-records';
    table.append(head, body);
    wrap.append(table);
    panel.append(wrap);
    panel.append(make('p', 'view-note unified-history-note', '보관 설비의 과거 기록도 포함됩니다. 주요·특수정비는 중요 기록으로 표시하며, 이 화면은 기록을 조회할 뿐 기존 데이터를 삭제하거나 정리하지 않습니다.'));

    // 기존 화면 모듈의 저장 완료 후 갱신 호출을 받아 통합 목록도 최신화할 숨김 호환 요소입니다.
    // IndexedDB의 저장 구조나 기록에는 변경을 가하지 않습니다.
    const legacy = make('div', 'unified-history-legacy-hooks');
    legacy.setAttribute('aria-hidden', 'true');
    const inspectionCount = make('span', '', ''); inspectionCount.id = 'history-record-count';
    const clearButton = make('button', '', ''); clearButton.type = 'button'; clearButton.id = 'history-filter-clear'; clearButton.hidden = true;
    const inspectionTable = document.createElement('table');
    const inspectionBody = document.createElement('tbody'); inspectionBody.id = 'history-table-body';
    inspectionTable.append(inspectionBody);
    const maintenanceCount = make('span', '', '0건'); maintenanceCount.id = 'maintenance-global-count';
    const maintenanceTable = document.createElement('table');
    const maintenanceBody = document.createElement('tbody'); maintenanceBody.id = 'maintenance-global-records';
    maintenanceTable.append(maintenanceBody);
    legacy.append(inspectionCount, clearButton, inspectionTable, maintenanceCount, maintenanceTable);
    panel.append(legacy);

    historyView.replaceChildren(panel);
    return { panel, body, count, message };
  }

  function selectField(labelText, id, options) {
    const wrap = make('label', 'unified-filter-field');
    wrap.append(make('span', '', labelText));
    const select = document.createElement('select');
    select.id = id;
    for (const [value, label] of options) select.add(new Option(label, value));
    wrap.append(select);
    return wrap;
  }

  function dateField(labelText, id) {
    const wrap = make('label', 'unified-filter-field');
    wrap.append(make('span', '', labelText));
    const input = document.createElement('input');
    input.type = 'date';
    input.id = id;
    wrap.append(input);
    return wrap;
  }

  const elements = buildHistoryView();
  const equipmentFilter = document.getElementById('unified-filter-equipment');
  const typeFilter = document.getElementById('unified-filter-type');
  const fromFilter = document.getElementById('unified-filter-from');
  const toFilter = document.getElementById('unified-filter-to');

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => {
        db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('저장소를 열지 못했습니다.'));
      request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용 중입니다. 다른 탭을 닫고 다시 시도해 주세요.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('이력 조회 작업이 취소되었습니다.'));
      transaction.onerror = () => {};
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('이력을 읽지 못했습니다.'));
    });
  }

  async function loadData() {
    if (!db) return;
    const transaction = db.transaction(['inspectionRecords', 'maintenanceRecords', 'equipment', 'faults'], 'readonly');
    const finished = transactionDone(transaction);
    const inspectionRequest = requestResult(transaction.objectStore('inspectionRecords').getAll());
    const maintenanceRequest = requestResult(transaction.objectStore('maintenanceRecords').getAll());
    const equipmentRequest = requestResult(transaction.objectStore('equipment').getAll());
    const faultsRequest = requestResult(transaction.objectStore('faults').getAll());
    const [inspections, maintenance, equipment, faults] = await Promise.all([
      inspectionRequest, maintenanceRequest, equipmentRequest, faultsRequest, finished
    ]).then((values) => values.slice(0, 4));

    records = [
      ...inspections.map((record) => ({ kind: 'inspection', record, key: `inspection:${record.id}` })),
      ...maintenance.map((record) => ({ kind: 'maintenance', record, key: `maintenance:${record.id}` })),
      ...faults.flatMap(fault => (fault.history || []).filter(event => String(event.type||'').startsWith('repair-')).map((event, index) => ({
        kind:'repair', key:`repair:${fault.id}:${event.at}:${index}`,
        record:{id:`${fault.id}:${index}`,faultId:fault.id,equipmentId:fault.equipmentId,equipmentName:fault.equipmentName,
          assetCode:fault.assetCode,occurredOn:String(event.at||'').slice(0,10),createdAt:event.at,actor:event.actor,
          type:event.type,note:event.note,taskId:event.taskId,taskTitle:event.taskTitle,participant:event.participant,
          before:event.before,after:event.after,reviewDate:event.reviewDate}
      })))
    ];
    records.sort((a, b) => recordDate(b).localeCompare(recordDate(a)) ||
      String(b.record.createdAt || '').localeCompare(String(a.record.createdAt || '')));
    equipmentRows = equipment;
    populateEquipmentFilter();
    render();
  }

  function recordDate(entry) {
    return String(entry.kind === 'inspection' ? entry.record.inspectedAt || '' : entry.kind==='repair' ? entry.record.occurredOn || '' : entry.record.maintainedAt || '');
  }

  function populateEquipmentFilter() {
    const selected = equipmentFilter.value;
    const equipmentById = new Map(equipmentRows.map((asset) => [asset.id, asset]));
    for (const entry of records) {
      const record = entry.record;
      if (record.equipmentId && !equipmentById.has(record.equipmentId)) {
        equipmentById.set(record.equipmentId, {
          id: record.equipmentId,
          name: record.equipmentName || record.assetCode || '이름 없는 설비',
          assetCode: record.assetCode || '',
          status: 'unknown'
        });
      }
    }
    const sorted = [...equipmentById.values()].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ko') || String(a.assetCode || '').localeCompare(String(b.assetCode || '')));
    equipmentFilter.replaceChildren(new Option('전체 설비', ''));
    for (const asset of sorted) {
      const archived = asset.status === 'archived' ? ' · 보관' : '';
      const code = asset.assetCode ? ` (${asset.assetCode})` : '';
      equipmentFilter.add(new Option(`${asset.name || '이름 없는 설비'}${code}${archived}`, asset.id));
    }
    if ([...equipmentFilter.options].some((option) => option.value === selected)) equipmentFilter.value = selected;
  }

  function isImportant(record) {
    return record.important === true || record.maintenanceType === 'major' || record.maintenanceType === 'special';
  }

  function formatDate(value) {
    const dateText = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText || '날짜 없음';
    const [year, month, day] = dateText.split('-').map(Number);
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(year, month - 1, day));
  }

  function matchesFilters(entry) {
    const record = entry.record;
    const date = recordDate(entry);
    if (equipmentFilter.value && record.equipmentId !== equipmentFilter.value) return false;
    if (typeFilter.value && entry.kind !== typeFilter.value) return false;
    if (fromFilter.value && (!date || date < fromFilter.value)) return false;
    if (toFilter.value && (!date || date > toFilter.value)) return false;
    return true;
  }

  function resultPill(result) {
    const known = Object.hasOwn(RESULT_LABELS, result);
    const className = known ? `unified-result unified-result-${result}` : 'unified-result';
    return make('span', className, RESULT_LABELS[result] || '결과 없음');
  }

  function appendDetails(row, entry) {
    const record = entry.record;
    const detailRow = document.createElement('tr');
    detailRow.className = 'unified-history-detail-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    const detail = make('div', 'unified-history-detail');

    if (entry.kind === 'inspection') {
      detail.append(make('h3', '', '점검 당시 항목 및 판정'));
      const list = make('ul', 'unified-detail-list');
      for (const item of Array.isArray(record.checklistItems) ? record.checklistItems : []) {
        const li = make('li', 'unified-detail-item');
        li.append(make('span', 'unified-detail-name', item.name || '이름 없는 항목'), resultPill(item.result));
        if (item.guidance) li.append(make('small', 'unified-detail-guidance', item.guidance));
        list.append(li);
      }
      if (!list.childElementCount) list.append(make('li', 'unified-detail-empty', '저장된 항목별 판정이 없습니다.'));
      detail.append(list);
      const extras = make('div', 'unified-detail-extras');
      extras.append(detailField('점검자', record.inspector), detailField('메모', record.memo), detailField('조치 내용', record.actions));
      detail.append(extras);
      globalThis.SmartMaintenanceCorrections?.mount(detail,record);
    } else if(entry.kind==='repair') {
      detail.append(make('h3','','고장별 정비 작업 변경 이력'));
      const extras=make('div','unified-detail-extras');
      extras.append(detailField('고장 ID',record.faultId),detailField('작업',record.taskTitle||record.taskId),
        detailField('참여자',record.participant),detailField('처리 유형',record.type),detailField('처리자',record.actor),
        detailField('처리·변경 사유',record.note),detailField('기존 정보',record.before ? JSON.stringify(record.before) : ''),
        detailField('새 정보',record.after ? JSON.stringify(record.after) : ''),detailField('다음 확인일',record.reviewDate));
      detail.append(extras);
    } else {
      detail.append(make('h3', '', '정비 상세 내용'));
      const extras = make('div', 'unified-detail-extras');
      extras.append(
        detailField('정비 유형', TYPE_LABELS[record.maintenanceType] || '알 수 없음'),
        detailField('작업자', record.worker),
        detailField('고장 증상', record.symptoms),
        detailField('작업 내용', record.workDescription),
        detailField('교체 부품', record.replacedParts)
      );
      detail.append(extras);
      if (isImportant(record)) detail.append(make('p', 'unified-important-note', '중요 기록 · 주요정비 또는 특수정비로 분류된 이력입니다.'));
    }

    const storedAt = record.createdAt ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.createdAt)) : '정보 없음';
    detail.append(make('p', 'unified-created-at', `기록 저장 시각: ${storedAt}`));
    cell.append(detail);
    detailRow.append(cell);
    row.after(detailRow);
  }

  function detailField(label, value) {
    const section = make('section', 'unified-detail-field');
    section.append(make('strong', '', label));
    section.append(make('p', '', value ? String(value) : '기록 없음'));
    return section;
  }

  function render() {
    const { body, count, message } = elements;
    const fromDate = fromFilter.value;
    const toDate = toFilter.value;
    body.replaceChildren();
    message.textContent = '';
    if (fromDate && toDate && fromDate > toDate) {
      count.textContent = '기간 확인 필요';
      message.textContent = '시작일은 종료일보다 늦을 수 없습니다.';
      return;
    }

    const filtered = records.filter(matchesFilters);
    count.textContent = `${filtered.length}건`;
    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = make('td', 'empty-table-cell', '조건에 맞는 점검·정비 이력이 없습니다.');
      cell.colSpan = 6;
      row.append(cell);
      body.append(row);
      return;
    }

    const assets = new Map(equipmentRows.map((asset) => [asset.id, asset]));
    for (const entry of filtered) {
      const record = entry.record;
      const row = document.createElement('tr');
      row.className = entry.kind === 'maintenance' && isImportant(record) ? 'unified-important-row' : '';
      row.append(make('td', '', formatDate(recordDate(entry))));

      const currentAsset = assets.get(record.equipmentId);
      const name = record.equipmentName || currentAsset?.name || record.assetCode || '이름 없는 설비';
      const assetCell = make('td', 'primary-cell unified-asset-cell', name);
      if (record.assetCode) assetCell.append(make('small', 'unified-asset-code', record.assetCode));
      if (currentAsset?.status === 'archived') assetCell.append(make('span', 'unified-archived-badge', '보관 설비'));
      row.append(assetCell);

      row.append(make('td', '', entry.kind === 'inspection' ? '점검' : entry.kind==='repair' ? '고장별 정비 작업' : '정비'));
      const typeCell = document.createElement('td');
      if (entry.kind === 'inspection') {
        typeCell.append(resultPill(record.overallResult));
      } else if (entry.kind==='repair') {
        typeCell.append(make('span','unified-maintenance-type',record.type||'작업 상태 변경'));
      } else {
        typeCell.append(make('span', 'unified-maintenance-type', TYPE_LABELS[record.maintenanceType] || '알 수 없음'));
        if (isImportant(record)) typeCell.append(make('span', 'unified-important-badge', '중요 기록'));
      }
      row.append(typeCell);
      row.append(make('td', '', entry.kind === 'inspection' ? record.inspector || '기록 없음' : entry.kind === 'repair' ? record.actor || '기록 없음' : record.worker || '기록 없음'));

      const detailCell = document.createElement('td');
      const button = make('button', 'unified-detail-button', expandedKey === entry.key ? '상세 닫기' : '상세 보기');
      button.type = 'button';
      button.dataset.unifiedDetail = entry.key;
      detailCell.append(button);
      if (entry.kind === 'inspection' || entry.kind === 'maintenance') {
        const photoButton = make('button', 'secondary-button photo-context-button', '사진 추가');
        photoButton.type = 'button';
        photoButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('smart-maintenance:open-photo', {
          detail: { recordType: entry.kind, recordId: record.id }
        })));
        detailCell.append(photoButton);
      }
      row.append(detailCell);
      body.append(row);
      if (expandedKey === entry.key) appendDetails(row, entry);
    }
  }

  function setEquipmentFilter(assetId) {
    if ([...equipmentFilter.options].some((option) => option.value === assetId)) {
      equipmentFilter.value = assetId;
    }
    expandedKey = null;
    render();
  }

  for (const control of [equipmentFilter, typeFilter, fromFilter, toFilter]) {
    control.addEventListener('change', () => { expandedKey = null; render(); });
  }
  document.getElementById('unified-filter-reset').addEventListener('click', () => {
    equipmentFilter.value = '';
    typeFilter.value = '';
    fromFilter.value = '';
    toFilter.value = '';
    expandedKey = null;
    render();
  });
  historyView.addEventListener('click', (event) => {
    const button = event.target.closest('[data-unified-detail]');
    if (!button) return;
    expandedKey = expandedKey === button.dataset.unifiedDetail ? null : button.dataset.unifiedDetail;
    render();
  });

  document.addEventListener('click', (event) => {
    const archivedButton = event.target.closest('[data-history-equipment]');
    if (archivedButton) {
      const historyNav = document.querySelector('[data-view="history"]');
      if (historyNav) historyNav.click();
      setEquipmentFilter(archivedButton.dataset.historyEquipment);
      return;
    }
    const historyButton = event.target.closest('[data-view="history"]');
    if (historyButton) {
      equipmentFilter.value = '';
      typeFilter.value = '';
      fromFilter.value = '';
      toFilter.value = '';
      expandedKey = null;
      render();
    }
  });

  async function refresh() {
    try {
      await loadData();
    } catch (error) {
      elements.count.textContent = '불러오기 실패';
      elements.message.textContent = error instanceof Error ? `통합 이력을 불러오지 못했습니다: ${error.message}` : '통합 이력을 불러오지 못했습니다.';
    }
  }

  // 기존 점검/정비 모듈이 성공적으로 저장하면 숨김 호환 요소를 갱신합니다.
  // 그 변경만 감지해 IndexedDB를 다시 조회하며, 통합 화면은 해당 호환 요소를 수정하지 않습니다.
  const legacyMaintenanceCount = document.getElementById('maintenance-global-count');
  if (legacyMaintenanceCount) {
    new MutationObserver(() => refresh()).observe(legacyMaintenanceCount, { childList: true });
  }
  const legacyInspectionBody = document.getElementById('history-table-body');
  if (legacyInspectionBody) {
    new MutationObserver(() => refresh()).observe(legacyInspectionBody, { childList: true });
  }

  openDatabase().then(refresh).catch((error) => {
    elements.count.textContent = '저장소 오류';
    elements.message.textContent = error instanceof Error ? error.message : 'IndexedDB 저장소를 열지 못했습니다.';
  });

  window.addEventListener('smart-maintenance:faults-updated', () => {void refresh();});
  window.addEventListener('beforeunload', () => db?.close());
})();
