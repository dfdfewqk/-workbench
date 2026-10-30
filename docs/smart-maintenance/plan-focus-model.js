(() => {
  'use strict';
  const valid = new Set(['normal', 'caution', 'failure']);
  function progress(results) {
    const values = Array.isArray(results) ? results : [];
    const judged = values.filter(value => valid.has(value)).length;
    return { judged, total: values.length, remaining: values.length - judged, complete: values.length > 0 && judged === values.length };
  }
  function nextIncomplete(results, fromIndex) {
    if (!Array.isArray(results) || results.length === 0) return -1;
    const n = results.length;
    for (let distance = 1; distance <= n; distance += 1) {
      const index = (fromIndex + distance + n) % n;
      if (!valid.has(results[index])) return index;
    }
    return -1;
  }
  function firstIncomplete(results) {
    return nextIncomplete(results, -1);
  }
  globalThis.SmartMaintenancePlanFocusModel = Object.freeze({ progress, nextIncomplete, firstIncomplete });
})();
