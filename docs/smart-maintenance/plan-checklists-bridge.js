(() => {
  'use strict';

  const DB_NAME = 'smart-maintenance';
  const DB_VERSION = 2;
  const planList = document.getElementById('plans-list');
  const plansPanel = document.getElementById('equipment-plans-panel');
  const archivedList = document.getElementById('archived-equipment-list');
  const equipmentMeta = document.getElementById('plans-equipment-meta');
  if (!planList || !plansPanel || !archivedList || !equipmentMeta) return;

  let db;
  let archiveEquipmentId = null;
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
      request.onerror = () => reject(request.error || new Error('IndexedDB 데이터를 읽지 못했습니다.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 작업이 취소되었습니다.'));
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

  function readAll(storeName) {
    const transaction = db.transaction(storeName, 'readonly');
    const finished = transactionDone(transaction);
    const values = requestValue(transaction.objectStore(storeName).getAll());
    return Promise.all([values, finished]).then(([rows]) => rows);
  }

  async function resolveActiveEquipment() {
    const metadata = equipmentMeta.textContent.trim();
    if (!metadata) return null;
    const equipment = await readAll('equipment');
    return equipment.find((asset) => `${asset.name} · ${asset.assetCode} · ${asset.location}` === metadata) || null;
  }

  async function decoratePlanRows() {
    if (!db || plansPanel.hidden) return;
    const assets = await readAll('equipment');
    const metadata = equipmentMeta.textContent.trim();
    const asset = assets.find((entry) => `${entry.name} · ${entry.assetCode} · ${entry.location}` === metadata);
    if (!asset) return;
    const plans = (await readAll('plans'))
      .filter((plan) => plan.equipmentId === asset.id)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
    const rows = [...planList.querySelectorAll('.plan-item')];
    rows.forEach((row, index) => {
      const plan = plans[index];
      if (!plan) return;
      row.dataset.planId = plan.id;
      if (row.querySelector('[data-plan-checklist-open]')) return;
      const button = el('button', 'plan-checklist-open-button', '점검표');
      button.type = 'button';
      button.dataset.planChecklistOpen = plan.id;
      button.setAttribute('aria-label', `${plan.name || '점검 계획'}의 독립 점검표 편집`);
      row.append(button);
    });
  }

  let decorating = false;
  async function safeDecoratePlanRows() {
    if (decorating) return;
    decorating = true;
    try { await decoratePlanRows(); } catch (_) { /* 연결 실패는 안내 메시지로 처리 */ }
    finally { decorating = false; }
  }

  const planObserver = new MutationObserver(safeDecoratePlanRows);
  planObserver.observe(planList, { childList: true, subtree: true });
  planObserver.observe(plansPanel, { attributes: true, attributeFilter: ['hidden'] });
  equipmentMeta.addEventListener('DOMSubtreeModified', safeDecoratePlanRows);
  safeDecoratePlanRows();

  const archivePanel = el('section', 'panel archive-plan-checklists');
  archivePanel.id = 'archive-plan-checklists';
  archivePanel.hidden = true;
  archivePanel.setAttribute('aria-labelledby', 'archive-plan-checklists-title');
  const archiveHeading = el('div', 'panel-heading archive-plan-checklists-heading');
  const headingCopy = document.createElement('div');
  headingCopy.append(el('p', 'eyebrow', 'ARCHIVED PLAN CHECKLISTS'));
  const archiveTitle = el('h2', '', '보관 설비의 계획별 점검표');
  archiveTitle.id = 'archive-plan-checklists-title';
  headingCopy.append(archiveTitle);
  const archiveMeta = el('p', 'archive-plan-checklists-meta', '');
  archiveMeta.id = 'archive-plan-checklists-meta';
  headingCopy.append(archiveMeta);
  const archiveClose = el('button', 'secondary-button', '닫기');
  archiveClose.type = 'button';
  archiveClose.addEventListener('click', () => { archivePanel.hidden = true; archiveEquipmentId = null; });
  archiveHeading.append(headingCopy, archiveClose);
  archivePanel.append(archiveHeading);
  archivePanel.append(el('p', 'archive-plan-checklists-note', '보관 설비와 연결된 점검 계획 및 저장된 점검 항목만 조회할 수 있습니다. 이 화면에서는 추가·수정·삭제가 불가능합니다.'));
  const archiveStatus = el('p', 'form-message', '');
  archiveStatus.id = 'archive-plan-checklists-status';
  archiveStatus.setAttribute('role', 'status');
  archiveStatus.setAttribute('aria-live', 'polite');
  archivePanel.append(archiveStatus);
  const archivePlans = el('ul', 'archive-plan-list');
  archivePlans.id = 'archive-plan-list';
  archivePanel.append(archivePlans);
  const archiveDetails = el('section', 'archive-plan-detail');
  archiveDetails.id = 'archive-plan-detail';
  archiveDetails.hidden = true;
  archivePanel.append(archiveDetails);
  plansPanel.insertAdjacentElement('afterend', archivePanel);

  function setArchiveMessage(text, isError = false) {
    archiveStatus.textContent = text;
    archiveStatus.classList.toggle('is-error', isError);
  }

  async function openArchivedPlans(equipmentId, button) {
    if (!db) throw new Error('저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const assets = await readAll('equipment');
      const asset = assets.find((entry) => entry.id === equipmentId);
      if (!asset || asset.status !== 'archived') throw new Error('보관 설비를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.');
      archiveEquipmentId = asset.id;
      archiveMeta.textContent = `${asset.name} · ${asset.assetCode} · ${asset.location}`;
      archivePlans.replaceChildren();
      archiveDetails.hidden = true;
      archiveDetails.replaceChildren();
      const plans = (await readAll('plans'))
        .filter((plan) => plan.equipmentId === asset.id)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
      if (!plans.length) {
        archivePlans.append(el('li', 'archive-plan-empty', '등록된 점검 계획이 없습니다.'));
      } else {
        for (const plan of plans) {
          const row = el('li', 'archive-plan-row');
          const copy = el('div', 'archive-plan-row-copy');
          copy.append(el('strong', '', plan.name || '이름 없는 계획'));
          const unit = { day: '일', week: '주', month: '개월', year: '년' }[plan.intervalUnit] || '주기 정보 없음';
          copy.append(el('span', '', `${plan.intervalCount || ''} ${unit}마다 · 기준 날짜 ${plan.baseDate || '정보 없음'}`));
          const view = el('button', 'plan-checklist-open-button', '점검표 보기');
          view.type = 'button';
          view.dataset.archivedPlanId = plan.id;
          row.append(copy, view);
          archivePlans.append(row);
        }
      }
      setArchiveMessage(plans.length ? `${plans.length}개 점검 계획을 조회했습니다. 보관 설비의 점검표는 읽기 전용입니다.` : '조회할 점검 계획이 없습니다.');
      archivePanel.hidden = false;
      archivePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  async function showArchivedPlanChecklist(planId, button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const plans = await readAll('plans');
      const assets = await readAll('equipment');
      const plan = plans.find((entry) => entry.id === planId && entry.equipmentId === archiveEquipmentId);
      const asset = assets.find((entry) => entry.id === archiveEquipmentId && entry.status === 'archived');
      if (!plan || !asset) throw new Error('보관 설비 또는 점검 계획을 찾을 수 없습니다.');
      archiveDetails.replaceChildren();
      archiveDetails.hidden = false;
      const heading = el('div', 'archive-plan-detail-heading');
      heading.append(el('h3', '', `${plan.name || '점검 계획'} · 점검표`));
      const close = el('button', 'secondary-button', '상세 닫기');
      close.type = 'button';
      close.addEventListener('click', () => { archiveDetails.hidden = true; archiveDetails.replaceChildren(); });
      heading.append(close);
      archiveDetails.append(heading);
      const items = Array.isArray(plan.checklistItems) ? plan.checklistItems : null;
      if (!items) {
        archiveDetails.append(el('p', 'archive-plan-empty', '이 계획에는 별도 점검표가 아직 설정되지 않았습니다.'));
      } else if (!items.length) {
        archiveDetails.append(el('p', 'archive-plan-empty', '등록된 계획별 점검 항목이 없습니다.'));
      } else {
        const list = el('ol', 'archive-plan-items');
        items.forEach((item) => {
          const row = el('li', 'archive-plan-item');
          row.append(el('strong', '', item.name || '이름 없는 항목'));
          if (item.guidance) row.append(el('p', '', item.guidance));
          list.append(row);
        });
        archiveDetails.append(list);
      }
      setArchiveMessage('보관 설비 점검표를 조회했습니다. 이 화면은 읽기 전용입니다.');
      archiveDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setArchiveMessage(error instanceof Error ? error.message : '점검표를 불러오지 못했습니다.', true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function decorateArchivedRows() {
    for (const row of archivedList.querySelectorAll('tr')) {
      const assetButton = row.querySelector('[data-checklist-id]');
      const cell = row.lastElementChild;
      if (!assetButton || !cell || cell.querySelector('[data-archived-plans-open]')) continue;
      const button = el('button', 'archive-plans-open-button', '계획 점검표');
      button.type = 'button';
      button.dataset.archivedPlansOpen = assetButton.dataset.checklistId;
      button.setAttribute('aria-label', `${row.cells[0]?.textContent || '보관 설비'} 계획별 점검표 보기`);
      cell.append(button);
    }
  }

  const archivedObserver = new MutationObserver(decorateArchivedRows);
  archivedObserver.observe(archivedList, { childList: true, subtree: true });
  decorateArchivedRows();

  archivedList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-archived-plans-open]');
    if (!button) return;
    try { await openArchivedPlans(button.dataset.archivedPlansOpen, button); }
    catch (error) { setArchiveMessage(error instanceof Error ? error.message : '계획별 점검표를 열지 못했습니다.', true); archivePanel.hidden = false; }
  });

  archivePlans.addEventListener('click', (event) => {
    const button = event.target.closest('[data-archived-plan-id]');
    if (button) showArchivedPlanChecklist(button.dataset.archivedPlanId, button);
  });

  planList.addEventListener('click', () => setTimeout(safeDecoratePlanRows, 0));
  openDatabase().then(safeDecoratePlanRows).catch((error) => {
    const note = plansPanel.querySelector('.plans-note');
    if (note) note.textContent = error instanceof Error ? `계획별 점검표 저장소를 사용할 수 없습니다: ${error.message}` : '계획별 점검표 저장소를 사용할 수 없습니다.';
  });

  const planNote = plansPanel.querySelector('.plans-note');
  if (planNote) planNote.textContent = '점검 계획마다 독립된 점검표를 설정할 수 있습니다. 고정 일정의 예정일을 표시하며, 실제 완료일 기준 계획은 계획별 완료 기록 연동 전까지 대기 상태입니다. 알림은 아직 제공하지 않습니다.';
  window.addEventListener('beforeunload', () => db?.close());
})();
