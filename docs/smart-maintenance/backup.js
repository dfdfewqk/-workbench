/* Smart Maintenance encrypted export/import: user-triggered; no network/API usage. */
(() => {
  'use strict';
  const DB_NAME = 'smart-maintenance';
  const VERSION = 6;
  const FILE_KIND = 'smart-maintenance-backup';
  const ENCRYPTED_KIND = 'smart-maintenance-encrypted-backup';
  const VERSION_FORMAT = 1;
  const MAX_IMPORT_BYTES = 150 * 1024 * 1024;
  const MAX_EXPORT_BYTES = 150 * 1024 * 1024;
  const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
  const ITERATIONS = 250000;
  const element = (id) => document.getElementById(id);
  const expStatus = element('backup-export-status');
  const impStatus = element('backup-import-status');
  const previewText = element('backup-preview-summary');
  const conflictsEl = element('backup-conflicts');
  const restoreButton = element('backup-restore');
  const options = element('backup-restore-options');
  if (!element('backup-export') || !element('backup-preview')) return;

  let preview = null;
  let sourceFile = null;
  let cancelled = false;
  const progress = element('backup-progress');
  const cancel = element('backup-cancel');
  const frequency = element('backup-frequency');
  const sizeHint = element('backup-size');
  const fmt = size => `${(size / (1024 * 1024)).toFixed(1)}MB`;
  const checkCancel = () => { if (cancelled) throw Error('요청에 따라 백업을 취소했습니다. 기존 기록은 변경되지 않았습니다.'); };
  const markProgress = (value, message) => {
    if (!progress) return;
    progress.hidden = false;
    progress.value = value;
    if (message) say(expStatus, message);
  };
  if (cancel) cancel.addEventListener('click', () => { cancelled = true; say(expStatus, '취소 요청을 확인했습니다. 현재 처리 단계가 끝나면 중단합니다.'); });
  if (frequency) {
    const saved = Number(localStorage.getItem('smart-maintenance:backup-frequency'));
    frequency.value = String(Number.isInteger(saved) && saved >= 1 && saved <= 365 ? saved : 7);
    frequency.addEventListener('change', () => {
      const days = Math.max(1, Math.min(365, Math.floor(Number(frequency.value) || 7)));
      frequency.value = String(days);
      localStorage.setItem('smart-maintenance:backup-frequency', String(days));
      refreshReminder();
    });
  }

  const say = (where, message, error = false) => {
    where.textContent = message;
    where.classList.toggle('is-error', error);
  };
  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || Error('데이터베이스 열기 실패'));
      r.onblocked = () => reject(Error('다른 탭에서 사용 중입니다. 모든 Smart Maintenance 탭을 닫고 다시 시도하세요.'));
    });
  }
  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || Error('데이터 요청 실패'));
    });
  }
  function done(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error || Error('트랜잭션이 취소되었습니다.'));
      t.onerror = () => {};
    });
  }
  async function readAll(db) {
    const names = Array.from(db.objectStoreNames);
    const t = db.transaction(names, 'readonly');
    const finished = done(t);
    const entries = await Promise.all(names.map(async name => [name, await req(t.objectStore(name).getAll())]));
    await finished;
    return Object.fromEntries(entries);
  }
  function bytesToBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  function base64ToBytes(s) {
    const binary = atob(s);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
  async function compress(bytes) {
    if (!globalThis.CompressionStream) throw Error('이 브라우저는 압축을 지원하지 않습니다. 최신 Chrome 또는 Edge를 이용하세요.');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  }
  async function decompress(bytes) {
    if (!globalThis.DecompressionStream) throw Error('이 브라우저는 압축 해제를 지원하지 않습니다.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const parts = []; let total = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_UNCOMPRESSED_BYTES) throw Error('압축 해제 크기가 안전 한도를 넘었습니다.');
        parts.push(value);
      }
    } catch (error) { await reader.cancel().catch(()=>{}); throw error; }
    const output = new Uint8Array(total); let position = 0;
    for (const part of parts) {output.set(part, position);position += part.byteLength;}
    return output;
  }
  async function deriveKey(password, salt, usage) {
    if (!crypto?.subtle) throw Error('암호화 기능을 사용할 수 없습니다. localhost 또는 HTTPS에서 실행하세요.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material,
      { name: 'AES-GCM', length: 256 }, false, [usage]);
  }
  async function encrypt(data, password) {
    if (password.length < 10) throw Error('암호화 비밀번호는 10자 이상으로 입력하세요.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const packed = await compress(new TextEncoder().encode(JSON.stringify(data)));
    const key = await deriveKey(password, salt, 'encrypt');
    const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed));
    return { kind: ENCRYPTED_KIND, version: VERSION_FORMAT, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
      compression: 'gzip', salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(bytes) };
  }
  async function decode(document, password) {
    if (document?.kind === ENCRYPTED_KIND && document.version === VERSION_FORMAT) {
      if (!password) throw Error('암호화된 백업의 비밀번호를 입력하세요.');
      if (document.algorithm !== 'AES-256-GCM' || document.compression !== 'gzip' || document.kdf !== 'PBKDF2-SHA256' || document.iterations !== ITERATIONS) {
        throw Error('지원하지 않는 암호화 형식입니다.');
      }
      try {
        const key = await deriveKey(password, base64ToBytes(document.salt), 'decrypt');
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(document.iv) }, key, base64ToBytes(document.ciphertext));
        document = JSON.parse(new TextDecoder().decode(await decompress(new Uint8Array(bytes))));
      } catch (e) {
        throw Error('비밀번호가 틀렸거나 암호화 백업 파일이 손상되었습니다.');
      }
    }
    if (document?.kind !== FILE_KIND || document.version !== VERSION_FORMAT || !document.stores || typeof document.stores !== 'object') {
      throw Error('지원하지 않는 백업 파일 형식입니다.');
    }
    if (!Number.isInteger(document.databaseVersion) || document.databaseVersion > VERSION || document.databaseVersion < 1) {
      throw Error('지원하지 않는 백업 데이터베이스 버전입니다.');
    }
    // Additive migration: a v1-v5 backup predates the photo store. No fabricated photo records.
    if (document.databaseVersion < 6 && !Object.hasOwn(document.stores, 'photos')) document.stores.photos = [];
    for (const [name, rows] of Object.entries(document.stores)) {
      if (!Array.isArray(rows) || !rows.every(x => x && typeof x === 'object' && typeof x.id === 'string')) {
        throw Error(`${name} 저장소 데이터가 올바르지 않습니다.`);
      }
      if (new Set(rows.map(x => x.id)).size !== rows.length) throw Error(`${name} 저장소에 중복 ID가 존재합니다.`);
      if (name === 'photos') for (const photo of rows) {
        if (!['inspection','fault','maintenance'].includes(photo.recordType) || !photo.recordId || !photo.equipmentId ||
          !['image/jpeg'].includes(photo.optimizedMime) || typeof photo.optimizedData !== 'string' ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(photo.optimizedData) || photo.optimizedData.length > 3 * 1024 * 1024 ||
          !Number.isInteger(photo.optimizedBytes) || photo.optimizedBytes < 0 || photo.optimizedBytes > 1.5 * 1024 * 1024 ||
          (photo.originalData && (typeof photo.originalData !== 'string' || photo.originalData.length > 12 * 1024 * 1024 ||
           !['image/png','image/jpeg','image/webp'].includes(photo.originalMime) || !Number.isInteger(photo.originalBytes) || photo.originalBytes > 8 * 1024 * 1024))) {
          throw Error('사진 저장소에 지원하지 않는 이미지 데이터가 포함되어 있습니다.');
        }
      }
    }
    return document;
  }
  function downloadFile(contents, name) {
    const blob = new Blob([JSON.stringify(contents)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function currentDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function getFrequency() { return Math.max(1, Math.min(365, Number(frequency?.value) || 7)); }
  async function saveBackup({ password, encrypted, suffix = '', interactive = false } = {}) {
    if (interactive) markProgress(5, '백업할 저장소를 확인하고 있습니다.');
    checkCancel();
    const db = await openDB();
    try {
      const stores = await readAll(db);
      checkCancel();
      if (interactive) markProgress(30, '기록과 사진을 백업 형식으로 정리하고 있습니다.');
      const data = { kind: FILE_KIND, version: VERSION_FORMAT, databaseVersion: VERSION, exportedAt: new Date().toISOString(),
        settings: { backupFrequencyDays: getFrequency() }, stores };
      const sourceSize = new Blob([JSON.stringify(data)]).size;
      if (sourceSize > MAX_UNCOMPRESSED_BYTES) throw Error(`원본 데이터 ${fmt(sourceSize)}: 안전 처리 한도 ${fmt(MAX_UNCOMPRESSED_BYTES)}를 초과합니다. 일부 데이터 삭제가 아닌 분할 백업 지원이 필요합니다.`);
      if (interactive) markProgress(55, encrypted ? '데이터를 압축·암호화하고 있습니다.' : '백업 파일을 생성하고 있습니다.');
      checkCancel();
      const packed = encrypted ? await encrypt(data, password) : data;
      checkCancel();
      if (interactive) markProgress(90, '완성된 백업 파일을 내려받기 준비 중입니다.');
      const fileBytes = new Blob([JSON.stringify(packed)]).size;
      if (fileBytes > MAX_EXPORT_BYTES) throw Error(`백업 파일이 ${fmt(MAX_EXPORT_BYTES)} 제한을 초과했습니다. 기록은 변경되지 않았습니다.`);
      const filename = `smart-maintenance-${currentDate()}${suffix}.${encrypted ? 'smbak' : 'json'}`;
      downloadFile(packed, filename);
      if (interactive) markProgress(100, '다운로드 요청 완료. 다운로드 폴더에 파일이 있는지 확인해 주세요.');
      return { filename, count: Object.values(stores).reduce((n, rows) => n + rows.length, 0) };
    } finally { db.close(); }
  }
  const exportButton = element('backup-export');
  exportButton.addEventListener('click', async () => {
    const encrypted = element('backup-encrypted').checked;
    const password = element('backup-password').value;
    if (!encrypted && !confirm('일반 JSON에는 담당자·정비 기록이 암호화되지 않고 저장됩니다. 계속하시겠습니까?')) return;
    exportButton.disabled = true;
    cancelled = false; if (cancel) cancel.hidden = false;
    say(expStatus, '백업을 생성하고 있습니다. 창을 닫지 마세요.');
    try {
      const out = await saveBackup({ password, encrypted, interactive:true });
      // Browser download APIs cannot guarantee the user actually kept the file.
      if (confirm(`${out.filename} 파일이 다운로드 폴더에 실제 저장되었습니까? 확인해야 백업 완료 날짜가 갱신됩니다.`)) {
        const d = await openDB();
        try { const t = d.transaction('photos','readonly');const finished=done(t);
          const count = await req(t.objectStore('photos').count());await finished;
          localStorage.setItem('smart-maintenance:last-backup-photo-count',String(count));
        }finally{d.close();}
        localStorage.setItem('smart-maintenance:last-backup', new Date().toISOString());
        window.dispatchEvent(new Event('smart-maintenance:backup-confirmed'));
        refreshReminder();
      }
      say(expStatus, `백업 파일 다운로드 요청 완료: ${out.filename} · 데이터 ${out.count}건. 다운로드 폴더에서 파일을 확인하세요.`);
    } catch (e) { say(expStatus, e.message, true); }
    finally { exportButton.disabled = false; if (cancel) cancel.hidden = true; }
  });
  function clearPreview() {
    preview = null;
    sourceFile = null;
    previewText.textContent = '';
    conflictsEl.replaceChildren();
    options.hidden = true;
    restoreButton.disabled = true;
  }
  element('backup-import-file').addEventListener('change', clearPreview);
  element('backup-import-password').addEventListener('input', clearPreview);
  async function makePreview() {
    const file = element('backup-import-file').files[0];
    if (!file) throw Error('복원할 백업 파일을 선택하세요.');
    if (file.size > MAX_IMPORT_BYTES) throw Error(`백업 파일이 안전 처리 한도 ${fmt(MAX_IMPORT_BYTES)}를 초과합니다.`);
    say(impStatus, '백업 파일을 확인하고 있습니다.');
    const payload = JSON.parse(await file.text());
    const backup = await decode(payload, element('backup-import-password').value);
    if (new Blob([JSON.stringify(backup)]).size > MAX_UNCOMPRESSED_BYTES) throw Error('복원 원본 크기가 안전 처리 한도를 초과합니다.');
    const db = await openDB();
    let current, names;
    try {
      names = Array.from(db.objectStoreNames);
      for (const name of Object.keys(backup.stores)) {
        if (!names.includes(name)) throw Error(`복원 대상에 없는 저장소(${name})가 포함되어 있습니다. 안전을 위해 중단합니다.`);
      }
      current = await readAll(db);
    } finally { db.close(); }
    const conflicts = [];
    let novel = 0;
    for (const [name, rows] of Object.entries(backup.stores)) {
      const existing = new Map(current[name].map(row => [row.id, row]));
      for (const row of rows) {
        if (!existing.has(row.id)) novel++;
        else if (JSON.stringify(existing.get(row.id)) !== JSON.stringify(row)) conflicts.push({ name, row });
      }
    }
    if (conflicts.length > 1000) throw Error('충돌 기록이 1,000건을 초과했습니다. 한 번에 안전하게 수동 검토할 수 없어 복원을 중단합니다.');
    const currentTotal = names.reduce((sum, name) => sum + current[name].length, 0);
    const backupTotal = Object.values(backup.stores).reduce((sum, rows) => sum + rows.length, 0);
    const backupIds = Object.fromEntries(names.map(name => [name, new Set((backup.stores[name] || []).map(row => row.id))]));
    const replaceRemoved = names.reduce((sum, name) => sum + current[name].filter(row => !backupIds[name].has(row.id)).length, 0);
    const replaceOverwritten = names.reduce((sum, name) => sum + current[name].filter(row => backupIds[name].has(row.id)).length, 0);
    const summary = () => {
      const mode = document.querySelector('input[name="backup-mode"]:checked')?.value || 'merge';
      const selections = [...conflictsEl.querySelectorAll('select')];
      const overwrite = selections.filter(select => select.value === 'apply').length;
      const common = `백업 시각: ${backup.exportedAt || '기록 없음'}\n현재 기록 ${currentTotal}건 · 백업 기록 ${backupTotal}건\n새 기록 ${novel}건 · 내용이 다른 동일 ID ${conflicts.length}건\n사진 ${backup.stores.photos?.length || 0}장 포함 · DB v${backup.databaseVersion} → 현재 v${VERSION}`;
      previewText.textContent = mode === 'replace'
        ? `${common}\n[전체 교체] 현재 기록 중 백업에 없는 ${replaceRemoved}건 삭제 · 동일 ID ${replaceOverwritten}건은 백업 내용으로 교체\n※ 충돌별 선택은 전체 교체에 적용되지 않습니다. 복원 전 현재 데이터 백업이 필요합니다.`
        : `${common}\n[병합] 새로운 ${novel}건 추가 · 기존 기록 ${overwrite}건 덮어쓰기 · 나머지 동일 ID 기록 유지\n※ 충돌별 선택은 병합 모드에서만 적용됩니다.`;
      conflictsEl.querySelectorAll('select').forEach(select => { select.disabled = mode === 'replace'; });
    };
    conflictsEl.replaceChildren();
    for (const conflict of conflicts) {
      const row = document.createElement('div');
      row.className = 'backup-conflict';
      const label = document.createElement('span');
      label.textContent = `${conflict.name} / ${conflict.row.id}`;
      const select = document.createElement('select');
      select.dataset.store = conflict.name;
      select.dataset.id = conflict.row.id;
      for (const [value, title] of [['keep', '현재 정보 유지'], ['apply', '백업 정보 적용'], ['skip', '이 항목 건너뛰기']]) {
        const opt = new Option(title, value);
        select.add(opt);
      }
      const detail = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = '차이 보기 (사진 원본 데이터 제외)';
      const text = document.createElement('pre');
      const trim = item => JSON.stringify(item, (key, value) =>
        key === 'optimizedData' || key === 'originalData' ? `[사진 데이터 ${String(value).length}자]` : value, 2).slice(0,5000);
      text.textContent = `현재:\n${trim(current[conflict.name].find(x => x.id === conflict.row.id))}\n백업:\n${trim(conflict.row)}`;
      detail.append(summary,text);
      row.append(label, select, detail);
      conflictsEl.append(row);
    }
    conflictsEl.addEventListener('change', summary);
    summary();
    preview = { backup, current, names, conflicts };
    sourceFile = file;
    options.hidden = false;
    restoreButton.disabled = false;
    say(impStatus, '복원 전 비교 완료. 데이터는 아직 변경되지 않았습니다.');
  }
  document.querySelectorAll('input[name="backup-mode"]').forEach(radio => radio.addEventListener('change', () => {
    if (preview) { clearPreview(); say(impStatus, '복원 방식이 변경되었습니다. 안전한 변경 내역 확인을 위해 다시 미리보기를 실행하세요.'); }
  }));
  const previewButton = element('backup-preview');
  previewButton.addEventListener('click', async () => {
    clearPreview();
    previewButton.disabled = true;
    try { await makePreview(); }
    catch (e) { say(impStatus, e.message, true); }
    finally { previewButton.disabled = false; }
  });
  async function refreshReminder() {
    const note = element('backup-reminder');
    if (!note) return;
    const last = localStorage.getItem('smart-maintenance:last-backup');
    if (last && Date.now() - Date.parse(last) < getFrequency() * 86400000) { note.hidden = true; return; }
    let db;
    try {
      db = await openDB();
      // Photo binary is intentionally not loaded merely to show the dashboard reminder.
      const names = Array.from(db.objectStoreNames);
      const t = db.transaction(names, 'readonly'); const finished = done(t);
      const [photoCount, ...groups] = await Promise.all([
        names.includes('photos') ? req(t.objectStore('photos').count()) : Promise.resolve(0),
        ...names.filter(n=>n!=='photos').map(n=>req(t.objectStore(n).getAll()))
      ]);
      await finished;
      const values = groups.flat();
      if (values.length === 0 && photoCount === 0) { note.hidden = true; return; }
      const afterBackup = !last || values.some(row => {
        const recorded = row.updatedAt || row.createdAt || row.completedAt || row.inspectedAt || row.maintainedAt;
        return !recorded || (Number.isFinite(Date.parse(recorded)) && Date.parse(recorded) > Date.parse(last));
      });
      const photoChanged = photoCount !== Number(localStorage.getItem('smart-maintenance:last-backup-photo-count') || 0);
      const photoEdited = Number(localStorage.getItem('smart-maintenance:photo-updated') || 0) > Date.parse(last || '1970-01-01');
      note.hidden = !(afterBackup || photoChanged || photoEdited);
      if (!note.hidden) note.textContent = `백업 권장: 마지막 백업 이후 ${getFrequency()}일 이상 지났거나 백업 기록이 없습니다. 백업·복원 메뉴에서 전체 데이터를 외부 파일로 보관하세요.`;
    } catch (_) { note.hidden = true; }
    finally { if (db) db.close(); }
  }
  document.querySelectorAll('[data-view="dashboard"]').forEach(button => button.addEventListener('click', refreshReminder));
  refreshReminder();
  restoreButton.addEventListener('click', async () => {
    if (!preview || !sourceFile || sourceFile !== element('backup-import-file').files[0]) return;
    const mode = document.querySelector('input[name="backup-mode"]:checked')?.value || 'merge';
    const { backup, current, names } = preview;
    const strategy = new Map([...conflictsEl.querySelectorAll('select')].map(s => [`${s.dataset.store}::${s.dataset.id}`, s.value]));
    // Validate links against the complete proposed post-restore set BEFORE requesting a write transaction.
    const proposed = Object.fromEntries(names.map(name => [name, new Map((mode === 'replace' ? [] : current[name]).map(x => [x.id,x]))]));
    const affected = [];
    for (const [name, rows] of Object.entries(backup.stores)) {
      for (const record of rows) {
        if (mode === 'replace' || !proposed[name].has(record.id) || strategy.get(`${name}::${record.id}`) === 'apply') {
          proposed[name].set(record.id, record);
          affected.push({ name, record });
        }
      }
    }
    try {
      // A conflict decision can affect references in other imported records.
      // Check the full proposed state before starting any write transaction.
      // Check the COMPLETE post-restore snapshot: applying a changed plan/equipment
      // can invalidate existing records that were not included in the import.
      const allProposedRecords = names.flatMap(name =>
        [...proposed[name].values()].map(record => ({ name, record })));
      globalThis.SmartMaintenanceBackupIntegrity.verify(proposed, allProposedRecords);
    } catch (error) {
      say(impStatus, `복원 중단: ${error.message}`, true);
      return;
    }
    if (mode === 'replace' && names.some(name => !Object.hasOwn(backup.stores, name))) {
      if (!confirm('구버전 백업에 존재하지 않는 저장소는 전체 교체 시 비워집니다. 계속하시겠습니까?')) return;
    }
    if (mode === 'replace') {
      const encrypted = element('backup-encrypted').checked;
      const password = element('backup-password').value;
      if (!encrypted && !confirm('전체 교체 전에 현재 기록을 일반 JSON으로 내보내면 암호화되지 않습니다. 계속하시겠습니까?')) return;
      try {
        cancelled = false;
        say(impStatus, '기존 데이터를 먼저 백업하는 중입니다.');
        const b = await saveBackup({ encrypted, password, suffix: '-before-restore' });
        if (!confirm(`${b.filename} 파일이 다운로드 폴더에 저장되었는지 확인하세요. 기존 기록 전체를 교체할까요?`)) return;
      } catch (e) { say(impStatus, `복원 전 백업 실패: ${e.message}`, true); return; }
    } else if (!confirm('기존 기록은 유지하고 새로운 기록 및 선택한 충돌 기록을 병합할까요?')) return;
    restoreButton.disabled = true;
    say(impStatus, '복원 중입니다. 이 창을 닫지 마세요.');
    let db;
    try {
      db = await openDB();
      // One read/write transaction compares and writes, preventing a race with other tabs.
      const t = db.transaction(names, 'readwrite');
      const finished = done(t);
      try {
        const actual = Object.fromEntries(await Promise.all(names.map(async name => [name,await req(t.objectStore(name).getAll())])));
        if (JSON.stringify(actual) !== JSON.stringify(current)) {
          throw Error('비교 이후 데이터가 변경됐습니다. 백업 내용 비교를 다시 실행하세요.');
        }
        for (const name of names) {
          const store = t.objectStore(name);
          const rows = backup.stores[name] || [];
          if (mode === 'replace') {
            store.clear();
            for (const record of rows) store.put(record);
          } else {
            const known = new Map(current[name].map(r => [r.id, r]));
            for (const record of rows) {
              if (!known.has(record.id) || strategy.get(`${name}::${record.id}`) === 'apply') store.put(record);
            }
          }
        }
      } catch (error) {
        try { t.abort(); } catch (_) { /* already finished */ }
        await finished.catch(()=>{});
        throw error;
      }
      await finished;
      if (backup.settings?.backupFrequencyDays) {
        const days=Number(backup.settings.backupFrequencyDays);
        if (Number.isInteger(days) && days>=1 && days<=365) localStorage.setItem('smart-maintenance:backup-frequency',String(days));
      }
      say(impStatus, '복원 완료. 화면을 다시 불러옵니다.');
      db.close();
      db = null;
      location.reload();
    } catch (e) { say(impStatus, `복원 실패: ${e.message}. 트랜잭션의 변경 사항은 취소됩니다.`, true); }
    finally { if (db) db.close(); restoreButton.disabled = false; }
  });
})();
