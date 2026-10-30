(() => {
  'use strict';
  let timer = 0;
  function queueRefresh() {
    clearTimeout(timer);
    timer = setTimeout(() => window.SmartMaintenanceDashboard?.refresh?.(), 150);
  }

  // Watch *source* UI changes only. dashboard.refresh() calls schedule.refresh(),
  // which re-renders #schedule-rows. Observing that table would recursively
  // schedule another dashboard refresh forever, even if the data is unchanged.
  for (const id of [
    'equipment-list',
    'archived-equipment-list',
    'plans-list',
    'history-table-body',
    'maintenance-global-records'
  ]) {
    const node = document.getElementById(id);
    if (node) {
      new MutationObserver(queueRefresh).observe(node, { childList: true, subtree: true });
    }
  }
  for (const event of [
    'smart-maintenance:plan-completed',
    'smart-maintenance:plan-settings-updated'
  ]) window.addEventListener(event, queueRefresh);

  document.querySelectorAll('[data-view="dashboard"]').forEach(button => {
    button.addEventListener('click', queueRefresh);
  });
  window.addEventListener('pageshow', queueRefresh);
})();
