(function () {
  'use strict';

  const SETTINGS_KEY = 'dongwei-teacher-profiles-v1';
  const DEFAULT_PROFILE_ID = 'dongwei';

  function emptyProfile(id, name) {
    return {
      id: id || DEFAULT_PROFILE_ID,
      name: name || '我的教學設定',
      school: '',
      customRosters: {},
      customLessons: [],
      materials: []
    };
  }

  function readStore() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (value && value.profiles) return value;
    } catch { /* use a new local profile store */ }
    return { activeProfileId: DEFAULT_PROFILE_ID, profiles: { [DEFAULT_PROFILE_ID]: emptyProfile(DEFAULT_PROFILE_ID, '東衛預設設定') } };
  }

  let store = readStore();
  if (!store.profiles[store.activeProfileId]) {
    store.profiles[store.activeProfileId] = emptyProfile(store.activeProfileId);
  }

  function persist() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(store));
  }

  function activeProfile() {
    return store.profiles[store.activeProfileId] || emptyProfile(store.activeProfileId);
  }

  function normaliseProfileId(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `teacher-${Date.now()}`;
  }

  function normaliseLines(value) {
    return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  }

  function normaliseLessonKey(value) {
    const text = String(value || '').replace(/\s+/g, '').toLowerCase();
    const numberKey = text.match(/\d+(?:[-－]\d+)?/);
    return numberKey ? numberKey[0].replace('－', '-') : text;
  }

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
  }

  function hasCustomContent() {
    const profile = activeProfile();
    return Object.values(profile.customRosters || {}).some(list => Array.isArray(list) && list.length)
      || (profile.customLessons || []).length > 0
      || (profile.materials || []).length > 0;
  }

  function applyRosters(rosters) {
    const profile = activeProfile();
    const custom = profile.customRosters || {};
    if (profile.id !== DEFAULT_PROFILE_ID) {
      ['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'].forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(custom, key)) rosters[key] = [];
      });
    }
    Object.keys(custom).forEach(key => {
      if (Array.isArray(custom[key])) rosters[key] = custom[key].slice();
    });
    rosters.all = Object.keys(rosters).filter(key => key !== 'all').flatMap(key => rosters[key]);
    return rosters;
  }

  function normaliseRosterKey(value) {
    const key = String(value || '').trim();
    return /^grade[1-6]$/.test(key) ? key : '';
  }

  function saveRoster(gradeKey, names) {
    const key = normaliseRosterKey(gradeKey);
    if (!key) throw new Error('請先選擇 1～6 年級');
    const roster = normaliseLines(Array.isArray(names) ? names.join('\n') : names);
    if (!roster.length) throw new Error('名單不可為空白');
    const profile = activeProfile();
    profile.customRosters = profile.customRosters || {};
    profile.customRosters[key] = roster;
    persist();
    return roster.slice();
  }

  function clearRoster(gradeKey) {
    const key = normaliseRosterKey(gradeKey);
    if (!key) throw new Error('請先選擇 1～6 年級');
    const profile = activeProfile();
    profile.customRosters = profile.customRosters || {};
    delete profile.customRosters[key];
    persist();
  }

  function getCustomLesson(subject, gradeNumber, lessonNumber) {
    const lessonKey = normaliseLessonKey(lessonNumber);
    return (activeProfile().customLessons || []).find(item =>
      item.subject === subject
      && String(item.grade) === String(gradeNumber)
      && normaliseLessonKey(item.lesson) === lessonKey
    ) || null;
  }

  function getMaterialsForLesson(subject, gradeNumber, lessonNumber) {
    const lessonKey = normaliseLessonKey(lessonNumber);
    return (activeProfile().materials || []).filter(item =>
      (!item.subject || item.subject === subject)
      && (!item.grade || String(item.grade) === String(gradeNumber))
      && (!item.lesson || normaliseLessonKey(item.lesson) === lessonKey)
    );
  }

  function storageKey(baseKey) {
    const profileId = store.activeProfileId || DEFAULT_PROFILE_ID;
    return profileId === DEFAULT_PROFILE_ID ? baseKey : `${baseKey}:${encodeURIComponent(profileId)}`;
  }

  function exportData() {
    return {
      app: 'dongwei-teaching-planet',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: JSON.parse(JSON.stringify(activeProfile()))
    };
  }

  function importData(payload, options = {}) {
    const source = payload?.profile || payload;
    if (!source || typeof source !== 'object') throw new Error('設定檔格式不正確');
    const requestedId = options.profileId || source.id || `imported-${Date.now()}`;
    const id = normaliseProfileId(requestedId);
    const imported = emptyProfile(id, source.name || '匯入的教學設定');
    imported.school = String(source.school || '').trim();
    imported.customRosters = Object.fromEntries(Object.entries(source.customRosters || {}).map(([key, list]) => [key, normaliseLines(Array.isArray(list) ? list.join('\n') : list)]));
    imported.customLessons = Array.isArray(source.customLessons) ? source.customLessons.map(item => ({
      id: item.id || crypto.randomUUID?.() || String(Date.now()),
      subject: String(item.subject || ''), grade: String(item.grade || ''), lesson: String(item.lesson || ''),
      title: String(item.title || ''), objectives: normaliseLines(item.objectives), activities: normaliseLines(item.activities),
      game: String(item.game || ''), worksheet: normaliseLines(item.worksheet), questions: normaliseLines(item.questions),
      materialUrl: safeUrl(item.materialUrl)
    })) : [];
    imported.materials = Array.isArray(source.materials) ? source.materials.map(item => ({
      id: item.id || crypto.randomUUID?.() || String(Date.now()), title: String(item.title || ''),
      type: String(item.type || '其他教材'), subject: String(item.subject || ''), grade: String(item.grade || ''),
      lesson: String(item.lesson || ''), url: safeUrl(item.url), note: String(item.note || '')
    })).filter(item => item.title && item.url) : [];
    store.profiles[id] = imported;
    store.activeProfileId = id;
    persist();
    return imported;
  }

  window.TeacherProfile = {
    SETTINGS_KEY,
    getStore: () => store,
    getActiveProfile: activeProfile,
    getActiveProfileId: () => store.activeProfileId,
    getCustomContent: hasCustomContent,
    applyRosters,
    saveRoster,
    clearRoster,
    getCustomLesson,
    getMaterialsForLesson,
    storageKey,
    normaliseProfileId,
    normaliseLines,
    safeUrl,
    exportData,
    importData,
    saveProfile(profile) {
      const id = normaliseProfileId(profile.id);
      const next = emptyProfile(id, profile.name || '我的教學設定');
      next.school = String(profile.school || '').trim();
      next.customRosters = Object.fromEntries(Object.entries(profile.customRosters || {}).map(([key, list]) => [key, normaliseLines(Array.isArray(list) ? list.join('\n') : list)]));
      next.customLessons = Array.isArray(profile.customLessons) ? profile.customLessons : [];
      next.materials = Array.isArray(profile.materials) ? profile.materials.filter(item => item.title && item.url) : [];
      store.profiles[id] = next;
      store.activeProfileId = id;
      persist();
      return next;
    },
    switchProfile(id) {
      const profileId = normaliseProfileId(id);
      if (!store.profiles[profileId]) store.profiles[profileId] = emptyProfile(profileId);
      store.activeProfileId = profileId;
      persist();
      return activeProfile();
    },
    persist
  };

  persist();
})();
