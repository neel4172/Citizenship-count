'use strict';

const CitizenshipProfiles = (() => {
  const KEY = 'citizenshipTrackerV2';
  const LEGACY_KEY = 'citizenshipTrackerV1';
  const CHECKLIST_FIELDS = ['ageGroup', 'prStatus', 'prConditions', 'taxes', 'language', 'prohibition', 'review'];
  const str = value => typeof value === 'string' ? value : '';
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  function cleanRows(rows, status = false) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(item => item && typeof item === 'object').map(item => {
      const row = {from: str(item.from), to: str(item.to)};
      if (status) row.type = str(item.type);
      return row;
    });
  }

  function cleanProfile(profile, today, newIdentity = false) {
    const checklist = {};
    for (const field of CHECKLIST_FIELDS) checklist[field] = str(profile?.checklist?.[field]);
    return {
      id: !newIdentity && str(profile?.id) ? profile.id : makeId(),
      name: str(profile?.name).trim().slice(0, 80) || 'Person',
      pr: str(profile?.pr), asof: str(profile?.asof) || today,
      statuses: cleanRows(profile?.statuses, true),
      trips: cleanRows(profile?.trips),
      exclusions: cleanRows(profile?.exclusions),
      checklist
    };
  }

  function createProfile(name, today) {
    return cleanProfile({name, asof: today}, today, true);
  }

  function createStore(today) {
    const person = createProfile('Myself', today);
    return {version: 2, activeId: person.id, profiles: [person]};
  }

  function normalizeStore(input, today, newIdentities = false) {
    if (!input || input.version !== 2 || !Array.isArray(input.profiles) || !input.profiles.length) {
      throw new Error('This file does not contain a valid family tracker backup.');
    }
    const profiles = input.profiles.map(profile => cleanProfile(profile, today, newIdentities));
    const ids = new Set();
    for (const profile of profiles) {
      if (ids.has(profile.id)) profile.id = makeId();
      ids.add(profile.id);
    }
    return {version: 2, activeId: profiles.some(p => p.id === input.activeId) ? input.activeId : profiles[0].id, profiles};
  }

  function load(storage, today) {
    try {
      const saved = storage.getItem(KEY);
      if (saved !== null) {
        return {data: normalizeStore(JSON.parse(saved), today), source: 'v2', blocked: false};
      }
      const old = storage.getItem(LEGACY_KEY);
      if (old !== null) {
        const previous = JSON.parse(old);
        if (!previous || typeof previous !== 'object' || !Array.isArray(previous.trips)) throw new Error('Invalid original data');
        const person = cleanProfile({...previous, name: 'Myself'}, today, true);
        return {data: {version: 2, activeId: person.id, profiles: [person]}, source: 'legacy', blocked: false};
      }
      return {data: createStore(today), source: 'new', blocked: false};
    } catch (error) {
      return {data: createStore(today), source: 'unavailable', blocked: true,
        error: 'Your saved data could not be read. Changes cannot be saved in this browser. Keep your browser data and use an existing backup or try another browser.'};
    }
  }

  function profilesFromBackup(input, today) {
    if (input?.version === 2) return normalizeStore(input, today, true).profiles;
    if (input && typeof input === 'object' && Array.isArray(input.trips)) {
      return [cleanProfile({...input, name: str(input.name) || 'Imported person'}, today, true)];
    }
    throw new Error('This is not a supported citizenship tracker backup.');
  }

  return {KEY, LEGACY_KEY, CHECKLIST_FIELDS, createProfile, load, profilesFromBackup};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CitizenshipProfiles;
else globalThis.CitizenshipProfiles = CitizenshipProfiles;
