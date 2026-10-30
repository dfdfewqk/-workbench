import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const site=path.resolve(import.meta.dirname,'../docs/smart-maintenance');
const source=(f)=>fs.readFileSync(path.join(site,f),'utf8');
const ctx=vm.createContext({globalThis:null,Date,Set,Math,Number,String,Error,TypeError,JSON,Object,Array});ctx.globalThis=ctx;
for(const file of ['date-calculator.js','plan-policy.js','schedule-engine.js'])vm.runInContext(source(file),ctx);
const e=ctx.SmartMaintenanceScheduleEngine;
const plan={id:'p1',equipmentId:'e1',scheduleBasis:'completion',baseDate:'2026-01-01',trackingStartedOn:'2026-01-01',intervalUnit:'day',intervalCount:1};
assert.equal(e.describeTarget(plan,[],'2026-02-01').kind,'pending');
assert.deepEqual(Array.from(e.missedDates(plan,[],'2026-02-01')),[], 'no phantom missed before initial completion');
const recorded=(day,id)=>({id,planId:'p1',equipmentId:'e1',completedAt:day,overallResult:'normal',scheduleCompletionEligible:true});
assert.deepEqual(Array.from(e.missedDates(plan,[recorded('2026-01-10','r1')],'2026-02-01')),['2026-01-11'], 'only one outstanding occurrence after latest completion');
assert.deepEqual(Array.from(e.missedDates(plan,[recorded('2026-01-10','r1'),recorded('2026-01-15','r2')],'2026-02-01')),['2026-01-11','2026-01-16'], 'one missed occurrence per uncompleted interval');
assert.deepEqual(Array.from(e.missedDates(plan,[{...recorded('2026-01-10','r1'),scheduleCompletionEligible:false}],'2026-02-01')),[], 'ineligible record does not establish an anchor');
const fixed={...plan,scheduleBasis:'fixed'};
assert.deepEqual(Array.from(e.missedDates(fixed,[],'2026-01-05')),['2026-01-02','2026-01-03','2026-01-04']);
const correction=source('inspection-corrections.js');
assert.match(correction,/updated\.scheduleCompletionEligible=engine\(\)\.withinCompletionWindow/, 'correction re-evaluates eligibility both ways');
assert.match(correction,/JSON\.stringify\(pick\(previous\)\)!==JSON\.stringify\(pick\(expectedOriginal\)\)/, 'stale form comparison');
assert.match(correction,/correct\(record\.id,edits,by,why,record\)/, 'form sends revision guard');
for(const filename of ['dashboard.js','schedule.js']) {
 assert.match(source(filename),/db\.onversionchange=\(\)=>\{db\.close\(\);db=null;/);
 assert.match(source(filename),/저장소 재연결 실패/);
}
console.log('PASS audit2: no phantom completion-based misses, late completion history, correction eligibility + stale protection, storage reconnection');
