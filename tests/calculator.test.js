'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calculator.js');

function check(profile) {
  const prepared = C.prepare({statuses: [], trips: [], exclusions: [], ...profile});
  assert.deepEqual(prepared.errors, []);
  return C.evaluate(prepared);
}

test('IRCC example: use only five years, count pre-PR at half days, and cap credit', () => {
  const result = check({pr: '2016-01-01', asof: '2018-04-01',
    statuses: [{type: 'student', from: '2012-04-01', to: '2015-12-31'}]});
  assert.equal(C.formatDate(result.start), '2013-04-01');
  assert.equal(C.formatDate(result.end), '2018-03-31');
  assert.equal(result.tempDays, 1005);
  assert.equal(result.tempCredit, 365);
  assert.equal(result.prDays, 821);
  assert.equal(result.total, 1186);
});

test('four years as a student then worker still have a combined 365-day cap', () => {
  const r = check({pr: '2022-01-01', asof: '2024-01-01',
    statuses: [{type: 'student', from: '2018-01-01', to: '2019-12-31'},
      {type: 'worker', from: '2020-01-01', to: '2021-12-31'}]});
  assert.equal(r.tempDays, 1096); // 2018 falls outside the five-year window.
  assert.equal(r.tempCredit, 365);
  assert.equal(r.prDays, 730);
  assert.equal(r.total, 1095);
  assert.equal(r.presenceMet, true);
});

test('explains older status dates and the pre-PR credit cap', () => {
  const p = C.prepare({pr: '2022-01-01', asof: '2024-01-01',
    statuses: [{type: 'student', from: '2018-01-01', to: '2019-12-31'},
      {type: 'worker', from: '2020-01-01', to: '2021-12-31'}], trips: [], exclusions: []});
  const r = C.evaluate(p);
  const detail = C.explain(p, r);
  assert.equal(detail.tempStatusDays, 1096);
  assert.equal(detail.tempDaysBeforeWindow, 365);
  assert.equal(detail.tempCreditBeforeCap, 548);
  assert.equal(r.tempCredit, 365);
  assert.equal(detail.prCalendarDays, 730);
});

test('application day is excluded and the five-year boundary is included', () => {
  let r = check({pr: '2025-01-01', asof: '2025-01-01'});
  assert.equal(r.prDays, 0);
  r = check({pr: '2025-01-01', asof: '2025-01-02'});
  assert.equal(r.prDays, 1);
  r = check({pr: '2018-04-02', asof: '2023-04-01',
    statuses: [{type: 'worker', from: '2018-03-31', to: '2018-04-01'}]});
  assert.equal(r.tempDays, 1);
  assert.equal(r.tempCredit, 0.5);
});

test('overlapping student and worker periods are counted once, and absences are removed', () => {
  const r = check({pr: '2021-01-16', asof: '2021-01-20',
    statuses: [{type: 'student', from: '2021-01-01', to: '2021-01-10'},
      {type: 'worker', from: '2021-01-05', to: '2021-01-15'}],
    trips: [{from: '2021-01-04', to: '2021-01-07'}]});
  assert.equal(r.tempDays, 13);
  assert.equal(r.tempCredit, 6.5);
  assert.equal(r.prDays, 4);
  assert.equal(r.absentDays, 2);
  assert.equal(r.total, 10.5);
});

test('a trip spanning the PR date and an overlapping exclusion do not deduct days twice', () => {
  const r = check({pr: '2022-01-01', asof: '2024-01-01',
    statuses: [{type: 'student', from: '2020-01-01', to: '2021-06-30'},
      {type: 'worker', from: '2021-06-01', to: '2021-12-31'}],
    trips: [{from: '2021-12-30', to: '2022-01-04'}],
    exclusions: [{from: '2022-01-01', to: '2022-01-05'}]});
  assert.equal(r.tempDays, 730);
  assert.equal(r.tempCredit, 365);
  assert.equal(r.prDays, 725);
  assert.equal(r.absentDays, 4);
  assert.equal(r.total, 1090);
});

test('explains trips and exclusions without subtracting overlapping days twice', () => {
  const p = C.prepare({pr: '2022-01-01', asof: '2024-01-01',
    statuses: [{type: 'student', from: '2020-01-01', to: '2021-06-30'},
      {type: 'worker', from: '2021-06-01', to: '2021-12-31'}],
    trips: [{from: '2021-12-30', to: '2022-01-04'}],
    exclusions: [{from: '2022-01-01', to: '2022-01-05'}]});
  const r = C.evaluate(p);
  const detail = C.explain(p, r);
  assert.equal(detail.tempStatusDays, 731);
  assert.equal(detail.tempAwayDays, 1);
  assert.equal(detail.tempExcludedDays, 0);
  assert.equal(detail.prCalendarDays, 730);
  assert.equal(detail.prAwayDays, 3);
  assert.equal(detail.prExcludedDays, 2);
  assert.equal(detail.otherAwayDays, 0);
});

test('temporary status after PR is never counted at half a day', () => {
  const r = check({pr: '2020-01-05', asof: '2020-01-10',
    statuses: [{type: 'worker', from: '2020-01-01', to: '2020-01-20'}]});
  assert.equal(r.tempDays, 4);
  assert.equal(r.tempCredit, 2);
  assert.equal(r.prDays, 5);
  assert.equal(r.total, 7);
});

test('explains status dates after PR and travel outside entered status periods', () => {
  const p = C.prepare({pr: '2020-01-05', asof: '2020-01-10',
    statuses: [{type: 'worker', from: '2020-01-01', to: '2020-01-20'}],
    trips: [{from: '2019-12-01', to: '2019-12-03'}], exclusions: []});
  const r = C.evaluate(p);
  const detail = C.explain(p, r);
  assert.equal(detail.statusDaysAfterPr, 5);
  assert.equal(detail.otherAwayDays, 1);
});

test('same-day and next-day trips have no full days abroad; a longer trip deducts the middle days', () => {
  const r = check({pr: '2023-01-01', asof: '2023-02-01',
    trips: [{from: '2023-01-02', to: '2023-01-02'}, {from: '2023-01-04', to: '2023-01-05'},
      {from: '2023-01-10', to: '2023-01-15'}]});
  assert.equal(r.absentDays, 4);
  assert.equal(r.prDays, 27);
});

test('leap day counts as a real presence or absence day', () => {
  const withoutTrip = check({pr: '2024-02-28', asof: '2024-03-02'});
  assert.equal(withoutTrip.prDays, 3);
  const withTrip = check({pr: '2024-02-28', asof: '2024-03-02',
    trips: [{from: '2024-02-28', to: '2024-03-01'}]});
  assert.equal(withTrip.prDays, 2);
  assert.equal(withTrip.absentDays, 1);
});

test('forecast recalculates credits that age out of the five-year window', () => {
  const prepared = C.prepare({pr: '2021-01-01', asof: '2023-01-01',
    statuses: [{type: 'student', from: '2018-01-01', to: '2018-12-31'}], trips: [], exclusions: []});
  assert.deepEqual(prepared.errors, []);
  assert.equal(C.evaluate(prepared).total, 912.5);
  assert.equal(C.formatDate(C.forecast(prepared)), '2024-01-01');
});

test('invalid ranges and overlapping trips are flagged', () => {
  const p = C.prepare({pr: '2021-01-01', asof: '2022-01-01',
    statuses: [{type: 'student', from: '2020-01-01', to: '2019-01-01'}],
    trips: [{from: '2021-01-01', to: '2021-05-01'}, {from: '2021-02-01', to: '2021-03-01'},
      {from: '2021-04-01', to: '2021-04-20'}], exclusions: []});
  assert.ok(p.errors.some(error => /end date/.test(error)));
  assert.ok(p.errors.some(error => /overlap/.test(error)));
});

test('interval calculations match an independent day-by-day calculation', () => {
  const base = C.parseDate('2018-01-01');
  const end = C.parseDate('2024-05-15');
  let seed = 20261118;
  const random = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let sample = 0; sample < 120; sample++) {
    const prDay = base + 300 + random(1600);
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const from = base + random(1500);
      statuses.push({type: i % 2 ? 'worker' : 'student', from: C.formatDate(from), to: C.formatDate(from + random(500))});
    }
    const tripStart = base + 200 + random(1200);
    const trips = [{from: C.formatDate(tripStart), to: C.formatDate(tripStart + random(20))},
      {from: C.formatDate(tripStart + 40), to: C.formatDate(tripStart + 40 + random(20))}];
    const exclusionStart = base + random(2200);
    const exclusions = [{from: C.formatDate(exclusionStart), to: C.formatDate(exclusionStart + random(100))}];
    const p = C.prepare({pr: C.formatDate(prDay), asof: C.formatDate(end), statuses, trips, exclusions});
    assert.deepEqual(p.errors, []);
    const actual = C.evaluate(p);
    let prDays = 0, tempDays = 0, absentDays = 0;
    for (let day = C.parseDate('2019-05-15'); day < end; day++) {
      const absent = trips.some(t => day > C.parseDate(t.from) && day < C.parseDate(t.to));
      const excluded = exclusions.some(x => day >= C.parseDate(x.from) && day <= C.parseDate(x.to));
      if (absent) absentDays++;
      if (absent || excluded) continue;
      if (day >= prDay) prDays++;
      else if (statuses.some(s => day >= C.parseDate(s.from) && day <= C.parseDate(s.to))) tempDays++;
    }
    assert.equal(actual.prDays, prDays, `PR sample ${sample}`);
    assert.equal(actual.tempDays, tempDays, `temporary sample ${sample}`);
    assert.equal(actual.absentDays, absentDays, `absence sample ${sample}`);
    assert.equal(actual.total, prDays + Math.min(365, tempDays / 2), `total sample ${sample}`);
  }
});
