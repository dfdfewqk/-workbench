(() => {
  'use strict';
  const model = globalThis.SmartMaintenancePlanFocusModel;
  if (!model) return;
  const panel = document.getElementById('plan-execution-panel');
  const itemsBox = document.getElementById('plan-execution-items');
  const form = document.getElementById('plan-execution-form');
  if (!panel || !itemsBox || !form) return;

  const labelText = { normal: '정상', caution: '주의', failure: '고장' };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let currentIndex = 0;
  let fullList = false;
  let complete = false;
  let saved = false;

  // This view controls only presentation. Every inspection input remains in the
  // original form so that draft/commit/validation keep reading all answers.
  const toolbar = element('section', 'plan-focus-toolbar');
  toolbar.setAttribute('aria-label', '점검 진행 현황');
  const heading = element('div', 'plan-focus-heading');
  const title = element('strong', '', '점검 진행 현황');
  const count = element('span', 'plan-focus-count', '0 / 0 판정 완료');
  heading.append(title, count);
  const progress = element('progress', 'plan-focus-progress');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', '점검 항목 판정 진행률');
  const controls = element('div', 'plan-focus-controls');
  const selectLabel = element('label', 'plan-focus-select-label', '항목 선택');
  const jump = element('select', 'plan-focus-jump');
  jump.setAttribute('aria-label', '점검 항목 바로 이동');
  selectLabel.append(jump);
  const toggle = element('button', 'secondary-button plan-focus-toggle', '전체 목록 보기');
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', 'false');
  controls.append(selectLabel, toggle);
  toolbar.append(heading, progress, controls);
  itemsBox.before(toolbar);

  const navigation = element('div', 'plan-focus-navigation');
  const previous = element('button', 'secondary-button plan-focus-previous', '이전 항목');
  const next = element('button', 'secondary-button plan-focus-next', '다음 미완료 항목');
  previous.type = next.type = 'button';
  const summary = element('p', 'plan-focus-current', '');
  summary.setAttribute('aria-live', 'polite');
  navigation.append(previous, summary, next);
  itemsBox.after(navigation);

  const hint = element('p', 'plan-focus-hint', '');
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  navigation.after(hint);

  function items() {
    return [...itemsBox.querySelectorAll('fieldset.plan-execution-item')];
  }
  function answers() {
    return items().map((_, index) => form.querySelector(`input[name="result-${index}"]:checked`)?.value || '');
  }
  function textOf(item, index) {
    const label = item.querySelector('legend')?.textContent?.trim() || `항목 ${index + 1}`;
    return label.replace(/^\d+\.\s*/, '').trim() || `항목 ${index + 1}`;
  }
  function update() {
    const all = items();
    if (!all.length) {
      toolbar.hidden = navigation.hidden = hint.hidden = true;
      return;
    }
    currentIndex = Math.min(Math.max(0, currentIndex), all.length - 1);
    toolbar.hidden = navigation.hidden = hint.hidden = false;
    const values = answers();
    const state = model.progress(values);
    count.textContent = `${state.judged} / ${state.total} 판정 완료 · ${state.remaining}개 남음`;
    progress.max = state.total;
    progress.value = state.judged;
    const options = all.map((item, index) => {
      const opt = new Option(`${index + 1}. ${textOf(item, index)} · ${labelText[values[index]] || '미판정'}`, String(index));
      return opt;
    });
    jump.replaceChildren(...options);
    jump.value = String(currentIndex);
    for (let index = 0; index < all.length; index += 1) {
      const field = all[index];
      field.hidden = !fullList && index !== currentIndex;
      field.classList.toggle('is-current', index === currentIndex);
    }
    summary.textContent = fullList ? `전체 ${all.length}개 항목 표시 중` : `${currentIndex + 1} / ${all.length} 항목`;
    toggle.textContent = fullList ? '한 항목씩 보기' : '전체 목록 보기';
    toggle.setAttribute('aria-pressed', String(fullList));
    previous.disabled = saved || fullList || all.length < 2 || currentIndex === 0;
    const nextIndex = model.nextIncomplete(values, currentIndex);
    next.disabled = saved || fullList || nextIndex === -1;
    jump.disabled = saved;
    toggle.disabled = saved;
    const current = values[currentIndex];
    if (saved) hint.textContent = '이 점검은 최종 저장됐습니다.';
    else if (state.complete) hint.textContent = '모든 항목의 판정이 끝났습니다. 전체 항목과 메모를 확인한 뒤 아래의 완료 저장 버튼을 눌러 주세요. 아직 최종 저장된 것은 아닙니다.';
    else if (current === 'caution' || current === 'failure') hint.textContent = `${labelText[current]} 판정입니다. 이 항목의 메모와 하단 고장 관리 연결 내용을 확인하세요. 자동으로 다음 항목으로 넘어가지 않습니다.`;
    else if (fullList) hint.textContent = '전체 항목을 보면서 수정할 수 있습니다. 항목을 선택하면 다시 집중 입력 화면으로 돌아옵니다.';
    else hint.textContent = '정상을 선택하면 다음 미완료 항목으로 이동합니다. 마지막 항목 판정 후에도 최종 저장 버튼을 눌러야 합니다.';
  }
  function show(index, focus = false) {
    const all = items();
    if (index < 0 || index >= all.length || saved) return;
    currentIndex = index;
    if (fullList) fullList = false;
    update();
    if (focus) {
      all[index].scrollIntoView({ block: 'nearest', behavior: 'auto' });
      all[index].querySelector('input[type="radio"]')?.focus({ preventScroll: true });
    }
  }
  function initialize() {
    saved = false;
    complete = false;
    fullList = false;
    currentIndex = 0;
    // New plans are rendered just before 'plan-started' dispatch. Preserve the
    // unsaved draft inputs for autosave to restore asynchronously afterward.
    show(0);
  }
  toggle.addEventListener('click', () => { if (saved) return; fullList = !fullList; update(); });
  jump.addEventListener('change', () => show(Number(jump.value), true));
  previous.addEventListener('click', () => show(currentIndex - 1, true));
  next.addEventListener('click', () => show(model.nextIncomplete(answers(), currentIndex), true));
  itemsBox.addEventListener('change', (event) => {
    const radio = event.target.closest?.('input[type="radio"]');
    if (!radio || saved || !panel || panel.hidden) return;
    const match = /^result-(\d+)$/.exec(radio.name || '');
    if (!match) return;
    const index = Number(match[1]);
    const all = items();
    if (!Number.isInteger(index) || index >= all.length) return;
    currentIndex = index;
    update();
    if (radio.value === 'normal' && !fullList) {
      const target = model.nextIncomplete(answers(), index);
      if (target !== -1) show(target, true);
    } else if ((radio.value === 'caution' || radio.value === 'failure') && !fullList) {
      // Details remain visible, but note entry stays optional under the
      // existing inspection policy. Do not change commit validation here.
      all[index].querySelector('textarea')?.focus({ preventScroll: true });
    }
  });
  window.addEventListener('smart-maintenance:plan-started', initialize);
  window.addEventListener('smart-maintenance:plan-draft-restored', (event) => {
    const state = event.detail || {};
    if (state.planId && panel.hidden === false && items().length) {
      currentIndex = Math.max(0, model.firstIncomplete(answers()));
      fullList = false;
      update();
    }
  });
  window.addEventListener('smart-maintenance:plan-completed', () => { saved = true; complete = true; update(); });
  // The editor remains available in the same DOM when hidden by menu navigation.
  // Its saved inputs are neither removed nor rewritten by the focused view.
  toolbar.hidden = navigation.hidden = hint.hidden = true;
})();
