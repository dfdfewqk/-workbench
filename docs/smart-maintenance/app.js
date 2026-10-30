const viewInfo = {
  dashboard: { title: '오늘의 업무', subtitle: '기한이 지난 점검과 미해결 고장을 우선 확인하세요.' },
  plans: { title: '점검 계획 관리', subtitle: '설비별 점검 계획과 점검표를 설정합니다.' },
  equipment: { title: '설비 관리', subtitle: '설비 기본 정보와 설비별 점검표를 관리합니다.' },
  schedule: { title: '점검 일정', subtitle: '점검 예정 현황을 확인하는 화면입니다.' },
  history: { title: '점검 이력', subtitle: '과거 점검 및 정비 기록을 확인하는 화면입니다.' },
  faults: { title: '고장 관리', subtitle: '미해결 고장의 담당자·우선순위·운전 상태와 재확인 이력을 관리합니다.' },
  photos: { title: '사진 기록', subtitle: '점검·고장·정비 사진을 기록별로 관리합니다.' },
  backup: { title: '백업·복원', subtitle: '설비와 점검 데이터를 외부 파일로 안전하게 보관합니다.' }
};

const EQUIPMENT_TYPES = [
  { id: 'type-conveyor', name: '컨베이어' },
  { id: 'type-motor-gearbox', name: '모터·감속기' },
  { id: 'type-pump', name: '펌프' },
  { id: 'type-compressor', name: '공기압축기' },
  { id: 'type-hydraulic-pneumatic', name: '유압·공압 설비' },
  { id: 'type-industrial-robot', name: '산업용 로봇' }
];

// 참고용 기본 항목입니다. 실제 점검 기준·주기나 법정검사 기준을 의미하지 않습니다.
const DEFAULT_CHECKLISTS = {
  'type-conveyor': [
    ['벨트 마모·장력', '벨트의 마모, 손상 및 처짐 상태를 확인합니다.'],
    ['롤러·풀리 상태', '회전 상태와 손상·이물 부착 여부를 확인합니다.'],
    ['이상 소음·진동', '운전 중 평소와 다른 소음이나 진동이 있는지 확인합니다.'],
    ['안전장치·비상정지', '가드와 비상정지 장치의 외관 및 상태를 확인합니다.']
  ],
  'type-motor-gearbox': [
    ['모터·감속기 발열', '외함의 비정상적인 발열 흔적이 있는지 확인합니다.'],
    ['진동·운전 소음', '운전 중 진동과 평소와 다른 소음이 있는지 확인합니다.'],
    ['윤활·누유 상태', '누유 흔적과 윤활 상태를 확인합니다.'],
    ['체결·외관 상태', '고정 상태, 케이블 및 외관 손상 여부를 확인합니다.']
  ],
  'type-pump': [
    ['누수·누액 흔적', '펌프 본체와 연결부의 누수 흔적을 확인합니다.'],
    ['진동·이상 소음', '운전 중 진동과 평소와 다른 소음이 있는지 확인합니다.'],
    ['운전 상태', '압력·유량 등 운전 표시와 평소 상태를 비교합니다.'],
    ['배관·체결 상태', '연결부와 지지부의 풀림이나 손상 여부를 확인합니다.']
  ],
  'type-compressor': [
    ['압력 표시 상태', '압력계 표시와 운전 상태를 확인합니다.'],
    ['공기 누설 흔적', '배관·호스·연결부의 누설 징후를 확인합니다.'],
    ['필터·흡기부 상태', '필터와 흡기부의 오염·막힘 여부를 확인합니다.'],
    ['이상 소음·진동', '운전 중 평소와 다른 소음이나 진동이 있는지 확인합니다.']
  ],
  'type-hydraulic-pneumatic': [
    ['호스·배관 손상', '마모, 균열, 부풀음 및 연결 상태를 확인합니다.'],
    ['누유·누설 흔적', '유압유 또는 압축공기의 누설 징후를 확인합니다.'],
    ['작동 상태', '실린더와 밸브 등 작동부의 움직임이 평소와 같은지 확인합니다.'],
    ['압력 표시·연결부', '압력 표시와 피팅·체결부의 상태를 확인합니다.']
  ],
  'type-industrial-robot': [
    ['외관·케이블 상태', '로봇 본체, 케이블 및 연결부의 손상 여부를 확인합니다.'],
    ['이상 상태 표시', '제어기·표시부의 경고 또는 이상 표시를 확인합니다.'],
    ['안전장치·가드', '안전 펜스, 인터록 및 비상정지 장치의 상태를 확인합니다.'],
    ['작동 중 이상 소음', '운전 중 평소와 다른 소음이나 동작 이상이 있는지 확인합니다.']
  ]
};

const DATABASE_NAME = 'smart-maintenance';
const DATABASE_VERSION = 2;
const navButtons = [...document.querySelectorAll('[data-view]')];
const groupButtons = [...document.querySelectorAll('[data-group]')];
const routeGroups = Object.freeze({dashboard:'home',schedule:'inspection',plans:'inspection',history:'inspection',faults:'repairs',equipment:'admin',photos:'admin',backup:'admin'});
const groupLanding = Object.freeze({home:'dashboard',inspection:'schedule',repairs:'faults',admin:'equipment'});
const panels = [...document.querySelectorAll('[data-panel]')];
const title = document.querySelector('#page-title');
const subtitle = document.querySelector('#page-subtitle');
const equipmentForm = document.querySelector('#equipment-form');
const equipmentName = document.querySelector('#equipment-name');
const equipmentCode = document.querySelector('#equipment-code');
const equipmentSelect = document.querySelector('#equipment-type');
const equipmentLocation = document.querySelector('#equipment-location');
const equipmentList = document.querySelector('#equipment-list');
const archivedEquipmentList = document.querySelector('#archived-equipment-list');
const equipmentCount = document.querySelector('#equipment-count');
const activeEquipmentCount = document.querySelector('#active-equipment-count');
const archivedEquipmentCount = document.querySelector('#archived-equipment-count');
const equipmentMessage = document.querySelector('#equipment-message');
const equipmentSubmit = document.querySelector('#equipment-submit');
const equipmentCancelEdit = document.querySelector('#equipment-cancel-edit');
const equipmentFormTitle = document.querySelector('#equipment-form-title');
const checklistEditor = document.querySelector('#checklist-editor');
const checklistMeta = document.querySelector('#checklist-equipment-meta');
const checklistTargetNote = document.querySelector('#checklist-target-note');
const checklistForm = document.querySelector('#checklist-form');
const checklistItemName = document.querySelector('#checklist-item-name');
const checklistItemGuidance = document.querySelector('#checklist-item-guidance');
const checklistSubmit = document.querySelector('#checklist-submit');
const checklistCancelEdit = document.querySelector('#checklist-cancel-edit');
const checklistMessage = document.querySelector('#checklist-message');
const checklistItemsList = document.querySelector('#checklist-items');
const checklistItemCount = document.querySelector('#checklist-item-count');
let database;
let editingAsset = null;
let currentChecklistAsset = null;
let currentChecklist = null;
let editingChecklistItemId = null;
let equipmentCache = {active: [], archived: []};
const equipmentSearch = document.getElementById('equipment-search');
const equipmentTypeFilter = document.getElementById('equipment-type-filter');
const recordMatches = globalThis.SmartMaintenanceRecordSearch.matches;
if (equipmentTypeFilter) {
  for (const type of EQUIPMENT_TYPES) equipmentTypeFilter.add(new Option(type.name, type.id));
}
function renderFilteredEquipment() {
  const query = equipmentSearch?.value || '';
  const type = equipmentTypeFilter?.value || '';
  const filtered = rows => rows.filter(asset => (!type || asset.typeId === type) &&
    recordMatches([asset.name, asset.assetCode, asset.location, EQUIPMENT_TYPES.find(t => t.id === asset.typeId)?.name], query));
  const active = filtered(equipmentCache.active);
  const archived = filtered(equipmentCache.archived);
  equipmentCount.textContent = `${active.length}대 표시 / 전체 ${equipmentCache.active.length}대`;
  activeEquipmentCount.textContent = `${active.length}/${equipmentCache.active.length}대`;
  archivedEquipmentCount.textContent = `${archived.length}/${equipmentCache.archived.length}대`;
  const filtering = Boolean(query.trim() || type);
  renderEquipmentRows(equipmentList, active, 'active', filtering);
  renderEquipmentRows(archivedEquipmentList, archived, 'archived', filtering);
}
for (const input of [equipmentSearch, equipmentTypeFilter]) input?.addEventListener(input.type === 'search' ? 'input' : 'change', renderFilteredEquipment);
document.getElementById('equipment-search-reset')?.addEventListener('click', () => {
  equipmentSearch.value = ''; equipmentTypeFilter.value = ''; renderFilteredEquipment(); equipmentSearch.focus();
});

function showView(viewName) {
  const page = viewInfo[viewName];
  if (!page) return;
  if (document.getElementById('plan-execution-panel')?.hidden === false &&
      globalThis.SmartMaintenanceInspectionNavigation?.mayLeave?.() === false) return;
  const panelName = viewName === 'plans' ? 'equipment' : viewName;
  const activeGroup = routeGroups[viewName];
  title.textContent = page.title;
  subtitle.textContent = page.subtitle;
  for (const panel of panels) panel.hidden = panel.dataset.panel !== panelName;
  const equipmentPanel = document.querySelector('[data-panel="equipment"]');
  equipmentPanel?.classList.toggle('is-plan-management', viewName === 'plans');
  const planModeNote = equipmentPanel?.querySelector('.plan-mode-note');
  if (planModeNote) planModeNote.hidden = viewName !== 'plans';
  // The sidebar and mobile menus share real panels but expose work-focused routes.
  for (const button of groupButtons) {
    const active = button.dataset.group === activeGroup;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  // The plan inspection editor is an on-demand form outside the view panels.
  // Hide it on every navigation so it never leaks into other pages.
  const activePlanEditor = document.getElementById('plan-execution-panel');
  if (activePlanEditor) activePlanEditor.hidden = true;
  for (const button of navButtons) {
    button.hidden = button.dataset.navGroup !== activeGroup;
    const active = button.dataset.view === viewName;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  // Switching tabs should land at the heading rather than retaining deep scroll.
  window.scrollTo(0, 0);
}

for (const button of groupButtons) button.addEventListener('click', () => showView(groupLanding[button.dataset.group]));
for (const button of navButtons) button.addEventListener('click', () => showView(button.dataset.view));
for (const button of document.querySelectorAll('[data-go]')) button.addEventListener('click', () => showView(button.dataset.go));
// Keep brand navigation consistent with sidebar and mobile tabs.
document.querySelector('.brand')?.addEventListener('click', (event) => {
  event.preventDefault();
  showView('dashboard');
});
// Ensure the initial page has exactly one visible view (dashboard).
showView('dashboard');

for (const tab of document.querySelectorAll('[data-equipment-list]')) {
  tab.addEventListener('click', () => {
    const archived = tab.dataset.equipmentList === 'archived';
    for (const otherTab of document.querySelectorAll('[data-equipment-list]')) {
      const active = otherTab === tab;
      otherTab.classList.toggle('is-active', active);
      otherTab.setAttribute('aria-selected', String(active));
      otherTab.tabIndex = active ? 0 : -1;
    }
    document.querySelector('#active-equipment-view').hidden = archived;
    document.querySelector('#archived-equipment-view').hidden = !archived;
  });
}

function setEquipmentMessage(message, isError = false) {
  equipmentMessage.textContent = message;
  equipmentMessage.classList.toggle('is-error', isError);
}

function setChecklistMessage(message, isError = false) {
  checklistMessage.textContent = message;
  checklistMessage.classList.toggle('is-error', isError);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('데이터 요청에 실패했습니다.'));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('저장 작업이 취소되었습니다.'));
    transaction.onerror = () => reject(transaction.error || new Error('저장 작업에 실패했습니다.'));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다. 최신 브라우저에서 다시 열어 주세요.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
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
      if (!db.objectStoreNames.contains('maintenanceRecords')) {
        const store = db.createObjectStore('maintenanceRecords', { keyPath: 'id' });
        store.createIndex('equipmentId', 'equipmentId', { unique: false });
        store.createIndex('maintainedAt', 'maintainedAt', { unique: false });
      }
    };
    request.onsuccess = () => {
      const connection = request.result;
      database = connection;
      connection.onversionchange = () => {
        connection.close();
        if (database === connection) {
          database = null;
          equipmentSubmit.disabled = true;
          setEquipmentMessage('다른 탭에서 저장소 구조가 변경됐습니다. 입력 중인 내용을 확인하고 이 페이지를 새로고침해 주세요. 기존 기록은 삭제되지 않습니다.', true);
        }
      };
      resolve(connection);
    };
    request.onerror = () => reject(request.error || new Error('데이터베이스를 열지 못했습니다.'));
    request.onblocked = () => reject(new Error('다른 탭에서 저장소를 사용 중입니다. 해당 탭을 닫고 새로고침해 주세요.'));
  });
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function templateId(typeId) {
  return `template-${typeId}`;
}

function checklistId(equipmentId) {
  return `equipment-checklist-${equipmentId}`;
}

function ensureChecklistTemplates() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('checklists', 'readwrite');
    const store = transaction.objectStore('checklists');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('기본 점검표를 초기화하지 못했습니다.'));
    transaction.onerror = () => reject(transaction.error || new Error('기본 점검표를 초기화하지 못했습니다.'));
    for (const type of EQUIPMENT_TYPES) {
      const getRequest = store.get(templateId(type.id));
      getRequest.onsuccess = () => {
        if (getRequest.result) return;
        const items = (DEFAULT_CHECKLISTS[type.id] || []).map(([name, guidance], index) => ({
          id: `default-${type.id}-${index + 1}`,
          name,
          guidance,
          source: 'default'
        }));
        store.add({
          id: templateId(type.id), typeId: type.id, equipmentId: null, isTemplate: true,
          items, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
      };
      getRequest.onerror = () => transaction.abort();
    }
  });
}

function getActiveEquipment(rows) {
  return rows.filter((asset) => asset.status !== 'archived');
}

function loadEquipment() {
  const transaction = database.transaction('equipment', 'readonly');
  const completed = transactionResult(transaction);
  const rowsPromise = requestResult(transaction.objectStore('equipment').getAll());
  return Promise.all([rowsPromise, completed]).then(([rows]) => {
    rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const activeRows = getActiveEquipment(rows);
    const archivedRows = rows.filter((asset) => asset.status === 'archived');
    renderEquipment(activeRows, archivedRows);
  });
}

function renderEquipment(activeRows, archivedRows) {
  equipmentCache = {active: activeRows, archived: archivedRows};
  renderFilteredEquipment();
}

function formatArchivedDate(value) {
  if (!value) return '기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function renderEquipmentRows(listElement, rows, listType, filtering = false) {
  listElement.replaceChildren();
  if (rows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-table-cell';
    cell.textContent = filtering ? '검색 조건에 맞는 설비가 없습니다. 검색 초기화를 선택해 보세요.' : listType === 'archived'
      ? '보관된 설비가 없습니다.'
      : '등록된 설비가 없습니다. 왼쪽 양식에서 설비를 등록하세요.';
    row.append(cell);
    listElement.append(row);
    return;
  }

  const typeNames = new Map(EQUIPMENT_TYPES.map((type) => [type.id, type.name]));
  const fragment = document.createDocumentFragment();
  for (const asset of rows) {
    const row = document.createElement('tr');
    const cells = [
      [asset.name, 'primary-cell'],
      [asset.assetCode, ''],
      [typeNames.get(asset.typeId) || '알 수 없는 종류', ''],
      [listType === 'archived' ? formatArchivedDate(asset.archivedAt) : asset.location, '']
    ];
    for (const [value, className] of cells) {
      const cell = document.createElement('td');
      if (className) cell.className = className;
      cell.textContent = value;
      row.append(cell);
    }
    const actionCell = document.createElement('td');
    const checklistButton = document.createElement('button');
    checklistButton.type = 'button';
    checklistButton.className = 'checklist-open-button';
    checklistButton.dataset.checklistId = asset.id;
    checklistButton.textContent = listType === 'archived' ? '점검표 보기' : '점검표';
    checklistButton.setAttribute('aria-label', `${asset.name} 점검표 ${listType === 'archived' ? '보기' : '관리'}`);
    actionCell.append(checklistButton);

    if (listType === 'active') {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'edit-button';
      editButton.dataset.editId = asset.id;
      editButton.textContent = '수정';
      editButton.setAttribute('aria-label', `${asset.name} 설비 수정`);
      actionCell.append(editButton);
      const archiveButton = document.createElement('button');
      archiveButton.type = 'button';
      archiveButton.className = 'archive-button';
      archiveButton.dataset.archiveId = asset.id;
      archiveButton.textContent = '보관';
      archiveButton.setAttribute('aria-label', `${asset.name} 설비 보관 처리`);
      actionCell.append(archiveButton);
    } else {
      const restoreButton = document.createElement('button');
      restoreButton.type = 'button';
      restoreButton.className = 'restore-button';
      restoreButton.dataset.restoreId = asset.id;
      restoreButton.textContent = '복원';
      restoreButton.setAttribute('aria-label', `${asset.name} 설비 복원`);
      actionCell.append(restoreButton);
    }
    row.append(actionCell);
    fragment.append(row);
  }
  listElement.append(fragment);
}

function addEquipment(asset) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('equipment', 'readwrite');
    const store = transaction.objectStore('equipment');
    let duplicate = false;
    transaction.oncomplete = () => duplicate
      ? reject(new Error('이미 등록된 관리번호입니다. 다른 번호를 입력하세요.'))
      : resolve();
    transaction.onabort = () => duplicate
      ? reject(new Error('이미 등록된 관리번호입니다. 다른 번호를 입력하세요.'))
      : reject(transaction.error || new Error('설비를 저장하지 못했습니다.'));
    transaction.onerror = () => {};
    const getAllRequest = store.getAll();
    getAllRequest.onsuccess = () => {
      const normalizedCode = asset.assetCode.toLocaleLowerCase('ko-KR');
      duplicate = getAllRequest.result.some((existing) => typeof existing.assetCode === 'string' &&
        existing.assetCode.trim().toLocaleLowerCase('ko-KR') === normalizedCode);
      if (duplicate) transaction.abort();
      else store.add(asset);
    };
    getAllRequest.onerror = () => transaction.abort();
  });
}

function updateEquipment(assetId, changes) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('equipment', 'readwrite');
    const store = transaction.objectStore('equipment');
    let missing = false;
    transaction.oncomplete = () => missing
      ? reject(new Error('수정할 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'))
      : resolve();
    transaction.onabort = () => missing
      ? reject(new Error('수정할 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'))
      : reject(transaction.error || new Error('설비를 수정하지 못했습니다.'));
    transaction.onerror = () => {};
    const getRequest = store.get(assetId);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) { missing = true; transaction.abort(); return; }
      store.put({ ...existing, ...changes, assetCode: existing.assetCode, updatedAt: new Date().toISOString() });
    };
    getRequest.onerror = () => transaction.abort();
  });
}

function archiveEquipment(assetId) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('equipment', 'readwrite');
    const store = transaction.objectStore('equipment');
    let missing = false;
    let alreadyArchived = false;
    transaction.oncomplete = () => {
      if (missing) reject(new Error('보관 처리할 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'));
      else if (alreadyArchived) reject(new Error('이미 보관된 설비입니다.'));
      else resolve();
    };
    transaction.onabort = () => {
      if (missing) reject(new Error('보관 처리할 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'));
      else if (alreadyArchived) reject(new Error('이미 보관된 설비입니다.'));
      else reject(transaction.error || new Error('설비를 보관 처리하지 못했습니다.'));
    };
    transaction.onerror = () => {};
    const getRequest = store.get(assetId);
    getRequest.onsuccess = () => {
      const asset = getRequest.result;
      if (!asset) { missing = true; transaction.abort(); return; }
      if (asset.status === 'archived') { alreadyArchived = true; transaction.abort(); return; }
      const archivedAt = new Date().toISOString();
      store.put({ ...asset, status: 'archived', archivedAt, updatedAt: archivedAt });
    };
    getRequest.onerror = () => transaction.abort();
  });
}

function restoreEquipment(assetId) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('equipment', 'readwrite');
    const store = transaction.objectStore('equipment');
    let missing = false;
    let notArchived = false;
    transaction.oncomplete = () => {
      if (missing) reject(new Error('복원할 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'));
      else if (notArchived) reject(new Error('해당 설비는 보관 상태가 아닙니다.'));
      else resolve();
    };
    transaction.onabort = () => {
      if (missing) reject(new Error('복원할 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.'));
      else if (notArchived) reject(new Error('해당 설비는 보관 상태가 아닙니다.'));
      else reject(transaction.error || new Error('설비를 복원하지 못했습니다.'));
    };
    transaction.onerror = () => {};
    const getRequest = store.get(assetId);
    getRequest.onsuccess = () => {
      const asset = getRequest.result;
      if (!asset) { missing = true; transaction.abort(); return; }
      if (asset.status !== 'archived') { notArchived = true; transaction.abort(); return; }
      store.put({ ...asset, status: 'active', archivedAt: null, updatedAt: new Date().toISOString() });
    };
    getRequest.onerror = () => transaction.abort();
  });
}

function startEditing(asset) {
  editingAsset = asset;
  equipmentName.value = asset.name;
  equipmentCode.value = asset.assetCode;
  equipmentCode.disabled = true;
  equipmentSelect.value = asset.typeId;
  equipmentLocation.value = asset.location;
  equipmentFormTitle.textContent = '설비 수정';
  equipmentSubmit.textContent = '변경사항 저장';
  equipmentCancelEdit.hidden = false;
  setEquipmentMessage('관리번호는 수정할 수 없습니다.');
  equipmentName.focus();
}

function cancelEditing() {
  editingAsset = null;
  equipmentForm.reset();
  equipmentCode.disabled = false;
  equipmentFormTitle.textContent = '설비 등록';
  equipmentSubmit.textContent = '설비 등록';
  equipmentCancelEdit.hidden = true;
  setEquipmentMessage('');
}

function renderChecklist() {
  if (!currentChecklist || !currentChecklistAsset) return;
  const archived = currentChecklistAsset.status === 'archived';
  checklistMeta.textContent = `${currentChecklistAsset.name} · ${currentChecklistAsset.assetCode} · ${currentChecklistAsset.location}`;
  checklistTargetNote.textContent = archived
    ? '보관된 설비는 일반 점검 대상에서 제외됩니다. 점검표 데이터는 보존되며, 보관 중에는 읽기 전용으로 조회할 수 있습니다.'
    : '이 점검표는 해당 설비에만 적용됩니다. 같은 종류의 다른 설비 점검표에는 영향을 주지 않습니다.';
  checklistForm.hidden = archived;
  checklistItemsList.replaceChildren();
  checklistItemCount.textContent = `${currentChecklist.items.length}개`;

  if (currentChecklist.items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'checklist-empty';
    empty.textContent = '등록된 점검 항목이 없습니다. 위 양식에서 항목을 추가하세요.';
    checklistItemsList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  currentChecklist.items.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'checklist-item';
    const content = document.createElement('div');
    content.className = 'checklist-item-copy';
    const heading = document.createElement('strong');
    heading.textContent = `${index + 1}. ${item.name}`;
    content.append(heading);
    if (item.guidance) {
      const guidance = document.createElement('p');
      guidance.textContent = item.guidance;
      content.append(guidance);
    }
    if (item.source === 'default') {
      const source = document.createElement('span');
      source.className = 'checklist-source';
      source.textContent = '기본 참고 항목';
      content.append(source);
    }
    li.append(content);
    if (!archived) {
      const actions = document.createElement('div');
      actions.className = 'checklist-item-actions';
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'checklist-edit-button';
      edit.dataset.checklistEdit = item.id; edit.textContent = '수정';
      edit.setAttribute('aria-label', `${item.name} 점검 항목 수정`);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'checklist-delete-button';
      remove.dataset.checklistDelete = item.id; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${item.name} 점검 항목 삭제`);
      actions.append(edit, remove);
      li.append(actions);
    }
    fragment.append(li);
  });
  checklistItemsList.append(fragment);
}

function resetChecklistForm() {
  editingChecklistItemId = null;
  checklistForm.reset();
  checklistSubmit.textContent = '항목 추가';
  checklistCancelEdit.hidden = true;
  setChecklistMessage('');
}

function hideChecklistEditor() {
  checklistEditor.hidden = true;
  currentChecklistAsset = null;
  currentChecklist = null;
  resetChecklistForm();
}

function getOrCreateEquipmentChecklist(asset) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('checklists', 'readwrite');
    const store = transaction.objectStore('checklists');
    let result = null;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error('설비 점검표를 불러오지 못했습니다.'));
    transaction.onerror = () => reject(transaction.error || new Error('설비 점검표를 불러오지 못했습니다.'));

    const existingRequest = store.get(checklistId(asset.id));
    existingRequest.onsuccess = () => {
      if (existingRequest.result) {
        result = existingRequest.result;
        return;
      }
      const templateRequest = store.get(templateId(asset.typeId));
      templateRequest.onsuccess = () => {
        const template = templateRequest.result;
        const now = new Date().toISOString();
        const personalized = {
          id: checklistId(asset.id), typeId: asset.typeId, equipmentId: asset.id,
          isTemplate: false,
          items: (template?.items || []).map((item) => ({
            id: makeId('item'), name: item.name, guidance: item.guidance || '', source: item.source === 'default' ? 'default' : 'custom'
          })),
          createdAt: now, updatedAt: now
        };
        result = personalized;
        store.add(personalized);
      };
      templateRequest.onerror = () => transaction.abort();
    };
    existingRequest.onerror = () => transaction.abort();
  });
}

async function openChecklistForEquipment(assetId) {
  const transaction = database.transaction('equipment', 'readonly');
  const completed = transactionResult(transaction);
  const assetPromise = requestResult(transaction.objectStore('equipment').get(assetId));
  const [asset] = await Promise.all([assetPromise, completed]);
  if (!asset) throw new Error('설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.');
  const checklist = await getOrCreateEquipmentChecklist(asset);
  currentChecklistAsset = asset;
  currentChecklist = checklist;
  resetChecklistForm();
  renderChecklist();
  checklistEditor.hidden = false;
  checklistEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveChecklistItems(asset, items) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('checklists', 'readwrite');
    const store = transaction.objectStore('checklists');
    let missing = false;
    transaction.oncomplete = () => missing
      ? reject(new Error('점검표를 찾을 수 없습니다. 다시 열어 주세요.'))
      : resolve();
    transaction.onabort = () => missing
      ? reject(new Error('점검표를 찾을 수 없습니다. 다시 열어 주세요.'))
      : reject(transaction.error || new Error('점검표를 저장하지 못했습니다.'));
    transaction.onerror = () => {};
    const request = store.get(checklistId(asset.id));
    request.onsuccess = () => {
      const saved = request.result;
      if (!saved || saved.isTemplate) { missing = true; transaction.abort(); return; }
      store.put({ ...saved, typeId: asset.typeId, equipmentId: asset.id, items, updatedAt: new Date().toISOString() });
    };
    request.onerror = () => transaction.abort();
  });
}

async function handleChecklistAction(event) {
  const button = event.target.closest('[data-checklist-id]');
  if (!button || !database) return;
  button.disabled = true;
  try {
    await openChecklistForEquipment(button.dataset.checklistId);
  } catch (error) {
    setEquipmentMessage(error instanceof Error ? error.message : '점검표를 불러오지 못했습니다.', true);
  } finally {
    button.disabled = false;
  }
}

equipmentList.addEventListener('click', async (event) => {
  if (event.target.closest('[data-checklist-id]')) {
    await handleChecklistAction(event);
    return;
  }
  const archiveButton = event.target.closest('[data-archive-id]');
  if (archiveButton && database) {
    archiveButton.disabled = true;
    try {
      const transaction = database.transaction('equipment', 'readonly');
      const completed = transactionResult(transaction);
      const asset = await requestResult(transaction.objectStore('equipment').get(archiveButton.dataset.archiveId));
      await completed;
      if (!asset) { await loadEquipment(); setEquipmentMessage('해당 설비를 찾을 수 없습니다. 목록을 새로고침했습니다.', true); return; }
      if (!globalThis.confirm(`“${asset.name}” 설비를 보관 처리할까요? 설비 정보와 기록은 삭제되지 않습니다.`)) return;
      await archiveEquipment(asset.id);
      if (editingAsset?.id === asset.id) cancelEditing();
      if (currentChecklistAsset?.id === asset.id) hideChecklistEditor();
      await loadEquipment();
      setEquipmentMessage('설비를 보관 처리했습니다. 설비와 점검표, 기존 기록은 삭제되지 않았습니다.');
    } catch (error) {
      setEquipmentMessage(error instanceof Error ? error.message : '설비를 보관 처리하지 못했습니다.', true);
    } finally {
      archiveButton.disabled = false;
    }
    return;
  }

  const button = event.target.closest('[data-edit-id]');
  if (!button || !database) return;
  button.disabled = true;
  try {
    const transaction = database.transaction('equipment', 'readonly');
    const completed = transactionResult(transaction);
    const asset = await requestResult(transaction.objectStore('equipment').get(button.dataset.editId));
    await completed;
    if (!asset) { await loadEquipment(); setEquipmentMessage('해당 설비를 찾을 수 없습니다. 목록을 새로고침했습니다.', true); return; }
    if (asset.status === 'archived') { await loadEquipment(); setEquipmentMessage('보관된 설비는 일반 목록에서 수정할 수 없습니다.', true); return; }
    startEditing(asset);
  } catch (error) {
    setEquipmentMessage(error instanceof Error ? error.message : '설비 정보를 불러오지 못했습니다.', true);
  } finally {
    button.disabled = false;
  }
});

archivedEquipmentList.addEventListener('click', async (event) => {
  if (event.target.closest('[data-checklist-id]')) {
    await handleChecklistAction(event);
    return;
  }
  const button = event.target.closest('[data-restore-id]');
  if (!button || !database) return;
  button.disabled = true;
  try {
    await restoreEquipment(button.dataset.restoreId);
    await loadEquipment();
    setEquipmentMessage('설비를 복원했습니다. 일반 설비 목록과 향후 점검 대상에 포함됩니다.');
  } catch (error) {
    setEquipmentMessage(error instanceof Error ? error.message : '설비를 복원하지 못했습니다.', true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#checklist-close').addEventListener('click', hideChecklistEditor);
checklistCancelEdit.addEventListener('click', resetChecklistForm);

equipmentCancelEdit.addEventListener('click', cancelEditing);

equipmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setEquipmentMessage('');
  const form = new FormData(equipmentForm);
  const name = String(form.get('name') || '').trim();
  const assetCode = editingAsset?.assetCode || String(form.get('assetCode') || '').trim();
  const typeId = String(form.get('typeId') || '');
  const location = String(form.get('location') || '').trim();
  if (!name || !assetCode || !typeId || !location) {
    setEquipmentMessage('설비 이름, 관리번호, 종류, 위치를 모두 입력하거나 선택하세요.', true); return;
  }
  if (name.length > 100 || assetCode.length > 50 || location.length > 100) {
    setEquipmentMessage('설비 이름·위치는 100자, 관리번호는 50자 이내로 입력하세요.', true); return;
  }
  if (!EQUIPMENT_TYPES.some((type) => type.id === typeId)) {
    setEquipmentMessage('유효한 설비 종류를 선택하세요.', true); return;
  }
  equipmentSubmit.disabled = true;
  globalThis.SmartMaintenanceDataTools?.markSaving?.();
  try {
    if (editingAsset) {
      await updateEquipment(editingAsset.id, { name, typeId, location });
      cancelEditing();
      await loadEquipment();
      setEquipmentMessage('설비 정보를 수정하고 이 브라우저에 저장했습니다.');
    } else {
      const now = new Date().toISOString();
      await addEquipment({ id: makeId('equipment'), name, assetCode, typeId, location, status: 'active', createdAt: now, updatedAt: now });
      equipmentForm.reset();
      await loadEquipment();
      setEquipmentMessage('설비를 등록하고 이 브라우저에 저장했습니다.');
    }
    globalThis.SmartMaintenanceDataTools?.markSaved?.();
  } catch (error) {
    globalThis.SmartMaintenanceDataTools?.markError?.();
    setEquipmentMessage(error instanceof Error ? error.message : '설비를 저장하지 못했습니다. 다시 시도해 주세요.', true);
  } finally {
    equipmentSubmit.disabled = false;
  }
});

checklistForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setChecklistMessage('');
  if (!currentChecklistAsset || !currentChecklist || currentChecklistAsset.status === 'archived') {
    setChecklistMessage('활성 설비를 선택한 뒤 점검표를 수정하세요.', true); return;
  }
  const name = checklistItemName.value.trim();
  const guidance = checklistItemGuidance.value.trim();
  if (!name) { setChecklistMessage('점검 항목 이름을 입력하세요.', true); return; }
  if (name.length > 100 || guidance.length > 300) { setChecklistMessage('항목 이름은 100자, 확인 안내는 300자 이내로 입력하세요.', true); return; }

  let items;
  if (editingChecklistItemId) {
    items = currentChecklist.items.map((item) => item.id === editingChecklistItemId
      ? { ...item, name, guidance, source: 'custom' }
      : item);
  } else {
    items = [...currentChecklist.items, { id: makeId('item'), name, guidance, source: 'custom' }];
  }
  checklistSubmit.disabled = true;
  try {
    await saveChecklistItems(currentChecklistAsset, items);
    currentChecklist = { ...currentChecklist, items };
    resetChecklistForm();
    renderChecklist();
    setChecklistMessage('점검표를 저장했습니다.');
  } catch (error) {
    setChecklistMessage(error instanceof Error ? error.message : '점검표를 저장하지 못했습니다.', true);
  } finally {
    checklistSubmit.disabled = false;
  }
});

checklistItemsList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-checklist-edit]');
  if (editButton && currentChecklist && currentChecklistAsset?.status !== 'archived') {
    const item = currentChecklist.items.find((entry) => entry.id === editButton.dataset.checklistEdit);
    if (!item) return;
    editingChecklistItemId = item.id;
    checklistItemName.value = item.name;
    checklistItemGuidance.value = item.guidance || '';
    checklistSubmit.textContent = '변경사항 저장';
    checklistCancelEdit.hidden = false;
    setChecklistMessage('');
    checklistItemName.focus();
    return;
  }

  const deleteButton = event.target.closest('[data-checklist-delete]');
  if (!deleteButton || !currentChecklist || !currentChecklistAsset || currentChecklistAsset.status === 'archived') return;
  const item = currentChecklist.items.find((entry) => entry.id === deleteButton.dataset.checklistDelete);
  if (!item || !globalThis.confirm(`“${item.name}” 항목을 삭제할까요?`)) return;
  deleteButton.disabled = true;
  try {
    const items = currentChecklist.items.filter((entry) => entry.id !== item.id);
    await saveChecklistItems(currentChecklistAsset, items);
    currentChecklist = { ...currentChecklist, items };
    if (editingChecklistItemId === item.id) resetChecklistForm();
    renderChecklist();
    setChecklistMessage('점검 항목을 삭제하고 저장했습니다.');
  } catch (error) {
    setChecklistMessage(error instanceof Error ? error.message : '점검 항목을 삭제하지 못했습니다.', true);
  } finally {
    deleteButton.disabled = false;
  }
});

// 날짜는 화면 표시용일 뿐, 점검 일정 계산에는 사용하지 않습니다.
const today = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
document.querySelector('#today').textContent = today;
document.querySelector('#heading-date').textContent = today;
equipmentSelect.replaceChildren(new Option('종류를 선택하세요', ''));
for (const type of EQUIPMENT_TYPES) equipmentSelect.add(new Option(type.name, type.id));
equipmentSubmit.disabled = true;

openDatabase()
  .then(async () => {
    await ensureChecklistTemplates();
    equipmentSubmit.disabled = false;
    await loadEquipment();
    window.dispatchEvent(new Event('smart-maintenance:data-ready'));
  })
  .catch((error) => {
    const text = error instanceof Error ? error.message : 'IndexedDB를 초기화하지 못했습니다.';
    setEquipmentMessage(`저장소를 사용할 수 없습니다: ${text}`, true);
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-table-cell';
    cell.textContent = '저장소를 열지 못했습니다. 브라우저 설정을 확인해 주세요.';
    row.append(cell);
    equipmentList.replaceChildren(row);
    archivedEquipmentList.replaceChildren(row.cloneNode(true));
  });

window.addEventListener('beforeunload', () => database?.close());

// Photo contextual navigation reuses the existing view switch and respects unsaved-form guards.
window.addEventListener('smart-maintenance:open-photo', event => {
  const detail = event.detail || {};
  if (!['inspection','fault','maintenance'].includes(detail.recordType) || !detail.recordId) return;
  showView('photos');
  if (document.querySelector('[data-panel="photos"]')?.hidden === false) {
    window.dispatchEvent(new CustomEvent('smart-maintenance:photo-context', {detail}));
  }
});
