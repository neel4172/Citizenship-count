'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Calculator = require('../calculator.js');
const Profiles = require('../profiles.js');

function runApp(initial) {
  const items = new Map(Object.entries(initial || {}));
  const localStorage = {getItem: key => items.has(key) ? items.get(key) : null,
    setItem: (key, value) => items.set(key, String(value))};
  const ids = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.value = ''; this.textContent = ''; }
    set id(value) { this._id = value; ids.set(value, this); }
    get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this[key] = value; }
    focus() {}
    select() {}
    click() { if (this.onclick) return this.onclick({target: this}); }
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) { const e = new Element('element'); e.id = match[1]; }
  const document = {getElementById: id => ids.get(id), createElement: tag => new Element(tag)};
  const context = vm.createContext({CitizenshipCalculator: Calculator, CitizenshipProfiles: Profiles, document,
    localStorage, navigator: {}, window: {addEventListener() {}}, confirm: () => true,
    console, Date, Blob, URL, setTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  return {ids, items, get: id => ids.get(id)};
}

function change(element, value) {
  element.value = value;
  element.onchange({target: element});
}

test('migrates a person, calculates student and worker time, and keeps family profiles separate', () => {
  const legacy = {pr: '2022-01-01', asof: '2024-01-01', trips: []};
  const app = runApp({[Profiles.LEGACY_KEY]: JSON.stringify(legacy)});
  const originalId = JSON.parse(app.items.get(Profiles.KEY)).activeId;
  assert.equal(app.get('credited').textContent, '730');
  assert.equal(app.get('profile-name').value, 'Myself');
  assert.equal(app.items.get(Profiles.LEGACY_KEY), JSON.stringify(legacy));

  app.get('add-status').click();
  change(app.get('status-0-type'), 'student');
  change(app.get('statuses-0-from'), '2020-01-01');
  change(app.get('statuses-0-to'), '2020-12-31');
  app.get('add-status').click();
  change(app.get('status-1-type'), 'worker');
  change(app.get('statuses-1-from'), '2021-01-01');
  change(app.get('statuses-1-to'), '2021-12-31');
  assert.equal(app.get('temp-credit').textContent, '365');
  assert.equal(app.get('total').textContent, '1,095');

  app.get('add-trip').click();
  change(app.get('trips-0-from'), '2022-06-01');
  change(app.get('trips-0-to'), '2022-06-04');
  assert.equal(app.get('absent').textContent, '2');
  assert.equal(app.get('total').textContent, '1,093');

  app.get('add-profile').click();
  const name = app.get('profile-name');
  name.value = 'Family member';
  name.oninput({target: name});
  change(app.get('pr'), '2023-01-01');
  change(app.get('asof'), '2024-01-01');
  assert.equal(app.get('total').textContent, '365');
  const saved = JSON.parse(app.items.get(Profiles.KEY));
  assert.equal(saved.profiles.length, 2);
  assert.equal(saved.profiles[1].name, 'Family member');
  assert.equal(saved.profiles[1].statuses.length, 0);
  assert.equal(saved.profiles[0].statuses.length, 2);

  change(app.get('profile-select'), originalId);
  assert.equal(app.get('profile-name').value, 'Myself');
  assert.equal(app.get('total').textContent, '1,093');
  assert.equal(app.get('temp-credit').textContent, '365');
});
