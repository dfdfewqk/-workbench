/* IndexedDB v6: legacy module requests are transparently upgraded to v6; existing stores and records are preserved. */
(() => {
  const factory = globalThis.IDBFactory?.prototype;
  if (!factory || factory.__smartMaintenanceVersionBridge) return;
  const nativeOpen = factory.open;
  Object.defineProperty(factory, '__smartMaintenanceVersionBridge', { value: true });
  factory.open = function (name, version) {
    if (name !== 'smart-maintenance') return nativeOpen.apply(this, arguments);
    const request = nativeOpen.call(this, name, Math.max(Number.isInteger(version) ? version : 1, 6));
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('faults')) {
        const store = db.createObjectStore('faults', { keyPath: 'id' });
        store.createIndex('equipmentId', 'equipmentId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('planDrafts')) {
        const store = db.createObjectStore('planDrafts', { keyPath: 'id' });
        store.createIndex('planId', 'planId', { unique: false });
        store.createIndex('equipmentId', 'equipmentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' });
        store.createIndex('recordId', 'recordId', { unique: false });
        store.createIndex('equipmentId', 'equipmentId', { unique: false });
      }
      if (!db.objectStoreNames.contains('missedOccurrences')) {
        const store = db.createObjectStore('missedOccurrences', { keyPath: 'id' });
        store.createIndex('planId', 'planId', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    });
    return request;
  };
})();
