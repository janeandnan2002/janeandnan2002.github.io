import {readingText} from './zhuyin.js';
import {openQuestionEditor} from './editor.js';
import {sound} from './sound.js';
import {launchConfetti} from './confetti.js';

const CERT_STORAGE_KEY = 'dongweiBlackbearCertifications.v1';
const BACKUP_STORAGE_KEY = 'dongweiBlackbearAttempts.v1';
const STATIC_SESSION_KEY = 'dongweiBlackbearStaticSession.v1';
const GRADE_LABELS = {
  grade1: '1 年級',
  grade2: '2 年級',
  grade3: '3 年級',
  grade4: '4 年級',
  grade5: '5 年級',
  grade6: '6 年級'
};

let showZhuyin = true;
let staticMode = false;
let staticExams = new Map();
const $ = s => document.querySelector(s), main = $('#main');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session = {student: null, teacher: false}, books = [], attempts = [], exam = null, answers = {}, position = 0, busy = false, lastActivity = Date.now();
const classLabel = name => String(name ?? '').replace(/資訊課|閩南語課/g, '').trim();
const title = id => books.find(b => b.id === id)?.title || id;
const short = b => b.title.includes('：') ? b.title.split('：').at(-1) : b.title.replace('（小黑啤)', '');
const stamp = d => d ? new Date(d).toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}) : '—';
const grade = name => { const m = String(name || '').match(/([1-6一二三四五六])\s*年/); return m ? Number(m[1]) || '一二三四五六'.indexOf(m[1]) + 1 : 0; };

function profileStorageKey(baseKey) {
  return window.TeacherProfile?.storageKey ? window.TeacherProfile.storageKey(baseKey) : baseKey;
}

function getStaticData() {
  return window.DONGWEI_BLACKBEAR_DATA || {books: [], readings: {}, defaultRosters: {}};
}

function getStaticRosters() {
  const raw = getStaticData().defaultRosters || {};
  const cloned = Object.fromEntries(Object.entries(GRADE_LABELS).map(([k]) => [k, Array.isArray(raw[k]) ? raw[k].slice() : []]));
  if (window.TeacherProfile?.applyRosters) {
    window.TeacherProfile.applyRosters(cloned);
  }
  return cloned;
}

function getStaticClasses() {
  const rosters = getStaticRosters();
  return Object.entries(GRADE_LABELS).map(([key, label]) => {
    const names = Array.isArray(rosters[key]) ? rosters[key] : [];
    const students = names.map((name, idx) => ({
      id: `${key}:${name}`,
      name,
      seat: idx + 1,
      classId: key,
      className: label
    }));
    return {
      id: key,
      code: key,
      name: label,
      studentCount: students.length,
      seats: students.map(s => s.seat),
      students
    };
  }).filter(c => c.studentCount > 0);
}

function findStaticStudentByName(name) {
  if (!name) return null;
  for (const cls of getStaticClasses()) {
    const hit = cls.students.find(s => s.name === name);
    if (hit) return hit;
  }
  return null;
}

function readLocalCerts() {
  const primaryKey = profileStorageKey(CERT_STORAGE_KEY);
  let primary = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(primaryKey) || 'null');
    if (Array.isArray(parsed)) primary = parsed;
  } catch { /* ignore */ }
  if (primary.length > 0 || primaryKey !== CERT_STORAGE_KEY) return primary;
  try {
    const backup = JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY) || 'null');
    if (Array.isArray(backup)) return backup;
  } catch { /* ignore */ }
  return [];
}

function writeLocalCert(record) {
  const primaryKey = profileStorageKey(CERT_STORAGE_KEY);
  const current = readLocalCerts().filter(item => !(record.id && item.id === record.id));
  const next = [record, ...current].slice(0, 1000);
  try {
    localStorage.setItem(primaryKey, JSON.stringify(next));
    if (primaryKey === CERT_STORAGE_KEY) {
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(next));
    } else {
      let backup = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY) || '[]');
        if (Array.isArray(parsed)) backup = parsed.filter(item => !(record.id && item.id === record.id));
      } catch { /* ignore */ }
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify([record, ...backup].slice(0, 1000)));
    }
  } catch { /* ignore quota errors cleanly */ }
  return record;
}

function shuffle(input) {
  const values = [...input];
  for (let i = values.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    let r;
    const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
    do {
      crypto.getRandomValues(buf);
      r = buf[0];
    } while (r >= limit);
    const j = r % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function startStaticExam(bookId) {
  const data = getStaticData();
  const book = (data.books || []).find(b => b.id === bookId);
  if (!book) throw Error('找不到這本書的題庫。');
  const pool = shuffle(book.questions || []).slice(0, 10);
  const posSeed = shuffle(shuffle([0, 1, 2, 3]).flatMap((n, i) => Array(i < 2 ? 3 : 2).fill(n)));
  const readings = data.readings || {};
  const withZhuyin = grade(session.student?.className || '') <= 3;

  const fullQuestions = pool.map((q, idx) => {
    const correct = q.options.find(o => o.id === q.correct_option_id) || q.options[0];
    const wrongOpts = shuffle(q.options.filter(o => o.id !== correct.id)).map(o => ({
      id: crypto.randomUUID?.() || `${q.id}-${o.id}-${Math.random()}`,
      text: o.text,
      zhuyin: o.zhuyin || readings[o.text]
    }));
    const answer = {
      id: crypto.randomUUID?.() || `${q.id}-ans-${Math.random()}`,
      text: correct.text,
      zhuyin: correct.zhuyin || readings[correct.text]
    };
    const pos = posSeed[idx] ?? Math.floor(Math.random() * (wrongOpts.length + 1));
    wrongOpts.splice(Math.min(pos, wrongOpts.length), 0, answer);
    return {
      id: q.id,
      text: q.question,
      zhuyin: q.zhuyin || readings[q.question],
      options: wrongOpts,
      answerId: answer.id,
      readingSkill: q.reading_skill || '閱讀理解'
    };
  });

  const examId = crypto.randomUUID?.() || `bb-${Date.now()}`;
  staticExams.set(examId, {bookId, bookTitle: book.title, fullQuestions});
  return {
    id: examId,
    bookId,
    questions: fullQuestions.map(({answerId, zhuyin, ...q}) => ({
      ...q,
      ...(withZhuyin ? {zhuyin} : {}),
      options: q.options.map(({zhuyin: oz, ...o}) => ({
        ...o,
        ...(withZhuyin ? {zhuyin: oz} : {})
      }))
    }))
  };
}

function summarizeSkills(review) {
  const stats = new Map();
  for (const r of review) {
    const key = r.readingSkill || '閱讀理解';
    const cur = stats.get(key) || {ok: 0, total: 0};
    cur.total += 1;
    if (r.correct) cur.ok += 1;
    stats.set(key, cur);
  }
  return [...stats.entries()].map(([k, v]) => `${k} ${v.ok}/${v.total}`).join('；');
}

function submitStaticExam(examId, submittedAnswers) {
  const stored = staticExams.get(examId);
  if (!stored) throw Error('找不到這次測驗記錄，請重新開始。');
  const total = stored.fullQuestions.length;
  if (!submittedAnswers || Object.keys(submittedAnswers).length !== total) {
    throw Error(`請完成全部 ${total} 題。`);
  }
  const review = stored.fullQuestions.map(q => {
    const choice = q.options.find(o => o.id === submittedAnswers[q.id]);
    if (!choice) throw Error(`請完成全部 ${total} 題。`);
    const answerOpt = q.options.find(o => o.id === q.answerId);
    return {
      question: q.text,
      choice: choice.text,
      answer: answerOpt?.text || '',
      correct: choice.id === q.answerId,
      readingSkill: q.readingSkill
    };
  });
  const score = review.filter(r => r.correct).length;
  const passed = score >= Math.min(8, total);
  const readingSkillSummary = summarizeSkills(review);
  staticExams.delete(examId);

  if (session.student) {
    writeLocalCert({
      id: `bb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      studentName: session.student.name,
      className: session.student.className || '',
      seat: Number(session.student.seat || 0),
      bookId: stored.bookId,
      bookTitle: stored.bookTitle,
      score,
      total,
      passed,
      readingSkillSummary,
      source: 'blackbear_quiz',
      date: new Date().toISOString()
    });
  }

  return {score, total, passed, review, readingSkillSummary};
}

function notice(text = '') { const n = $('#notice'); n.textContent = text; n.hidden = !text; }
function view(html) { notice(); main.innerHTML = html; main.focus({preventScroll: true}); window.scrollTo({top: 0}); }

async function api(path, data) {
  let r;
  try {
    r = await fetch('/api/it' + path, {
      method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(data === undefined ? {} : {'Content-Type': 'application/json'}),
        ...(session.student ? {'X-IT-Student': session.student.id} : {})
      },
      ...(data === undefined ? {} : {body: JSON.stringify(data)})
    });
  } catch {
    throw Error('網路暫時無法連線，作答仍保留在本頁，請稍後重試。');
  }
  let body;
  try { body = await r.json(); } catch { throw Error('服務暫時無法連線，請稍後重試。'); }
  if (!r.ok) {
    if (r.status === 401) {
      session.student = null; exam = null; answers = {}; nav();
      main.innerHTML = '<section class="panel"><h1>請重新登入</h1><p>登入已到期，或這台裝置已換人登入。</p><button id="again">回到登入</button></section>';
      $('#again').onclick = () => login().catch(e => notice(e.message));
    }
    throw Error(body.reason || '操作未完成。');
  }
  return body;
}

async function run(action) {
  if (busy) return;
  busy = true; notice();
  try { await action(); } catch(e) { notice(e.message); } finally { busy = false; }
}

function updateSoundBtn() {
  const b = $('#sound');
  if (b) b.textContent = sound.isMuted() ? '🔇' : '🔊';
}

function passportUrl() {
  const q = session.student ? `?student=${encodeURIComponent(session.student.name)}` : '';
  return `/index.html${q}#missionReading`;
}

function nav() {
  for (const id of ['account', 'logout']) $('#' + id).hidden = !session.student;
  $('#password').hidden = !session.student || staticMode;
  const backLink = $('#back-passport');
  if (backLink) backLink.href = passportUrl();
  updateSoundBtn();
}

async function refresh() {
  if (!session.student) {
    attempts = [];
    return;
  }
  const localOwn = readLocalCerts().filter(a => a.studentName === session.student.name).map(a => ({
    id: a.id,
    bookId: a.bookId,
    score: a.score,
    passed: a.passed ?? a.score >= 8,
    date: a.date,
    source: a.source
  }));
  if (staticMode) {
    attempts = localOwn;
    return;
  }
  try {
    const remote = (await api('/blackbear/mine')).attempts || [];
    const seen = new Set(remote.map(r => `${r.bookId}|${r.date}`));
    attempts = [...remote, ...localOwn.filter(l => !seen.has(`${l.bookId}|${l.date}`))];
  } catch {
    attempts = localOwn;
  }
}

function abandon() {
  if (!exam) return true;
  if (!confirm('目前作答尚未送出，確定離開這次認證？')) return false;
  exam = null; answers = {}; return true;
}

function shelf() {
  const passed = new Set(attempts.filter(a => a.score >= 8 || a.passed).map(a => String(a.bookId)));
  const totalBooks = books.length || 22;
  view(`<section class="hero">
    <div>
      <span class="eyebrow">READ TAIWAN · 閱讀足跡</span>
      <h1>跟著小黑啤，讀遍臺灣</h1>
      <p>${session.student ? `${esc(classLabel(session.student.className))} · ${session.student.seat} 號 · ${esc(session.student.name)}，今天想讀哪一本？` : '讀完一本書，就來挑戰看看。選擇學生登入後，每一次認證都會同步紀錄到「東衛任務閱讀存摺」。'}</p>
      ${session.student ? `<div class="student-tools">
        <span class="pill">已通過 ${passed.size} / ${totalBooks} 本 · 完成 ${Math.round(passed.size / totalBooks * 100)}%</span>
        <a class="primary" href="${esc(passportUrl())}">📖 查看任務閱讀存摺</a>
        ${staticMode ? '<button id="switch-student">切換學生</button>' : '<button class="primary" id="shelf-password">修改我的密碼</button>'}
      </div>` : '<button class="primary" id="student-login">學生登入，開始認證</button>'}
    </div>
    <div class="seal"><b>${totalBooks}</b><span>本閱讀冒險</span></div>
  </section>
  <div class="toolbar">
    <label for="search">找一本書</label>
    <input id="search" type="search" placeholder="輸入書名或縣市">
    <label for="filter">顯示</label>
    <select id="filter" style="width:auto">
      <option value="all">全部書籍</option>
      <option value="new">尚未通過</option>
      <option value="passed">已通過</option>
    </select>
  </div>
  <div class="shelf" id="shelf"></div>
  <p class="muted" id="count" aria-live="polite"></p>`);

  if ($('#student-login')) $('#student-login').onclick = () => run(() => login());
  if ($('#shelf-password')) $('#shelf-password').onclick = password;
  if ($('#switch-student')) $('#switch-student').onclick = () => run(() => login());

  function draw() {
    const query = $('#search').value.trim(), filter = $('#filter').value;
    const selected = books.filter(b => b.title.includes(query) && (filter === 'all' || (filter === 'passed') === passed.has(b.id)));
    $('#shelf').innerHTML = selected.map(b => `
      <button class="book" data-book="${b.id}" aria-label="${esc(b.title)}，${passed.has(b.id) ? '已通過' : '開始認證'}">
        <span class="book-art">
          <img class="cover" src="${esc(b.cover)}" alt="${esc(b.title)}書封" loading="lazy" width="200" height="260">
          ${passed.has(b.id) ? '<img class="passed-stamp" src="/blackbear/passed-stamp.webp" alt="" aria-hidden="true" width="384" height="384">' : ''}
        </span>
        <span class="booktitle">
          <strong>${esc(short(b))}</strong>
          <small>${esc(b.title.replace(/：[^：]+$/, ''))}</small>
          <span class="tag ${passed.has(b.id) ? 'pass' : ''}">${passed.has(b.id) ? '✓ 已通過' : '每次 10 題 · 8 題通過'}</span>
        </span>
      </button>
    `).join('');
    $('#count').textContent = `顯示 ${selected.length} 本，共 ${books.length} 本`;
    $('#shelf').querySelectorAll('[data-book]').forEach(el => el.onclick = () => run(() => session.student ? bookDetail(el.dataset.book) : login()));
  }

  $('#search').oninput = draw;
  $('#filter').onchange = draw;
  draw();
}

async function login() {
  if (staticMode) {
    const groups = getStaticClasses();
    view('<section class="panel"><span class="eyebrow">我的閱讀護照</span><h1>先選你的年級</h1><p>點選自己的年級與座號姓名，認證成績將自動存入手邊裝置並連動至閱讀存摺。</p><div class="choices" id="classes"></div></section>');
    $('#classes').innerHTML = groups.length ? groups.map((c, i) => `<button data-group="${i}">${esc(c.name)}<br><small>${c.studentCount} 人</small></button>`).join('') : '<p>目前沒有學生名單，請先至首頁「我的設定」或抽人分組設定名單。</p>';
    $('#classes').querySelectorAll('button').forEach(b => b.onclick = () => staticSeats(groups[Number(b.dataset.group)]));
    return;
  }
  const data = await api('/class-options'), groups = data.classes.filter(c => grade(c.name) >= 1 && grade(c.name) <= 6).sort((a, b) => grade(a.name) - grade(b.name));
  view('<section class="panel"><span class="eyebrow">我的閱讀護照</span><h1>先選你的班級</h1><p>沿用資訊小達人的座號與 4 位數密碼。</p><div class="choices" id="classes"></div><p class="muted">忘記密碼請找老師協助；不要使用其他同學的帳號。</p></section>');
  $('#classes').innerHTML = groups.length ? groups.map((c, i) => `<button data-group="${i}">${esc(classLabel(c.name))}</button>`).join('') : '<p>目前沒有可用班級，請聯絡老師。</p>';
  $('#classes').querySelectorAll('button').forEach(b => b.onclick = () => run(() => seats(groups[Number(b.dataset.group)])));
}

function staticSeats(group) {
  view(`<section class="panel">
    <span class="eyebrow">${esc(group.name)}</span>
    <h1>點選自己的名字</h1>
    <div class="choices" id="seats">${group.students.map((s, idx) => `<button class="seat-choice" data-idx="${idx}"><span>${s.seat} 號</span><small>${esc(s.name)}</small></button>`).join('')}</div>
    <div class="actions"><button id="back">重選年級</button></div>
  </section>`);
  $('#back').onclick = () => run(() => login());
  $('#seats').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      const student = group.students[Number(b.dataset.idx)];
      view(`<section class="panel">
        <h1>嗨，${esc(student.name)}！</h1>
        <p>${esc(student.className)} · ${student.seat} 號，這是你嗎？</p>
        <div class="actions">
          <button id="wrong">不是我</button>
          <button class="primary" id="confirm">是我，開始閱讀認證</button>
        </div>
      </section>`);
      $('#wrong').onclick = () => staticSeats(group);
      $('#confirm').onclick = () => run(async () => {
        session.student = student;
        sessionStorage.setItem(STATIC_SESSION_KEY, JSON.stringify(student));
        lastActivity = Date.now();
        nav();
        await refresh();
        shelf();
      });
    };
  });
}

async function seats(group) {
  const data = await api('/class-entry?code=' + encodeURIComponent(group.code));
  view(`<section class="panel"><span class="eyebrow">${esc(classLabel(group.name))}</span><h1>點自己的座號</h1><div class="choices" id="seats">${data.seats.map(n => `<button data-seat="${n}">${n}<small> 號</small></button>`).join('')}</div><div class="actions"><button id="back">重選班級</button></div></section>`);
  $('#back').onclick = () => run(() => login());
  $('#seats').querySelectorAll('button').forEach(b => b.onclick = () => pinForm(group, Number(b.dataset.seat)));
}

function pinForm(group, seat) {
  view(`<section class="panel"><span class="eyebrow">${esc(classLabel(group.name))} · ${seat} 號</span><h1>輸入你的秘密數字</h1><form class="form" id="pin-form"><label>4 位數密碼<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required></label><button class="primary">確認我的身分</button></form><div class="actions"><button id="back">重選座號</button></div><p class="muted">忘記密碼？請找老師幫忙重設。</p></section>`);
  $('#back').onclick = () => run(() => seats(group));
  $('#pin-form').onsubmit = e => {
    e.preventDefault();
    const pin = new FormData(e.target).get('pin');
    run(async () => {
      const result = await api('/seat-login', {code: group.code, seat, pin});
      view(`<section class="panel"><h1>嗨，${esc(result.name)}！</h1><p>${esc(classLabel(group.name))} · ${seat} 號，這是你嗎？</p><div class="actions"><button id="wrong">不是我</button><button class="primary" id="confirm">是我，開始閱讀</button></div></section>`);
      $('#wrong').onclick = () => run(() => seats(group));
      $('#confirm').onclick = () => run(async () => {
        const confirmed = await api('/seat-login', {code: group.code, seat, pin, confirm: true});
        session.student = confirmed.student;
        lastActivity = Date.now();
        nav();
        await refresh();
        shelf();
      });
    });
  };
}

function bookDetail(id) {
  const book = books.find(b => b.id === id);
  const own = attempts.filter(a => a.bookId === id);
  view(`<section class="panel">
    <div class="hero">
      <img class="cover" style="width:160px" src="${book.cover}" alt="${esc(book.title)}書封">
      <div>
        <span class="eyebrow">一本一本，慢慢累積</span>
        <h1>${esc(short(book))}</h1>
        <p>${esc(book.title)}</p>
        <p>每次隨機 10 題 · 答對 8 題通過<br>通過後成績會自動同步到「東衛任務閱讀存摺」並可累計點數。</p>
      </div>
    </div>
    <p class="muted">請先讀完這本書，再開始認證。題目與選項每次都會重新排列。</p>
    <div class="actions">
      <button id="back">回書架</button>
      <button id="start" class="primary">我讀完了，開始認證</button>
    </div>
    ${own.length ? `<h2>我的歷次紀錄</h2>${historyTable(own)}` : ''}
  </section>`);
  $('#back').onclick = shelf;
  $('#start').onclick = () => run(async () => {
    sound.playTap();
    exam = staticMode ? startStaticExam(id) : await api('/blackbear/start', {bookId: id});
    answers = {};
    position = 0;
    showZhuyin = grade(session.student?.className || '') <= 3;
    question();
  });
}

function encourageText(pos, count) {
  if (count === 10) return '🌟 10 題已全部作答完成！確認後即可送出認證喔！';
  if (pos < 3) return '✨ 好的開始！仔細閱讀故事內容再選答喔';
  if (pos < 6) return '💪 進度已經過半了！保持專注，你很棒！';
  if (pos < 9) return '🚀 快要完成挑戰了！繼續加油！';
  return '🎯 最後一題了！選好後檢查一下就可以送出囉';
}

function question() {
  const q = exam.questions[position];
  const count = Object.keys(answers).length;
  const totalQ = exam.questions.length;
  const currentBook = books.find(b => b.id === exam.bookId);

  const dots = Array.from({length: totalQ}, (_, i) => {
    const isCurrent = i === position;
    const isAnswered = Boolean(answers[exam.questions[i]?.id]);
    const cls = ['step-dot', isCurrent ? 'active' : '', isAnswered ? 'answered' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" data-step="${i}" aria-label="第 ${i+1} 題，${isAnswered ? '已作答' : '未作答'}${isCurrent ? '（目前位置）' : ''}" title="第 ${i+1} 題">${i+1}</button>`;
  }).join('');

  const studentGrade = grade(session.student?.className || '');
  view(`<section class="panel">
    <div class="q-meta">
      <span class="q-badge">第 ${position+1} / ${totalQ} 題</span>
      <span class="q-book">${esc(short(currentBook || {title: exam.bookId}))}</span>
      ${studentGrade >= 1 && studentGrade <= 3 ? `<button id="toggle-zhuyin" class="toggle-btn" aria-pressed="${showZhuyin}">🔤 ${showZhuyin ? '隱藏注音' : '顯示注音'}</button>` : ''}
    </div>
    <div class="stepper" role="navigation" aria-label="題目導航">${dots}</div>
    <div class="progress" role="progressbar" aria-label="已回答題數" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${totalQ}">
      <span style="width:${Math.round(count / totalQ * 100)}%"></span>
    </div>
    <h1 class="question">${readingText(q.text, q.zhuyin, showZhuyin)}</h1>
    <div class="options">
      ${q.options.map((o, i) => `
        <button class="option" data-option="${o.id}" data-opt-idx="${i}" aria-pressed="${answers[q.id] === o.id}">
          <b class="opt-${'abcd'[i]}">${'ABCD'[i]}</b>
          <span>${readingText(o.text, o.zhuyin, showZhuyin)}</span>
          <span class="opt-check" aria-hidden="true">${answers[q.id] === o.id ? '✓' : ''}</span>
        </button>
      `).join('')}
    </div>
    <div class="actions">
      <button id="previous" ${position === 0 ? 'disabled' : ''}>上一題</button>
      ${position < totalQ - 1 ? `
        <button id="next" class="primary" ${!answers[q.id] ? 'disabled' : ''}>下一題</button>
      ` : `
        <button id="submit" class="primary submit-btn ${count === totalQ ? 'ready' : ''}" ${count !== totalQ ? 'disabled' : ''}>
          ${count === totalQ ? '🎉 完成送出認證' : `送出認證（還差 ${totalQ - count} 題）`}
        </button>
      `}
    </div>
    <p class="encourage-tip">${encourageText(position, count)}</p>
  </section>`);

  if ($('#toggle-zhuyin')) {
    $('#toggle-zhuyin').onclick = () => {
      showZhuyin = !showZhuyin;
      sound.playTap();
      question();
      $('#toggle-zhuyin')?.focus();
    };
  }

  main.querySelectorAll('[data-step]').forEach(b => {
    b.onclick = () => {
      const target = Number(b.dataset.step);
      if (target !== position) {
        position = target;
        sound.playTap();
        question();
      }
    };
  });

  main.querySelectorAll('[data-option]').forEach(b => {
    b.onclick = () => {
      const idx = Number(b.dataset.optIdx || 0);
      answers[q.id] = b.dataset.option;
      sound.playOption(idx);
      question();
      const chosen = main.querySelector(`[data-option="${b.dataset.option}"]`);
      chosen?.focus({preventScroll: true});
    };
  });

  $('#previous').onclick = () => {
    position--;
    sound.playTap();
    question();
  };

  if ($('#next')) {
    $('#next').onclick = () => {
      position++;
      sound.playStep();
      question();
    };
  }

  if ($('#submit')) {
    $('#submit').onclick = () => run(async () => {
      const button = $('#submit');
      button.disabled = true;
      button.textContent = '正在送出…';
      try {
        let result;
        const bookId = exam.bookId;
        if (staticMode) {
          result = submitStaticExam(exam.id, answers);
        } else {
          result = await api('/blackbear/submit', {id: exam.id, answers});
          if (session.student) {
            const book = books.find(b => b.id === bookId);
            writeLocalCert({
              id: `bb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              studentName: session.student.name,
              className: session.student.className || '',
              seat: Number(session.student.seat || 0),
              bookId,
              bookTitle: book?.title || bookId,
              score: result.score,
              total: result.total || 10,
              passed: Boolean(result.passed),
              readingSkillSummary: summarizeSkills(result.review || []),
              source: 'blackbear_quiz',
              date: new Date().toISOString()
            });
          }
        }
        exam = null;
        answers = {};
        resultView(result, bookId);
        try {
          await refresh();
        } catch {
          notice('認證已儲存，書架進度暫時無法更新，請稍後重新整理。');
        }
      } catch (e) {
        if ($('#submit')) {
          $('#submit').disabled = false;
          $('#submit').textContent = '重試送出';
        }
        throw e;
      }
    });
  }
}

function skillAdvice(skill) {
  if (skill === '直接提取') return '在故事內文中直接標記關鍵字（人名、地名、物品），就能找到明確線索喔！';
  if (skill === '直接推論') return '根據情節細節與角色的動作表情，推敲事情發生的原因和關聯！';
  if (skill === '詮釋整合') return '想一想整段冒險的經過，把多個情節串連起來，就能理解全貌囉！';
  return '再細讀一次書本細節，答案就在故事的字裡行間！';
}

function resultView(result, bookId) {
  const book = books.find(b => b.id === bookId) || {title: bookId};
  if (result.passed) {
    sound.playVictory();
    launchConfetti();
  } else {
    sound.playEncourage();
  }

  view(`<section class="panel">
    <div class="result-hero ${result.passed ? 'pass' : 'retry'}">
      <span class="eyebrow">${esc(title(bookId))}</span>
      <h1>${result.passed ? '認證通過，太棒了！' : '再讀一次，一定會更熟悉'}</h1>
      ${result.passed ? `
        <div class="result-badge-anim">
          <img class="result-stamp" src="/blackbear/passed-stamp.webp" alt="認證通過戳章">
        </div>
      ` : ''}
      <div class="score ${result.passed ? '' : 'retry'}">${result.score}<small style="font-size:24px"> / ${result.total || 10}</small></div>
      <p>${result.passed ? `太厲害了！你已成功通過《${esc(short(book))}》閱讀認證，書架封面已蓋上認證通過章，並已同步寫入東衛任務閱讀存摺！` : `這次答對 ${result.score} 題（通過門檻為 8 題）。這次成績已保存，讀完書隨時可以再次挑戰！`}</p>
    </div>
    <div class="actions">
      <button id="back">回書架</button>
      <button id="retry">再挑戰這一本</button>
      <a class="primary" href="${esc(passportUrl())}">📖 查看任務閱讀存摺</a>
    </div>
    <details open style="margin-top:22px">
      <summary style="font-size:17px;font-weight:700;cursor:pointer;padding:10px 0">看看這次的作答</summary>
      ${result.review.map((r, i) => `
        <div class="review-card ${r.correct ? 'correct' : 'wrong'}">
          <b>${i + 1}. ${esc(r.question)}</b>
          <p style="margin:6px 0">你的答案：${esc(r.choice)} ${r.correct ? '<span class="tag pass">✓ 答對了</span>' : '<span class="tag fail">✕ 答錯了</span>'}</p>
          ${r.correct ? '' : `<p style="margin:6px 0;color:#c62828">正確答案：<strong>${esc(r.answer)}</strong></p>`}
          ${!r.correct && r.readingSkill ? `
            <div class="review-skill-hint">
              💡 <b>閱讀理解提示【${esc(r.readingSkill)}】</b>：${esc(skillAdvice(r.readingSkill))}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </details>
  </section>`);

  $('#back').onclick = shelf;
  $('#retry').onclick = () => run(() => bookDetail(bookId));
}

function historyTable(rows) {
  return `<div class="tablewrap"><table><thead><tr><th>書名</th><th>成績</th><th>結果</th><th>認證時間</th></tr></thead><tbody>${rows.map(a => `<tr><td>${esc(short(books.find(b => b.id === a.bookId) || {title: a.bookId}))}</td><td>${a.score} / 10</td><td>${a.score >= 8 || a.passed ? '✓ 通過' : '再挑戰'}</td><td>${esc(stamp(a.date))}</td></tr>`).join('')}</tbody></table></div>`;
}

async function mine() {
  await refresh();
  view(`<section class="panel wide">
    <h1>我的閱讀足跡</h1>
    <p>每本書通過後只計入完成冊數一次，重考紀錄仍會保留；已同步至首頁「東衛任務閱讀存摺」。</p>
    <div class="actions" style="margin:12px 0 20px;justify-content:flex-start">
      <a class="primary" href="${esc(passportUrl())}">📖 前往東衛任務閱讀存摺</a>
      ${staticMode ? '' : '<button id="records-password">修改我的密碼</button>'}
    </div>
    ${attempts.length ? historyTable(attempts) : '<p>還沒有認證紀錄，先到書架挑一本吧！</p>'}
  </section>`);
  if ($('#records-password')) $('#records-password').onclick = password;
}

function password() {
  view(`<section class="panel">
    <h1>修改我的密碼</h1>
    <p>密碼與資訊小達人共用，修改後兩邊都要使用新密碼。</p>
    <form class="form" id="password-form">
      <label>舊密碼<input name="oldPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required></label>
      <label>新密碼（4 位數）<input name="newPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label>
      <label>再輸入一次新密碼<input name="repeat" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label>
      <button class="primary">儲存新密碼</button>
    </form>
    <p class="muted">請避開 1234、4321 或四個相同數字。儲存後需要重新登入。</p>
  </section>`);
  $('#password-form').onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (d.newPin !== d.repeat) {
      notice('兩次新密碼不相同。');
      return;
    }
    run(async () => {
      await api('/change-pin', {oldPin: d.oldPin, newPin: d.newPin});
      session.student = null;
      attempts = [];
      nav();
      await login();
      notice('密碼已修改，請使用新密碼登入。');
    });
  };
}

function exportCsv(rows, name) {
  const cell = x => '"' + String(x ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildStaticTeacherPayload(classId = '') {
  const classes = getStaticClasses();
  const targetClasses = classId ? classes.filter(c => c.id === classId) : classes;
  const students = targetClasses.flatMap(c => c.students);
  const allCerts = readLocalCerts();
  const validBooks = new Set(books.map(b => String(b.id)));
  const nameSet = new Set(students.map(s => s.name));
  const studentMap = new Map(students.map(s => [s.name, s]));

  const filteredAttempts = allCerts
    .filter(a => nameSet.has(a.studentName) && validBooks.has(String(a.bookId)))
    .map(a => ({
      ...a,
      studentId: studentMap.get(a.studentName)?.id || a.studentName
    }));

  const rows = students.map(s => {
    const own = filteredAttempts.filter(a => a.studentName === s.name);
    const passed = [...new Set(own.filter(a => a.score >= 8 || a.passed).map(a => String(a.bookId)))];
    return {
      ...s,
      attempts: own.length,
      passed,
      completed: passed.length,
      completion: books.length ? Math.round(passed.length / books.length * 100) : 0,
      lastDate: own[0]?.date || null
    };
  });

  const perBook = books.map(b => {
    const own = filteredAttempts.filter(a => String(a.bookId) === String(b.id));
    return {
      id: b.id,
      title: b.title,
      participants: new Set(own.map(a => a.studentName)).size,
      passed: new Set(own.filter(a => a.score >= 8 || a.passed).map(a => a.studentName)).size
    };
  });

  return {
    classes,
    students: rows,
    books: perBook,
    attempts: filteredAttempts,
    summary: {
      students: rows.length,
      participants: rows.filter(s => s.attempts > 0).length,
      passedStudents: rows.filter(s => s.completed > 0).length,
      finished: rows.filter(s => books.length && s.completed === books.length).length,
      completion: rows.length && books.length ? Math.round(rows.reduce((n, s) => n + s.completed, 0) / (rows.length * books.length) * 100) : 0
    }
  };
}

async function teacher(classId = '') {
  let d;
  if (staticMode) {
    d = buildStaticTeacherPayload(classId);
  } else {
    session = await api('/session');
    nav();
    if (!session.teacher) {
      view(`<section class="panel">
        <h1>教師後台</h1>
        <p>使用資訊互動平台原有的授權教師帳號登入。</p>
        ${session.signedIn ? '<p>目前帳號沒有教師權限，請換用原本的管理帳號。</p>' : ''}
        <a class="primary" href="/signin-with-chatgpt?return_to=%2Fblackbear%2Findex.html%3Fteacher%3D1">教師登入</a>
        <p class="muted">學生請使用上方閱讀書架的座號登入。</p>
      </section>`);
      return;
    }
    d = await api('/blackbear/teacher?' + new URLSearchParams(classId ? {classId} : {}));
  }

  const s = d.summary;
  view(`<section class="panel wide">
    <span class="eyebrow">TEACHER · 閱讀認證總覽${staticMode ? '（本機／靜態同步模式）' : ''}</span>
    <h1>看見每一位孩子的閱讀足跡</h1>
    <div class="toolbar">
      <label for="class-filter">班級</label>
      <select id="class-filter" style="width:auto">
        <option value="">一～六年級全部</option>
        ${d.classes.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(classLabel(c.name))}（${c.studentCount} 人）</option>`).join('')}
      </select>
      <button id="reload">重新整理</button>
      <button id="export">匯出學生統計</button>
      <button id="export-attempts">匯出歷次成績</button>
      ${staticMode ? '<a class="primary" href="/index.html#missionReading">前往東衛任務閱讀存摺（新增主題／加點）</a>' : '<button id="edit-questions" class="primary">題庫編輯</button>'}
    </div>
    <div class="stats">
      <div class="stat"><b>${s.participants} / ${s.students}</b><small>參與認證人數</small></div>
      <div class="stat"><b>${s.passedStudents}</b><small>至少通過一本的人數</small></div>
      <div class="stat"><b>${s.completion}%</b><small>全體書目完成比例</small></div>
      <div class="stat"><b>${s.finished}</b><small>${books.length} 本全部通過人數</small></div>
    </div>
    <p class="muted">參與＝至少送出一次認證。完成比例＝通過的學生／書籍組合 ÷（名單人數 × ${books.length}）；重考不重複累計。所有認證紀錄皆同步儲存於「東衛任務閱讀存摺」。</p>
    <h2>學生完成情形</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr><th>班級</th><th>座號</th><th>姓名</th><th>認證次數</th><th>通過冊數</th><th>完成比例</th><th>最近認證</th><th>管理</th></tr>
        </thead>
        <tbody>
          ${d.students.map(st => `<tr><td>${esc(classLabel(st.className))}</td><td>${st.seat}</td><td>${esc(st.name)}</td><td>${st.attempts}</td><td>${st.completed} / ${books.length}</td><td>${st.completion}%</td><td>${esc(stamp(st.lastDate))}</td><td><button data-records="${esc(st.id)}">紀錄</button> <a href="/index.html?student=${encodeURIComponent(st.name)}#missionReading">存摺</a>${staticMode ? '' : ` <button data-reset="${esc(st.id)}">重設密碼</button>`}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="student-detail"></div>
    <h2>每本書的認證情形</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr><th>書名</th><th>參與人數</th><th>通過人數</th><th>全班完成比例</th></tr>
        </thead>
        <tbody>
          ${d.books.map(b => `<tr><td>${esc(b.title)}</td><td>${b.participants}</td><td>${b.passed}</td><td>${s.students ? Math.round(b.passed / s.students * 100) : 0}%</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <details>
      <summary>學生入口 QR Code</summary>
      <p>掃描後直接開啟小黑啤閱讀認證。</p>
      <img class="qr" src="/blackbear/entry-qr.png" alt="小黑啤閱讀認證學生入口 QR Code">
      <p><a href="/blackbear/entry-qr.png" download>下載 QR Code</a></p>
    </details>
  </section>`);

  $('#class-filter').onchange = e => run(() => teacher(e.target.value));
  $('#reload').onclick = () => run(() => teacher(classId));
  if ($('#edit-questions')) $('#edit-questions').onclick = () => run(() => openQuestionEditor({api, run, view, esc, books, onBack: () => teacher(classId)}));
  $('#export').onclick = () => exportCsv([['班級','座號','姓名','認證次數','通過冊數','完成比例(%)'], ...d.students.map(st => [st.className, st.seat, st.name, st.attempts, st.completed, st.completion])], '小黑啤認證統計.csv');
  $('#export-attempts').onclick = () => exportCsv([['班級','座號','姓名','書名','答對題數','通過','時間'], ...d.attempts.map(a => { const st = d.students.find(x => x.id === a.studentId || x.name === a.studentName); return [st?.className || a.className, st?.seat || a.seat, st?.name || a.studentName, title(a.bookId), a.score, (a.score >= 8 || a.passed) ? '是' : '否', stamp(a.date)]; })], '小黑啤歷次認證.csv');

  main.querySelectorAll('[data-records]').forEach(b => b.onclick = () => {
    const st = d.students.find(x => x.id === b.dataset.records);
    const own = d.attempts.filter(a => a.studentId === st.id || a.studentName === st.name);
    $('#student-detail').innerHTML = `<h2>${esc(st.name)}的歷次認證</h2>${own.length ? historyTable(own) : '<p class="muted">尚無認證紀錄。</p>'}`;
    $('#student-detail').scrollIntoView({block: 'start'});
  });

  main.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => {
    const st = d.students.find(x => x.id === b.dataset.reset);
    const pin = prompt(`替 ${st.className} ${st.seat} 號 ${st.name} 設定新的4位數密碼。\n資訊平台密碼也會變更，該生原登入會失效。`);
    if (pin === null) return;
    if (!/^\d{4}$/.test(pin)) { notice('請輸入 4 位數字。'); return; }
    run(async () => {
      await api('/teacher/reset-pin', {studentId: st.id, pin});
      notice('已重設，請私下告知該生新密碼。');
    });
  });
}

$('#home').onclick = () => { if (abandon()) shelf(); };
$('#account').onclick = () => { if (abandon()) run(mine); };
$('#password').onclick = () => { if (abandon()) password(); };
$('#teacher').onclick = () => { if (abandon()) run(() => teacher()); };
$('#logout').onclick = () => {
  if (abandon()) run(async () => {
    if (!staticMode) {
      await api('/logout', {}).catch(() => {});
    }
    sessionStorage.removeItem(STATIC_SESSION_KEY);
    session.student = null; attempts = []; nav(); shelf();
  });
};

if ($('#sound')) {
  $('#sound').onclick = () => {
    const active = sound.toggle();
    updateSoundBtn();
    notice(active ? '已開啟作答音效' : '已關閉作答音效');
  };
}

for (const event of ['pointerdown', 'keydown']) {
  document.addEventListener(event, () => lastActivity = Date.now(), {passive: true});
}

setInterval(() => {
  if (!session.student || staticMode) return;
  if (Date.now() - lastActivity > 540000) {
    run(async () => {
      try { await api('/logout', {}); }
      finally {
        session.student = null; exam = null; answers = {}; attempts = []; nav(); shelf();
        notice('一段時間沒有操作，已登出保護你的紀錄。');
      }
    });
  } else if (Date.now() - lastActivity < 300000) {
    api('/keepalive', {}).catch(e => notice(e.message));
  }
}, 60000);

window.addEventListener('beforeunload', e => {
  if (exam) { e.preventDefault(); e.returnValue = ''; }
});

run(async () => {
  try {
    const values = await Promise.all([api('/session'), api('/blackbear/catalog')]);
    session = values[0];
    books = values[1].books;
    staticMode = false;
  } catch {
    staticMode = true;
    const data = getStaticData();
    books = (data.books || []).map(b => ({
      id: b.id,
      title: b.title,
      isbn: b.isbn,
      cover: b.cover,
      count: (b.questions || []).length
    }));
  }

  const params = new URLSearchParams(location.search);
  const requestedStudent = params.get('student');
  if (requestedStudent) {
    const found = findStaticStudentByName(requestedStudent);
    if (found) {
      session.student = found;
      sessionStorage.setItem(STATIC_SESSION_KEY, JSON.stringify(found));
    }
  } else if (staticMode && !session.student) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STATIC_SESSION_KEY) || 'null');
      if (saved && saved.name) session.student = saved;
    } catch { /* ignore */ }
  }

  nav();
  await refresh();
  if (params.has('teacher')) await teacher();
  else shelf();
});
