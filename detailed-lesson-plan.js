(function (global) {
  'use strict';

  const asList = value => Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  const shorten = (value, length = 82) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > length ? `${text.slice(0, length - 1)}…` : text;
  };
  const isEmptyHeading = value => /^(?:[（(]?[一二三]?[）)]?)?(?:準備|發展|綜合|統整|引起動機)?活動[一二三四五六七八九十\d]*[：:、]?$/.test(String(value || '').replace(/\s+/g, ''));
  const isGenericFlow = value => /依教師手冊重點展開教學|核心概念建構與小組協作|生活情境觀察與提問|概念歸納、任務單檢核/.test(String(value || ''));

  function subjectName(subject) {
    if (subject === '閩南語') return '本土語言';
    return subject;
  }

  function sessionName(record) {
    const lessonMatch = String(record.unit || '').match(/第\s*0*(\d+)\s*課/);
    if (lessonMatch) return `第${Number(lessonMatch[1])}節課`;
    if (Number(record.lessonCount) > 1) return `本單元第1節（共${record.lessonCount}節）`;
    return '本課第1節';
  }

  function allocateMinutes(total) {
    if (total === 40) return { intro: 8, development: 22, conclusion: 10 };
    const intro = Math.max(5, Math.round(total * 0.2));
    const development = Math.max(10, Math.round(total * 0.55));
    return { intro, development, conclusion: total - intro - development };
  }

  function buildObjectives(record) {
    const objectives = unique([...asList(record.objectives), ...asList(record.focus)]).slice(0, 5);
    const title = record.title || '本課主題';
    const fallbacks = [
      `能用自己的話說出〈${title}〉的一項教材重點。`,
      `能依教材指示完成〈${title}〉的口語、書寫或實作任務。`,
      `能根據教材內容說明答案，並檢查自己的學習成果。`,
    ];
    for (const item of fallbacks) {
      if (objectives.length >= 3) break;
      objectives.push(item);
    }
    return objectives;
  }

  function buildCompetencies(record, objectives) {
    const supplied = unique([
      ...asList(record.coreCompetencies),
      ...asList(record.competencies),
      ...asList(record.coreCompetency),
    ]);
    if (supplied.length) return supplied.map(item => ({ text: item, source: '教材原列' }));

    const first = shorten(objectives[0], 58);
    const second = shorten(objectives[1] || objectives[0], 58);
    const subject = record.subject;
    const mappings = {
      '國語文': [
        `溝通互動：透過朗讀、詞句理解與口語表達完成「${first}」。`,
        `自主行動：從課文找出證據，檢核自己是否掌握「${second}」。`,
      ],
      '數學': [
        `自主行動：理解題意、列式計算並檢查，完成「${first}」。`,
        `溝通互動：說明解題步驟，比較不同方法是否合理。`,
      ],
      '自然': [
        `自主行動：透過觀察、操作、紀錄與推論完成「${first}」。`,
        `溝通互動：依觀察證據說明發現，與同學比較結果。`,
      ],
      '社會': [
        `社會參與：運用教材資料理解「${first}」，並連結生活情境。`,
        `溝通互動：讀圖、判讀資料並提出有證據的看法。`,
      ],
      '英語': [
        `溝通互動：運用本課單字與句型完成聽說對話。`,
        `自主行動：依教材情境完成「${first}」並自我檢核。`,
      ],
      '閩南語': [
        `溝通互動：運用本課語詞與句型聽、講、唸讀，完成「${first}」。`,
        `社會參與：把本課語言內容連結澎湖生活情境並與同學分享。`,
      ],
      '資訊': [
        `自主行動：依步驟操作數位工具，完成「${first}」。`,
        `溝通互動：展示操作成果，說明做法並接受同儕回饋。`,
      ],
      '健康與體育': [
        `自主行動：依安全規範實際完成「${first}」。`,
        `社會參與：在合作任務中遵守規則、觀察同伴並給予回饋。`,
      ],
    };
    return (mappings[subject] || [
      `自主行動：依教材步驟完成「${first}」。`,
      `溝通互動：與同學合作、說明成果並完成「${second}」。`,
    ]).map(text => ({ text, source: '依本課教材目標對應；原檔未列代碼' }));
  }

  function orderedMaterials(record) {
    const priority = ['教師手冊', '教冊', '課本', '課程計畫', '練習', '學習單', '習作', '評量', '試卷'];
    return (Array.isArray(record.materials) ? record.materials : []).filter(Boolean).map((item, index) => ({
      item,
      index,
      rank: priority.findIndex(label => String(typeof item === 'string' ? item : `${item.type || ''}${item.name || ''}`).includes(label)),
    })).sort((a, b) => (a.rank < 0 ? priority.length : a.rank) - (b.rank < 0 ? priority.length : b.rank) || a.index - b.index).map(entry => entry.item);
  }

  function buildPreparation(record) {
    const actual = orderedMaterials(record).map(item => {
      if (typeof item === 'string') return item;
      return `${item.type || '教材'}：${item.name || '本課資料'}`;
    });
    if (!actual.length && record.sourceFile) actual.push(`本次讀取檔案：${record.sourceFile}`);

    const subjectMaterials = {
      '國語文': ['本課課文投影或課本', '取自本課內容的詞語／句型卡', '小白板或學習單'],
      '數學': ['本課例題投影或課本', '計算紙與小白板', '依單元需要準備的操作教具'],
      '自然': ['本課觀察或實驗材料', '紀錄表與書寫工具', '安全防護用品（依教材活動需要）'],
      '社會': ['本課地圖、圖片、時間線或資料圖表', '資料判讀任務單', '小白板或便利貼'],
      '英語': ['本課單字圖卡與音訊', '句型／對話卡', '口說任務單'],
      '閩南語': ['本課課文與音訊（若教材提供）', '本課語詞圖卡與句型卡', '口說／唸讀檢核單'],
      '資訊': ['學生電腦或平板', '本課操作步驟投影', '成果檢核表'],
      '健康與體育': ['本課指定器材', '安全界線標示與飲水', '觀察／操作檢核表'],
    };
    return unique([...actual, ...(subjectMaterials[record.subject] || ['本課教材投影', '任務單', '書寫工具'])]).slice(0, 8);
  }

  function sourceActivities(record) {
    return unique([
      ...asList(record.sourceActivities),
      ...asList(record.flow),
      ...asList(record.studentActivities),
    ]).filter(item => !isEmptyHeading(item) && !isGenericFlow(item)).map(item => shorten(item, 150));
  }

  function groundedQuestion(record, index, focus) {
    const provided = asList(record.teacherGuidance).filter(item => !/哪些地方會接觸到|哪些方法或步驟|關鍵重點是什麼/.test(item));
    if (provided[index]) return shorten(provided[index], 120);
    return `根據本課教材，你可以怎麼說明或完成「${shorten(focus, 62)}」？`;
  }

  function expectedAnswer(focus) {
    return `能依教材內容指出或做到：${shorten(focus, 90)}`;
  }

  function makeStep(name, minutes, teacherActions, studentActions, question, answer, coreContent, materials) {
    return {
      name,
      minutes,
      teacherActions: asList(teacherActions),
      studentActions: asList(studentActions),
      questions: question ? [question] : [],
      expectedAnswers: answer ? [answer] : [],
      coreContent,
      materials: asList(materials),
    };
  }

  function developmentSteps(record, objectives, preparation, excerpts) {
    const title = record.title;
    const focus = unique([...asList(record.focus), ...objectives]);
    const f0 = focus[0] || objectives[0];
    const f1 = focus[1] || objectives[1];
    const f2 = focus[2] || objectives[2];
    const sourceNote = index => excerpts[index] ? `教材活動：${excerpts[index]}` : `教材重點：${shorten(focus[index] || f0, 100)}`;
    const commonMaterials = preparation.slice(0, 3);

    if (record.subject === '國語文') return [
      makeStep('步驟1｜示範朗讀與內容定位', 8,
        [`指定本課教材段落，先示範停頓、語氣與關鍵詞，再逐段帶讀。`, `每讀完一段立即請學生指出人物、事件或段落重點；答案只能回到課文找證據。`],
        [`跟讀後兩人互讀，圈出不熟悉的詞語與能支持段意的句子。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜詞語與句型替換', 7,
        [`從本課教材挑選詞語或句型，示範詞義、上下文用法與一次替換。`, `巡視學生造句，發現不合語意時請學生回看原句修正。`],
        [`抽詞語／句型卡，先口說再寫一句符合本課語意的句子。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜閱讀證據任務', 7,
        [`提出一題本課內容理解題，要求回答時同時指出課文依據。`, `邀請兩組比較答案，整理「答案＋證據」的完整說法。`],
        [`小組在課文中找證據，將答案與依據寫在小白板後說明。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];

    if (record.subject === '數學') return [
      makeStep('步驟1｜教材例題示範', 7,
        [`投影本課教師手冊或課本的一道代表例題，先遮住解答。`, `帶學生依序圈出已知條件、問題與單位，再示範列式、計算及檢查；每一步都說明理由。`],
        [`口頭說出題目條件與所求，跟著在計算紙完成每一步。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜學生實際計算', 7,
        [`指定同單元一道練習題，先讓學生獨立列式計算，再巡視記錄常見錯誤。`],
        [`獨立完成算式與答案，圈出單位，完成後與同桌逐步核對。`],
        `你的列式如何對應題目中的條件與問題？`, expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜教師檢核與訂正', 4,
        [`抽看兩種解法或一個常見錯誤，請全班判斷哪一步需要修正。`, `用逆算、估算或代回題意的方法檢查答案是否合理。`],
        [`舉牌判斷並說明理由，依檢核結果訂正自己的算式。`],
        `除了重算一次，還能怎麼確認答案合理？`, `能使用本單元適合的檢查方法，並說明判斷理由。`, sourceNote(2), commonMaterials),
      makeStep('步驟4｜教材情境應用題', 4,
        [`使用本課教材中的生活情境題，要求學生完整寫出列式、計算、單位與答句。`],
        [`完成應用題，與組員互查四項內容是否齊全。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), `應用範圍限定於〈${title}〉教材所列概念。`, commonMaterials),
    ];

    if (record.subject === '自然') return [
      makeStep('步驟1｜觀察與提出問題', 7,
        [`依教材呈現本課觀察物、圖片或現象，先請學生描述看到的事實，再區分觀察與猜測。`],
        [`個別觀察並在紀錄表寫下至少兩項可直接觀察的特徵。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜操作、分類與紀錄', 8,
        [`依教材步驟示範一次操作與安全注意事項，再發材料。`, `巡視各組是否控制條件、正確分類並如實記錄。`],
        [`分工操作、分類或測量，把結果填入表格，不改寫不符合預期的數據。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜證據推論', 7,
        [`比較各組紀錄，追問「哪一項資料支持你的說法」。`, `整理教材概念與觀察結果間的關係。`],
        [`根據紀錄提出結論，指出證據，並修正與證據不符的推論。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];

    if (record.subject === '社會') return [
      makeStep('步驟1｜讀圖與資料定位', 7,
        [`出示本課地圖、照片、時間線或圖表，示範先讀標題、圖例、時間與資料來源。`],
        [`兩人一組指出資料中的位置、時間或關鍵資訊，將證據標記出來。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜資料判讀與比較', 7,
        [`帶學生比較兩項教材資料，將「看到的事實」與「根據事實的推論」分開記錄。`],
        [`完成比較表，說出一項相同、一項不同及其資料依據。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜情境討論任務', 8,
        [`提出與本課內容一致的生活情境，要求各組依教材證據做選擇並說明。`, `追問不同選擇可能造成的影響，最後回扣教材重點。`],
        [`小組選擇立場，把「選擇、理由、教材證據」寫在小白板並發表。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];

    if (record.subject === '英語') return [
      makeStep('步驟1｜聽辨與單字口說', 7,
        [`播放或示範本課教材語音，學生先聽不看字，再出示單字圖卡帶讀與辨音。`],
        [`聽音指圖、跟讀，再與同桌互相抽卡說出單字。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜句型替換', 7,
        [`呈現教材原句型，示範替換一個詞並確認語意與發音。`],
        [`依圖卡完成至少兩次句型替換，先說後寫。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜情境對話任務', 8,
        [`設定教材中的對話情境，說明角色與必用句型，巡聽後提供發音回饋。`],
        [`兩人輪換角色完成對話，再向另一組演示。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];

    if (record.subject === '閩南語') return [
      makeStep('步驟1｜聽音、範讀與唸讀', 7,
        [`依本課課程計畫先範讀指定課文或語句，提醒學生注意教材列出的語音與停頓。`, `採「教師一句、全班一句、同桌互讀」進行，立即修正誤讀。`],
        [`先聽辨，再跟讀、分組讀與同桌互讀；把不熟悉的語詞做記號。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜本課語詞與句型', 7,
        [`從本課教材活動挑選語詞或句型，以圖卡、動作或上下文說明，不加入教材未列的課文內容。`, `示範一次生活化替換，再請學生口說。`],
        [`抽取語詞／句型卡，完成指認、唸讀及一句生活情境口說。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜澎湖生活情境任務', 8,
        [`使用課程計畫原有情境或把本課語詞放入可驗證的澎湖日常情境，交代角色、必用語詞與完成條件。`, `巡聽各組對話，依正確用詞、完整表達與合作給回饋。`],
        [`兩人或小組完成情境對話／任務，交換角色再練一次。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];

    if (record.subject === '資訊') return [
      makeStep('步驟1｜教師示範操作', 6,
        [`投影本課操作畫面，依課程計畫逐步示範；每完成一步就停下來讓學生指出下一步。`],
        [`先看示範不搶操作，口頭說出功能位置與操作順序。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜學生分段實作', 10,
        [`一次公布一小段任務，巡視畫面與操作紀錄；先用提示卡引導，不直接代做。`],
        [`依步驟完成作品，每完成一段就用檢核表確認並儲存。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜成果檢核與除錯', 6,
        [`請學生執行或展示成果，依教材條件逐項檢核；示範如何從現象回查可能步驟。`],
        [`與同桌交換檢核，找到一項可改進處並自行修正。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];

    return [
      makeStep('步驟1｜教師示範與重點釐清', 7,
        [`依教材示範〈${title}〉的第一項學習任務，拆成可觀察的步驟並逐步確認。`],
        [`觀察示範，用自己的話重述步驟或重點。`],
        groundedQuestion(record, 0, f0), expectedAnswer(f0), sourceNote(0), commonMaterials),
      makeStep('步驟2｜學生實作與合作', 8,
        [`交代完成條件與分工，巡視時針對教材重點提問，不直接公布答案。`],
        [`個別先做，再與組員比較並依教材修正。`],
        groundedQuestion(record, 1, f1), expectedAnswer(f1), sourceNote(1), commonMaterials),
      makeStep('步驟3｜任務挑戰與說明', 7,
        [`提出與本課目標直接相關的任務，要求學生展示成果並說明依據。`],
        [`小組完成任務、展示成果，回答同學一個提問。`],
        groundedQuestion(record, 2, f2), expectedAnswer(f2), sourceNote(2), commonMaterials),
    ];
  }

  function buildIntro(record, objectives, preparation, minutes) {
    const lowGrade = Number(record.grade) <= 2;
    const modes = lowGrade
      ? ['看圖猜課名', '圖卡配對', '動作模仿']
      : ['關鍵線索快問快答', '概念分類', '一分鐘預測'];
    const mode = record.subject === '數學' ? (lowGrade ? '看圖估一估' : '錯誤偵探')
      : record.subject === '自然' ? '觀察線索猜想'
        : record.subject === '社會' ? '資料線索快問快答'
          : record.subject === '閩南語' ? (lowGrade ? '聽音指圖' : '語詞線索猜課名')
            : modes[0];
    return {
      id: 'intro',
      title: '一、引起動機',
      activityName: `${mode}：〈${record.title}〉`,
      minutes,
      teacherActions: [
        `出示取自本課教材的 2～3 個圖片、語詞、算式或資料線索，不先公布答案。`,
        `說明暖身規則並逐一揭示線索；每揭示一項就請學生說出猜測及理由。`,
        `將學生答案連回本課第一項目標「${shorten(objectives[0], 72)}」，宣布今天的學習任務。`,
      ],
      studentActions: [
        `先獨立觀察或聆聽，再舉牌、指圖、做動作或口頭回答。`,
        `和同桌用一句話說明猜測依據，聽到新證據後可修正答案。`,
      ],
      questions: [
        `你從哪一個教材線索想到〈${record.title}〉？理由是什麼？`,
        `今天完成什麼任務，才算真的學會這一課？`,
      ],
      expectedAnswers: [expectedAnswer(objectives[0])],
      materials: preparation.slice(0, 4),
      rules: [
        `每次揭示線索後先想 5 秒再回答。`,
        `回答必須包含「我的猜測」和「我看到／聽到的線索」。`,
        `答錯可以依新線索修正，不倒扣；能說明教材依據才得分。`,
      ],
      assessment: [`觀察學生能否根據本課教材線索提出合理猜測，作為課前診斷。`],
    };
  }

  function buildConclusion(record, objectives, preparation, minutes) {
    const practiceMinutes = Math.max(5, minutes - 4);
    const summaryMinutes = minutes - practiceMinutes;
    return {
      id: 'conclusion',
      title: '三、綜合活動與評量',
      activityName: `任務闖關＋學習出口票：〈${record.title}〉`,
      minutes,
      steps: [
        makeStep('綜合練習／情境任務', practiceMinutes,
          [`依三項學習目標設三個小任務：說出重點、完成操作／作答、說明教材依據。`, `讓學生輪流完成，不以只聽教師講解代替操作。`],
          [`個別作答後與同桌互查，再由小組代表完成一次口語、書寫或實作展示。`],
          `請用本課教材內容完成任務，並指出你用到哪一項學習重點。`,
          `答案須符合教材，且能對應至少一項學習目標。`,
          `評量目標：${objectives.map((item, index) => `${index + 1}.${shorten(item, 52)}`).join('；')}`,
          preparation.slice(0, 4)),
        makeStep('教師總結與 Exit Ticket', summaryMinutes,
          [`逐項重述今日目標，請學生用手勢或小白板回報掌握度。`, `收取出口票，依下列判準記錄需要補救、已達成與可進階的學生。`],
          [`完成出口票：寫／說一項本課重點，再完成一個最能代表本課目標的小題或操作。`],
          `哪一項證據最能證明你已經學會〈${record.title}〉？`,
          `能指出自己的作答、朗讀、計算、操作或教材證據，並說明對應目標。`,
          `教師判斷：三項目標中至少達成兩項，且核心任務正確，判定本節已學會；僅達成一項者安排提示卡或同儕再練。`,
          ['Exit Ticket／小白板', ...preparation.slice(0, 2)]),
      ],
      teacherActions: [],
      studentActions: [],
      questions: [],
      expectedAnswers: [],
      materials: unique(['Exit Ticket／小白板', ...preparation.slice(0, 3)]),
      rules: [
        `先個別作答，再與同桌核對；每位學生都必須留下可檢核的學習證據。`,
        `小組加分以答案符合教材、說明清楚及合作完成為準。`,
      ],
      assessment: objectives.map((item, index) => `目標${index + 1}：以口語、書寫或實作證據檢核「${shorten(item, 72)}」`),
      mastery: `學生能完成核心任務，並在三項目標中至少提供兩項正確、可觀察的學習證據；未達者依錯誤類型安排再示範、提示卡或同儕練習。`,
    };
  }

  function validate(plan) {
    const phaseMap = Object.fromEntries(plan.phases.map(phase => [phase.id, phase]));
    const participantActions = plan.phases.flatMap(phase => [
      ...asList(phase.studentActions),
      ...asList(phase.steps).flatMap(step => asList(step.studentActions)),
    ]);
    const checks = [
      ['有教材來源', Boolean(plan.source)],
      ['有單元課名', Boolean(plan.unitTitle)],
      ['有核心素養', plan.competencies.length > 0],
      ['至少3個學習目標', plan.objectives.length >= 3],
      ['有教學準備', plan.preparation.length > 0],
      ['有引起動機', Boolean(phaseMap.intro)],
      ['有發展活動', Boolean(phaseMap.development && phaseMap.development.steps.length >= 2)],
      ['有綜合活動', Boolean(phaseMap.conclusion)],
      ['至少2個學生實際參與活動', participantActions.length >= 2],
      ['有評量', plan.phases.some(phase => asList(phase.assessment).length > 0)],
      ['時間總和等於設定時間', plan.phases.reduce((sum, phase) => sum + phase.minutes, 0) === plan.totalMinutes],
      ['內容與目前教材單元一致', plan.title === plan.recordTitle && plan.designBasis.length > 0],
    ];
    return checks.map(([label, passed]) => ({ label, passed }));
  }

  function build(record, options = {}) {
    if (!record || !record.title || !record.subject) throw new Error('缺少可用的教材紀錄');
    const totalMinutes = Number(options.minutes) || 40;
    const times = allocateMinutes(totalMinutes);
    const objectives = buildObjectives(record);
    const competencies = buildCompetencies(record, objectives);
    const preparation = buildPreparation(record);
    const excerpts = sourceActivities(record);
    const development = {
      id: 'development',
      title: '二、發展活動',
      activityName: `教材重點學習與任務實作：〈${record.title}〉`,
      minutes: times.development,
      steps: developmentSteps(record, objectives, preparation, excerpts),
      teacherActions: [],
      studentActions: [],
      questions: [],
      expectedAnswers: [],
      materials: preparation.slice(0, 5),
      rules: [`先個別思考或操作，再與同伴核對；回答與成果必須能指出教材依據。`],
      assessment: [`巡迴檢核學生是否正確完成操作／作答，並能用教材語句或證據說明。`],
    };
    const developmentTotal = development.steps.reduce((sum, step) => sum + step.minutes, 0);
    if (development.steps.length && developmentTotal !== development.minutes) {
      development.steps[development.steps.length - 1].minutes += development.minutes - developmentTotal;
    }

    const source = record.sourceLabel || record.sourceFile || record.sourcePath || '目前讀取的課程教材';
    const session = sessionName(record);
    const designBasis = unique([
      ...orderedMaterials(record).map(item => typeof item === 'string' ? item : item.name),
      record.sourceFile,
      record.sourcePath,
    ]).filter(Boolean);
    const plan = {
      subject: subjectName(record.subject),
      grade: `${record.grade}年級`,
      session,
      basicLabel: `${record.grade}年級${subjectName(record.subject)}（${session}）`,
      source,
      unitTitle: `${record.unit || '本課'} ${record.title}｜${session}`,
      audience: `${record.grade}年級學生（授課時間：${totalMinutes}分鐘）`,
      designBasis,
      competencies,
      objectives,
      preparation,
      title: record.title,
      recordTitle: record.title,
      totalMinutes,
      phases: [
        buildIntro(record, objectives, preparation, times.intro),
        development,
        buildConclusion(record, objectives, preparation, times.conclusion),
      ],
    };
    plan.qualityChecks = validate(plan);
    plan.complete = plan.qualityChecks.every(item => item.passed);
    if (!plan.complete) throw new Error(`教案品質檢查未通過：${plan.qualityChecks.filter(item => !item.passed).map(item => item.label).join('、')}`);
    return plan;
  }

  global.DONGWEI_DETAILED_LESSON = { build, validate, allocateMinutes };
})(typeof window !== 'undefined' ? window : globalThis);
