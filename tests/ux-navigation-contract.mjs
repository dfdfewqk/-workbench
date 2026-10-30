import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../docs/smart-maintenance/',import.meta.url);
const html=readFileSync(new URL('index.html',dir),'utf8');
const js=readFileSync(new URL('app.js',dir),'utf8');
const css=readFileSync(new URL('ui-foundation.css',dir),'utf8');
for (const group of ['home','inspection','repairs','admin']) assert.equal((html.match(new RegExp(`data-group="${group}"`,'g'))||[]).length,2,`desktop and mobile group ${group}`);
for (const route of ['dashboard','schedule','plans','history','faults','equipment','photos','backup']) assert.equal((html.match(new RegExp(`data-view="${route}"`,'g'))||[]).length,2,`desktop and mobile route ${route}`);
for(const old of ['dashboard','equipment','schedule','history','faults','photos','backup']) assert.match(html,new RegExp(`data-panel="${old}"`),'Existing panel preserved: '+old);
assert.match(html,/href="ui-foundation\.css"/);
assert.match(css,/is-plan-management \.equipment-form-panel/);
assert.match(html,/class="plan-mode-note" hidden/);
function element(fields={}) {
 const attrs={}; const classes=new Set();
 return {...fields,hidden:false, attrs, classes,
    classList:{ toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
    setAttribute(k,v){attrs[k]=v;}, removeAttribute(k){delete attrs[k];},
    addEventListener(name,cb){this[`on_${name}`]=cb;},
    click(){this.on_click?.();}}
}
const links=[...html.matchAll(/<button class="nav-link nav-sub-link[^>]*data-view="([^"]+)" data-nav-group="([^"]+)"/g)].map(m=>element({dataset:{view:m[1],navGroup:m[2]}}));
const groups=[...html.matchAll(/<button class="nav-link group-link[^>]*data-group="([^"]+)"/g)].map(m=>element({dataset:{group:m[1]}}));
assert.equal(links.length,16);assert.equal(groups.length,8);
const panels=['dashboard','equipment','schedule','history','faults','photos','backup'].map(id=>element({dataset:{panel:id}}));
const planModeNote=element();
const equipmentPanel=panels.find(x=>x.dataset.panel==='equipment');equipmentPanel.querySelector=s=>s==='.plan-mode-note'?planModeNote:null;
const editor=element({hidden:true});
let mayLeave=true;
const document={getElementById:id=>id==='plan-execution-panel'?editor:null,querySelector:sel=>sel==='[data-panel="equipment"]'?equipmentPanel:null};
const context={document,globalThis:{SmartMaintenanceInspectionNavigation:{mayLeave:()=>mayLeave}},
 title:element({textContent:''}),subtitle:element({textContent:''}),
 navButtons:links,groupButtons:groups,panels,window:{scrollTo(){}},console};
const headings=js.slice(js.indexOf('const viewInfo ='),js.indexOf('const EQUIPMENT_TYPES ='));
const mappings=js.slice(js.indexOf('const routeGroups ='),js.indexOf('const panels ='));
const switchFn=js.slice(js.indexOf('function showView(viewName) {'),js.indexOf('for (const button of navButtons) button.addEventListener'));
vm.runInNewContext(headings+'\n'+mappings+'\n'+switchFn+'\nthis.openRoute=showView;',context);
function check(route,group,panel){
 context.openRoute(route);
 assert.equal(panels.filter(x=>!x.hidden).length,1,route+' must show exactly one panel');
 assert.equal(panels.find(x=>!x.hidden).dataset.panel,panel);
 assert.equal(groups.filter(x=>x.classes.has('is-active')).length,2);
 assert(groups.filter(x=>x.classes.has('is-active')).every(x=>x.dataset.group===group));
 assert.equal(links.filter(x=>!x.hidden).length,[...links].filter(x=>x.dataset.navGroup===group).length);
 assert.equal(links.filter(x=>x.classes.has('is-active')).length,2);
 assert(links.filter(x=>x.classes.has('is-active')).every(x=>x.dataset.view===route));
}
check('dashboard','home','dashboard');
check('schedule','inspection','schedule');
check('plans','inspection','equipment');assert.equal(planModeNote.hidden,false);
check('equipment','admin','equipment');assert.equal(planModeNote.hidden,true);
check('faults','repairs','faults');
check('photos','admin','photos');
check('backup','admin','backup');
check('history','inspection','history');
editor.hidden=false;mayLeave=false;
const prior=context.title.textContent;
context.openRoute('dashboard');assert.equal(context.title.textContent,prior,'guarded unsaved inspection must prevent navigation');
console.log('PASS: 4 grouped menus, 8 routes, 7 original views, plan management routing, unsaved editor guard');
