(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SmartMaintenanceDateCalculator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const UNITS = Object.freeze(['day', 'week', 'month', 'year']);
  const MAX_VALUE = 9999;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Date-only 값을 UTC 자정의 날짜 성분으로만 다뤄 현지 시간대의 날짜 이동을 막습니다.
  function makeUtcDate(year, monthIndex, day) {
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, monthIndex, day);
    return date;
  }

  function parseDateOnly(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new TypeError('기준 날짜는 YYYY-MM-DD 형식이어야 합니다.');
    }

    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || year > 9999) throw new RangeError('연도는 0001~9999 범위여야 합니다.');

    const date = makeUtcDate(year, month - 1, day);
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new RangeError('존재하지 않는 날짜입니다.');
    }
    return { year, month, day, date };
  }

  function parsePositiveInteger(value, label) {
    let number;
    if (typeof value === 'number') {
      number = value;
    } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      number = Number(value.trim());
    } else {
      throw new TypeError(`${label}은(는) 양의 정수여야 합니다.`);
    }

    if (!Number.isSafeInteger(number) || number < 1 || number > MAX_VALUE) {
      throw new RangeError(`${label}은(는) 1~${MAX_VALUE} 사이의 정수여야 합니다.`);
    }
    return number;
  }

  function formatDateOnly(date) {
    const year = date.getUTCFullYear();
    if (
      Number.isNaN(date.getTime()) ||
      year < 1 || year > 9999
    ) {
      throw new RangeError('계산 결과가 지원하는 날짜 범위(0001-01-01~9999-12-31)를 벗어났습니다.');
    }
    return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * 기준 날짜로부터 지정한 주기의 occurrence번째 예정일을 계산합니다.
   * 매 계산을 원래 기준 날짜에 고정하므로 1월 31일의 1개월 주기는
   * occurrence 1에서 2월 말일, occurrence 2에서 3월 31일이 됩니다.
   * @param {string} baseDate YYYY-MM-DD 날짜
   * @param {'day'|'week'|'month'|'year'} intervalUnit 주기 단위
   * @param {number|string} intervalCount 각 주기의 간격(1~9999 정수)
   * @param {number|string} occurrence 기준일 이후 몇 번째 예정일인지(1~9999 정수)
   * @returns {string} YYYY-MM-DD 형식의 예정일
   */
  function calculateOccurrenceDate(baseDate, intervalUnit, intervalCount, occurrence) {
    const base = parseDateOnly(baseDate);
    if (!UNITS.includes(intervalUnit)) {
      throw new TypeError('주기 단위는 day, week, month, year 중 하나여야 합니다.');
    }
    const count = parsePositiveInteger(intervalCount, '주기 간격');
    const index = parsePositiveInteger(occurrence, '예정 회차');

    if (intervalUnit === 'day' || intervalUnit === 'week') {
      const days = count * index * (intervalUnit === 'week' ? 7 : 1);
      const result = new Date(base.date.getTime() + days * MS_PER_DAY);
      return formatDateOnly(result);
    }

    // 원래 기준일의 일(day)을 기준으로 매번 계산하여 월말 이후에도 날짜가 드리프트하지 않습니다.
    const monthOffset = count * index * (intervalUnit === 'year' ? 12 : 1);
    const absoluteMonth = base.year * 12 + (base.month - 1) + monthOffset;
    const targetYear = Math.floor(absoluteMonth / 12);
    const targetMonthIndex = absoluteMonth - targetYear * 12;
    if (targetYear < 1 || targetYear > 9999) {
      throw new RangeError('계산 결과가 지원하는 날짜 범위(0001-01-01~9999-12-31)를 벗어났습니다.');
    }

    const lastDayOfTargetMonth = makeUtcDate(targetYear, targetMonthIndex + 1, 0).getUTCDate();
    const result = makeUtcDate(targetYear, targetMonthIndex, Math.min(base.day, lastDayOfTargetMonth));
    return formatDateOnly(result);
  }

  // 다음 첫 회차를 간편히 구하는 함수. 반복 회차는 calculateOccurrenceDate에
  // 항상 최초 기준 날짜와 회차 번호를 전달해 기준일을 보존합니다.
  function calculateNextDate(baseDate, intervalUnit, intervalCount) {
    return calculateOccurrenceDate(baseDate, intervalUnit, intervalCount, 1);
  }

  return Object.freeze({
    units: UNITS,
    calculateNextDate,
    calculateOccurrenceDate
  });
});
