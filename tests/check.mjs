import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'docs', 'smart-maintenance');
const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
for(const file of fs.readdirSync(site).filter(f=>f.endsWith('.js'))){
  execFileSync(process.execPath,['--check',path.join(site,file)],{stdio:'pipe'});
}
for(const [,ref] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  assert(fs.existsSync(path.join(site,ref)),`missing local asset ${ref}`);
}
const ctx=vm.createContext({console,Date,Error,TypeError,RangeError,Number,globalThis:null});ctx.globalThis=ctx;
vm.runInContext(fs.readFileSync(path.join(site,'date-calculator.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(site,'schedule-engine.js'),'utf8'),ctx);
const dc=ctx.SmartMaintenanceDateCalculator,se=ctx.SmartMaintenanceScheduleEngine;
assert.equal(dc.calculateOccurrenceDate('2026-01-31','month',1,1),'2026-02-28');
assert.equal(dc.calculateOccurrenceDate('2026-01-31','month',1,2),'2026-03-31');
assert.equal(dc.calculateOccurrenceDate('2028-02-29','year',1,4),'2032-02-29');
const plan={id:'plan-check',equipmentId:'eq-1',intervalUnit:'day',intervalCount:1,baseDate:'2020-01-01',trackingStartedOn:'2026-10-29',scheduleBasis:'fixed'};
assert.deepEqual(Array.from(se.missedDates(plan,[],'2026-10-31')),['2026-10-29','2026-10-30']);
assert.deepEqual(Array.from(se.missedDates(plan,[{id:'r1',planId:'plan-check',equipmentId:'eq-1',inspectedAt:'2026-10-29',scheduleOccurrenceDueDate:'2026-10-30'}],'2026-10-31')),['2026-10-29']);
assert.equal(se.earlyDays({intervalUnit:'week'}),2);
// Regression: starting an inspection from the plan list must resolve its due occurrence.
const freshPlan={id:'plan-fresh',equipmentId:'eq-1',intervalUnit:'week',intervalCount:1,baseDate:'2026-10-01',trackingStartedOn:'2026-10-01',scheduleBasis:'fixed'};
assert.equal(se.executionTarget(freshPlan,[]).dueDate,'2026-10-08');
assert.equal(se.executionTarget(freshPlan,[],'2026-10-15').dueDate,'2026-10-15');
const first=se.executionTarget(freshPlan,[]);
const completed=[{id:'completed',planId:'plan-fresh',equipmentId:'eq-1',inspectedAt:'2026-10-08',scheduleOccurrenceDueDate:first.dueDate,scheduleCompletionEligible:true}];
assert.equal(se.executionTarget(freshPlan,completed).dueDate,'2026-10-15');
const bootstrap={...freshPlan,scheduleBasis:'completion'};
assert.equal(se.executionTarget(bootstrap,[]).dueDate,''); // first completion anchors the recurrence
const noBasis={...freshPlan,scheduleBasis:undefined};
assert.throws(()=>se.executionTarget(noBasis,[]),/설정/);
assert.match(fs.readFileSync(path.join(site,'plan-execution.js'),'utf8'),/executionTarget\(plan,records,due\)/);
assert.match(fs.readFileSync(path.join(site,'plan-autosave.js'),'utf8'),/smart-maintenance:plan-started/);
assert.match(fs.readFileSync(path.join(site,'plan-execution.js'),'utf8'),/document\.querySelector\('main\.content'\)\.append\(panel\)/); // visible from schedule view too

// Fixed schedule: early inspection cannot shift its anchored future dates.
const monthPlan={id:'monthly',equipmentId:'eq-2',intervalUnit:'month',intervalCount:1,baseDate:'2026-01-31',trackingStartedOn:'2026-02-01',scheduleBasis:'fixed'};
assert.equal(se.executionTarget(monthPlan,[]).dueDate,'2026-02-28');
const earlyDone=[{id:'early-done',planId:'monthly',equipmentId:'eq-2',inspectedAt:'2026-02-21',scheduleOccurrenceDueDate:'2026-02-28',scheduleCompletionEligible:true}];
assert.equal(se.executionTarget(monthPlan,earlyDone).dueDate,'2026-03-31');
assert.deepEqual(Array.from(se.missedDates(monthPlan,earlyDone,'2026-03-01')),[]);
assert.equal(se.withinCompletionWindow(monthPlan,'2026-02-28','2026-02-21'),true);
assert.equal(se.withinCompletionWindow(monthPlan,'2026-02-28','2026-02-20'),false);


console.log(`PASS: JavaScript syntax ${fs.readdirSync(site).filter(f=>f.endsWith('.js')).length} files, HTML references, due-date/draft integration guards, recurrence/early-window tests`);
