/* Progressive disclosure for the existing fault workflows. No persistence or safety decisions here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('fault-detail');
  const faultModel = globalThis.SmartMaintenanceFaultModel;
  const repairModel = globalThis.SmartMaintenanceRepairModel;
  if (!editor || !faultModel || !$('fault-update-form') || !$('repair-editors')) return;

  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  // Moving nodes (not cloning or recreating forms) preserves the existing form listeners,
  // validation, IndexedDB writes, and explicit owner/closure requirements.
  const wrappers = new Map();
  function wrap(id, label) {
    const form = $(id);
    if (!form) return;
    const details = make('details', 'fault-disclosure');
    details.id = `fault-ui-${id}`;
    const summary = make('summary', '', label);
    details.append(summary);
    form.before(details);
    details.append(form);
    wrappers.set(id, details);
    return details;
  }

  const overview = make('section', 'fault-quick-overview');
  overview.setAttribute('aria-label', '선택 고장 주요 정보');
  const overviewTitle = make('h3', '', '고장 현황 한눈에 보기');
  const overviewGrid = make('dl', 'fault-quick-grid');
  const overviewNotice = make('p', 'fault-quick-note');
  overview.append(overviewTitle, overviewGrid, overviewNotice);
  $('fault-history-summary').after(overview);

  const actions = make('section', 'fault-quick-actions');
  actions.setAttribute('aria-label', '고장 처리 바로가기');
  actions.append(make('h3', '', '지금 할 작업'));
  const buttons = make('div', 'fault-quick-buttons');
  const recommendation = make('p', 'fault-next-action');
  recommendation.id = 'fault-next-action';
  recommendation.setAttribute('role', 'status');
  recommendation.setAttribute('aria-live', 'polite');
  const commands = [
    {id: 'fault-update-form', label: '관리 정보 수정', type: 'edit'},
    {id: 'repair-create-form', label: '정비 작업 등록', type: 'edit'},
    {id: 'repair-progress-form', label: '작업별 진행·완료', type: 'task'},
    {id: 'fault-review-form', label: '고장 재확인', type: 'edit'},
    {id: 'fault-close-form', label: '고장 종료', type: 'edit'},
    {id: 'repair-confirm-form', label: '계획 확정', type: 'confirm'},
    {id: 'fault-history-log', label: '전체 변경 이력', type: 'read'}
  ];
  for (const command of commands) {
    const button = make('button', 'fault-quick-button', command.label);
    button.type = 'button';
    button.dataset.faultOpen = command.id;
    button.setAttribute('aria-controls', `fault-ui-${command.id}`);
    buttons.append(button);
  }
  actions.append(recommendation, buttons, make('p', 'fault-quick-hint', '항목을 선택하면 해당 입력창만 펼쳐집니다. 기존 확인·승인·고장 종료 절차는 유지됩니다.'));
  overview.after(actions);
  // Keep success/error feedback next to the action buttons instead of below a long audit log.
  const detailFeedback = $('fault-detail-message');
  if (detailFeedback) {
    detailFeedback.classList.add('fault-quick-feedback');
    detailFeedback.setAttribute('aria-live', 'polite');
    actions.after(detailFeedback);
  }
  const repairFeedback = $('repair-note');
  if (repairFeedback && $('repair-alert')) $('repair-alert').after(repairFeedback);

  wrap('fault-update-form', '관리 정보 변경 · 담당자 / 우선순위 / 운전 상태 / 기한');
  wrap('fault-review-form', '고장 재확인 결과 기록');
  for (const [id, label] of [
    ['repair-create-form', '정비 작업 등록'],
    ['repair-member-form', '기존 작업에 참여자 추가'],
    ['repair-progress-form', '작업자별 진행·완료 기록'],
    ['repair-action-form', '작업 보류·재개·취소'],
    ['repair-confirm-form', '정비 조치 계획 확정·재확정']
  ]) wrap(id, label);
  wrap('fault-close-form', '고장 종료 사유와 확인 결과');

  // The original log is preserved in place; it is displayed on demand.
  const logHeading = editor.querySelector('h3:last-of-type');
  const log = $('fault-log');
  const history = make('details', 'fault-disclosure fault-history-disclosure');
  history.id = 'fault-ui-fault-history-log';
  history.append(make('summary', '', '변경·재확인·종료 전체 이력'));
  if (logHeading && logHeading.nextElementSibling === log) {
    logHeading.before(history);
    logHeading.remove();
  } else if (log) log.before(history);
  if (log) history.append(log);
  wrappers.set('fault-history-log', history);

  let currentId = null;
  let selected = null;
  let archived = false;
  const val = value => value && String(value).trim() ? String(value) : '미지정';
  const fields = (fault, metrics) => [
    ['상태', fault.status === 'closed' ? '종료' : '미해결'],
    ['관리 책임자', val(fault.owner)],
    ['우선순위', faultModel.PRIORITIES?.[fault.priority] || '미평가'],
    ['운전 상태', faultModel.OPERATIONS?.[fault.operatingState] || '운전 상태 확인 필요'],
    ['정비 목표일', val(fault.repairDueDate)],
    ['재확인일', val(fault.nextReviewDate)],
    ['정비 작업', metrics ? `전체 ${metrics.total}건 · 미완료 ${metrics.pending}건` : '확인 중']
  ];
  function updateOverview(fault, isArchived) {
    overviewGrid.replaceChildren();
    const metrics = repairModel?.metrics(fault);
    for (const [term, value] of fields(fault, metrics)) {
      const cell = make('div', 'fault-quick-cell');
      cell.append(make('dt', '', term), make('dd', '', value));
      overviewGrid.append(cell);
    }
    const flags = faultModel.flags(fault);
    overviewNotice.textContent = isArchived
      ? '보관된 설비의 고장 기록은 조회 전용입니다.'
      : fault.status === 'closed'
        ? '종료된 고장 기록입니다. 과거 이력은 아래에서 확인할 수 있습니다.'
        : flags.needsOperation || flags.worsening
          ? '운전 상태 확인이나 악화 경고가 남아 있습니다. 이 앱은 운전 허가를 대신하지 않습니다.'
          : '점검 완료·정비 작업 완료·고장 종료는 각각 별도 절차입니다.';
    overviewNotice.classList.toggle('fault-quick-warning', !!(fault.status === 'open' && (flags.needsOperation || flags.worsening)));
    const readOnly = fault.status !== 'open' || isArchived;
    // Completion and fault closure remain separate. Warn before entering closure,
    // and require the existing acknowledgement only when work is still pending.
    const closeForm=$('fault-close-form');
    if(closeForm){
      let review=$('fault-closure-preflight');
      if(!review){
        review=make('div','fault-closure-preflight');review.id='fault-closure-preflight';
        closeForm.prepend(review);
      }
      const warnings=[];
      if(metrics?.pending)warnings.push(`미완료·보류 작업 ${metrics.pending}건 (보류 ${metrics.held}건)`);
      if(metrics?.planStatus==='needed'||metrics?.planStatus==='draft'||metrics?.planStatus==='review')warnings.push('조치 계획 미확정 또는 재확정 필요');
      if(flags.needsOperation)warnings.push('운전 상태 미확인');
      if(flags.worsening)warnings.push('악화 경고 미해제');
      if(flags.correctionReview)warnings.push('점검 정정 후 재검토 필요');
      review.textContent=warnings.length?`종료 전 확인: ${warnings.join(' · ')}. 실제 현장 확인과 종료 사유를 기록하세요. 자동 운전 허가는 아닙니다.`:'작업 완료와 고장 종료는 별도 기록입니다. 실제 확인 결과와 종료 사유를 기록하세요.';
      review.classList.toggle('fault-closure-warning',Boolean(warnings.length));
      const ack=$('fault-close-ack');
      const ackLabel=ack?.closest('label');
      if(ackLabel)ackLabel.hidden=!(metrics?.pending>0);
      if(ack && !(metrics?.pending>0))ack.checked=false;
    }
    // Apply visibility before checking a button's ancestors (prevents stale disabled buttons
    // after selecting a new fault, reopening a closed one, or creating the first task).
    for (const id of ['fault-update-form','fault-review-form','fault-close-form']) {
      const section = wrappers.get(id);
      if (section) section.hidden = readOnly;
    }
    const confirmSection = wrappers.get('repair-confirm-form');
    const notConfirmable = !!$('repair-confirm-form')?.hidden;
    if (confirmSection) confirmSection.hidden = notConfirmable;
    for (const command of commands) {
      const button = buttons.querySelector(`[data-fault-open="${command.id}"]`);
      const section = wrappers.get(command.id);
      const parentHidden = !!section?.closest('[hidden]');
      const noTasks = command.type === 'task' && !repairModel?.tasksOf(fault).some(t=>t.controlState==='active');
      const requiresOwner = ['repair-create-form','repair-progress-form','fault-review-form','fault-close-form','repair-confirm-form'].includes(command.id);
      const needsOwner = requiresOwner && !String(fault.owner||'').trim();
      const irrelevant = noTasks || (command.type === 'confirm' && notConfirmable);
      // Keep the unavailable controls in the DOM (stable keyboard/test identity)
      // but do not clutter the work surface with actions that cannot be used.
      button.hidden = command.type !== 'read' && (readOnly || irrelevant);
      button.disabled = command.type !== 'read' && (readOnly || parentHidden || irrelevant || needsOwner);
      button.title = readOnly && command.type !== 'read' ? '종료된 고장 또는 보관된 설비는 조회만 가능합니다.'
        : needsOwner ? '관리 정보를 열고 고장 관리 책임자를 먼저 지정하세요.'
        : noTasks ? '먼저 정비 작업을 등록하세요.'
        : command.type === 'confirm' && notConfirmable ? '현재 계획에 확정이 필요하지 않습니다.' : '';
    }
    // Recommend only actions that are currently available. A recommendation does
    // not submit forms or bypass the existing required inputs and approvals.
    const candidates = [];
    if (readOnly) {
      candidates.push(['fault-history-log', '조회 전용 기록: 변경 이력을 확인하세요.']);
    } else {
      if (flags.needsOwner || flags.needsPriority || flags.needsOperation)
        candidates.push(['fault-update-form', '관리 책임자·우선순위·운전 상태부터 확인하세요.']);
      if (metrics && (metrics.planStatus === 'needed' || metrics.total === 0))
        candidates.push(['repair-create-form', '조치 작업을 등록하고 관리 계획을 수립하세요.']);
      if (metrics && (metrics.planStatus === 'draft' || metrics.planStatus === 'review'))
        candidates.push(['repair-confirm-form', '정비 조치 계획을 검토하고 확정하세요.']);
      if (metrics?.pending > 0)
        candidates.push(['repair-progress-form', '진행 중인 정비 작업을 확인하고 실제 수행 결과를 기록하세요.']);
      if (flags.reviewLate || flags.worsening)
        candidates.push(['fault-review-form', '고장을 재확인하고 현재 상태를 기록하세요.']);
      candidates.push(['fault-close-form', '종료 전에 실제 조치 결과와 남은 작업을 확인하세요.']);
    }
    const next = candidates.find(([id]) => {
      const button = buttons.querySelector(`[data-fault-open="${id}"]`);
      return button && !button.hidden && !button.disabled;
    });
    for (const button of buttons.querySelectorAll('[data-fault-open]')) {
      button.classList.remove('fault-quick-recommended');
      button.removeAttribute('aria-describedby');
    }
    if (next) {
      const button = buttons.querySelector(`[data-fault-open="${next[0]}"]`);
      recommendation.textContent = `다음 권장 작업: ${next[1]}`;
      button.classList.add('fault-quick-recommended');
      button.setAttribute('aria-describedby', 'fault-next-action');
      buttons.prepend(button);
    } else {
      recommendation.textContent = '현재 바로 실행할 수 있는 작업이 없습니다. 고장 상태와 권한을 확인하세요.';
    }
  }

  function openEditor(id) {
    const target=wrappers.get(id);
    if(!target || target.hidden || target.closest('[hidden]'))return false;
    for(const [key,details] of wrappers)if(key!=='fault-history-log' && details!==target)details.open=false;
    target.open=true;
    // Move keyboard focus into the revealed panel. The original action remains
    // non-submitting, and the existing form and validation handlers are preserved.
    const heading = target.querySelector('summary');
    if (heading) heading.focus({preventScroll:true});
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'start'});
    return true;
  }
  window.addEventListener('smart-maintenance:fault-open-form',event=>{
    if(!selected || selected.status!=='open' || archived)return;
    openEditor(event.detail?.formId);
  });
  buttons.addEventListener('click', event => {
    const button = event.target.closest('[data-fault-open]');
    if (!button || button.disabled || !selected) return;
    openEditor(button.dataset.faultOpen);
  });

  window.addEventListener('smart-maintenance:fault-selected', event => {
    const fault = event.detail?.fault || null;
    selected = fault;
    archived = !!event.detail?.archived;
    if (!fault) {currentId = null; return;}
    if (currentId !== fault.id) {
      for (const details of wrappers.values()) details.open = false;
      currentId = fault.id;
    }
    updateOverview(fault, archived);
  });
})();
