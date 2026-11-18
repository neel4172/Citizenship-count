'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Calculator = require('../calculator.js');
const Profiles = require('../profiles.js');

function runApp(initial, clock = '2024-01-01T12:00:00Z') {
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
    focus() { this.focused = true; }
    select() {}
    click() { if (this.onclick) return this.onclick({target: this}); }
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) { const e = new Element('element'); e.id = match[1]; }
  const listeners = {};
  const document = {getElementById: id => ids.get(id), createElement: tag => new Element(tag),
    addEventListener: (name, handler) => { listeners[name] = handler; }, hidden: false};
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return Date.parse(clock); }
  }
  const context = vm.createContext({CitizenshipCalculator: Calculator, CitizenshipProfiles: Profiles, document,
    localStorage, navigator: {}, window: {addEventListener() {}}, confirm: () => true,
    console, Date: FixedDate, Blob, URL, setTimeout});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  return {ids, items, get: id => ids.get(id), setClock: value => { clock = value; },
    showPage: () => listeners.visibilitychange?.()};
}

function change(element, value) {
  element.value = value;
  element.onchange({target: element});
}

test('migrates a person, calculates student and worker time, and keeps family profiles separate', () => {
  const legacy = {pr: '2022-01-01', asof: '2024-01-01', trips: []};
  const app = runApp({[Profiles.LEGACY_KEY]: JSON.stringify(legacy)});
  const originalId = JSON.parse(app.items.get(Profiles.KEY)).activeId;
  assert.equal(app.get('dashboard-view').hidden, false);
  assert.equal(app.get('detail-view').hidden, true);
  assert.notEqual(app.get('dashboard-title').focused, true);
  app.get('edit-person-' + originalId).click();
  assert.equal(app.get('dashboard-view').hidden, true);
  assert.equal(app.get('detail-view').hidden, false);
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
  const explanation = app.get('calculation-explanation').children;
  const section = label => explanation.find(item => item.children[0].textContent === label + ': ').children[1].textContent;
  assert.match(section('PR time'), /730 calendar days.*2 full days.*728 credited PR days/);
  assert.match(section('Temporary-resident credit'), /731 eligible days.*365\.5 days.*365 days are added/);
  assert.match(section('Your total'), /728 PR days \+ 365 pre-PR credit = 1,093 credited days/);

  app.get('add-profile').click();
  const name = app.get('profile-name');
  name.value = 'Family member';
  name.oninput({target: name});
  change(app.get('pr'), '2023-01-01');
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
  app.get('show-dashboard-bottom').click();
  assert.equal(app.get('dashboard-view').hidden, false);
  assert.equal(app.get('detail-view').hidden, true);
  const cards = app.get('dashboard-cards').children;
  assert.equal(cards.length, 2);
  assert.equal(cards[0].children[0].children[0].textContent, 'Myself');
  assert.equal(cards[0].children[1].children[0].children[1].textContent, '2');
  assert.equal(cards[1].children[0].children[0].textContent, 'Family member');
  assert.equal(cards[1].children[1].children[0].children[1].textContent, '730');
});

test('details explain why older temporary-resident dates and credit above the cap do not count', () => {
  const person = Profiles.createProfile('Example', '2023-01-01');
  person.pr = '2022-01-01';
  person.statuses = [{type: 'student', from: '2018-01-01', to: '2019-12-31'},
    {type: 'worker', from: '2020-01-01', to: '2021-12-31'}];
  const app = runApp({[Profiles.KEY]: JSON.stringify({version: 2, activeId: person.id, profiles: [person]})}, '2024-01-01T12:00:00Z');
  app.get('edit-person-' + person.id).click();
  const explanation = app.get('calculation-explanation').children;
  const section = label => explanation.find(item => item.children[0].textContent === label + ': ').children[1].textContent;
  assert.match(section('Before PR'), /1,096 entered status days/);
  assert.match(section('Temporary-resident credit'), /1,096 eligible days.*548 days.*365 days are added/);
  assert.match(section('Older dates'), /365 entered pre-PR status calendar days.*before the five-year window/);
  assert.match(section('Your total'), /730 PR days \+ 365 pre-PR credit = 1,095 credited days/);
});

test('dashboard and details use today, ignoring a saved old date and updating when the page returns', () => {
  const person = Profiles.createProfile('Neel', '2023-01-01');
  person.pr = '2022-01-01';
  const data = {version: 2, activeId: person.id, profiles: [person]};
  const app = runApp({[Profiles.KEY]: JSON.stringify(data)}, '2024-01-01T12:00:00Z');
  const card = app.get('dashboard-cards').children[0];
  assert.equal(card.children[0].children[0].textContent, 'Neel');
  assert.equal(card.children[1].children[0].children[1].textContent, '365');
  assert.equal(card.children[1].children[1].children[1].textContent,
    new Date('2024-12-31T00:00:00Z').toLocaleDateString('en-CA', {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'}));
  assert.match(card.children[2].textContent, /counting through the day before/);
  assert.equal(app.get('asof'), undefined);
  app.get('edit-person-' + person.id).click();
  assert.equal(app.get('credited').textContent, '730');
  assert.match(app.get('window').textContent, /2023-12-31/);
  assert.equal(JSON.parse(app.items.get(Profiles.KEY)).profiles[0].asof, '2023-01-01');
  app.setClock('2024-01-02T12:00:00Z');
  app.showPage();
  assert.equal(app.get('credited').textContent, '731');
  app.get('show-dashboard-bottom').click();
  assert.equal(app.get('dashboard-cards').children[0].children[1].children[0].children[1].textContent, '364');
});

test('dashboard labels a future PR date as a projection', () => {
  const person = Profiles.createProfile('Future PR', '2024-01-01');
  person.pr = '2024-07-01';
  const app = runApp({[Profiles.KEY]: JSON.stringify({version: 2, activeId: person.id, profiles: [person]})}, '2024-01-01T12:00:00Z');
  const card = app.get('dashboard-cards').children[0];
  assert.equal(card.children[1].children[0].children[1].textContent, '1,095');
  assert.match(card.children[2].textContent, /Projection from your entered PR date/);
  app.get('edit-person-' + person.id).click();
  assert.equal(app.get('credited').textContent, '0');
  assert.match(app.get('window').textContent, /Projection from your entered PR date/);
});

test('dashboard avoids applying the adult goal to a minor', () => {
  const person = Profiles.createProfile('Child', '2024-01-01');
  person.pr = '2022-01-01';
  person.checklist.ageGroup = 'under18';
  const app = runApp({[Profiles.KEY]: JSON.stringify({version: 2, activeId: person.id, profiles: [person]})}, '2024-01-01T12:00:00Z');
  const card = app.get('dashboard-cards').children[0];
  assert.equal(card.children[1].children[0].children[1].textContent, '—');
  assert.match(card.children[2].textContent, /Minors have different citizenship pathways/);
});
