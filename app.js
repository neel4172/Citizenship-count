'use strict';

const $ = id => document.getElementById(id);
const C = CitizenshipCalculator;
const P = CitizenshipProfiles;
const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const stored = P.load(localStorage, today());
let state = stored.data;
const current = () => state.profiles.find(person => person.id === state.activeId) || state.profiles[0];
const fieldIds = {
  ageGroup: 'age-group', prStatus: 'pr-status', prConditions: 'pr-conditions',
  taxes: 'taxes', language: 'language', prohibition: 'prohibition', review: 'review'
};

function storageMessage(message) {
  $('storage-message').textContent = message;
  $('dashboard-storage-message').textContent = message;
}

function save() {
  if (stored.blocked) {
    storageMessage(stored.error);
    return false;
  }
  try {
    localStorage.setItem(P.KEY, JSON.stringify(state));
    return true;
  } catch {
    storageMessage('Changes could not be saved in this browser. Try enabling website storage or export a backup.');
    return false;
  }
}

function profileOptions() {
  const select = $('profile-select');
  select.replaceChildren();
  for (const person of state.profiles) {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name.trim() || 'Unnamed person';
    select.append(option);
  }
  select.value = current().id;
  $('remove-profile').disabled = state.profiles.length <= 1;
}

function createOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function renderRows(kind, containerId, title, labels) {
  const person = current();
  const container = $(containerId);
  container.replaceChildren();
  person[kind].forEach((row, index) => {
    const box = document.createElement('div');
    box.className = 'entry';
    const header = document.createElement('div');
    header.className = 'entry-head';
    const heading = document.createElement('strong');
    heading.textContent = `${title} ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${title.toLowerCase()} ${index + 1}`);
    remove.onclick = () => { person[kind].splice(index, 1); save(); render(); };
    header.append(heading, remove);
    box.append(header);

    if (kind === 'statuses') {
      const id = `status-${index}-type`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = 'Type of status';
      const select = document.createElement('select');
      select.id = id;
      for (const [value, text] of [
        ['', 'Choose a status'], ['student', 'Student'], ['worker', 'Worker'],
        ['visitor', 'Visitor'], ['permit', 'Temporary resident permit holder'],
        ['protected', 'Protected person (after approval)']
      ]) createOption(select, value, text);
      select.value = row.type || '';
      select.onchange = () => { row.type = select.value; save(); compute(); };
      box.append(label, select);
    }

    const fields = document.createElement('div');
    fields.className = 'two';
    for (const [key, labelText] of labels) {
      const wrap = document.createElement('div');
      const label = document.createElement('label');
      const input = document.createElement('input');
      const id = `${kind}-${index}-${key}`;
      label.htmlFor = id;
      label.textContent = labelText;
      input.id = id;
      input.type = 'date';
      input.min = '1900-01-01';
      input.max = '2100-12-31';
      input.value = row[key] || '';
      input.onchange = () => { row[key] = input.value; save(); compute(); };
      wrap.append(label, input);
      fields.append(wrap);
    }
    box.append(fields);
    container.append(box);
  });
}

function checklist() {
  const answers = current().checklist;
  const group = answers.ageGroup;
  $('language-section').hidden = group !== '18-54';
  $('age-guidance').textContent = group === 'under18'
    ? 'This checklist is for adults. Minors have different IRCC application pathways and may have different physical presence rules.'
    : group === '18-54'
      ? 'IRCC generally requires language proof and invites applicants to take a citizenship test after applying; accommodations and waivers may be available.'
      : group === '55plus'
        ? 'IRCC generally does not require language proof or a citizenship test for applicants who are 55 or older on the application date.'
        : 'Choose your age when you apply. Minors have different pathways.';

  const issues = [];
  if (group === 'under18') issues.push('Use IRCC’s minor requirements rather than this adult checklist.');
  else if (!group) issues.push('Choose an age group.');
  if (answers.prStatus === 'no') issues.push('Valid permanent resident status is required to apply.');
  else if (!answers.prStatus || answers.prStatus === 'unsure') issues.push('Confirm your permanent resident status.');
  if (answers.prConditions === 'no') issues.push('Review any removal order or unfulfilled PR conditions.');
  else if (!answers.prConditions || answers.prConditions === 'unsure') issues.push('Check for removal orders and unfulfilled PR conditions.');
  if (answers.taxes === 'no') issues.push('Review your Canadian tax filing obligations before applying.');
  else if (!answers.taxes || answers.taxes === 'unsure') issues.push('Confirm your Canadian tax filing obligations.');
  if (group === '18-54' && answers.language !== 'yes') {
    issues.push(answers.language === 'waiver' ? 'Ask IRCC about requesting a language waiver.' : 'Review the language-proof requirement or a possible waiver.');
  }
  if (answers.prohibition !== 'no') issues.push('Review IRCC’s citizenship prohibitions for your situation.');
  if (answers.review === 'yes') issues.push('IRCC may suspend processing during an immigration or fraud review; a review does not automatically prevent applying.');
  else if (!answers.review || answers.review === 'unsure') issues.push('Check whether a PR status review affects your application.');
  $('checklist-summary').textContent = issues.length
    ? 'Items to review: ' + issues.join(' ') + ' Your answers are self-reported; IRCC makes the decision.'
    : 'Your answers have been recorded. This checklist does not confirm eligibility; review all requirements with IRCC.';
}

function number(value) {
  return value.toLocaleString('en-CA', {maximumFractionDigits: 1});
}

function calculationDate(person) {
  const todayText = today();
  const todayDay = C.parseDate(todayText);
  const prDay = C.parseDate(person.pr);
  return prDay !== null && prDay > todayDay ? person.pr : todayText;
}

function readableDate(day) {
  return new Date(day * 86400000).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  });
}

function makeMetric(label, value, date = false) {
  const wrap = document.createElement('div');
  wrap.className = 'person-stat';
  const caption = document.createElement('div');
  caption.className = 'person-stat-label';
  caption.textContent = label;
  const amount = document.createElement('div');
  amount.className = 'person-stat-value' + (date ? ' date' : '');
  amount.textContent = value;
  wrap.append(caption, amount);
  return wrap;
}

function renderDashboard() {
  const cards = $('dashboard-cards');
  cards.replaceChildren();
  for (const person of state.profiles) {
    const card = document.createElement('article');
    card.className = 'person-card';
    const head = document.createElement('div');
    head.className = 'person-head';
    const name = document.createElement('div');
    name.className = 'person-name';
    name.textContent = person.name.trim() || 'Unnamed person';
    const badge = document.createElement('span');
    badge.className = 'badge';
    const stats = document.createElement('div');
    stats.className = 'person-stats';
    const context = document.createElement('p');
    context.className = 'person-context';

    const todayText = today();
    const todayDay = C.parseDate(todayText);
    const prDay = C.parseDate(person.pr);
    const futurePr = prDay !== null && prDay > todayDay;
    // Dashboard values normally use today; a future PR date is a projection.
    const summaryDate = calculationDate(person);
    const prepared = C.prepare({...person, asof: summaryDate});
    let remaining = '—';
    let date = '—';
    let buttonLabel = 'View & edit details';

    if (person.checklist.ageGroup === 'under18') {
      badge.textContent = 'Review requirements';
      context.textContent = 'Minors have different citizenship pathways. Check the IRCC guidance in the details.';
    } else if (prepared.errors.length) {
      badge.textContent = 'Details needed';
      context.textContent = prepared.errors[0] + ' Add or correct the details to see the estimate.';
      buttonLabel = 'Add details';
    } else {
      const result = C.evaluate(prepared);
      remaining = number(result.remaining);
      badge.textContent = result.presenceMet ? 'Target reached' : 'In progress';
      if (result.presenceMet) {
        badge.className += ' reached';
        date = 'Target reached';
      } else {
        const projected = C.forecast(prepared);
        date = projected === null ? 'Not available' : readableDate(projected);
      }
      context.textContent = futurePr
        ? `Projection from your entered PR date (${readableDate(prDay)}). Future status time is assumed. The date assumes no extra travel.`
        : `As of ${readableDate(todayDay)} (counting through the day before). The tentative date assumes no extra travel beyond trips entered.`;
    }

    head.append(name, badge);
    stats.append(makeMetric('Days left', remaining), makeMetric('Tentative date', date, true));
    const edit = document.createElement('button');
    edit.id = 'edit-person-' + person.id;
    edit.type = 'button';
    edit.className = 'secondary';
    edit.textContent = buttonLabel;
    edit.setAttribute('aria-label', `${buttonLabel} for ${person.name.trim() || 'this person'}`);
    edit.onclick = () => showDetails(person.id);
    card.append(head, stats, context, edit);
    cards.append(card);
  }
}

function showDashboard(shouldFocus = true) {
  save();
  renderDashboard();
  $('detail-view').hidden = true;
  $('dashboard-view').hidden = false;
  if (shouldFocus) $('dashboard-title').focus();
}

function showDetails(personId) {
  state.activeId = personId;
  save();
  render();
  $('dashboard-view').hidden = true;
  $('detail-view').hidden = false;
  $('people-title').focus();
}

function renderExplanation(prepared, result, futurePr) {
  const container = $('calculation-explanation');
  container.replaceChildren();
  const detail = C.explain(prepared, result);
  function line(title, text) {
    const paragraph = document.createElement('p');
    const label = document.createElement('strong');
    const value = document.createElement('span');
    label.textContent = title + ': ';
    value.textContent = text;
    paragraph.append(label, value);
    container.append(paragraph);
  }

  line('Five-year window', `${futurePr ? 'For this projection, the' : 'The'} window is ${C.formatDate(result.start)} to ${C.formatDate(result.end)}. The calculation date itself is not counted.`);
  line('PR time', `${number(detail.prCalendarDays)} calendar days in the window since your PR date − ${number(detail.prAwayDays)} full days outside Canada − ${number(detail.prExcludedDays)} other excluded days = ${number(result.prDays)} credited PR days.`);

  if (!prepared.statuses.length) {
    line('Before PR', 'No temporary-resident or protected-person periods have been entered. Add any eligible student, worker or other status periods to include them.');
  } else {
    line('Before PR', `${number(detail.tempStatusDays)} entered status days in the window before PR − ${number(detail.tempAwayDays)} full days outside Canada − ${number(detail.tempExcludedDays)} other excluded days = ${number(result.tempDays)} eligible days in Canada.`);
  }
  line('Temporary-resident credit', `${number(result.tempDays)} eligible days ÷ 2 = ${number(detail.tempCreditBeforeCap)} days. The maximum credit is 365, so ${number(result.tempCredit)} days are added.`);

  const earlier = [];
  if (detail.tempDaysBeforeWindow) earlier.push(`${number(detail.tempDaysBeforeWindow)} entered pre-PR status calendar days`);
  if (detail.prDaysBeforeWindow) earlier.push(`${number(detail.prDaysBeforeWindow)} calendar days since your PR date`);
  line('Older dates', earlier.length
    ? `${earlier.join(' and ')} fall before the five-year window and are not counted here. Calendar days can include time spent outside Canada.`
    : 'Dates before the five-year window are not counted. Before PR, only the eligible status periods you entered are included.');
  if (detail.statusDaysAfterPr) {
    line('Overlapping status', `${number(detail.statusDaysAfterPr)} entered status calendar days fall on or after your PR date. They are considered as PR time, not counted again as temporary-resident time.`);
  }
  line('Trips', `${number(result.absentDays)} full days outside Canada are recorded within the five-year window: ${number(detail.prAwayDays)} during PR, ${number(detail.tempAwayDays)} during entered pre-PR status, and ${number(detail.otherAwayDays)} outside those periods. Departure and return days usually count as days in Canada.`);
  line('Your total', `${number(result.prDays)} PR days + ${number(result.tempCredit)} pre-PR credit = ${number(result.total)} credited days. ${number(result.remaining)} more credited days are needed to reach 1,095.`);
  if (futurePr) line('Future dates', 'This is a projection based on your entered PR and status dates. Future time is assumed, and your actual result can change.');
}

function compute() {
  const person = current();
  const effectiveDate = calculationDate(person);
  const prepared = C.prepare({...person, asof: effectiveDate});
  $('errors').textContent = prepared.errors.join(' ');
  checklist();
  if (prepared.errors.length) {
    for (const id of ['total', 'remaining', 'credited', 'temp-credit', 'temp-days', 'absent', 'percent']) $(id).textContent = '—';
    $('window').textContent = '';
    $('bar').style.width = '0%';
    $('forecast').textContent = '';
    const explanation = $('calculation-explanation');
    explanation.replaceChildren();
    const placeholder = document.createElement('p');
    placeholder.textContent = 'Enter valid details to see how your days are counted.';
    explanation.append(placeholder);
    return;
  }
  const result = C.evaluate(prepared);
  const futurePr = C.parseDate(effectiveDate) > C.parseDate(today());
  $('window').textContent = futurePr
    ? `Projection from your entered PR date. Five-year window: ${C.formatDate(result.start)} to ${C.formatDate(result.end)}.`
    : `As of today, the five-year window is ${C.formatDate(result.start)} to ${C.formatDate(result.end)} (today is not counted).`;
  $('total').textContent = number(result.total);
  $('remaining').textContent = number(result.remaining);
  $('credited').textContent = number(result.prDays);
  $('temp-credit').textContent = number(result.tempCredit);
  $('temp-days').textContent = number(result.tempDays);
  $('absent').textContent = number(result.absentDays);
  const percentage = Math.min(100, result.total / C.TARGET * 100);
  $('percent').textContent = percentage.toFixed(1) + '%';
  $('bar').style.width = percentage + '%';
  renderExplanation(prepared, result, futurePr);
  if (result.presenceMet) {
    $('forecast').textContent = 'Your entered dates reach the standard 1,095-day physical presence target. Other citizenship requirements and exceptions still apply.';
  } else {
    const projected = C.forecast(prepared);
    $('forecast').textContent = projected === null
      ? 'No estimated target date was found in the next 10 years. Review the dates and check with IRCC.'
      : `Estimated application date for reaching the physical presence target: ${C.formatDate(projected)}. This assumes you remain in Canada except for trips and excluded periods already entered.`;
  }
}

function render() {
  const person = current();
  profileOptions();
  $('profile-name').value = person.name;
  $('pr').value = person.pr;
  for (const [field, id] of Object.entries(fieldIds)) $(id).value = person.checklist[field] || '';
  renderRows('statuses', 'statuses', 'Status period', [['from', 'First day in Canada with this status'], ['to', 'Last day of this valid status']]);
  renderRows('trips', 'trips', 'Trip', [['from', 'Left Canada'], ['to', 'Returned (or expected return)']]);
  renderRows('exclusions', 'exclusions', 'Excluded period', [['from', 'First excluded day'], ['to', 'Last excluded day']]);
  compute();
}

$('profile-select').onchange = event => { state.activeId = event.target.value; save(); render(); };
$('profile-name').oninput = event => { current().name = event.target.value.slice(0, 80); save(); profileOptions(); };
function addPerson() {
  const person = P.createProfile(`Person ${state.profiles.length + 1}`, today());
  state.profiles.push(person);
  showDetails(person.id);
  $('profile-name').focus();
  $('profile-name').select();
}
$('add-profile').onclick = addPerson;
$('dashboard-add-profile').onclick = addPerson;
$('show-dashboard-top').onclick = showDashboard;
$('show-dashboard-bottom').onclick = showDashboard;
$('remove-profile').onclick = () => {
  if (state.profiles.length <= 1) return;
  if (!confirm(`Remove ${current().name || 'this person'} and their locally saved information?`)) return;
  state.profiles = state.profiles.filter(person => person.id !== state.activeId);
  state.activeId = state.profiles[0].id;
  showDashboard();
};
$('pr').onchange = event => { current().pr = event.target.value; save(); compute(); };
for (const [field, id] of Object.entries(fieldIds)) $(id).onchange = event => { current().checklist[field] = event.target.value; save(); checklist(); };
$('add-status').onclick = () => { current().statuses.push({type: '', from: '', to: ''}); save(); render(); };
$('add-trip').onclick = () => { current().trips.push({from: '', to: ''}); save(); render(); };
$('add-exclusion').onclick = () => { current().exclusions.push({from: '', to: ''}); save(); render(); };
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'citizenship-family-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import-button').onclick = () => $('import-file').click();
$('import-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('This backup is too large.');
    const imported = P.profilesFromBackup(JSON.parse(await file.text()), today());
    state.profiles.push(...imported);
    state.activeId = imported[0].id;
    const saved = save();
    render();
    if (saved) storageMessage(`Imported ${imported.length} profile(s) as additional people. Existing profiles were kept.`);
  } catch (error) {
    storageMessage(error.message || 'Unable to read this backup.');
  } finally {
    event.target.value = '';
  }
};

if (stored.blocked) storageMessage(stored.error);
else save(); // Also migrates the original single-person data without deleting it.
render();
showDashboard(false);

document.addEventListener?.('visibilitychange', () => {
  if (document.hidden) return;
  if (!$('dashboard-view').hidden) renderDashboard();
  else compute();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
