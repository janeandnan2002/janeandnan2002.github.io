(function (root) {
  'use strict';
  function parse(raw) {
    const value = raw === null ? {} : JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('點數格式不正確');
    const result = Object.create(null);
    for (const [key, record] of Object.entries(value)) {
      if (!record || !Number.isSafeInteger(record.points) || record.points < 0 || !Number.isSafeInteger(record.earned) || record.earned < 0) throw new Error('點數資料不完整，未覆寫原資料');
      const name = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
      const old = result[name] || { points: 0, earned: 0 };
      result[name] = { points: old.points + record.points, earned: old.earned + record.earned };
      if (!Number.isSafeInteger(result[name].points) || !Number.isSafeInteger(result[name].earned)) throw new Error('點數超過可處理範圍');
    }
    return result;
  }
  function summary(data) {
    return `${Object.keys(data).length} 人；可用點數合計 ${Object.values(data).reduce((sum, r) => sum + r.points, 0)}；累積星光合計 ${Object.values(data).reduce((sum, r) => sum + r.earned, 0)}`;
  }
  function create(storage, key) {
    const historyKey = key + ':history-v1';
    let expected = storage.getItem(key);
    const history = () => {
      const entries = JSON.parse(storage.getItem(historyKey) || '[]');
      if (!Array.isArray(entries) || entries.some(e => !e || typeof e.label !== 'string' || typeof e.at !== 'string' || (e.raw !== null && typeof e.raw !== 'string'))) throw new Error('備份紀錄無法讀取，請先匯出備份，不要清除瀏覽器資料');
      return entries;
    };
    return {
      key,
      load: () => parse(expected),
      history,
      export: () => ({ app: 'dongwei-reward-backup', version: 1, key, exportedAt: new Date().toISOString(), raw: storage.getItem(key), history: storage.getItem(historyKey) }),
      save(data, label, recovery = false) {
        const raw = JSON.stringify(parse(JSON.stringify(data)));
        if (storage.getItem(key) !== expected) throw new Error('另一個分頁已修改點數。請重新整理後再操作，避免蓋掉新紀錄');
        if (!recovery) parse(expected);
        const entries = history();
        const at = new Date().toISOString();
        // Persist both sides before replacing the live value; a failed live write remains recoverable.
        const next = [{ at, label: label + '（操作後預備備份）', raw }, { at, label: label + '（操作前）', raw: expected }, ...entries].slice(0, 100);
        storage.setItem(historyKey, JSON.stringify(next));
        storage.setItem(key, raw);
        expected = raw;
        return parse(raw);
      }
    };
  }
  root.RewardHistory = { parse, summary, create };
})(typeof window === 'undefined' ? globalThis : window);
