/* Repair work plan attached to each fault. All mutations are pure and auditable.
   The maintenanceRecords ledger remains independent; repair tasks do not fake completed maintenance. */
(() => {
  'use strict';
  const clean = value => String(value ?? '').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const iso = () => new Date().toISOString();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  const identifier = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,13)}`;
  const PLAN_STATUS = Object.freeze({needed:'조치 계획 필요',draft:'계획 작성 중',confirmed:'계획 확정',review:'계획 재확정 필요'});
  const MEMBER_STATUS = Object.freeze({pending:'미착수',working:'진행 중',done:'완료'});
  const TASK_STATUS = Object.freeze({pending:'미착수',working:'진행 중',done:'완료',held:'보류',canceled:'취소'});
  const planOf = fault => fault.workPlan || {status:'needed',tasks:[],confirmedAt:null,confirmedBy:''};
  const tasksOf = fault => planOf(fault).tasks || [];
  function taskStatus(task) {
    if(task.controlState==='canceled') return 'canceled';
    if(task.controlState==='held') return 'held';
    const people = task.participants || [];
    if(people.length && people.every(p=>p.status==='done')) return 'done';
    if(people.some(p=>p.status==='working'||p.status==='done')) return 'working';
    return 'pending';
  }
  function metrics(fault, on=today()) {
    const tasks = tasksOf(fault);
    const statuses = tasks.map(taskStatus);
    const pending = statuses.filter(s=>s==='pending'||s==='working'||s==='held').length;
    const holdOverdue = tasks.filter(t=>t.controlState==='held' && validDate(t.holdReviewDate) && t.holdReviewDate < on).length;
    return {total:tasks.length,done:statuses.filter(s=>s==='done').length,canceled:statuses.filter(s=>s==='canceled').length,
      pending,held:statuses.filter(s=>s==='held').length,holdOverdue,planStatus:planOf(fault).status || 'needed',
      members:tasks.reduce((sum,t)=>sum+(t.participants||[]).length,0)};
  }
  function validateOwner(fault,actor) {
    if(fault.status!=='open') throw Error('종료된 고장은 수정할 수 없습니다.');
    if(!clean(fault.owner) || clean(actor)!==clean(fault.owner)) throw Error('현재 고장 관리 책임자 이름으로 처리하세요.');
  }
  function mutate(previous,actor,reason,eventType,modify) {
    validateOwner(previous,actor);
    if(!clean(reason)) throw Error('변경 사유·확인 내용을 입력하세요.');
    const next=clone(previous);
    if(!next.workPlan) next.workPlan={status:'needed',tasks:[],confirmedAt:null,confirmedBy:''};
    if(!Array.isArray(next.workPlan.tasks)) next.workPlan.tasks=[];
    const info=modify(next.workPlan,next);
    const at=iso(); next.updatedAt=at;
    next.history=next.history||[];
    next.history.push({at,actor:clean(actor),type:eventType,note:clean(reason),...info});
    return next;
  }
  function invalidate(plan) {
    plan.status=plan.status==='confirmed'?'review':plan.status==='review'?'review':'draft';
  }
  function requireTask(plan,id) {
    const task=plan.tasks.find(t=>t.id===id);
    if(!task)throw Error('정비 작업을 찾을 수 없습니다.');
    return task;
  }
  function addTask(previous,{title,worker,role},actor,reason) {
    if(!clean(title)||!clean(worker)||!clean(role))throw Error('작업명, 첫 참여 작업자, 역할을 입력하세요.');
    if(clean(title).length>160||clean(worker).length>100||clean(role).length>100)throw Error('입력 글자 수를 확인하세요.');
    return mutate(previous,actor,reason,'repair-task-created',plan=>{
      const task={id:`task-${identifier()}`,title:clean(title),createdAt:iso(),createdBy:clean(actor),controlState:'active',holdReviewDate:'',holdSince:null,
        participants:[{id:`worker-${identifier()}`,name:clean(worker),role:clean(role),status:'pending',workDetail:'',workDate:'',completedAt:null,updatedAt:iso()}]};
      plan.tasks.push(task);invalidate(plan);
      return {taskId:task.id,taskTitle:task.title,participant:clean(worker),role:clean(role)};
    });
  }
  function addParticipant(previous,taskId,worker,role,actor,reason) {
    if(!clean(worker)||!clean(role))throw Error('참여자 이름과 역할을 입력하세요.');
    return mutate(previous,actor,reason,'repair-participant-added',plan=>{
      const task=requireTask(plan,taskId);
      if(task.controlState!=='active')throw Error('보류·취소한 작업에는 참여자를 추가할 수 없습니다.');
      if(task.participants.some(p=>p.name.toLocaleLowerCase()===clean(worker).toLocaleLowerCase())) throw Error('같은 작업에 이미 등록된 참여자입니다.');
      const item={id:`worker-${identifier()}`,name:clean(worker),role:clean(role),status:'pending',workDetail:'',workDate:'',completedAt:null,updatedAt:iso()};
      task.participants.push(item);invalidate(plan);
      return {taskId,participantId:item.id,participant:item.name,role:item.role};
    });
  }
  function confirmPlan(previous,actor,reason) {
    return mutate(previous,actor,reason,'repair-plan-confirmed',plan=>{
      if(!plan.tasks.some(t=>taskStatus(t)!=='canceled')) throw Error('확정하려면 취소되지 않은 정비 작업이 필요합니다.');
      if(plan.status==='confirmed')throw Error('이미 확정된 계획입니다.');
      const was=plan.status;
      plan.status='confirmed';plan.confirmedAt=iso();plan.confirmedBy=clean(actor);
      return {before:was,after:'confirmed',taskCount:plan.tasks.length};
    });
  }
  function updateParticipant(previous,taskId,participantId,actor,nextStatus,detail,workDate,reason='') {
    if(previous.status!=='open')throw Error('종료된 고장은 수정할 수 없습니다.');
    if(!(nextStatus in MEMBER_STATUS))throw Error('작업자 진행 상태를 확인하세요.');
    const found=tasksOf(previous).find(t=>t.id===taskId);
    const worker=found?.participants?.find(p=>p.id===participantId);
    if(!found||!worker)throw Error('작업자 기록을 찾을 수 없습니다.');
    if(clean(actor)!==clean(worker.name)&&clean(actor)!==clean(previous.owner))throw Error('작업자 본인 또는 관리 책임자 이름으로 기록하세요.');
    if(found.controlState!=='active')throw Error('보류·취소한 작업은 작업자 상태를 변경할 수 없습니다.');
    if(nextStatus==='done'&&(!clean(detail)||!validDate(workDate)))throw Error('완료 처리 시 수행 내용과 작업일이 필요합니다.');
    if(worker.status==='done'&&(nextStatus!=='done'||clean(detail)!==clean(worker.workDetail)||workDate!==worker.workDate)&&!clean(reason))
      throw Error('완료 기록을 수정하려면 정정 사유가 필요합니다.');
    if(worker.status===nextStatus && clean(detail)===clean(worker.workDetail) && (nextStatus!=='done'||workDate===worker.workDate))throw Error('변경된 작업자 기록이 없습니다.');
    const next=clone(previous),task=requireTask(next.workPlan,taskId),person=task.participants.find(p=>p.id===participantId);
    const before={status:person.status,workDetail:person.workDetail,workDate:person.workDate,completedAt:person.completedAt};
    const at=iso();person.status=nextStatus;person.workDetail=clean(detail);person.workDate=nextStatus==='done'?workDate:'';
    person.completedAt=nextStatus==='done' ? (before.status==='done'?before.completedAt:at) : null;person.updatedAt=at;
    next.history=next.history||[];
    next.history.push({at,actor:clean(actor),type:'repair-participant-updated',note:clean(reason)||`작업자 ${person.name} 상태 기록`,taskId,participantId,participant:person.name,before,after:{status:person.status,workDetail:person.workDetail,workDate:person.workDate,completedAt:person.completedAt}});
    next.updatedAt=at;return next;
  }
  function taskAction(previous,taskId,action,actor,reason,reviewDate='') {
    if(!['hold','resume','cancel','check'].includes(action))throw Error('작업 처리 방식을 확인하세요.');
    return mutate(previous,actor,reason,`repair-task-${action}`,plan=>{
      const task=requireTask(plan,taskId),before=taskStatus(task);
      if(action==='hold') {
        if(task.controlState!=='active'||before==='done')throw Error('완료·보류·취소한 작업은 보류할 수 없습니다.');
        if(!validDate(reviewDate))throw Error('보류 시 다음 확인일을 입력하세요.');
        task.controlState='held';task.holdSince=iso();task.holdReviewDate=reviewDate;
      } else if(action==='check') {
        if(task.controlState!=='held')throw Error('보류 중인 작업만 재확인할 수 있습니다.');
        if(!validDate(reviewDate))throw Error('실제 재확인 내용과 다음 확인일을 입력하세요.');
        task.holdReviewDate=reviewDate;
      } else if(action==='resume') {
        if(task.controlState!=='held')throw Error('보류 중인 작업만 재개할 수 있습니다.');
        task.controlState='active';task.holdSince=null;task.holdReviewDate='';
      } else {
        if(task.controlState==='canceled'||before==='done')throw Error('이미 완료·취소한 작업은 취소할 수 없습니다.');
        task.controlState='canceled';task.canceledAt=iso();task.canceledBy=clean(actor);task.cancelReason=clean(reason);
        invalidate(plan);
      }
      return {taskId,taskTitle:task.title,before,after:taskStatus(task),reviewDate:task.holdReviewDate||''};
    });
  }
  globalThis.SmartMaintenanceRepairModel=Object.freeze({PLAN_STATUS,MEMBER_STATUS,TASK_STATUS,planOf,tasksOf,taskStatus,metrics,addTask,addParticipant,confirmPlan,updateParticipant,taskAction});
})();
