import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=fs.readFileSync('docs/smart-maintenance/plan-execution.js','utf8');
const fn=source.match(/function chooseNextDueInspection\(currentPlanId\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(fn,'Priority selector must exist');
function row(id,due,missed=false,disabled=false){return {disabled,dataset:{scheduleStart:id,scheduleDueDate:due,scheduleMissed:String(missed),scheduleOccurrenceId:'occ-'+id}};}
const rows=[row('future','2026-11-05'),row('today','2026-10-30'),row('overdue','2026-10-27'),row('current','2026-10-20'),row('paused','2026-10-21',false,true),row('invalid','')];
const ctx={document:{querySelectorAll:()=>rows},today:()=> '2026-10-30',dateOnly:s=>/^\d{4}-\d{2}-\d{2}$/.test(s)};
vm.createContext(ctx);vm.runInContext(fn+';globalThis.select=chooseNextDueInspection;',ctx);
assert.equal(ctx.select('current').dataset.scheduleStart,'overdue','Most overdue active due inspection should win');
assert.equal(ctx.select('overdue').dataset.scheduleStart,'current','Current plan excluded, next earliest due chosen');
assert.equal(ctx.select('current').dataset.scheduleDueDate,'2026-10-27');
assert.equal(ctx.select('current').dataset.scheduleMissed,'false');
assert.equal(ctx.select('current').dataset.scheduleOccurrenceId,'occ-overdue');
rows.splice(0,rows.length,row('future','2026-11-01'),row('same','2026-10-30'));
assert.equal(ctx.select('same'),null,'Never auto-start future inspection');
console.log('PASS: due-date priority, exclusion, disabled, no future auto-start, occurrence metadata');
