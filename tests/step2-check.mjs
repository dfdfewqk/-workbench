import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const site = path.resolve(import.meta.dirname, '../docs/smart-maintenance');
const read = name => fs.readFileSync(path.join(site, name), 'utf8');

// Execute the actual refresh-binding module against a minimal browser event mock.
// A dashboard refresh redraws #schedule-rows. It must NOT trigger itself again.
const nodes = new Map([
  'equipment-list', 'archived-equipment-list', 'plans-list', 'schedule-rows',
  'history-table-body', 'maintenance-global-records'
].map(id => [id, {id}]));
const observed = new Map();
const events = new Map();
const timers = new Map();
let timerId = 0;
let refreshCalls = 0;
const context = vm.createContext({
  document: {
    getElementById(id) { return nodes.get(id) || null; },
    querySelectorAll(selector) { return selector === '[data-view="dashboard"]' ? [{addEventListener(name, cb) { events.set('dashboard-click', cb); }}] : []; }
  },
  MutationObserver: class {
    constructor(fn) { this.fn = fn; }
    observe(node) { observed.set(node.id, this.fn); }
  },
  window: {
    SmartMaintenanceDashboard: {
      refresh() {
        refreshCalls++;
        observed.get('schedule-rows')?.(); // Actual dashboard calls schedule.refresh() which redraws table
      }
    },
    addEventListener(name, cb) { events.set(name, cb); }
  },
  setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); }
});
vm.runInContext(read('dashboard-refresh.js'), context, {filename: 'dashboard-refresh.js'});
assert(!observed.has('schedule-rows'), 'schedule table must not trigger dashboard self-refresh');
assert(observed.has('equipment-list'));
assert(observed.has('history-table-body'));
assert(events.has('smart-maintenance:plan-completed'));
assert(events.has('smart-maintenance:plan-settings-updated'));
assert(events.has('pageshow'));
events.get('smart-maintenance:plan-completed')();
for (const [id, run] of [...timers]) { timers.delete(id); run(); }
assert.equal(refreshCalls, 1, 'plan completion should cause exactly one dashboard refresh');
assert.equal(timers.size, 0, 'refresh should not schedule itself again');

// Check the queued-write decision in the *actual* autosave source.
const autosave = read('plan-autosave.js');
const match = autosave.match(/if\s*\(queued\.get\(id\)\s*===\s*signature\s*\|\|\s*\(lastSaved\.get\(id\)\s*===\s*signature\s*&&\s*!queued\.has\(id\)\)\)\s*return;/);
assert(match, 'autosave should not suppress restoration to A while B is in flight');
// Extract the live condition to exercise two concurrent edits, not a reimplementation.
const predicate = match[0].replace(/^if\s*\(/, '(').replace(/\s*return;$/, '');
function skip(saved, inFlight, next) {
  const lastSaved = new Map([['draft', saved]]);
  const queued = new Map(inFlight === undefined ? [] : [['draft', inFlight]]);
  return vm.runInNewContext(`(() => { const id='draft', signature=${JSON.stringify(next)}; return ${predicate} ? true : false; })()`, {lastSaved, queued});
}
assert.equal(skip('A', undefined, 'A'), true, 'skip already persisted unchanged value');
assert.equal(skip('A', 'B', 'B'), true, 'skip already queued value');
assert.equal(skip('A', 'B', 'A'), false, 'requeue A after B to preserve latest edit');
assert.equal(skip('A', undefined, 'B'), false, 'queue new edits');
assert.match(autosave, /lastSaved\.delete\(scope\.draftId\)/, 'reopening an empty draft resets the fingerprint');
assert.match(read('inspection.js'), /addEventListener\('smart-maintenance:plan-completed',[\s\S]*?renderHistory\(\)/, 'planned inspections should refresh the legacy/unified inspection history');

console.log('PASS: dashboard refresh loop prevention, event wiring, autosave in-flight reversion, draft-reset and history refresh guards');
