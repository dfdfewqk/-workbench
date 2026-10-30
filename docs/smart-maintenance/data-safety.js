/* Data visibility and opt-in test-equipment cleanup. IndexedDB schema is unchanged. */
(() => {
  'use strict';
  const model=globalThis.SmartMaintenanceCleanupModel;
  const $=id=>document.getElementById(id);
  if (!model || !$('sm-data-overview') || !$('sm-cleanup-panel')) return;
  const REQUIRED=model.STORES;
  let db=null, snapshot=null, selected=new Set(), pending=null, busy=false, detailRefreshPending=false;
  const say=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('저장 영역 요청 실패'));});
  function done(t){return new Promise((resolve,reject)=>{t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error||Error('거래가 취소되었습니다.'));});}
  async function connect(){
    if (!indexedDB || typeof indexedDB.databases!=='function') throw Error('IndexedDB 목록 확인을 지원하는 Chrome/Edge가 필요합니다.');
    const listed=await indexedDB.databases();
    if(!listed.some(x=>x.name==='smart-maintenance'))throw Error('이 주소와 브라우저 프로필에 기존 저장소가 없습니다.');
    if(db) return db;
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open('smart-maintenance',6);
      r.onupgradeneeded=()=>{r.transaction?.abort();reject(Error('기존 v6 저장소가 아니므로 안전하게 중단했습니다.'));};
      r.onsuccess=()=>{db=r.result;db.onversionchange=()=>{db.close();db=null;say('sm-data-overview','저장소 구조가 변경됐습니다. 새로고침해 주세요.');};resolve(db);};
      r.onerror=()=>reject(r.error||Error('DB 연결 실패'));
      r.onblocked=()=>reject(Error('다른 탭에서 저장소를 사용 중입니다.'));
    });
  }
  function names(connection){const names=[...connection.objectStoreNames];const extra=names.filter(name=>!REQUIRED.includes(name));
    if(extra.length)throw Error('알 수 없는 저장 영역: '+extra.join(', '));
    for(const required of REQUIRED)if(!names.includes(required))throw Error('누락된 저장 영역: '+required);
    return names;
  }
  async function readAll(connection){
    const all=names(connection),t=connection.transaction(all,'readonly'),completed=done(t);
    const records=await Promise.all(all.map(async name=>[name,await req(t.objectStore(name).getAll())]));
    await completed;return Object.fromEntries(records);
  }
  async function readCounts(connection){
    const all=names(connection),t=connection.transaction(all,'readonly'),completed=done(t);
    const counts=await Promise.all(all.map(name=>req(t.objectStore(name).count())));
    await completed;
    return Object.fromEntries(all.map((name,index)=>[name,counts[index]]));
  }
  function backupText(){
    let raw=null;try{raw=localStorage.getItem('smart-maintenance:last-backup');}catch(_){return '백업 날짜: 확인 불가';}
    const when=raw?new Date(raw):null;
    return when&&!Number.isNaN(when.getTime())?'마지막 백업 확인: '+when.toLocaleString('ko-KR'):'백업 확인 기록 없음';
  }
  function overview(counts){const count=name=>counts[name]||0;
    say('sm-data-overview',`이 브라우저에 저장된 기록 · 설비 ${count('equipment')}대 / 점검 ${count('inspectionRecords')}건 / 고장 ${count('faults')}건 / 정비 ${count('maintenanceRecords')}건 / 사진 ${count('photos')}건`);
    say('sm-backup-when',backupText()+' · 자동 백업이 아닙니다. 별도 백업 파일을 보관하세요.');
    say('sm-data-origin','로컬 저장 출처: '+location.origin+' · 다른 주소·브라우저 프로필·PC·휴대폰과 데이터가 자동 공유되지 않습니다.');
  }
  function safeText(tag,txt,cls){const el=document.createElement(tag);el.textContent=txt;if(cls)el.className=cls;return el;}
  function showList(data){
    const div=$('sm-cleanup-list');div.replaceChildren();
    const assets=(data.equipment||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko'));
    if(!assets.length){div.append(safeText('p','등록된 설비가 없습니다.'));return;}
    for(const asset of assets){const label=document.createElement('label');label.className='sm-cleanup-item';const input=document.createElement('input');input.type='checkbox';input.value=asset.id;input.checked=selected.has(asset.id);input.addEventListener('change',()=>{if(input.checked)selected.add(asset.id);else selected.delete(asset.id);preview();});
      const info=document.createElement('span');info.append(safeText('strong',asset.name||'(이름 없음)'),safeText('small',`관리번호: ${asset.assetCode||'없음'} · ${asset.status==='archived'?'보관':'운영'} · ${asset.location||'위치 미기재'}`));label.append(input,info);div.append(label);}
  }
  function allowDelete(){const button=$('sm-cleanup-delete');button.disabled=busy||!pending||!selected.size||
    !$('sm-cleanup-backup').checked||!$('sm-cleanup-ack').checked||$('sm-cleanup-phrase').value.trim()!=='선택 설비 삭제';}
  function preview(){pending=null;if(!snapshot){allowDelete();return;}
    try{if(!selected.size){say('sm-cleanup-preview','삭제할 테스트 설비를 선택해 주세요.');}
      else{const p=model.plan(snapshot,[...selected]);pending={plan:p,ids:[...selected],signature:model.signature(snapshot)};
        say('sm-cleanup-preview',[`선택 설비 ${p.equipmentCount}대 · 삭제 예정 총 ${p.total}건`,...Object.entries(p.counts).map(([key,value])=>`• ${model.LABELS[key]||key} ${value}건`),'선택하지 않은 설비와 기본 설정은 유지됩니다.'].join('\n'));}
    }catch(e){say('sm-cleanup-preview','삭제 대상 확인 실패: '+e.message);}allowDelete();
  }
  async function refresh(options={}){if(busy){if(options.loadDetails||$('sm-cleanup-panel').open)detailRefreshPending=true;return;}busy=true;allowDelete();say('sm-data-overview','브라우저 저장소에서 기록 건수 조회 중…');
    try{
      const connection=await connect();const counts=await readCounts(connection);overview(counts);
      if(options.loadDetails||$('sm-cleanup-panel').open){
        snapshot=await readAll(connection);
        selected=new Set([...selected].filter(id=>snapshot.equipment.some(x=>x.id===id)));
        showList(snapshot);preview();
        say('sm-cleanup-message','삭제 대상과 연결된 기록을 확인했습니다. 아직 삭제된 데이터는 없습니다.');
      }else{snapshot=null;pending=null;}
    }catch(e){snapshot=null;pending=null;say('sm-data-overview','기록 조회 실패: '+e.message);say('sm-cleanup-message','오류: '+e.message);}
    finally{busy=false;allowDelete();if(detailRefreshPending){detailRefreshPending=false;if($('sm-cleanup-panel').open)void refresh({loadDetails:true});}}
  }
  async function removeSelected(){if(busy||!pending||$('sm-cleanup-delete').disabled)return;
    const {ids,signature,plan}=pending;
    if(!confirm(`선택한 테스트 설비 ${ids.length}대 및 연결 기록 총 ${plan.total}건을 영구 삭제합니다.\n백업 파일을 실제로 보관했고 삭제 대상을 확인했습니까?`))return;
    busy=true;allowDelete();say('sm-cleanup-message','변경 여부를 확인하고 있습니다. 삭제 완료 전 창을 닫지 마세요.');
    try{
      const connection=await connect();const all=names(connection);
      const deleted=await new Promise((resolve,reject)=>{
        const t=connection.transaction(all,'readwrite'),now={},completedNames=[];let failed=null;
        t.oncomplete=()=>resolve(plan.total);
        t.onabort=()=>reject(failed||t.error||Error('삭제가 취소됐습니다. 기록은 변경되지 않았습니다.'));
        for(const name of all){const r=t.objectStore(name).getAll();r.onsuccess=()=>{
          now[name]=r.result;completedNames.push(name);
          if(completedNames.length===all.length){try{
            if(model.signature(now)!==signature)throw Error('미리보기 이후 기록이 변경됐습니다. 새로 조회해 주세요.');
            const actual=model.plan(now,ids);
            if(actual.total!==plan.total || JSON.stringify(actual.counts)!==JSON.stringify(plan.counts))throw Error('삭제 예정 건수가 변경됐습니다.');
            for(const [store,keys] of Object.entries(actual.removed))for(const key of keys)t.objectStore(store).delete(key);
          }catch(error){failed=error;t.abort();}}
        };r.onerror=()=>{failed=r.error||Error('삭제 전 조회 실패');t.abort();};}
      });
      selected.clear();pending=null;$('sm-cleanup-phrase').value='';$('sm-cleanup-ack').checked=false;$('sm-cleanup-backup').checked=false;
      snapshot=await readAll(connection);showList(snapshot);overview(await readCounts(connection));preview();
      say('sm-cleanup-message',`삭제 완료: 테스트 설비 ${ids.length}대와 연결 기록 총 ${deleted}건을 삭제했습니다. 화면에 남아 있는 이전 설비 목록은 앱을 새로고침하면 갱신됩니다.`);
      window.dispatchEvent(new Event('smart-maintenance:data-changed'));
    }catch(e){say('sm-cleanup-message','삭제 미완료: '+e.message+' 삭제 완료로 표시하지 않습니다.');}
    finally{busy=false;allowDelete();}
  }
  $('sm-data-refresh').addEventListener('click',refresh);
  $('sm-cleanup-refresh').addEventListener('click',()=>refresh({loadDetails:true}));
  $('sm-cleanup-delete').addEventListener('click',removeSelected);
  for(const id of ['sm-cleanup-backup','sm-cleanup-ack','sm-cleanup-phrase'])$(id).addEventListener(id==='sm-cleanup-phrase'?'input':'change',allowDelete);
  $('sm-cleanup-panel').addEventListener('toggle',()=>{if($('sm-cleanup-panel').open)refresh({loadDetails:true});else{snapshot=null;pending=null;allowDelete();}});
  window.addEventListener('smart-maintenance:data-changed',()=>{if(!busy)refresh();});
  window.addEventListener('smart-maintenance:data-ready',()=>{if(!busy)refresh();});
  window.addEventListener('smart-maintenance:backup-confirmed',()=>say('sm-backup-when',backupText()));
  window.addEventListener('beforeunload',()=>db?.close());
  globalThis.SmartMaintenanceDataTools=Object.freeze({refresh,markSaved:()=>{say('sm-save-feedback','설비 변경사항 저장 완료 · 이 브라우저의 IndexedDB');window.dispatchEvent(new Event('smart-maintenance:data-changed'));},markSaving:()=>say('sm-save-feedback','설비 변경사항 저장 중…'),markError:()=>say('sm-save-feedback','설비 저장 실패 · 아래 오류 내용을 확인해 주세요.')});
  // Wait for app.js bootstrap so the v6 version bridge and stores have initialized.
  window.addEventListener('load',()=>{refresh();});
})();
