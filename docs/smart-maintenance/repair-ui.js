/* Work plan UI: attaches to existing fault detail; reuses fault store's guarded update transaction. */
(() => {
  'use strict';
  const R=globalThis.SmartMaintenanceRepairModel;
  const F=globalThis.SmartMaintenanceFaultUI;
  const $=id=>document.getElementById(id);
  if(!R||!F||!$('repair-board'))return;
  let selected=null,locked=true;
  const el=(tag,content,className='')=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(className)n.className=className;return n;};
  function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
  function statusLabel(status){return R.TASK_STATUS[status]||status;}
  function showMessage(msg){const n=$('repair-note');n.textContent=msg||'';}
  function fillSelection(id,entries,placeholder,selectedValue){
    const n=$(id);n.replaceChildren();option(n,'',placeholder);
    for(const entry of entries)option(n,entry.id,entry.label);
    if(entries.some(x=>x.id===selectedValue))n.value=selectedValue;
  }
  // Work cards show only valid next actions. Buttons open the ORIGINAL forms; no parallel
  // input model, implicit status changes, or bypass of the owner/worker validation.
  function taskButton(parent, label, action, taskId, participantId) {
    const b=el('button',label,'repair-card-action');b.type='button';
    b.dataset.repairAction=action;b.dataset.taskId=taskId;
    if(participantId)b.dataset.participantId=participantId;
    parent.append(b);return b;
  }
  function renderTasks(fault) {
    const container=$('repair-tasks');container.replaceChildren();
    const tasks=R.tasksOf(fault);
    if(!tasks.length){container.append(el('p','정비 작업이 없습니다. 담당자가 원인을 확인한 후 등록하세요.','repair-muted'));return;}
    for(const task of tasks){
      const status=R.taskStatus(task);
      const card=el('article',undefined,'repair-card');card.dataset.repairTaskId=task.id;
      const title=el('div',undefined,'repair-card-head');
      title.append(el('strong',task.title),el('span',statusLabel(status),'repair-chip'));card.append(title);
      if(task.controlState==='held'){
        const overdue=R.metrics({workPlan:{tasks:[task],status:'draft'}}).holdOverdue>0;
        card.append(el('p',`보류 확인일: ${task.holdReviewDate||'미설정'}${overdue?' · 재확인 지연':''}`,overdue?'repair-warning':'repair-muted'));
      }
      if(task.controlState==='canceled')card.append(el('p',`취소 사유: ${task.cancelReason||'기록 없음'} · ${task.canceledBy||'담당자 미상'}`,'repair-muted'));
      const list=el('ul',undefined,'repair-members');
      for(const person of task.participants||[]){
        const item=el('li');
        const detail=el('div',undefined,'repair-worker-row');
        detail.append(el('strong',`${person.name} (${person.role})`),el('span',R.MEMBER_STATUS[person.status]||'미착수','repair-chip'));
        item.append(detail);
        if(person.workDetail)item.append(el('p',`작업 내용: ${person.workDetail}${person.workDate?` · 작업일 ${person.workDate}`:''}`,'repair-muted'));
        if(!locked && task.controlState==='active'){
          const controls=el('div',undefined,'repair-worker-actions');
          if(person.status==='pending')taskButton(controls,'진행 시작','start',task.id,person.id);
          if(person.status!=='done')taskButton(controls,'완료 기록','finish',task.id,person.id);
          else taskButton(controls,'완료 기록 정정','correct',task.id,person.id);
          if(person.status==='working')taskButton(controls,'진행 내용 수정','progress',task.id,person.id);
          item.append(controls);
        }
        list.append(item);
      }
      card.append(list);
      if(!locked && task.controlState!=='canceled'){
        const actions=el('div',undefined,'repair-task-actions');
        if(task.controlState==='active'){
          taskButton(actions,'+ 참여자 추가','member',task.id);
          if(status!=='done'){
            taskButton(actions,'보류','hold',task.id);
            taskButton(actions,'작업 취소','cancel',task.id);
          }
        }else if(task.controlState==='held'){
          taskButton(actions,'보류 재확인','check',task.id);
          taskButton(actions,'작업 재개','resume',task.id);
          taskButton(actions,'작업 취소','cancel',task.id);
        }
        card.append(actions);
      }
      container.append(card);
    }
  }
  function renderSelects(fault){
    const tasks=R.tasksOf(fault),editable=tasks.filter(t=>t.controlState==='active');
    for(const [id,items,placeholder] of [
      ['repair-member-task',editable,'작업 선택'],
      ['repair-progress-task',editable,'작업 선택'],
      ['repair-action-task',tasks.filter(t=>R.taskStatus(t)!=='done'&&t.controlState!=='canceled'),'작업 선택']
    ]){
      const current=$(id).value;
      fillSelection(id,items.map(t=>({id:t.id,label:`${t.title} · ${statusLabel(R.taskStatus(t))}`})),placeholder,current);
    }
    renderMembers();
    for(const id of ['repair-create-actor','repair-member-actor','repair-action-actor','repair-confirm-actor'])$(id).value=fault.owner||'';
  }
  function renderMembers(){
    const task=selected && R.tasksOf(selected).find(t=>t.id===$('repair-progress-task').value);
    const current=$('repair-progress-member').value;
    fillSelection('repair-progress-member',(task?.participants||[]).map(p=>({id:p.id,label:`${p.name} · ${p.role} (${R.MEMBER_STATUS[p.status]||'미착수'})`})),'참여자 선택',current);
    const worker=task?.participants?.find(p=>p.id===$('repair-progress-member').value);
    if(worker){$('repair-progress-actor').value=worker.name;$('repair-progress-status').value=worker.status;$('repair-progress-detail').value=worker.workDetail||'';$('repair-progress-date').value=worker.workDate||'';}
  }
  function render(fault,archived){
    selected=fault;const board=$('repair-board');board.hidden=!fault;
    if(!fault)return;
    locked=fault.status==='closed'||archived;
    const m=R.metrics(fault);
    $('repair-summary').textContent=`${R.PLAN_STATUS[m.planStatus]||'조치 계획 필요'} · 작업 ${m.total}건 (완료 ${m.done}, 진행·미착수·보류 ${m.pending}, 취소 ${m.canceled}) · 참여자 ${m.members}명`;
    $('repair-alert').textContent=m.holdOverdue?`보류 작업 ${m.holdOverdue}건의 재확인일이 지났습니다. 현장 확인 후 재확인·재개하세요.`:m.planStatus==='review'?'작업 범위가 변경되어 관리 책임자의 계획 재확정이 필요합니다.':m.planStatus==='needed'?'조치 계획을 등록해야 합니다.':'';
    $('repair-alert').hidden=!$('repair-alert').textContent;
    renderTasks(fault);renderSelects(fault);
    $('repair-editors').hidden=locked;
    $('repair-confirm-form').hidden=locked||m.planStatus==='confirmed'||!R.tasksOf(fault).some(t=>R.taskStatus(t)!=='canceled');
    $('repair-closed-note').hidden=!locked;
    $('repair-closed-note').textContent=archived?'보관된 설비는 조회 전용입니다.':'종료된 고장은 작업 기록 조회만 가능합니다.';
    $('repair-confirm-reason').value='';
    showMessage('');
  }
  async function write(callback){
    if(!selected||locked){showMessage('이 고장은 조회 전용입니다.');return;}
    const saved=await F.updateSelected(prev=>{
      if(prev.status!=='open')throw Error('종료한 고장은 수정할 수 없습니다.');
      return callback(prev);
    });
    showMessage(saved ? '정비 작업 변경 내용을 저장했습니다. 고장 종료는 별도 확인이 필요합니다.' : ($('fault-detail-message')?.textContent||'저장하지 못했습니다.'));
  }
  $('repair-tasks').addEventListener('click',event=>{
    const button=event.target.closest('button[data-repair-action]');
    if(!button||locked||!selected)return;
    const task=R.tasksOf(selected).find(t=>t.id===button.dataset.taskId);
    if(!task||task.controlState==='canceled')return;
    const kind=button.dataset.repairAction;
    const active=task.controlState==='active';
    if(['member','start','finish','correct','progress','hold'].includes(kind)&&!active)return;
    if(['resume','check'].includes(kind)&&task.controlState!=='held')return;
    let formId;
    if(kind==='member'){
      formId='repair-member-form';$('repair-member-task').value=task.id;
    }else if(['start','finish','correct','progress'].includes(kind)){
      formId='repair-progress-form';
      $('repair-progress-task').value=task.id;renderMembers();
      $('repair-progress-member').value=button.dataset.participantId||'';renderMembers();
      if(kind==='start')$('repair-progress-status').value='working';
      if(kind==='finish'){
        $('repair-progress-status').value='done';
        if(!$('repair-progress-date').value){const d=new Date();$('repair-progress-date').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
      }
      $('repair-progress-reason').value='';
    }else{
      formId='repair-action-form';$('repair-action-task').value=task.id;
      $('repair-action-kind').value=kind;
      $('repair-action-reason').value='';$('repair-action-date').value=task.holdReviewDate||'';
    }
    window.dispatchEvent(new CustomEvent('smart-maintenance:fault-open-form',
      {detail:{formId,taskId:task.id,taskTitle:task.title}}));
  });
  $('repair-create-form').addEventListener('submit',e=>{
    e.preventDefault();void write(prev=>R.addTask(prev,{
      title:$('repair-create-title').value,worker:$('repair-create-worker').value,role:$('repair-create-role').value
    },$('repair-create-actor').value,$('repair-create-reason').value));
  });
  $('repair-member-form').addEventListener('submit',e=>{
    e.preventDefault();void write(prev=>R.addParticipant(prev,$('repair-member-task').value,$('repair-member-name').value,$('repair-member-role').value,$('repair-member-actor').value,$('repair-member-reason').value));
  });
  $('repair-progress-task').addEventListener('change',renderMembers);
  $('repair-progress-member').addEventListener('change',renderMembers);
  $('repair-progress-form').addEventListener('submit',e=>{
    e.preventDefault();void write(prev=>R.updateParticipant(prev,$('repair-progress-task').value,$('repair-progress-member').value,
      $('repair-progress-actor').value,$('repair-progress-status').value,$('repair-progress-detail').value,$('repair-progress-date').value,$('repair-progress-reason').value));
  });
  $('repair-action-form').addEventListener('submit',e=>{
    e.preventDefault();void write(prev=>R.taskAction(prev,$('repair-action-task').value,$('repair-action-kind').value,$('repair-action-actor').value,$('repair-action-reason').value,$('repair-action-date').value));
  });
  $('repair-confirm-form').addEventListener('submit',e=>{
    e.preventDefault();void write(prev=>R.confirmPlan(prev,$('repair-confirm-actor').value,$('repair-confirm-reason').value));
  });
  window.addEventListener('smart-maintenance:fault-selected',event=>render(event.detail?.fault||null,Boolean(event.detail?.archived)));
})();
