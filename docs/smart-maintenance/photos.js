/* Optional photo evidence; links to existing records and keeps source records immutable. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('photo-form')) return;
  const DB = 'smart-maintenance', VERSION = 6;
  const types = {inspection:'inspectionRecords',fault:'faults',maintenance:'maintenanceRecords'};
  const labels = {inspection:'점검',fault:'고장',maintenance:'정비'};
  const phases = {observation:'상태·이상',before:'정비 전',after:'정비 후'};
  const MAX_INPUT = 12 * 1024 * 1024, MAX_ORIGINAL = 8 * 1024 * 1024;
  const MAX_OPTIMIZED = 1.5 * 1024 * 1024, MAX_PIXELS = 60_000_000;
  let records = {}, equipment = [], photos = [], busy = false;
  function request(r) { return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error || Error('조회 실패'));}); }
  function completed(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error || Error('저장 실패'));});}
  function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error || Error('DB 열기 실패'));r.onblocked=()=>reject(Error('다른 탭을 닫은 후 다시 실행하세요.'));});}
  const fmt = n => `${(n/1024/1024).toFixed(1)}MB`;
  const localTimestamp = value => {
    const time = new Date(value || '');
    return Number.isNaN(time.getTime()) ? '시각 미상' : new Intl.DateTimeFormat('ko-KR',
      {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);
  };
  const localDay = value => {
    if (!value) return '날짜 미상';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return String(value).slice(0,10);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  function status(message, bad=false){$('photo-status').textContent=message;$('photo-status').classList.toggle('is-error',bad);}
  function id() {return `photo-${crypto.randomUUID()}`;}
  function getName(row,type){const day=row.inspectedAt || row.maintainedAt || row.createdAt || '';
    const text=type==='fault'?(row.symptom || row.summary || '고장'):type==='inspection'?(row.inspector||'점검'):row.workDescription||row.worker||'정비';
    return `${row.equipmentName || row.assetCode || row.equipmentId || '설비'} · ${localDay(day)} · ${String(text).slice(0,70)} (${row.id.slice(-8)})`;
  }
  function permitted(row){return equipment.some(e=>e.id===row.equipmentId && e.status!=='archived');}
  async function read() {
    const db=await open();
    try {const names=['equipment',...Object.values(types),'photos'];const tx=db.transaction(names,'readonly');const finished=completed(tx);
      const [eq,ins,fault,main,pics] = await Promise.all(names.map(n=>request(tx.objectStore(n).getAll())));
      await finished;equipment=eq;records={inspection:ins,fault,maintenance:main};photos=pics;
    }finally{db.close();}
  }
  function selectRows(){
    const type=$('photo-record-type').value, selection=$('photo-record-id'), previous=selection.value;
    selection.replaceChildren(new Option('연결할 기록 선택',''));
    records[type].filter(permitted).sort((a,b)=>String(b.createdAt||b.inspectedAt||b.maintainedAt||'').localeCompare(String(a.createdAt||a.inspectedAt||a.maintainedAt||'')))
      .slice(0,400).forEach(row=>selection.add(new Option(getName(row,type),row.id)));
    if([...selection.options].some(o=>o.value===previous)) selection.value=previous;
  }
  async function space(){
    const used=photos.reduce((n,p)=>n+(p.optimizedBytes||0)+(p.originalBytes||0),0);
    let message=`사진 저장 용량 추정: ${fmt(used)} · ${photos.filter(p=>!p.hiddenAt).length}장 표시`;
    if(navigator.storage?.estimate){try{const e=await navigator.storage.estimate();if(e.quota) message+=`\n브라우저 전체 사용량 ${fmt(e.usage||0)} / 할당량 ${fmt(e.quota)}`;}catch(_){/* unsupported */}}
    $('photo-space').textContent=message+'\n브라우저 데이터를 삭제하면 사진도 사라질 수 있습니다. 외부 백업을 권장합니다.';
  }
  function gallery(){const host=$('photo-gallery');host.replaceChildren();
    if(!photos.length){const p=document.createElement('p');p.textContent='등록된 사진이 없습니다.';host.append(p);return;}
    if(photos.length>50){const note=document.createElement('p');note.textContent=`최근 50장만 표시합니다. 전체 ${photos.length}장은 백업에 포함됩니다.`;host.append(note);}
    for(const p of photos.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50)) {
      const card=document.createElement('article');card.className='photo-card'+(p.hiddenAt?' is-hidden':'');
      // Hidden photos remain in the immutable audit data and backups, but their
      // image pixels must not be shown in the normal gallery.
      if (!p.hiddenAt) {
        const img=document.createElement('img');img.alt=`${labels[p.recordType]} ${phases[p.phase]} 사진`;img.loading='lazy';img.src=`data:${p.optimizedMime};base64,${p.optimizedData}`;
        card.append(img);
      }
      const heading=document.createElement('strong');heading.textContent=`${labels[p.recordType]} · ${phases[p.phase]}${p.hiddenAt?' · 숨김':''}`;
      const detail=document.createElement('small');detail.textContent=p.hiddenAt
        ? `숨김 사진 (기록만 보존)\n처리자: ${p.hiddenBy || '기록 없음'}\n사유: ${p.hiddenReason || '기록 없음'}\n처리 시각: ${localTimestamp(p.hiddenAt)}`
        : `${p.recordLabel || p.recordId}\n${p.description}\n${p.actor} · ${localTimestamp(p.createdAt)} · 최적화 ${fmt(p.optimizedBytes)}${p.originalBytes?' · 원본 '+fmt(p.originalBytes):''}`;
      detail.style.whiteSpace='pre-wrap';card.append(heading,detail);
      if(p.originalData && !p.hiddenAt) {
        const link=document.createElement('button');link.type='button';link.className='secondary-button';link.textContent='원본 사진 저장';link.addEventListener('click',()=>{
          const bytes=Uint8Array.from(atob(p.originalData),ch=>ch.charCodeAt(0));
          const blob=new Blob([bytes],{type:p.originalMime});const url=URL.createObjectURL(blob);
          const a=document.createElement('a');a.href=url;a.download=`${p.id}.${p.originalMime==='image/png'?'png':p.originalMime==='image/webp'?'webp':'jpg'}`;
          a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
        });card.append(link);
      }
      if(!p.hiddenAt){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='사진 숨김 (사유 기록)';
        button.addEventListener('click',async()=>{
          const actor=prompt('숨김 처리자 이름을 입력하세요.');if(!actor?.trim())return;
          const reason=prompt('숨김 사유를 입력하세요.');if(!reason?.trim())return;
          if(!confirm('사진을 목록에서 숨깁니다. 원본 기록과 사진 데이터는 삭제되지 않습니다.'))return;
          try{const db=await open();try{const tx=db.transaction('photos','readwrite');const finished=completed(tx);const store=tx.objectStore('photos');const now=await request(store.get(p.id));if(!now||now.hiddenAt)throw Error('이미 변경된 사진입니다.');
            now.hiddenAt=new Date().toISOString();now.hiddenBy=actor.trim().slice(0,100);now.hiddenReason=reason.trim().slice(0,1000);store.put(now);await finished;
          }finally{db.close();}localStorage.setItem('smart-maintenance:photo-updated',String(Date.now()));await refresh();status('사진 숨김 이력을 보존했습니다.');}catch(e){status(e.message,true);}
        });card.append(button);}
      host.append(card);
    }
  }
  async function refresh(){await read();selectRows();gallery();await space();}
  function validSignature(bytes) {
    const has=(...seq)=>seq.every((b,i)=>bytes[i]===b);
    if(has(0xff,0xd8,0xff))return 'image/jpeg';
    if(has(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return 'image/png';
    if(String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
    throw Error('지원하지 않는 사진 형식입니다. JPG·PNG·WebP만 가능합니다.');
  }
  const asBase64=bytes=>{let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.slice(i,i+16384));return btoa(result);};
  async function optimize(file){
    if(file.size>MAX_INPUT || !file.size)throw Error('사진은 12MB 이하의 JPG·PNG·WebP 파일만 등록할 수 있습니다.');
    const signature=validSignature(new Uint8Array(await file.slice(0,12).arrayBuffer()));
    let image;
    try{image=await createImageBitmap(file);}catch(_){throw Error('이미지를 해석할 수 없습니다. 사진 파일을 확인하세요.');}
    try{
      if(image.width*image.height>MAX_PIXELS)throw Error('사진 해상도가 너무 높습니다. 다른 파일을 사용하세요.');
      let width=image.width,height=image.height,scale=Math.min(1,1600/Math.max(width,height)),blob;
      for(let attempt=0;attempt<4;attempt++){
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('사진 최적화 기능을 사용할 수 없습니다.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.78-attempt*0.08));
        canvas.width=canvas.height=0;
        if(!blob)throw Error('사진 최적화에 실패했습니다.');
        if(blob.size<=MAX_OPTIMIZED)break;
        scale*=0.75;
      }
      if(blob.size>MAX_OPTIMIZED)throw Error('최적화 후 용량이 1.5MB를 초과합니다. 더 작은 사진을 사용하세요.');
      const optimized=asBase64(new Uint8Array(await blob.arrayBuffer()));
      return {optimizedMime:'image/jpeg',optimizedBytes:blob.size,optimizedData:optimized,originalMime:signature};
    }finally{image.close();}
  }
  $('photo-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    const type=$('photo-record-type').value,recordId=$('photo-record-id').value;
    const actor=$('photo-actor').value.trim(),description=$('photo-description').value.trim();const file=$('photo-file').files[0];
    const keepOriginal=$('photo-original').checked;
    if(!recordId||!actor||!description||!file)return status('연결할 기록, 등록자, 설명, 사진 파일을 확인하세요.',true);
    if(keepOriginal&&file.size>MAX_ORIGINAL)return status('원본 보존 시 사진 파일은 8MB 이하만 가능합니다.',true);
    busy=true;$('photo-save').disabled=true;status('사진을 최적화하고 저장하고 있습니다.');
    try {
      const photo=await optimize(file);
      let original={};if(keepOriginal)original={originalMime:photo.originalMime,originalBytes:file.size,originalData:asBase64(new Uint8Array(await file.arrayBuffer()))};
      const db=await open();
      try{const tx=db.transaction([types[type],'equipment','photos'],'readwrite');const finished=completed(tx);
        const record=await request(tx.objectStore(types[type]).get(recordId));
        if(!record)throw Error('연결할 기록을 찾을 수 없습니다.');
        const equip=await request(tx.objectStore('equipment').get(record.equipmentId));
        if(!equip||equip.status==='archived')throw Error('보관된 설비에는 새 사진을 등록할 수 없습니다.');
        const current=await request(tx.objectStore('photos').getAll());
        if(current.filter(p=>p.recordId===recordId && !p.hiddenAt).length>=10)throw Error('한 기록에 사진은 최대 10장까지 등록할 수 있습니다.');
        const newSize=photo.optimizedBytes+(original.originalBytes||0);
        if(current.reduce((n,p)=>n+(p.optimizedBytes||0)+(p.originalBytes||0),0)+newSize>60*1024*1024)throw Error('사진 저장 총량 60MB 한도를 초과합니다. 기존 사진을 백업 후 관리하세요.');
        tx.objectStore('photos').add({id:id(),recordType:type,recordId,equipmentId:record.equipmentId,recordLabel:getName(record,type),phase:$('photo-phase').value,actor,description,createdAt:new Date().toISOString(),captureDateSource:file.lastModified?'파일 수정 시각':'확인 불가',fileLastModified:file.lastModified?new Date(file.lastModified).toISOString():null,...photo,...original});
        await finished;
      }finally{db.close();}
      $('photo-file').value='';$('photo-description').value='';$('photo-original').checked=false;
      localStorage.setItem('smart-maintenance:photo-updated',String(Date.now()));await refresh();status('사진을 저장했습니다. 원본 점검·정비·고장 이력은 변경하지 않았습니다.');
    }catch(error){status(error.message||String(error),true);}
    finally{busy=false;$('photo-save').disabled=false;}
  });
  // Contextual photo registration from an existing inspection, fault, or maintenance record.
  let contextRequest = 0;
  window.addEventListener('smart-maintenance:photo-context', async event => {
    const {recordType, recordId} = event.detail || {};
    if (!Object.hasOwn(types, recordType) || !recordId) return;
    const token = ++contextRequest;
    try {
      await read();
      if (token !== contextRequest) return;
      $('photo-record-type').value = recordType;
      selectRows();
      const row = (records[recordType] || []).find(item => item.id === recordId);
      if (!row || !permitted(row) || ![...$('photo-record-id').options].some(option => option.value === recordId)) {
        status('대상 기록을 선택할 수 없습니다. 기록 보관 여부 또는 최근 400개 목록 제한을 확인하세요.', true);
        return;
      }
      $('photo-record-id').value = recordId;
      $('photo-phase').value = recordType === 'maintenance' ? 'after' : 'observation';
      status('사진을 추가할 기존 기록을 자동 선택했습니다. 등록자·설명·파일을 확인하세요.');
      $('photo-description').focus();
    } catch (error) { if (token === contextRequest) status('사진 연결 실패: '+error.message, true); }
  });
  const faultPhotoButton = $('fault-add-photo');
  if (faultPhotoButton) {
    window.addEventListener('smart-maintenance:fault-selected', event => {
      const fault = event.detail?.fault;
      faultPhotoButton.hidden = !fault || !!event.detail?.archived;
      faultPhotoButton.dataset.recordId = fault?.id || '';
    });
    faultPhotoButton.addEventListener('click', () => {
      if (faultPhotoButton.dataset.recordId) window.dispatchEvent(new CustomEvent('smart-maintenance:open-photo', {
        detail: {recordType:'fault', recordId:faultPhotoButton.dataset.recordId}
      }));
    });
  }
  $('photo-record-type').addEventListener('change',selectRows);
  $('photo-refresh').addEventListener('click',()=>refresh().catch(e=>status(e.message,true)));
  document.querySelectorAll('[data-view="photos"]').forEach(b=>b.addEventListener('click',()=>refresh().catch(e=>status(e.message,true))));
  refresh().catch(e=>status('사진 저장소 초기화 실패: '+e.message,true));
})();
