import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=new URL('../docs/smart-maintenance/',import.meta.url);
const source=(f)=>fs.readFileSync(new URL(f,root),'utf8');
const nodes=new Map();
class E {constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.className='';this.dataset={};this.hidden=false;this.disabled=false;this.classList={toggle:(n,active)=>this.className=active?n:''};this.listeners={};}
 replaceChildren(...x){this.children=[...x]} append(...x){this.children.push(...x)} addEventListener(type,cb){this.listeners[type]=cb} setAttribute(){} closest(){return null} querySelector(){return null}
}
const byId=id=>{if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id)};
let faultRecords=[],inspectionRecords=[];
const mockRequest=(value)=>{const r={};queueMicrotask(()=>{r.result=value;r.onsuccess?.()});return r;};
const fakeDb={objectStoreNames:{contains:()=>true},transaction(names){const tx={oncomplete:null,onabort:null,onerror:null,objectStore(name){return {getAll(){return mockRequest(name==='faults'?faultRecords:name==='equipment'?[]:inspectionRecords)}}}};setTimeout(()=>tx.oncomplete?.(),8);return tx;},close(){}};
const dbFactory={open(){const r={};setTimeout(()=>{r.result=fakeDb;r.onsuccess?.()},5);return r;}};
const document={getElementById:id=>['inspection-form','plan-execution-form'].includes(id)?null:byId(id),querySelector:()=>null,querySelectorAll:()=>[],createElement:t=>new E(t)};
const window={addEventListener(){},dispatchEvent(){}};
const context=vm.createContext({globalThis:null,window,document,indexedDB:dbFactory,Date,Number,String,Boolean,RegExp,JSON,Error,Set,Promise,Option:class{},CustomEvent:class{},console,setTimeout});context.globalThis=context;
vm.runInContext(source('fault-model.js'),context);vm.runInContext(source('faults.js'),context);
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
await sleep(40);
assert.match(byId('fault-list-message').textContent,/새로 고침 완료/);
assert.match(byId('fault-list-message').textContent,/전체 0건/);
assert.match(byId('fault-rows').children[0].children[0].textContent,/고장 기록이 없습니다/);
assert.equal(byId('fault-refresh').disabled,false);
inspectionRecords=[{id:'orphan-inspection',overallResult:'failure',cautionFaultRequested:false}];
byId('fault-refresh').listeners.click();await sleep(35);
assert.match(byId('fault-list-message').textContent,/연결되지 않은 고장\/주의 점검 1건/);
inspectionRecords=[];
faultRecords=[{id:'f1',equipmentId:'e1',summary:'베어링 점검 고장',createdAt:'2026-10-29',status:'open',priority:'unassessed',owner:'',operatingState:'unverified',sourceInspectionIds:[],history:[]}];
byId('fault-refresh').listeners.click();await sleep(35);
assert.match(byId('fault-list-message').textContent,/전체 1건 · 미해결 1건/);
assert.equal(byId('fault-rows').children.length,1);
assert.equal(byId('fault-refresh').textContent,'새로 고침');
assert.equal(byId('fault-refresh').disabled,false);
console.log('PASS: manual refresh feedback, non-empty data, empty state, re-enabled button');
