import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(import.meta.dirname,'../docs/smart-maintenance');
const context={globalThis:null, Error, Set, Map};context.globalThis=context;
vm.runInNewContext(fs.readFileSync(path.join(site,'backup-integrity.js'),'utf8'),context);
const verify=context.SmartMaintenanceBackupIntegrity.verify;
const eq={id:'eq-1'};
const plan={id:'plan-1',equipmentId:'eq-1'};
const inspection={id:'ins-1',equipmentId:'eq-1',planId:'plan-1'};
const fault={id:'fault-1',equipmentId:'eq-1',sourceInspectionIds:['ins-1'],sourcePlanIds:['plan-1']};
const photo={id:'photo-1',equipmentId:'eq-1',recordType:'inspection',recordId:'ins-1'};
const proposed={equipment:new Map([[eq.id,eq]]),plans:new Map([[plan.id,plan]]),inspectionRecords:new Map([[inspection.id,inspection]]),maintenanceRecords:new Map(),faults:new Map([[fault.id,fault]]),photos:new Map([[photo.id,photo]])};
const affected=[['plans',plan],['inspectionRecords',inspection],['faults',fault],['photos',photo]].map(([name,record])=>({name,record}));
assert.doesNotThrow(()=>verify(proposed,affected));
for(const [name, bad] of [
 ['plans',{...plan,equipmentId:'missing'}],
 ['inspectionRecords',{...inspection,planId:'missing'}],
 ['faults',{...fault,sourceInspectionIds:['missing']}],
 ['faults',{...fault,linkedPriorFaultId:'missing'}],
 ['photos',{...photo,recordId:'missing'}],
 ['photos',{...photo,recordType:'maintenance'}]
])assert.throws(()=>verify(proposed,[{name,record:bad}]),/없|다른 설비/);
// Verify ALL proposed rows, not only imported/overwritten rows. An old inspection can
// become orphaned after replacing a plan in an otherwise valid merge.
const existingInspection={id:'old-inspection',equipmentId:'eq-1',planId:'plan-1'};
const changedPlan={id:'plan-1',equipmentId:'eq-2'};
const inconsistent={...proposed, plans:new Map([[changedPlan.id,changedPlan]]), inspectionRecords:new Map([[existingInspection.id,existingInspection]]), equipment:new Map([['eq-1',eq],['eq-2',{id:'eq-2'}]])};
assert.doesNotThrow(()=>verify(inconsistent,[{name:'plans',record:changedPlan}])); // proves the old blind spot
const all=[...Object.entries(inconsistent).flatMap(([name,rows])=>[...rows.values()].map(record=>({name,record})))];
assert.throws(()=>verify(inconsistent,all),/다른 설비/);
assert.throws(()=>verify(proposed,[{name:'inspectionRecords',record:{...inspection,linkedFaultId:'missing'}}]),/고장 기록/);
const backupSource=fs.readFileSync(path.join(site,'backup.js'),'utf8');
assert.match(backupSource,/allProposedRecords/);
assert.match(backupSource,/SmartMaintenanceBackupIntegrity\.verify\(proposed, allProposedRecords\)/);
assert.match(fs.readFileSync(path.join(site,'index.html'),'utf8'),/backup-integrity\.js" defer><\/script><script src="backup\.js"/);
console.log('PASS: restore-link preflight for equipment, plan, inspection, fault, photo and prior fault; valid snapshots accepted');
