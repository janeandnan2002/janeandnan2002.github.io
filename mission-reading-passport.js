(function (global) {
  'use strict';

  const TASKS_CONFIG_KEY = 'dongweiMissionTasksConfig.v1';
  const THEMES_CONFIG_KEY = 'dongweiReadingThemes.v1';
  const CERT_STORAGE_KEY = 'dongweiBlackbearCertifications.v1';
  const BACKUP_CERT_KEY = 'dongweiBlackbearAttempts.v1';
  const DAYS = ['一', '二', '三', '四', '五'];

  const DEFAULT_TASKS = [
    { key: 'classFocus', label: '專心參與課堂', points: 1 },
    { key: 'teamwork', label: '小組合作完成任務', points: 2 },
    { key: 'helper', label: '主動協助收納與服務', points: 2 },
    { key: 'speaking', label: '勇敢發表或口說練習', points: 2 },
    { key: 'cleanup', label: '保持座位、器材與場地整潔', points: 1 },
    { key: 'dailyReading', label: '自主晨讀或主題閱讀分享', points: 2 }
  ];

  const DEFAULT_THEMES = [
    '小黑啤玩臺灣',
    '澎湖在地與海洋教育',
    '國語日報／讀報任務',
    '自然科普與環境探索',
    '品格與生命教育繪本',
    '自由課外閱讀'
  ];

  const COMPREHENSION_META = {
    full: { label: '✅ 完全理解（認證通過）', short: '✅ 完全理解', passed: true },
    good: { label: '⭕ 大致理解（認證通過）', short: '⭕ 大致理解', passed: true },
    partial: { label: '⚠️ 部分理解（需加強引導）', short: '⚠️ 部分理解', passed: false },
    retry: { label: '⏳ 待補考／重讀', short: '⏳ 待補考', passed: false }
  };

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function mount(ctx) {
    const {
      $,
      getNames,
      findGradeByName,
      getProfileStorageKey,
      missionData,
      saveMissionData,
      addPoints,
      showToast
    } = ctx;

    let manageTasksMode = false;
    let currentCerts = [];

    function getBlackbearBooks() {
      return Array.isArray(global.DONGWEI_BLACKBEAR_DATA?.books)
        ? global.DONGWEI_BLACKBEAR_DATA.books
        : [];
    }

    function shortBookTitle(title) {
      const text = String(title || '');
      return text.includes('：') ? text.split('：').at(-1) : text;
    }

    function loadTasksConfig() {
      try {
        const saved = JSON.parse(localStorage.getItem(getProfileStorageKey(TASKS_CONFIG_KEY)) || 'null');
        if (Array.isArray(saved) && saved.length) {
          return saved
            .filter(t => t && t.key && t.label)
            .map(t => ({
              key: String(t.key),
              label: String(t.label),
              points: Math.max(1, Math.min(20, Number(t.points) || 1))
            }));
        }
      } catch { /* fallback to defaults */ }
      return DEFAULT_TASKS.map(t => ({ ...t }));
    }

    function saveTasksConfig(list) {
      localStorage.setItem(getProfileStorageKey(TASKS_CONFIG_KEY), JSON.stringify(list));
    }

    function loadThemesConfig() {
      try {
        const saved = JSON.parse(localStorage.getItem(getProfileStorageKey(THEMES_CONFIG_KEY)) || 'null');
        if (Array.isArray(saved) && saved.length) {
          const clean = [...new Set(saved.map(s => String(s || '').trim()).filter(Boolean))];
          if (!clean.includes('小黑啤玩臺灣')) clean.unshift('小黑啤玩臺灣');
          return clean;
        }
      } catch { /* fallback to defaults */ }
      return DEFAULT_THEMES.slice();
    }

    function saveThemesConfig(list) {
      localStorage.setItem(getProfileStorageKey(THEMES_CONFIG_KEY), JSON.stringify(list));
    }

    function readStoredBlackbearCerts() {
      const primaryKey = getProfileStorageKey(CERT_STORAGE_KEY);
      let primary = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(primaryKey) || 'null');
        if (Array.isArray(parsed)) primary = parsed;
      } catch { /* ignore */ }
      if (primary.length > 0 || primaryKey !== CERT_STORAGE_KEY) return primary;
      try {
        const backup = JSON.parse(localStorage.getItem(BACKUP_CERT_KEY) || 'null');
        if (Array.isArray(backup)) return backup;
      } catch { /* ignore */ }
      return [];
    }

    function readBlackbearCerts() {
      const stored = readStoredBlackbearCerts();
      const primaryKey = getProfileStorageKey(CERT_STORAGE_KEY);
      const seeds = (primaryKey === CERT_STORAGE_KEY && Array.isArray(global.DONGWEI_BLACKBEAR_DATA?.seedAttempts))
        ? global.DONGWEI_BLACKBEAR_DATA.seedAttempts
        : [];
      if (!seeds.length) {
        return [...stored].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
      }
      const seenIds = new Set();
      const seenKeys = new Set();
      const merged = [];
      for (const item of [...stored, ...seeds]) {
        if (!item) continue;
        const id = item.id ? String(item.id) : '';
        const composite = `${item.studentName || ''}|${item.bookId ?? ''}|${item.date || ''}`;
        if ((id && seenIds.has(id)) || seenKeys.has(composite)) continue;
        if (id) seenIds.add(id);
        seenKeys.add(composite);
        merged.push(item);
      }
      return merged.sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
    }

    function writeBlackbearCert(entry) {
      const primaryKey = getProfileStorageKey(CERT_STORAGE_KEY);
      const current = readStoredBlackbearCerts();
      const filtered = current.filter(item =>
        !(item.studentName === entry.studentName && String(item.bookId) === String(entry.bookId) && item.source === entry.source)
      );
      const next = [entry, ...filtered].slice(0, 1000);
      try {
        localStorage.setItem(primaryKey, JSON.stringify(next));
        if (primaryKey === CERT_STORAGE_KEY) {
          localStorage.setItem(BACKUP_CERT_KEY, JSON.stringify(next));
        } else {
          let backup = [];
          try {
            const parsed = JSON.parse(localStorage.getItem(BACKUP_CERT_KEY) || '[]');
            if (Array.isArray(parsed)) {
              backup = parsed.filter(item =>
                !(item.studentName === entry.studentName && String(item.bookId) === String(entry.bookId) && item.source === entry.source)
              );
            }
          } catch { /* ignore */ }
          localStorage.setItem(BACKUP_CERT_KEY, JSON.stringify([entry, ...backup].slice(0, 1000)));
        }
      } catch { /* ignore quota errors cleanly */ }
    }

    function getStudentBlackbearStats(studentName) {
      const books = getBlackbearBooks();
      const allCerts = readBlackbearCerts().filter(c => c.studentName === studentName);
      const byBook = new Map();
      for (const c of allCerts) {
        const id = String(c.bookId || '');
        if (!id) continue;
        const prev = byBook.get(id);
        const passed = Boolean(c.passed || Number(c.score) >= 8);
        if (!prev || (!prev.passed && passed) || Number(c.score || 0) > Number(prev.score || 0)) {
          byBook.set(id, { ...c, passed });
        }
      }
      const passedBooks = [...byBook.values()].filter(b => b.passed);
      return {
        totalBooks: books.length || 22,
        attempts: allCerts,
        byBook,
        passedCount: passedBooks.length
      };
    }

    let missionTasks = loadTasksConfig();
    let readingThemes = loadThemesConfig();

    function currentStudentName() {
      return $('missionStudent')?.value || '';
    }

    function renderMissionTaskGrid(existingTasksMap) {
      const prevValues = existingTasksMap || readCurrentTaskValues();
      const container = $('missionTaskGrid');
      if (!container) return;

      container.innerHTML = missionTasks.map((task, index) => `
        <div class="rounded-2xl border-2 border-orange-100 bg-orange-50/60 p-3" data-task-card="${esc(task.key)}">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-black text-orange-900">${esc(task.label)}</p>
            <div class="flex items-center gap-2">
              ${manageTasksMode ? `
                <label class="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-black text-orange-700">
                  每次
                  <input type="number" min="1" max="20" value="${task.points}" data-edit-task-points="${index}" class="w-12 rounded border border-orange-300 px-1 py-0.5 text-center font-black text-orange-900">
                  點
                </label>
                <button type="button" data-delete-task="${index}" class="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700 hover:bg-rose-200">✕ 刪除</button>
              ` : `
                <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-700">每次 ${task.points} 點</span>
              `}
            </div>
          </div>
          <div class="mt-3 grid grid-cols-5 gap-2">
            ${DAYS.map(day => {
              const val = Number(prevValues?.[task.key]?.[day] || 0);
              return `
                <label class="rounded-xl bg-white p-2 text-center text-xs font-black text-slate-600 shadow-sm">
                  ${day}
                  <select data-task="${esc(task.key)}" data-day="${day}" class="missionCount mt-1 w-full rounded-lg border border-orange-200 px-1 py-1 text-center font-black">
                    ${[0, 1, 2, 3].map(n => `<option value="${n}" ${val === n ? 'selected' : ''}>${n}</option>`).join('')}
                  </select>
                </label>`;
            }).join('')}
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.missionCount').forEach(sel => {
        sel.addEventListener('change', updateMissionSummary);
      });

      if (manageTasksMode) {
        container.querySelectorAll('[data-edit-task-points]').forEach(inp => {
          inp.addEventListener('change', () => {
            const idx = Number(inp.dataset.editTaskPoints);
            if (!missionTasks[idx]) return;
            missionTasks[idx].points = Math.max(1, Math.min(20, Number(inp.value) || 1));
            inp.value = missionTasks[idx].points;
            saveTasksConfig(missionTasks);
            updateMissionSummary();
            showToast(`已更新「${missionTasks[idx].label}」為每次 ${missionTasks[idx].points} 點`);
          });
        });

        container.querySelectorAll('[data-delete-task]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.deleteTask);
            const target = missionTasks[idx];
            if (!target) return;
            if (missionTasks.length <= 1) return showToast('至少需保留一項任務');
            if (!confirm(`確定移除任務「${target.label}」嗎？`)) return;
            const snapshot = readCurrentTaskValues();
            missionTasks.splice(idx, 1);
            saveTasksConfig(missionTasks);
            renderMissionTaskGrid(snapshot);
            updateMissionSummary();
            showToast(`已移除任務：${target.label}`);
          });
        });
      }
    }

    function readCurrentTaskValues() {
      const tasks = {};
      document.querySelectorAll('.missionCount').forEach(select => {
        const task = select.dataset.task;
        const day = select.dataset.day;
        if (!tasks[task]) tasks[task] = {};
        tasks[task][day] = Number(select.value || 0);
      });
      return tasks;
    }

    function renderThemeSelects() {
      const themeSel = $('readingThemeSelect');
      const filterSel = $('missionThemeFilter');
      const curTheme = themeSel?.value || readingThemes[0];
      const curFilter = filterSel?.value || '';
      if (themeSel) {
        themeSel.innerHTML = readingThemes.map(t =>
          `<option value="${esc(t)}">${t === '小黑啤玩臺灣' ? '🐻 小黑啤玩臺灣（22 本專書）' : esc(t)}</option>`
        ).join('');
        themeSel.value = readingThemes.includes(curTheme) ? curTheme : readingThemes[0];
      }
      if (filterSel) {
        filterSel.innerHTML = `<option value="">全部主題</option>` + readingThemes.map(t =>
          `<option value="${esc(t)}">${esc(t)}</option>`
        ).join('');
        filterSel.value = readingThemes.includes(curFilter) ? curFilter : '';
      }
      toggleBlackbearPicker();
    }

    function renderBlackbearBannerAndBooks() {
      const name = currentStudentName();
      const stats = getStudentBlackbearStats(name);
      const badge = $('blackbearProgressBadge');
      const latestInfo = $('blackbearLatestHint');
      const openLink = $('openBlackbearLink');
      const books = getBlackbearBooks();

      if (badge) {
        badge.textContent = name
          ? `🐻 ${name} · 小黑啤認證：已通過 ${stats.passedCount} / ${stats.totalBooks} 本`
          : `🐻 小黑啤認證：0 / ${stats.totalBooks} 本`;
      }
      if (latestInfo) {
        if (stats.attempts.length > 0) {
          const latest = stats.attempts[0];
          const dt = latest.date ? new Date(latest.date).toLocaleDateString('zh-TW') : '';
          latestInfo.textContent = `最近測驗：《${shortBookTitle(latest.bookTitle || latest.bookId)}》${latest.score}/${latest.total || 10} 分（${latest.passed ? '已通過' : '未通過'}）${dt ? ' · ' + dt : ''}`;
        } else {
          latestInfo.textContent = name ? '尚未有小黑啤線上測驗紀錄，可點右方按鈕前往挑戰或由老師直接登錄。' : '請先選擇學生。';
        }
      }
      if (openLink) {
        openLink.href = name
          ? `/blackbear/index.html?student=${encodeURIComponent(name)}`
          : '/blackbear/index.html';
      }

      const bookSel = $('blackbearBookSelect');
      if (bookSel) {
        const prev = bookSel.value;
        bookSel.innerHTML = `<option value="">-- 請選擇《小黑啤玩臺灣》書籍（可快選帶入）--</option>` +
          books.map(b => {
            const hit = stats.byBook.get(String(b.id));
            const tag = hit ? (hit.passed ? ` ✓ 已通過(${hit.score}/10)` : ` (上次${hit.score}/10)`) : '';
            return `<option value="${esc(b.id)}">${esc(b.title)}${esc(tag)}</option>`;
          }).join('');
        if (prev && books.some(b => String(b.id) === prev)) bookSel.value = prev;
      }
    }

    function toggleBlackbearPicker() {
      const wrap = $('blackbearPickerWrap');
      if (!wrap) return;
      const isBlackbear = $('readingThemeSelect')?.value === '小黑啤玩臺灣';
      wrap.classList.toggle('hidden', !isBlackbear);
    }

    function syncCertifiedCheckboxFromSelect() {
      const comp = $('readingComprehension')?.value || 'full';
      const meta = COMPREHENSION_META[comp] || COMPREHENSION_META.full;
      if ($('readingCertified')) $('readingCertified').checked = meta.passed;
      const ptsInput = $('readingPointsInput');
      if (ptsInput && !meta.passed && Number(ptsInput.value) > 0) {
        ptsInput.dataset.prevPassedPts = ptsInput.value;
        ptsInput.value = '0';
      } else if (ptsInput && meta.passed && Number(ptsInput.value) === 0) {
        ptsInput.value = ptsInput.dataset.prevPassedPts || '5';
      }
      updateMissionSummary();
    }

    function syncSelectFromCertifiedCheckbox() {
      const checked = Boolean($('readingCertified')?.checked);
      const sel = $('readingComprehension');
      if (!sel) return;
      if (checked && !COMPREHENSION_META[sel.value]?.passed) {
        sel.value = 'full';
      } else if (!checked && COMPREHENSION_META[sel.value]?.passed) {
        sel.value = 'partial';
      }
      const ptsInput = $('readingPointsInput');
      if (ptsInput) {
        if (checked && Number(ptsInput.value) === 0) ptsInput.value = ptsInput.dataset.prevPassedPts || '5';
        if (!checked && Number(ptsInput.value) > 0) {
          ptsInput.dataset.prevPassedPts = ptsInput.value;
          ptsInput.value = '0';
        }
      }
      updateMissionSummary();
    }

    function buildDraftCertFromInputs() {
      const title = $('readingTitle')?.value.trim() || '';
      if (!title) return null;
      const theme = $('readingThemeSelect')?.value || '自由課外閱讀';
      const bookId = theme === '小黑啤玩臺灣' ? ($('blackbearBookSelect')?.value || '') : '';
      const method = $('readingMethod')?.value || '教師口頭提問';
      const score = $('readingScore')?.value.trim() || '';
      const comprehension = $('readingComprehension')?.value || ($('readingCertified')?.checked ? 'full' : 'partial');
      const meta = COMPREHENSION_META[comprehension] || COMPREHENSION_META.full;
      const passed = Boolean($('readingCertified')?.checked && meta.passed);
      const points = passed ? Math.max(0, Math.min(20, Number($('readingPointsInput')?.value || 5))) : 0;
      return {
        id: `cert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        theme,
        bookId,
        title,
        method,
        score,
        comprehension,
        passed,
        points,
        q1: $('readingQ1')?.value.trim() || '',
        q2: $('readingQ2')?.value.trim() || '',
        q3: $('readingQ3')?.value.trim() || '',
        date: new Date().toISOString()
      };
    }

    function resetDraftReadingInputs() {
      if ($('blackbearBookSelect')) $('blackbearBookSelect').value = '';
      if ($('readingTitle')) $('readingTitle').value = '';
      if ($('readingScore')) $('readingScore').value = '';
      if ($('readingComprehension')) $('readingComprehension').value = 'full';
      if ($('readingCertified')) $('readingCertified').checked = true;
      if ($('readingPointsInput')) $('readingPointsInput').value = '5';
      if ($('readingQ1')) $('readingQ1').value = '';
      if ($('readingQ2')) $('readingQ2').value = '';
      if ($('readingQ3')) $('readingQ3').value = '';
    }

    function addOrUpdateCert(entry) {
      const idx = currentCerts.findIndex(c =>
        (entry.bookId && c.bookId && String(c.bookId) === String(entry.bookId)) ||
        (c.theme === entry.theme && c.title === entry.title)
      );
      if (idx >= 0) {
        currentCerts[idx] = { ...currentCerts[idx], ...entry, id: currentCerts[idx].id };
      } else {
        currentCerts.push(entry);
      }
      renderCertList();
      updateMissionSummary();
    }

    function mirrorCertsToBlackbear(studentName, certs) {
      if (!studentName || !Array.isArray(certs) || !certs.length) return;
      const books = getBlackbearBooks();
      const gradeKey = findGradeByName(studentName);
      const classLabel = gradeKey.startsWith('grade') ? `${gradeKey.replace('grade', '')} 年級` : '';

      for (const c of certs) {
        if (c.source === 'blackbear_quiz') continue;
        let matchedBookId = c.bookId;
        if (!matchedBookId && c.theme === '小黑啤玩臺灣' && c.title) {
          const hit = books.find(b => b.title === c.title || shortBookTitle(b.title) === c.title || b.title.includes(c.title));
          if (hit) matchedBookId = hit.id;
        }
        if (!matchedBookId) continue;

        let numericScore = 0;
        const m = String(c.score || '').match(/(\d+)/);
        if (m) numericScore = Math.min(10, Math.max(0, Number(m[1])));
        else numericScore = c.passed ? 10 : 5;

        const book = books.find(b => String(b.id) === String(matchedBookId));
        writeBlackbearCert({
          id: `passport-${studentName}-${matchedBookId}`,
          studentName,
          className: classLabel,
          seat: 0,
          bookId: String(matchedBookId),
          bookTitle: book?.title || c.title,
          score: numericScore,
          total: 10,
          passed: Boolean(c.passed),
          readingSkillSummary: c.readingSkillSummary || (COMPREHENSION_META[c.comprehension]?.short || ''),
          source: 'passport_manual',
          date: c.date || new Date().toISOString()
        });
      }
    }

    function renderCertList() {
      const listEl = $('readingCertList');
      const countEl = $('readingCertCountBadge');
      if (countEl) {
        const passedPts = currentCerts.filter(c => c.passed).reduce((s, c) => s + Number(c.points || 0), 0);
        countEl.textContent = `已記錄 ${currentCerts.length} 本（閱讀 +${passedPts} 點）`;
      }
      if (!listEl) return;
      if (!currentCerts.length) {
        listEl.innerHTML = '<p class="rounded-2xl bg-white/80 p-3 text-center text-xs font-bold text-slate-500">尚未加入本週認證書目。上方填好後可點「＋ 加入本筆閱讀認證」，或按「🔄 同步小黑啤測驗紀錄」。</p>';
        return;
      }

      listEl.innerHTML = currentCerts.map((c, idx) => {
        const meta = COMPREHENSION_META[c.comprehension] || (c.passed ? COMPREHENSION_META.full : COMPREHENSION_META.partial);
        const badgeCls = meta.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
        return `
          <div class="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm" data-cert-index="${idx}">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 text-xs font-black">
                  <span class="rounded-full bg-orange-100 px-2 py-0.5 text-orange-800">${esc(c.theme || '閱讀認證')}</span>
                  <span class="rounded-full ${badgeCls} px-2 py-0.5">${esc(meta.short)}</span>
                  ${c.score ? `<span class="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">${esc(c.score)}</span>` : ''}
                  <span class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">${esc(c.method || '認證')}</span>
                </div>
                <p class="mt-1.5 font-black text-slate-900">${esc(c.title)}</p>
                ${c.readingSkillSummary ? `<p class="mt-0.5 text-xs font-bold text-indigo-600">理解分析：${esc(c.readingSkillSummary)}</p>` : ''}
                ${(c.q1 || c.q2 || c.q3) ? `<p class="mt-1 text-xs text-slate-500 line-clamp-2">心得摘要：${esc([c.q1, c.q2, c.q3].filter(Boolean).join(' ／ '))}</p>` : ''}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">${c.passed ? `+${c.points} 點` : '0 點'}</span>
                <button type="button" data-remove-cert="${idx}" class="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 hover:bg-rose-100 hover:text-rose-700">移除</button>
              </div>
            </div>
          </div>`;
      }).join('');

      listEl.querySelectorAll('[data-remove-cert]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.removeCert);
          currentCerts.splice(idx, 1);
          renderCertList();
          updateMissionSummary();
        });
      });
    }

    function normalizeRecordCerts(record) {
      if (!record) return [];
      if (Array.isArray(record.certifications) && record.certifications.length > 0) {
        return record.certifications.map(c => ({
          ...c,
          points: c.passed ? Number(c.points ?? 5) : 0
        }));
      }
      if (record.reading && (record.reading.title || record.reading.certified || record.reading.q1 || record.reading.q2 || record.reading.q3)) {
        const passed = Boolean(record.reading.certified);
        return [{
          id: 'legacy-1',
          theme: '自由課外閱讀',
          bookId: '',
          title: record.reading.title || '未填書名',
          method: '教師口頭提問',
          score: passed ? '通過' : '',
          comprehension: passed ? 'full' : 'partial',
          passed,
          points: passed ? Number(record.readingPoints ?? 5) : 0,
          q1: record.reading.q1 || '',
          q2: record.reading.q2 || '',
          q3: record.reading.q3 || '',
          date: record.updatedAt || new Date().toISOString()
        }];
      }
      return [];
    }

    function collectMissionForm(options = {}) {
      const tasks = readCurrentTaskValues();
      const taskPoints = missionTasks.reduce((sum, task) => {
        const count = DAYS.reduce((daySum, day) => daySum + Number(tasks[task.key]?.[day] || 0), 0);
        return sum + count * task.points;
      }, 0);

      let effectiveCerts = currentCerts.slice();
      const draftCert = buildDraftCertFromInputs();
      if (options.includeDraft && draftCert) {
        const exists = effectiveCerts.some(c =>
          (draftCert.bookId && c.bookId && String(c.bookId) === String(draftCert.bookId)) ||
          (c.theme === draftCert.theme && c.title === draftCert.title)
        );
        if (!exists) effectiveCerts.push(draftCert);
      }

      const listPoints = effectiveCerts.reduce((sum, c) => sum + (c.passed ? Number(c.points || 0) : 0), 0);
      const readingPoints = effectiveCerts.length > 0
        ? listPoints
        : (draftCert && draftCert.passed ? Number(draftCert.points || 0) : ($('readingCertified')?.checked && !$('readingTitle')?.value.trim() ? 5 : 0));

      const totalPoints = taskPoints + readingPoints;
      const rewardMinutes = Math.floor(totalPoints / 10) * 30;
      const usedMinutes = Math.max(0, Number($('rewardMinutesUsed')?.value || 0));
      const primaryCert = effectiveCerts[0] || draftCert;

      return {
        student: currentStudentName(),
        week: $('missionWeek')?.value.trim() || '未命名週次',
        tasks,
        certifications: effectiveCerts,
        reading: {
          title: primaryCert?.title || $('readingTitle')?.value.trim() || '',
          q1: primaryCert?.q1 || $('readingQ1')?.value.trim() || '',
          q2: primaryCert?.q2 || $('readingQ2')?.value.trim() || '',
          q3: primaryCert?.q3 || $('readingQ3')?.value.trim() || '',
          certified: effectiveCerts.some(c => c.passed) || Boolean($('readingCertified')?.checked)
        },
        taskPoints,
        readingPoints,
        totalPoints,
        rewardMinutes,
        usedMinutes,
        remainingMinutes: Math.max(0, rewardMinutes - usedMinutes),
        note: $('missionNote')?.value.trim() || '',
        updatedAt: new Date().toISOString()
      };
    }

    function fillMissionForm(record) {
      if (record?.tasks) {
        // Ensure any historical custom task keys from old saved record also display cleanly
        Object.keys(record.tasks).forEach(k => {
          if (!missionTasks.some(t => t.key === k)) {
            const hasCount = DAYS.some(d => Number(record.tasks[k]?.[d] || 0) > 0);
            if (hasCount) {
              missionTasks.push({ key: k, label: `自訂任務 (${k})`, points: 1 });
            }
          }
        });
      }
      renderMissionTaskGrid(record?.tasks || {});
      currentCerts = normalizeRecordCerts(record);
      renderCertList();
      resetDraftReadingInputs();
      if ($('rewardMinutesUsed')) $('rewardMinutesUsed').value = record?.usedMinutes || 0;
      if ($('missionNote')) $('missionNote').value = record?.note || '';
      renderBlackbearBannerAndBooks();
      updateMissionSummary();
    }

    function updateMissionSummary() {
      const data = collectMissionForm({ includeDraft: true });
      if ($('missionTaskPoints')) $('missionTaskPoints').textContent = data.totalPoints;
      if ($('missionPointsBreakdown')) {
        $('missionPointsBreakdown').textContent = `課堂任務 ${data.taskPoints} ＋ 閱讀認證 ${data.readingPoints} 點`;
      }
      if ($('missionRewardMinutes')) $('missionRewardMinutes').textContent = `${data.remainingMinutes} 分`;
    }

    function toPassportCert(item) {
      const scoreNum = Number(item.score);
      const passed = Boolean(item.passed || (Number.isFinite(scoreNum) && scoreNum >= 8));
      const comp = passed ? (scoreNum >= 9 ? 'full' : 'good') : 'retry';
      return {
        id: item.id || `bb-${item.bookId}`,
        theme: '小黑啤玩臺灣',
        bookId: String(item.bookId || ''),
        title: item.bookTitle || shortBookTitle(item.bookId),
        method: item.source === 'passport_manual' ? '教師人工認證' : '小黑啤線上測驗',
        score: Number.isFinite(scoreNum) ? `${scoreNum}/${item.total || 10}` : (item.score ? String(item.score) : ''),
        comprehension: comp,
        passed,
        points: passed ? 5 : 0,
        readingSkillSummary: item.readingSkillSummary || '',
        source: item.source || 'blackbear_quiz',
        date: item.date || new Date().toISOString()
      };
    }

    function seedInitialMissionDataFromBlackbear() {
      const certs = readBlackbearCerts();
      if (!certs.length) return false;
      const defaultWeek = '第 1 週';
      const studentNames = [...new Set(certs.map(c => String(c?.studentName || '').trim()).filter(Boolean))];
      let mutatedAny = false;

      for (const studentName of studentNames) {
        const grade = findGradeByName(studentName);
        const key = `${grade}:${studentName}:${defaultWeek}`;
        const stats = getStudentBlackbearStats(studentName);
        const bestList = [...stats.byBook.values()];
        if (!bestList.length) continue;

        const alreadyOtherWeeksBooks = new Set();
        for (const rec of Object.values(missionData)) {
          if (!rec || rec.student !== studentName || rec.key === key) continue;
          for (const c of normalizeRecordCerts(rec)) {
            if (c.bookId) alreadyOtherWeeksBooks.add(String(c.bookId));
          }
        }

        const existing = missionData[key];
        const mergedCerts = existing ? normalizeRecordCerts(existing).slice() : [];
        let changed = false;

        for (const item of bestList) {
          const bookKey = String(item.bookId || '');
          if (!bookKey || alreadyOtherWeeksBooks.has(bookKey)) continue;
          const nextCert = toPassportCert(item);
          const idx = mergedCerts.findIndex(c => String(c.bookId || '') === bookKey);
          if (idx < 0) {
            mergedCerts.push(nextCert);
            changed = true;
          } else {
            const cur = mergedCerts[idx];
            if (cur.source !== 'passport_manual' && (cur.score !== nextCert.score || Boolean(cur.passed) !== Boolean(nextCert.passed))) {
              mergedCerts[idx] = { ...cur, ...nextCert };
              changed = true;
            }
          }
        }

        if (!changed) continue;
        mutatedAny = true;
        const taskPoints = Number(existing?.taskPoints || 0);
        const readingPoints = mergedCerts.reduce((sum, c) => sum + (c.passed ? Number(c.points ?? 5) : 0), 0);
        const totalPoints = taskPoints + readingPoints;
        const rewardMinutes = Math.floor(totalPoints / 10) * 30;
        const usedMinutes = Number(existing?.usedMinutes || 0);
        const primaryCert = mergedCerts[0];
        const latestDate = mergedCerts.reduce((max, c) => {
          const ts = Date.parse(c.date || 0);
          return (!Number.isNaN(ts) && (!max || ts > Date.parse(max))) ? c.date : max;
        }, '') || existing?.updatedAt || new Date().toISOString();

        missionData[key] = {
          ...(existing || {}),
          key,
          student: studentName,
          week: existing?.week || defaultWeek,
          tasks: existing?.tasks || {},
          certifications: mergedCerts,
          reading: existing?.reading?.title ? existing.reading : {
            title: primaryCert?.title || '',
            q1: primaryCert?.q1 || '',
            q2: primaryCert?.q2 || '',
            q3: primaryCert?.q3 || '',
            certified: mergedCerts.some(c => c.passed)
          },
          taskPoints,
          readingPoints,
          totalPoints,
          rewardMinutes,
          usedMinutes,
          remainingMinutes: Math.max(0, rewardMinutes - usedMinutes),
          note: existing?.note || '',
          appliedPoints: Number(existing?.appliedPoints || 0),
          updatedAt: latestDate
        };
      }
      return mutatedAny;
    }

    function parseCsvRows(text) {
      const clean = String(text || '').replace(/^\uFEFF/, '');
      const rows = [];
      let row = [];
      let cell = '';
      let inQuotes = false;
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (inQuotes) {
          if (ch === '"' && clean[i + 1] === '"') {
            cell += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            cell += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          row.push(cell.trim());
          cell = '';
        } else if (ch === '\r' || ch === '\n') {
          if (ch === '\r' && clean[i + 1] === '\n') i++;
          row.push(cell.trim());
          if (row.some(Boolean)) rows.push(row);
          row = [];
          cell = '';
        } else {
          cell += ch;
        }
      }
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      return rows;
    }

    function resolveImportedStudentName(rawName, className, seat) {
      const cleaned = String(rawName || '').trim();
      if (cleaned && !/^\d+\s*號$/.test(cleaned)) return cleaned;
      const gradeMap = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
      const m = String(className || '').match(/([1-6一二三四五六])\s*年?/);
      const seatNum = Number(seat);
      if (m && seatNum >= 1) {
        const gradeKey = `grade${gradeMap[m[1]]}`;
        const rosterName = global.DONGWEI_BLACKBEAR_DATA?.defaultRosters?.[gradeKey]?.[seatNum - 1];
        if (rosterName) return rosterName;
      }
      return '';
    }

    function normalizeImportedDate(raw) {
      const text = String(raw || '').trim();
      if (!text) return new Date().toISOString();
      const sqlUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
      const parsed = Date.parse(sqlUtc);
      return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
    }

    function importCertificationsFromText(rawText) {
      const trimmed = String(rawText || '').replace(/^\uFEFF/, '').trim();
      if (!trimmed) return 0;
      let items = [];
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        items = Array.isArray(parsed) ? parsed : (parsed.attempts || parsed.certifications || []);
      } else {
        const rows = parseCsvRows(trimmed);
        if (rows.length < 2) return 0;
        const headers = rows[0].map(h => h.trim());
        items = rows.slice(1).map(cols => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
          return obj;
        });
      }

      const books = getBlackbearBooks();
      let imported = 0;
      for (let i = 0; i < items.length; i++) {
        const r = items[i] || {};
        const className = r.className || r['班級'] || '';
        const seat = r.seat || r['座號'] || '';
        const studentName = resolveImportedStudentName(r.studentName || r['姓名'] || r.student, className, seat);
        if (!studentName) continue;

        const rawBookId = String(r.bookId || r['書號'] || '').trim();
        const rawBookTitle = String(r.bookTitle || r['書名'] || r.title || '').trim();
        const matchedBook = books.find(b => rawBookId && String(b.id) === rawBookId)
          || books.find(b => rawBookTitle && (b.title === rawBookTitle || shortBookTitle(b.title) === shortBookTitle(rawBookTitle)));
        const bookId = matchedBook ? String(matchedBook.id) : (rawBookId || rawBookTitle);
        const bookTitle = matchedBook ? matchedBook.title : (rawBookTitle || bookId);
        if (!bookId) continue;

        const scoreRaw = String(r.score ?? r['答對題數'] ?? r['得分'] ?? '').trim();
        const scoreMatch = scoreRaw.match(/(\d+)/);
        const score = scoreMatch ? Number(scoreMatch[1]) : 0;
        const passedFlag = String(r.passed ?? r['通過'] ?? '').trim().toLowerCase();
        const passed = passedFlag
          ? (passedFlag === 'true' || passedFlag === '是' || passedFlag === '1' || passedFlag.includes('通過'))
          : score >= 8;
        const date = normalizeImportedDate(r.date || r.submitted_at || r['時間'] || r['日期']);

        writeBlackbearCert({
          id: r.id || `import-${studentName}-${bookId}-${Date.now()}-${i}`,
          studentName,
          className,
          seat: seat ? Number(seat) : undefined,
          bookId,
          bookTitle,
          score,
          total: Number(r.total || 10),
          passed,
          date,
          source: r.source || 'blackbear_quiz'
        });
        imported++;
      }
      if (imported > 0) {
        seedInitialMissionDataFromBlackbear();
        renderBlackbearBannerAndBooks();
        if (currentStudentName()) loadMissionRecord({ silent: true });
        renderMissionRecords();
      }
      return imported;
    }

    function syncBlackbearRecordsForStudent(silent = false) {
      const name = currentStudentName();
      if (!name) {
        if (!silent) showToast('請先選擇學生');
        return 0;
      }
      const stats = getStudentBlackbearStats(name);
      const allUnique = [...stats.byBook.values()];
      if (allUnique.length === 0) {
        if (!silent) showToast(`${name} 尚無小黑啤測驗紀錄，可點「前往小黑啤書架測驗」挑戰`);
        return 0;
      }

      let importedCount = 0;
      for (const item of allUnique) {
        const alreadyInList = currentCerts.some(c => String(c.bookId) === String(item.bookId));
        if (!alreadyInList) importedCount++;
        addOrUpdateCert(toPassportCert(item));
      }

      if (!silent) {
        showToast(importedCount > 0
          ? `已同步 ${importedCount} 筆《小黑啤玩臺灣》認證紀錄（共通過 ${stats.passedCount} 本），記得按「儲存任務與認證紀錄」完成加點！`
          : `已更新《小黑啤玩臺灣》最新成績（共 ${allUnique.length} 本）`);
      }
      return importedCount;
    }

    function saveMissionRecord() {
      const draft = buildDraftCertFromInputs();
      if (draft) {
        addOrUpdateCert(draft);
        resetDraftReadingInputs();
      }
      const data = collectMissionForm({ includeDraft: false });
      if (!data.student) return showToast('請先選擇學生');

      const key = `${findGradeByName(data.student)}:${data.student}:${data.week || '未命名週次'}`;
      const oldRecord = missionData[key];
      const oldApplied = Number(oldRecord?.appliedPoints || 0);
      const delta = data.totalPoints - oldApplied;

      missionData[key] = { ...data, key, appliedPoints: data.totalPoints };
      try {
        saveMissionData();
      } catch {
        if (oldRecord) missionData[key] = oldRecord; else delete missionData[key];
        return showToast('任務紀錄未儲存，也未加點。請檢查瀏覽器儲存空間。');
      }

      if (delta !== 0 && !addPoints(data.student, delta)) {
        if (oldRecord) missionData[key] = oldRecord; else delete missionData[key];
        try { saveMissionData(); }
        catch { alert('點數未變更，但任務紀錄無法復原，請勿重複給點，先匯出資料再檢查。'); }
        if ($('missionStatus')) $('missionStatus').textContent = '點數未儲存，本次任務未完成同步。';
        return;
      }

      mirrorCertsToBlackbear(data.student, data.certifications);
      renderBlackbearBannerAndBooks();
      renderMissionRecords();
      if ($('missionStatus')) {
        $('missionStatus').textContent = `已儲存：${data.student}｜${data.week}，共 ${data.totalPoints} 點（認證 ${data.certifications.length} 本），已同步星光 ${delta >= 0 ? '+' : ''}${delta}`;
      }
      showToast('任務閱讀存摺已儲存並完成同步');
    }

    function loadMissionRecord(options = {}) {
      const name = currentStudentName();
      const week = $('missionWeek')?.value.trim() || '未命名週次';
      const key = `${findGradeByName(name)}:${name}:${week}`;
      const record = missionData[key];
      renderBlackbearBannerAndBooks();
      if (!record) {
        fillMissionForm(null);
        if ($('missionStatus')) $('missionStatus').textContent = '查無這位學生的本週紀錄，可直接建立或同步小黑啤認證';
        return;
      }
      fillMissionForm(record);
      if ($('missionStatus')) $('missionStatus').textContent = `已讀取：${record.student}｜${record.week}`;
      if (!options?.silent) showToast('已讀取任務閱讀紀錄');
    }

    function clearMissionRecord() {
      const name = currentStudentName();
      const week = $('missionWeek')?.value.trim() || '未命名週次';
      const key = `${findGradeByName(name)}:${name}:${week}`;
      const record = missionData[key];
      if (!record) return showToast('目前沒有可清除的本筆紀錄');
      if (!confirm(`確定清除「${record.student}｜${record.week}」任務閱讀紀錄嗎？已同步的星光點不會自動扣回。`)) return;
      delete missionData[key];
      saveMissionData();
      fillMissionForm(null);
      renderMissionRecords();
      if ($('missionStatus')) $('missionStatus').textContent = '已清除本筆任務閱讀紀錄';
      showToast('已清除本筆紀錄');
    }

    function renderMissionRecords() {
      const keyword = ($('missionSearch')?.value || '').trim();
      const themeFilter = $('missionThemeFilter')?.value || '';
      const rows = Object.values(missionData)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .filter(record => {
          const certs = normalizeRecordCerts(record);
          const matchTheme = !themeFilter || certs.some(c => c.theme === themeFilter);
          if (!matchTheme) return false;
          if (!keyword) return true;
          const certText = certs.map(c => `${c.theme} ${c.title} ${c.score || ''}`).join(' ');
          return String(record.student || '').includes(keyword)
            || String(record.week || '').includes(keyword)
            || certText.includes(keyword);
        });

      const tbody = $('missionRecordTable');
      if (!tbody) return;
      tbody.innerHTML = rows.map(record => {
        const certs = normalizeRecordCerts(record);
        const bbStats = getStudentBlackbearStats(record.student);
        const certHtml = certs.length
          ? `<div class="space-y-1">${certs.map(c => {
              const meta = COMPREHENSION_META[c.comprehension] || (c.passed ? COMPREHENSION_META.full : COMPREHENSION_META.partial);
              return `<div class="text-xs"><span class="inline-block rounded bg-orange-100 px-1.5 py-0.5 font-black text-orange-800">${esc(c.theme || '閱讀')}</span> <span class="font-bold text-slate-800">${esc(shortBookTitle(c.title))}</span> ${c.score ? `<span class="font-black text-blue-700">${esc(c.score)}</span>` : ''} <span class="text-slate-600">${esc(meta.short)}</span></div>`;
            }).join('')}</div>`
          : `<span class="text-xs text-slate-400">未登錄閱讀</span>`;

        return `
          <tr class="cursor-pointer hover:bg-orange-50 align-top" data-mission-key="${esc(record.key)}">
            <td class="px-4 py-3">
              <p class="font-black text-blue-700">${esc(record.student)}</p>
              <p class="text-xs font-bold text-amber-700">🐻 小黑啤 ${bbStats.passedCount}/${bbStats.totalBooks} 本</p>
            </td>
            <td class="px-4 py-3 font-bold">${esc(record.week)}</td>
            <td class="px-4 py-3">
              <p class="font-black text-orange-700">${record.totalPoints} 點</p>
              <p class="text-xs text-slate-500">任 ${record.taskPoints || 0} / 讀 ${record.readingPoints || 0}</p>
            </td>
            <td class="px-4 py-3">${certHtml}</td>
            <td class="px-4 py-3 font-bold">${record.remainingMinutes} / ${record.rewardMinutes} 分</td>
            <td class="px-4 py-3 text-xs text-slate-500">${new Date(record.updatedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('[data-mission-key]').forEach(row => {
        row.addEventListener('click', () => {
          const record = missionData[row.dataset.missionKey];
          if (!record) return;
          if ($('missionStudent')) $('missionStudent').value = record.student;
          if ($('missionWeek')) $('missionWeek').value = record.week;
          fillMissionForm(record);
          if ($('missionStatus')) $('missionStatus').textContent = `已載入表格紀錄：${record.student}｜${record.week}`;
        });
      });
    }

    function exportMissionCsv() {
      const rows = [['學生', '年級', '週次/單元', '課堂任務點', '閱讀認證點', '本週總點數', '小黑啤累計通過冊數', '主題與認證明細', '剩餘獎勵(分)', '總獎勵(分)', '備註', '更新時間']];
      Object.values(missionData)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .forEach(record => {
          const certs = normalizeRecordCerts(record);
          const bbStats = getStudentBlackbearStats(record.student);
          const detail = certs.map(c => {
            const meta = COMPREHENSION_META[c.comprehension] || (c.passed ? COMPREHENSION_META.full : COMPREHENSION_META.partial);
            return `[${c.theme}] ${c.title} (${c.method}${c.score ? ' ' + c.score : ''} / ${meta.short} / +${c.points}點)`;
          }).join('；');
          rows.push([
            record.student,
            findGradeByName(record.student),
            record.week,
            record.taskPoints || 0,
            record.readingPoints || 0,
            record.totalPoints || 0,
            `${bbStats.passedCount}/${bbStats.totalBooks}`,
            detail || '無',
            record.remainingMinutes || 0,
            record.rewardMinutes || 0,
            record.note || '',
            record.updatedAt || ''
          ]);
        });
      const cell = x => '"' + String(x ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
      const csv = rows.map(r => r.map(cell).join(',')).join('\r\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `東衛任務閱讀存摺_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('已匯出任務閱讀存摺 CSV');
    }

    // Wire UI Events
    $('addMissionTaskButton')?.addEventListener('click', () => {
      const box = $('newTaskBox');
      if (box) {
        box.classList.toggle('hidden');
        if (!box.classList.contains('hidden')) $('newTaskLabelInput')?.focus();
      }
    });

    $('cancelAddTaskButton')?.addEventListener('click', () => {
      $('newTaskBox')?.classList.add('hidden');
    });

    $('confirmAddTaskButton')?.addEventListener('click', () => {
      const label = $('newTaskLabelInput')?.value.trim() || '';
      const pts = Math.max(1, Math.min(20, Number($('newTaskPointsInput')?.value || 2)));
      if (!label) return showToast('請輸入任務名稱');
      const key = `custom_${Date.now()}`;
      const snapshot = readCurrentTaskValues();
      missionTasks.push({ key, label, points: pts });
      saveTasksConfig(missionTasks);
      if ($('newTaskLabelInput')) $('newTaskLabelInput').value = '';
      $('newTaskBox')?.classList.add('hidden');
      renderMissionTaskGrid(snapshot);
      updateMissionSummary();
      showToast(`已新增任務：「${label}」（每次 ${pts} 點）`);
    });

    $('toggleManageTasksButton')?.addEventListener('click', () => {
      manageTasksMode = !manageTasksMode;
      const btn = $('toggleManageTasksButton');
      if (btn) btn.textContent = manageTasksMode ? '✅ 完成管理' : '⚙️ 管理點數';
      renderMissionTaskGrid();
    });

    $('resetMissionTasksButton')?.addEventListener('click', () => {
      if (!confirm('確定將本週任務設定還原為預設項目嗎？（已儲存的歷史紀錄不會受影響）')) return;
      const snapshot = readCurrentTaskValues();
      missionTasks = DEFAULT_TASKS.map(t => ({ ...t }));
      saveTasksConfig(missionTasks);
      manageTasksMode = false;
      if ($('toggleManageTasksButton')) $('toggleManageTasksButton').textContent = '⚙️ 管理點數';
      renderMissionTaskGrid(snapshot);
      updateMissionSummary();
      showToast('已還原預設任務設定');
    });

    $('addReadingThemeButton')?.addEventListener('click', () => {
      const box = $('newThemeBox');
      if (box) {
        box.classList.toggle('hidden');
        if (!box.classList.contains('hidden')) $('newThemeNameInput')?.focus();
      }
    });

    $('cancelAddThemeButton')?.addEventListener('click', () => {
      $('newThemeBox')?.classList.add('hidden');
    });

    $('confirmAddThemeButton')?.addEventListener('click', () => {
      const name = $('newThemeNameInput')?.value.trim() || '';
      if (!name) return showToast('請輸入主題名稱');
      if (!readingThemes.includes(name)) {
        readingThemes.push(name);
        saveThemesConfig(readingThemes);
      }
      renderThemeSelects();
      if ($('readingThemeSelect')) $('readingThemeSelect').value = name;
      toggleBlackbearPicker();
      if ($('newThemeNameInput')) $('newThemeNameInput').value = '';
      $('newThemeBox')?.classList.add('hidden');
      showToast(`已新增主題閱讀分類：「${name}」`);
    });

    $('readingThemeSelect')?.addEventListener('change', toggleBlackbearPicker);

    $('blackbearBookSelect')?.addEventListener('change', () => {
      const bookId = $('blackbearBookSelect').value;
      if (!bookId) return;
      const books = getBlackbearBooks();
      const book = books.find(b => String(b.id) === String(bookId));
      if (!book) return;
      if ($('readingTitle')) $('readingTitle').value = book.title;
      const stats = getStudentBlackbearStats(currentStudentName());
      const hit = stats.byBook.get(String(book.id));
      if (hit) {
        if ($('readingMethod')) $('readingMethod').value = hit.source === 'passport_manual' ? '教師口頭提問' : '小黑啤線上測驗';
        if ($('readingScore')) $('readingScore').value = `${hit.score}/${hit.total || 10}`;
        if ($('readingComprehension')) {
          $('readingComprehension').value = hit.passed ? (Number(hit.score) >= 9 ? 'full' : 'good') : 'retry';
        }
        if ($('readingCertified')) $('readingCertified').checked = Boolean(hit.passed);
        if ($('readingPointsInput')) $('readingPointsInput').value = hit.passed ? '5' : '0';
      } else {
        if ($('readingMethod')) $('readingMethod').value = '小黑啤線上測驗';
        if ($('readingScore')) $('readingScore').value = '';
        if ($('readingComprehension')) $('readingComprehension').value = 'full';
        if ($('readingCertified')) $('readingCertified').checked = true;
        if ($('readingPointsInput')) $('readingPointsInput').value = '5';
      }
      updateMissionSummary();
    });

    $('readingComprehension')?.addEventListener('change', syncCertifiedCheckboxFromSelect);
    $('readingCertified')?.addEventListener('change', syncSelectFromCertifiedCheckbox);
    $('readingPointsInput')?.addEventListener('input', updateMissionSummary);

    $('addReadingCertButton')?.addEventListener('click', () => {
      const draft = buildDraftCertFromInputs();
      if (!draft) return showToast('請先選擇書單或輸入書名 / 篇名');
      addOrUpdateCert(draft);
      resetDraftReadingInputs();
      showToast(`已加入「${shortBookTitle(draft.title)}」至本週認證清單`);
    });

    $('syncBlackbearButton')?.addEventListener('click', () => {
      syncBlackbearRecordsForStudent(false);
    });

    $('missionExportCsvButton')?.addEventListener('click', exportMissionCsv);
    $('missionImportCertButton')?.addEventListener('click', () => {
      $('missionImportCertFile')?.click?.();
    });
    $('missionImportCertFile')?.addEventListener('change', (e) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const count = importCertificationsFromText(String(reader.result || ''));
          showToast(count > 0 ? `已匯入 ${count} 筆小黑啤認證紀錄並同步至存摺` : '檔案中沒有可匯入的認證紀錄');
        } catch (err) {
          showToast(`匯入失敗：${err?.message || '格式錯誤'}`);
        } finally {
          if (e.target) e.target.value = '';
        }
      };
      reader.readAsText(file, 'utf-8');
    });
    $('missionStudent')?.addEventListener('change', () => loadMissionRecord());
    $('missionWeek')?.addEventListener('input', updateMissionSummary);
    $('readingTitle')?.addEventListener('input', updateMissionSummary);
    $('readingScore')?.addEventListener('input', updateMissionSummary);
    $('rewardMinutesUsed')?.addEventListener('input', updateMissionSummary);
    $('missionSaveButton')?.addEventListener('click', saveMissionRecord);
    $('missionLoadButton')?.addEventListener('click', () => loadMissionRecord());
    $('missionClearButton')?.addEventListener('click', clearMissionRecord);
    $('missionSearch')?.addEventListener('input', renderMissionRecords);
    $('missionThemeFilter')?.addEventListener('change', renderMissionRecords);

    // Refresh when returning from /blackbear/ tab or storage update
    const refreshLiveBlackbear = () => {
      seedInitialMissionDataFromBlackbear();
      renderBlackbearBannerAndBooks();
      renderMissionRecords();
    };
    window.addEventListener('storage', refreshLiveBlackbear);
    window.addEventListener('focus', refreshLiveBlackbear);

    // Initial seed & render
    seedInitialMissionDataFromBlackbear();
    renderThemeSelects();
    renderMissionTaskGrid();
    if (currentStudentName()) {
      loadMissionRecord({ silent: true });
    } else {
      renderBlackbearBannerAndBooks();
      renderCertList();
      updateMissionSummary();
    }
    renderMissionRecords();

    return {
      renderMissionTaskGrid: () => renderMissionTaskGrid(),
      updateMissionSummary,
      renderMissionRecords,
      loadMissionRecord: (opts) => loadMissionRecord(opts),
      importCertificationsFromText,
      refreshBlackbear: refreshLiveBlackbear,
      selectStudentAndLoad(studentName) {
        if (studentName && getNames().includes(studentName) && $('missionStudent')) {
          $('missionStudent').value = studentName;
        }
        renderBlackbearBannerAndBooks();
        loadMissionRecord({ silent: true });
      }
    };
  }

  global.MissionReadingPassport = {
    mount,
    DEFAULT_TASKS,
    DEFAULT_THEMES,
    COMPREHENSION_META
  };
})(typeof window !== 'undefined' ? window : globalThis);
