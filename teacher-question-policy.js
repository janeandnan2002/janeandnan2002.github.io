/* Keep teaching notes separate from answer-key questions; never manufacture options. */
(() => {
  const generic = /教材主題是什麼|教師手冊對|整理了哪些教學重點|引導學生(?:觀察|探究)|核心學習重點是什麼|請舉出一項生活中的實例|請根據教材填入|這個概念可以怎麼說明/;
  const rubric = /依學生|言之有理|合理例子即可|評分重點|能將本課學到|請依老師提供/;
  const missingContext = /如[下上左右]?圖|[下上左右]圖|下表|圖中|根據課文|文中/;
  function reviewPairs(pairs) {
    return (Array.isArray(pairs) ? pairs : []).filter(item => Array.isArray(item)
      && typeof item[0] === 'string' && typeof item[1] === 'string'
      && item[0].trim() && item[1].trim()
      && !generic.test(item[0]) && !rubric.test(item[1]) && !missingContext.test(item[0]));
  }
  window.TeacherQuestionPolicy = { reviewPairs, isCoreSubject: subject => ['國語', '國語文', '數學', '自然', '社會'].includes(subject) };
  const bank = window.DONGWEI_KNSH_115;
  if (Array.isArray(bank?.records)) {
    bank.records = bank.records.map(record => {
      if (!window.TeacherQuestionPolicy.isCoreSubject(record.subject)) return record;
      const questions = reviewPairs(record.questions);
      return { ...record, questions,
        teacherDiscussionQuestions: [...(record.teacherDiscussionQuestions || []), ...(record.questions || []).filter(item => !questions.includes(item))] };
    });
  }
})();
