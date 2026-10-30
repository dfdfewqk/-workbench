/* Read-only text matching for equipment, schedules, faults and history. */
(() => {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
  const matches = (values, query) => {
    const terms = normalize(query).split(' ').filter(Boolean);
    if (!terms.length) return true;
    const haystack = normalize(Array.isArray(values) ? values.join(' ') : values);
    return terms.every(term => haystack.includes(term));
  };
  const api = Object.freeze({normalize, matches});
  globalThis.SmartMaintenanceRecordSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
