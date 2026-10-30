import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
const site=path.resolve(import.meta.dirname,'../docs/smart-maintenance');
const js=fs.readFileSync(path.join(site,'schedule.js'),'utf8');
const expression=js.match(/function status\(x,today\)\{.*?\}function render\(\)/s);
assert.ok(expression,'Production status function could not be located');
const statusSource=expression[0].slice(0,-'function render()'.length);
const validDate=/^\d{4}-\d{2}-\d{2}$/;
const api={
  isDateOnly:v=>typeof v==='string'&&validDate.test(v),
  daysBetween:(a,b)=>{if(!validDate.test(a)||!validDate.test(b))throw TypeError('유효한 날짜가 필요합니다.');return (Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;}
};
const context=vm.createContext({E:()=>api});
const status=vm.runInContext(statusSource+'\nstatus;',context);
for(const kind of ['paused','pending','unset','error','today','scheduled','overdue']){
  const item={kind,dueDate:''};
  assert.doesNotThrow(()=>status(item,'2026-10-30'),kind+' must not require a due date');
  assert.ok(status(item,'2026-10-30')[0]);
}
assert.equal(status({kind:'early',dueDate:'2026-11-01'},'2026-10-30')[0],'조기 점검 가능 · 2일 전');
assert.match(status({kind:'early',dueDate:''},'2026-10-30')[0],/예정일 확인/);
console.log('PASS: schedule status handles undated paused/pending/unset/error and valid early without date exception');
