/* Non-destructive PM plan timeline, suspension, and audit helpers. No new object stores. */
(function (root, factory) {
  const api=factory();
  if(root)root.SmartMaintenancePlanPolicy=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEYS=['intervalUnit','intervalCount','baseDate','scheduleBasis','earlyDays'];
  const snapshot=p=>Object.fromEntries(KEYS.map(k=>[k,p[k]]));
  const changes=p=>(Array.isArray(p?.scheduleChanges)?p.scheduleChanges:[]).slice().sort((a,b)=>String(a.effectiveOn).localeCompare(String(b.effectiveOn))||String(a.at).localeCompare(String(b.at)));
  function planAt(p,date){let s=snapshot(p);const history=changes(p);if(history.length){s={...history[0].before};for(const change of history)if(change.effectiveOn<=date)s={...change.after};}return{...p,...s};}
  function segments(p,from,to){if(!/^\d{4}-\d\d-\d\d$/.test(from)||!/^\d{4}-\d\d-\d\d$/.test(to)||from>to)return[];
    const starts=[from,...changes(p).map(c=>c.effectiveOn).filter(d=>d>from&&d<=to)].sort();
    return starts.map((start,i)=>({start,end:starts[i+1]||null,plan:planAt(p,start)}));
  }
  function pausePeriods(p){return Array.isArray(p?.pausePeriods)?p.pausePeriods:[];}
  function isPausedAt(p,date){return pausePeriods(p).some(x=>x.startDate<=date&&(!x.endDate||date<x.endDate));}
  const isCurrentlyPaused=p=>pausePeriods(p).some(x=>!x.endDate);
  function pause(p,actor,reason,date,at){if(isCurrentlyPaused(p))throw Error('이미 일시정지된 계획입니다.');if(!actor?.trim()||!reason?.trim())throw Error('처리자와 정지 사유가 필요합니다.');return{...p,pausePeriods:[...pausePeriods(p),{startDate:date,endDate:null,actor:actor.trim(),reason:reason.trim(),at}],updatedAt:at};}
  function resume(p,actor,reason,date,at,needsInspection=false){if(!isCurrentlyPaused(p))throw Error('일시정지된 계획이 아닙니다.');if(!actor?.trim()||!reason?.trim())throw Error('처리자와 재개 사유가 필요합니다.');return{...p,pausePeriods:pausePeriods(p).map(x=>x.endDate?x:{...x,endDate:date,resumedAt:at,resumedBy:actor.trim(),resumeReason:reason.trim()}),resumeInspectionRequired:!!needsInspection,resumedOn:date,updatedAt:at};}
  function changeSchedule(p,newFields,actor,reason,effectiveOn,at,today){if(!actor?.trim()||!reason?.trim())throw Error('변경 처리자와 변경 사유가 필요합니다.');if(!/^\d{4}-\d\d-\d\d$/.test(effectiveOn)||effectiveOn<today)throw Error('효력 발생일은 오늘 이후여야 합니다.');
    const before=snapshot(planAt(p,effectiveOn));const after={...before,...newFields};if(KEYS.every(k=>before[k]===after[k]))return p;
    const old=changes(p);if(old.length&&old.at(-1).effectiveOn>=effectiveOn)throw Error('이미 등록된 미래 일정 변경과 날짜가 겹칩니다. 기존 계획을 확인하세요.');
    return{...p,...after,scheduleChanges:[...old,{at,actor:actor.trim(),reason:reason.trim(),effectiveOn,before,after}],updatedAt:at};
  }
  return Object.freeze({KEYS,snapshot,changes,planAt,segments,pausePeriods,isPausedAt,isCurrentlyPaused,pause,resume,changeSchedule});
});
