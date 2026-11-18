'use strict';

// Dates are represented as whole UTC days so that daylight saving time cannot
// change the number of days in a period. Ranges are inclusive unless noted.
const CitizenshipCalculator = (() => {
  const DAY_MS = 86400000;
  const TARGET = 1095;
  const PR_MINIMUM = 730;
  const TEMP_CREDIT_MAX = 365;
  const STATUS_TYPES = new Set(['student', 'worker', 'visitor', 'permit', 'protected']);

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || value < '1900-01-01' || value > '2100-12-31') return null;
    const milliseconds = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value
      ? milliseconds / DAY_MS : null;
  }

  function formatDate(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
  }

  function yearsEarlier(day, years) {
    const date = new Date(day * DAY_MS);
    const year = date.getUTCFullYear() - years;
    const month = date.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) / DAY_MS;
  }

  function mergeRanges(ranges) {
    const sorted = ranges.filter(range => range.from <= range.to)
      .map(range => ({from: range.from, to: range.to}))
      .sort((a, b) => a.from - b.from || a.to - b.to);
    const merged = [];
    for (const current of sorted) {
      const previous = merged[merged.length - 1];
      if (previous && current.from <= previous.to + 1) previous.to = Math.max(previous.to, current.to);
      else merged.push(current);
    }
    return merged;
  }

  function clipRanges(ranges, from, to) {
    if (from > to) return [];
    return ranges.map(range => ({from: Math.max(range.from, from), to: Math.min(range.to, to)}))
      .filter(range => range.from <= range.to);
  }

  function countRanges(ranges) {
    return ranges.reduce((total, range) => total + range.to - range.from + 1, 0);
  }

  function countAvailable(ranges, blocked) {
    let count = countRanges(ranges);
    for (const period of ranges) {
      for (const excluded of blocked) {
        const from = Math.max(period.from, excluded.from);
        const to = Math.min(period.to, excluded.to);
        if (from <= to) count -= to - from + 1;
      }
    }
    return count;
  }

  function countOverlap(ranges, other) {
    let count = 0;
    for (const period of ranges) {
      for (const item of other) {
        const from = Math.max(period.from, item.from);
        const to = Math.min(period.to, item.to);
        if (from <= to) count += to - from + 1;
      }
    }
    return count;
  }

  function prepare(profile) {
    const errors = [];
    const pr = parseDate(profile.pr);
    const application = parseDate(profile.asof);
    if (pr === null) errors.push('Enter a valid permanent resident date.');
    if (application === null) errors.push('Enter a valid calculation date.');
    if (pr !== null && application !== null && pr > application) {
      errors.push('The calculation date must be on or after the PR date. For a future estimate, choose a later calculation date.');
    }

    function readRanges(items, name, needsType) {
      const ranges = [];
      (Array.isArray(items) ? items : []).forEach((item, index) => {
        const fromText = item?.from || '';
        const toText = item?.to || '';
        if (!fromText && !toText && (!needsType || !item.type)) return;
        const from = parseDate(fromText);
        const to = parseDate(toText);
        if (from === null || to === null) {
          errors.push(`${name} ${index + 1}: enter valid start and end dates.`);
          return;
        }
        if (from > to) {
          errors.push(`${name} ${index + 1}: the end date must be on or after the start date.`);
          return;
        }
        if (needsType && !STATUS_TYPES.has(item.type)) {
          errors.push(`${name} ${index + 1}: choose a status type.`);
          return;
        }
        ranges.push({from, to});
      });
      return ranges;
    }

    const statuses = readRanges(profile.statuses, 'Status period', true);
    const trips = readRanges(profile.trips, 'Trip', false);
    const exclusions = readRanges(profile.exclusions, 'Excluded period', false);
    const sortedTrips = [...trips].sort((a, b) => a.from - b.from || a.to - b.to);
    let previousEnd = -Infinity;
    for (const trip of sortedTrips) {
      if (trip.from < previousEnd) {
        errors.push('Trips overlap. Please correct the travel dates.');
        break;
      }
      previousEnd = Math.max(previousEnd, trip.to);
    }

    // The day of departure and the day of return are generally days present.
    const away = mergeRanges(trips.map(trip => ({from: trip.from + 1, to: trip.to - 1})));
    const excluded = mergeRanges(exclusions);
    return {errors, pr, application, statuses: mergeRanges(statuses), away,
      blocked: mergeRanges([...away, ...excluded])};
  }

  function evaluate(prepared, application = prepared.application) {
    const start = yearsEarlier(application, 5);
    const end = application - 1;
    const prRanges = clipRanges([{from: prepared.pr, to: end}], start, end);
    const tempRanges = clipRanges(prepared.statuses, start, Math.min(end, prepared.pr - 1));
    const prDays = countAvailable(prRanges, prepared.blocked);
    const tempDays = countAvailable(tempRanges, prepared.blocked);
    const tempCredit = Math.min(TEMP_CREDIT_MAX, tempDays / 2);
    const total = prDays + tempCredit;
    return {
      start, end, prDays, tempDays, tempCredit, total,
      absentDays: countRanges(clipRanges(prepared.away, start, end)),
      remaining: Math.max(0, TARGET - total),
      presenceMet: total >= TARGET && prDays >= PR_MINIMUM
    };
  }

  // Explain the existing calculation without changing the counting rules.
  // All ranges have been merged, so a day cannot be subtracted twice.
  function explain(prepared, result) {
    const prRanges = clipRanges([{from: prepared.pr, to: result.end}], result.start, result.end);
    const tempRanges = clipRanges(prepared.statuses, result.start, Math.min(result.end, prepared.pr - 1));
    const prCalendarDays = countRanges(prRanges);
    const tempStatusDays = countRanges(tempRanges);
    const prAwayDays = countOverlap(prRanges, prepared.away);
    const tempAwayDays = countOverlap(tempRanges, prepared.away);
    return {
      prCalendarDays,
      tempStatusDays,
      prAwayDays,
      tempAwayDays,
      prExcludedDays: prCalendarDays - result.prDays - prAwayDays,
      tempExcludedDays: tempStatusDays - result.tempDays - tempAwayDays,
      otherAwayDays: result.absentDays - prAwayDays - tempAwayDays,
      tempDaysBeforeWindow: countRanges(clipRanges(prepared.statuses, -Infinity, Math.min(result.start - 1, prepared.pr - 1))),
      prDaysBeforeWindow: Math.max(0, result.start - prepared.pr),
      statusDaysAfterPr: countRanges(clipRanges(prepared.statuses, prepared.pr, result.end)),
      tempCreditBeforeCap: result.tempDays / 2
    };
  }

  function forecast(prepared, maxFutureDays = 3660) {
    const current = evaluate(prepared);
    if (current.presenceMet) return prepared.application;
    for (let day = prepared.application + 1; day <= prepared.application + maxFutureDays; day++) {
      if (evaluate(prepared, day).presenceMet) return day;
    }
    return null;
  }

  return {TARGET, PR_MINIMUM, TEMP_CREDIT_MAX, parseDate, formatDate, yearsEarlier, prepare, evaluate, explain, forecast};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CitizenshipCalculator;
else globalThis.CitizenshipCalculator = CitizenshipCalculator;
