(()=>{'use strict';const UNIT_LABELS=Object.freeze({day:'일',week:'주',month:'개월',year:'년'}),EARLY_DEFAULTS=Object.freeze({day:0,week:2,month:7,year:30});function todayLocal(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}function isDateOnly(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(`${v}T00:00:00.000Z`);return!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;}function daysBetween(a,b){if(!isDateOnly(a)||!isDateOnly(b))throw TypeError('유효한 날짜가 필요합니다.');return Math.floor((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000);}function earlyDays(p){const v=p?.earlyDays;if(v===undefined||v===null||v==='')return EARLY_DEFAULTS[p?.intervalUnit]??null;return Number.isSafeInteger(v)&&v>=0&&v<=3650?v:null;}function validate(p){if(!UNIT_LABELS[p?.intervalUnit]||!Number.isSafeInteger(p.intervalCount)||p.intervalCount<1)throw TypeError('점검 주기 설정을 확인하세요.');}function occurrenceDate(p,i,base=p.baseDate){const c=globalThis.SmartMaintenanceDateCalculator;if(!c?.calculateOccurrenceDate)throw Error('날짜 계산 모듈을 불러오지 못했습니다.');validate(p);if(!isDateOnly(base))throw TypeError('기준 날짜가 올바르지 않습니다.');return c.calculateOccurrenceDate(base,p.intervalUnit,p.intervalCount,i);}function firstOccurrenceOnOrAfter(p,target,base=p.baseDate){if(!isDateOnly(target)||!isDateOnly(base))throw TypeError('기준 날짜가 올바르지 않습니다.');validate(p);let i=1;if(p.intervalUnit==='day'||p.intervalUnit==='week')i=Math.max(1,Math.ceil(daysBetween(base,target)/(p.intervalCount*(p.intervalUnit==='week'?7:1))));else{const[y,m]=base.split('-').map(Number),[ty,tm]=target.split('-').map(Number),step=p.intervalCount*(p.intervalUnit==='year'?12:1);i=Math.max(1,Math.ceil(((ty-y)*12+tm-m)/step));}while(i>1&&occurrenceDate(p,i-1,base)>=target)i--;while(occurrenceDate(p,i,base)<target)i++;return i;}function recordDate(r){for(const v of[r?.completedAt,r?.inspectedAt])if(typeof v==='string'&&isDateOnly(v.slice(0,10)))return v.slice(0,10);return null;}function planRecords(records,p){return records.filter(r=>r.planId===p.id&&r.equipmentId===p.equipmentId&&recordDate(r)).sort((a,b)=>recordDate(a).localeCompare(recordDate(b))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));}function scheduleRecords(records,p){const eligible=planRecords(records,p).filter(r=>r.scheduleCompletionEligible!==false);return p.scheduleBasis==='fixed'?eligible.filter(r=>isDateOnly(r.scheduleOccurrenceDueDate)):eligible;}function latestScheduleRecord(records,p){return scheduleRecords(records,p).at(-1)||null;}function label(p){const u=UNIT_LABELS[p?.intervalUnit];return u&&Number.isSafeInteger(p.intervalCount)&&p.intervalCount>0?`${p.intervalCount} ${u}마다`:'주기 확인 필요';}function completedDueDates(records,p){return new Set(planRecords(records,p).filter(r=>r.scheduleCompletionEligible!==false).map(r=>r.scheduleOccurrenceDueDate).filter(isDateOnly));}function targetKind(due,allowance,today){if(due<today)return'overdue';if(due===today)return'today';return daysBetween(today,due)<=allowance?'early':'scheduled';}function describeTarget(p,records,today=todayLocal()){
  const policy=globalThis.SmartMaintenancePlanPolicy,active=policy?.planAt(p,today)||p;
  const row={plan:p,frequency:label(active),completionRecord:latestScheduleRecord(records,p),dueDate:'',anchorDate:'',occurrenceIndex:null,kind:'error',error:''};
  if(policy?.isPausedAt(p,today))return {...row,kind:'paused'};
  if(active.scheduleBasis!=='fixed'&&active.scheduleBasis!=='completion')return {...row,kind:'unset'};
  const allowance=earlyDays(active);
  if(!UNIT_LABELS[active.intervalUnit]||!Number.isSafeInteger(active.intervalCount)||active.intervalCount<1||allowance===null)return{...row,kind:'error',error:'점검 주기·조기 점검 설정 확인 필요'};
  if(active.scheduleBasis==='completion'){
    const latest=latestScheduleRecord(records,p);if(!latest)return{...row,kind:'pending'};
    const anchor=recordDate(latest);
    try {const due=occurrenceDate(active,1,anchor);return{...row,anchorDate:anchor,dueDate:due,occurrenceIndex:1,kind:targetKind(due,allowance,today)};}
    catch(e){return{...row,kind:'error',error:e.message||'일정 계산 오류'};}
  }
  try {
    const completed=completedDueDates(records,p),tracking=isDateOnly(p.trackingStartedOn)?p.trackingStartedOn:today;
    const periods=policy?.segments(p,tracking,'9999-12-30')||[{start:tracking,end:null,plan:active}];
    for(const segment of periods){if(segment.plan.scheduleBasis!=='fixed'||!isDateOnly(segment.plan.baseDate))continue;
      let i=firstOccurrenceOnOrAfter(segment.plan,segment.start,segment.plan.baseDate),due=occurrenceDate(segment.plan,i,segment.plan.baseDate),guard=0;
      while(!segment.end||due<segment.end){
        if(!completed.has(due)&&!policy?.isPausedAt(p,due))return{...row,frequency:label(segment.plan),dueDate:due,anchorDate:segment.plan.baseDate,occurrenceIndex:i,kind:targetKind(due,earlyDays(segment.plan),today)};
        if(++guard>10000)throw Error('다음 예정일 계산 반복 횟수를 초과했습니다.');
        due=occurrenceDate(segment.plan,++i,segment.plan.baseDate);
      }
    }
    return {...row,kind:'pending'};
  }catch(e){return{...row,kind:'error',error:e.message||'일정 계산 오류'};}
}
function anchorForDue(p,records,due){p=globalThis.SmartMaintenancePlanPolicy?.planAt(p,due)||p;if(!isDateOnly(due))return null;if(p.scheduleBasis==='fixed')return isDateOnly(p.baseDate)?p.baseDate:null;if(p.scheduleBasis!=='completion')return null;const previous=scheduleRecords(records,p).filter(r=>recordDate(r)<due).at(-1);return previous?recordDate(previous):(isDateOnly(p.baseDate)?p.baseDate:null);}function executionTarget(p,records,requestedDueDate=''){if(globalThis.SmartMaintenancePlanPolicy?.isPausedAt(p,todayLocal()))throw Error('일시정지된 점검 계획은 실행할 수 없습니다.');const requested=isDateOnly(requestedDueDate)?requestedDueDate:'';const target=requested?null:describeTarget(p,records);if(target&&(target.kind==='unset'||target.kind==='error'))throw Error(target.error||'점검 계획의 일정 계산 방식을 먼저 설정하세요.');const dueDate=requested||(isDateOnly(target?.dueDate)?target.dueDate:'');return{dueDate,anchorDate:anchorForDue(p,records,dueDate)};}function missedId(id,date){return`${id}::${date}`;}function missedDates(p,records,today=todayLocal()){
  const policy=globalThis.SmartMaintenancePlanPolicy;
  if(!isDateOnly(today)||!isDateOnly(p?.trackingStartedOn))return[];
  const yesterday=new Date(Date.parse(`${today}T00:00:00Z`)-86400000).toISOString().slice(0,10);
  if(yesterday<p.trackingStartedOn)return[];
  try {
    const completed=completedDueDates(records,p),result=new Set(),periods=policy?.segments(p,p.trackingStartedOn,today)||[{start:p.trackingStartedOn,end:null,plan:p}];
    for(const segment of periods){const sp=segment.plan,stop=segment.end&&segment.end<=today?new Date(Date.parse(`${segment.end}T00:00:00Z`)-86400000).toISOString().slice(0,10):yesterday;
      if(stop<segment.start||!isDateOnly(sp.baseDate)||(sp.scheduleBasis!=='fixed'&&sp.scheduleBasis!=='completion'))continue;
      if(sp.scheduleBasis==='completion'){
        // A completion-based plan does not have a reliable due date until its first eligible completion.
        // It does not advance by itself: one outstanding occurrence per completion interval, not one per elapsed day.
        const rs=scheduleRecords(records,p).filter(r=>recordDate(r)<=stop);
        let anchor=rs.filter(r=>recordDate(r)<segment.start).at(-1);
        let lastDate=anchor?recordDate(anchor):null;
        for(const record of rs.filter(r=>recordDate(r)>=segment.start)){
          const actual=recordDate(record);
          if(lastDate){
            const due=occurrenceDate(sp,1,lastDate);
            if(due<actual&&due>=segment.start&&due<=stop&&!completed.has(due)&&!policy?.isPausedAt(p,due))result.add(due);
          }
          lastDate=actual;
        }
        if(lastDate){
          const due=occurrenceDate(sp,1,lastDate);
          if(due>=segment.start&&due<=stop&&!completed.has(due)&&!policy?.isPausedAt(p,due))result.add(due);
        }
      } else {let i=firstOccurrenceOnOrAfter(sp,segment.start,sp.baseDate),due=occurrenceDate(sp,i,sp.baseDate),guard=0;
        while(due<=stop){if(!completed.has(due)&&!policy?.isPausedAt(p,due))result.add(due);due=occurrenceDate(sp,++i,sp.baseDate);if(++guard>100000)throw Error('누락 계산 범위 초과');}
      }
    }
    return [...result].sort();
  }catch(_){return[];}
}
function pausedDates(p,today=todayLocal()){
  const policy=globalThis.SmartMaintenancePlanPolicy;if(!policy||!isDateOnly(p.trackingStartedOn))return[];
  const result=new Set();for(const segment of policy.segments(p,p.trackingStartedOn,today)){
    const sp=segment.plan;if(sp.scheduleBasis!=='fixed'||!isDateOnly(sp.baseDate))continue;
    const stop=segment.end&&segment.end<=today?segment.end:today;let i=firstOccurrenceOnOrAfter(sp,segment.start,sp.baseDate),guard=0,due=occurrenceDate(sp,i,sp.baseDate);
    while(due<stop){if(policy.isPausedAt(p,due))result.add(due);if(++guard>100000)break;due=occurrenceDate(sp,++i,sp.baseDate);}
  }return [...result].sort();
}
function isOccurrence(p,due,base){p=globalThis.SmartMaintenancePlanPolicy?.planAt(p,due)||p;if(!base||p.scheduleBasis==='fixed')base=p.baseDate;if(!isDateOnly(due)||!isDateOnly(base))return false;try{validate(p);return occurrenceDate(p,firstOccurrenceOnOrAfter(p,due,base),base)===due;}catch(_){return false;}}function withinCompletionWindow(p,due,actual){p=globalThis.SmartMaintenancePlanPolicy?.planAt(p,due)||p;if(!isDateOnly(due)||!isDateOnly(actual))return false;if(actual>=due)return true;const n=earlyDays(p);return Number.isSafeInteger(n)&&daysBetween(actual,due)<=n;}globalThis.SmartMaintenanceScheduleEngine=Object.freeze({UNIT_LABELS,EARLY_DEFAULTS,todayLocal,isDateOnly,daysBetween,earlyDays,occurrenceDate,firstOccurrenceOnOrAfter,recordDate,planRecords,scheduleRecords,latestScheduleRecord,completedDueDates,label,describeTarget,anchorForDue,executionTarget,missedDates,pausedDates,missedId,isOccurrence,withinCompletionWindow});})();
