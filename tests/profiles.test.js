'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../profiles.js');

function storage(initial = {}) {
  const data = {...initial};
  return {getItem: key => Object.hasOwn(data, key) ? data[key] : null,
    setItem: (key, value) => { data[key] = String(value); }, data};
}

test('migrates the existing single-person data without deleting it', () => {
  const legacy = {pr: '2022-05-01', asof: '2026-03-15', trips: [{from: '2023-06-01', to: '2023-06-12'}]};
  const db = storage({[P.LEGACY_KEY]: JSON.stringify(legacy)});
  const loaded = P.load(db, '2026-11-18');
  assert.equal(loaded.source, 'legacy');
  assert.equal(loaded.blocked, false);
  assert.equal(loaded.data.profiles[0].pr, legacy.pr);
  assert.equal(loaded.data.profiles[0].asof, legacy.asof);
  assert.deepEqual(loaded.data.profiles[0].trips, legacy.trips);
  assert.deepEqual(loaded.data.profiles[0].statuses, []);
  db.setItem(P.KEY, JSON.stringify(loaded.data));
  assert.deepEqual(JSON.parse(db.data[P.LEGACY_KEY]), legacy);
  assert.equal(P.load(db, '2026-11-18').data.profiles[0].pr, legacy.pr);
});

test('separate family profiles retain their own status and travel details', () => {
  const a = P.createProfile('A', '2026-11-18');
  const b = P.createProfile('B', '2026-11-18');
  a.pr = '2022-01-01';
  a.statuses.push({type: 'student', from: '2019-01-01', to: '2021-12-31'});
  b.pr = '2024-01-01';
  b.trips.push({from: '2025-01-01', to: '2025-01-10'});
  const db = storage({[P.KEY]: JSON.stringify({version: 2, activeId: b.id, profiles: [a, b]})});
  const saved = P.load(db, '2026-11-18').data;
  assert.equal(saved.activeId, b.id);
  assert.equal(saved.profiles[0].statuses.length, 1);
  assert.equal(saved.profiles[0].trips.length, 0);
  assert.equal(saved.profiles[1].statuses.length, 0);
  assert.equal(saved.profiles[1].trips.length, 1);
});

test('import assigns fresh IDs and preserves both family profiles', () => {
  const original = P.createProfile('Neel', '2026-11-18');
  const other = P.createProfile('Family member', '2026-11-18');
  original.pr = '2021-01-01';
  other.statuses.push({type: 'worker', from: '2020-01-01', to: '2021-12-31'});
  const imported = P.profilesFromBackup({version: 2, activeId: original.id, profiles: [original, other]}, '2026-11-18');
  assert.equal(imported.length, 2);
  assert.notEqual(imported[0].id, original.id);
  assert.notEqual(imported[1].id, other.id);
  assert.equal(imported[0].pr, original.pr);
  assert.deepEqual(imported[1].statuses, other.statuses);
});

test('imports the old single-person backup and rejects unsupported input', () => {
  const profiles = P.profilesFromBackup({pr: '2020-01-01', trips: []}, '2026-11-18');
  assert.equal(profiles[0].name, 'Imported person');
  assert.equal(profiles[0].pr, '2020-01-01');
  assert.throws(() => P.profilesFromBackup({hello: 'world'}, '2026-11-18'));
});

test('unreadable existing data is not silently overwritten', () => {
  const db = storage({[P.KEY]: '{invalid json', [P.LEGACY_KEY]: JSON.stringify({pr: '2020-01-01', trips: []})});
  const result = P.load(db, '2026-11-18');
  assert.equal(result.blocked, true);
  assert.equal(db.data[P.KEY], '{invalid json');
  assert.match(result.error, /could not be read/);
});
