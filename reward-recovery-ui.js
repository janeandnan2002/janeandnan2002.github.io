(function () {
  'use strict';
  window.mountRewardRecovery = function ({ store, loadError, save, render }) {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'rewardRecoveryTitle');
    dialog.className = 'w-full max-w-3xl rounded-2xl p-6 text-slate-800 backdrop:bg-slate-900/50';
    dialog.innerHTML = `<h2 id="rewardRecoveryTitle" class="text-2xl font-black">星光紀錄與還原</h2>
      <p class="mt-3">點數只存在目前瀏覽器，不會自動同步其他電腦。自動備份從新版開始保留，最多 100 份；無法憑空找回已清除且沒有備份的點數。</p>
      <p class="mt-2">還原只處理星光點數，不改名單、教師設定或任務閱讀紀錄。若姓名曾修改，舊姓名的點數仍可能在備份中，請先查看預覽。</p>
      <p data-status role="status" class="my-3 font-bold text-blue-800"></p>
      <div class="my-4 flex flex-wrap gap-3">
        <button type="button" data-export class="rounded-xl bg-emerald-700 px-4 py-3 text-white">下載完整備份</button>
        <label class="rounded-xl border border-blue-300 p-3">選擇 JSON 備份檔<input data-import type="file" accept=".json,application/json" class="block max-w-full"></label>
      </div>
      <p class="text-sm">備份含學生資料，請存放於教師私人資料夾，不要公開分享。選檔只會預覽，不會自動覆寫。</p>
      <label class="mt-4 block font-bold">選擇紀錄／可用資料<select data-list class="mt-2 w-full rounded-xl border p-3"></select></label>
      <p data-summary class="my-3 font-bold"></p>
      <div class="max-h-60 overflow-auto rounded-xl border p-3"><table class="w-full text-left"><thead><tr><th>學生</th><th>可用點數</th><th>累積星光</th></tr></thead><tbody data-preview></tbody></table></div>
      <div class="mt-4 flex flex-wrap gap-3"><button type="button" data-restore class="rounded-xl bg-blue-700 px-4 py-3 text-white" disabled>還原選取紀錄</button><button type="button" data-close class="rounded-xl border px-4 py-3">關閉</button></div>`;
    document.body.append(dialog);
    const find = selector => dialog.querySelector(selector);
    const list = find('[data-list]');
    const status = find('[data-status]');
    let candidates = [];
    let selected;
    function preview() {
      selected = candidates[Number(list.value)];
      find('[data-preview]').replaceChildren();
      find('[data-restore]').disabled = true;
      try {
        if (!selected) { find('[data-summary]').textContent = '沒有可預覽的紀錄'; return; }
        const data = window.RewardHistory.parse(selected.raw);
        find('[data-summary]').textContent = window.RewardHistory.summary(data);
        for (const [name, record] of Object.entries(data)) {
          const row = document.createElement('tr');
          for (const value of [name, record.points, record.earned]) {
            const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
          }
          find('[data-preview]').append(row);
        }
        find('[data-restore]').disabled = !selected.restorable;
      } catch (error) { find('[data-summary]').textContent = '此筆資料無法直接還原：' + error.message + '。請先下載完整備份保留原始內容。'; }
    }
    function populate() {
      list.replaceChildren();
      candidates.forEach((candidate, index) => {
        const option = document.createElement('option'); option.value = index; option.textContent = candidate.label; list.append(option);
      });
      list.value = '0'; preview();
    }
    function refresh() {
      candidates = [];
      status.textContent = loadError() || `目前設定：${window.TeacherProfile?.getActiveProfile?.()?.name || '東衛預設設定'}。不會自動還原，請先核對人數、姓名及點數。`;
      try {
        if (!store) throw new Error('目前瀏覽器無法存取點數儲存區');
        candidates.push({ label: '目前儲存的點數（僅預覽）', raw: localStorage.getItem(store.key), restorable: false });
        for (const entry of store.history()) candidates.push({ label: `${new Date(entry.at).toLocaleString('zh-TW')}｜${entry.label}`, raw: entry.raw, restorable: true });
        // Search only recognized reward keys; never copy another profile automatically.
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (key === store.key || key.endsWith(':history-v1') || !/^schoolRewardPoints\.v[12](?::[^:]+)?$/.test(key)) continue;
          candidates.push({ label: '其他設定／舊版點數：' + key, raw: localStorage.getItem(key), restorable: true });
        }
        if (candidates.length === 1) status.textContent += ' 本瀏覽器尚無歷史備份或其他設定的點數；請到原本使用的瀏覽器檢查，或匯入先前下載的備份。';
      } catch (error) { status.textContent = error.message; }
      populate();
    }
    document.getElementById('rewardHistoryButton').addEventListener('click', () => { refresh(); dialog.showModal(); });
    find('[data-close]').addEventListener('click', () => dialog.close());
    list.addEventListener('change', preview);
    find('[data-export]').addEventListener('click', () => {
      try {
        if (!store) throw new Error('無法讀取目前瀏覽器資料');
        const blob = new Blob([JSON.stringify(store.export(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `星光點數備份_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = '已產生備份下載，請確認檔案已存入私人資料夾。';
      } catch (error) { status.textContent = '匯出失敗：' + error.message; }
    });
    find('[data-import]').addEventListener('change', async event => {
      try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 10 * 1024 * 1024) throw new Error('檔案超過 10 MB');
        const payload = JSON.parse(await file.text());
        if (payload.app !== 'dongwei-reward-backup' || payload.version !== 1 || (payload.raw !== null && typeof payload.raw !== 'string')) throw new Error('請選擇「下載完整備份」產生的 JSON 檔案');
        const imported = [{ label: `匯入檔案｜${file.name}｜主資料`, raw: payload.raw, restorable: true }];
        if (payload.history) {
          const entries = JSON.parse(payload.history);
          if (!Array.isArray(entries)) throw new Error('備份紀錄格式不正確');
          for (const entry of entries.slice(0, 100)) {
            if (!entry || (entry.raw !== null && typeof entry.raw !== 'string')) throw new Error('備份內容不完整');
            imported.push({ label: `匯入備份｜${entry.at}｜${entry.label}`, raw: entry.raw, restorable: true });
          }
        }
        candidates = imported; populate();
        status.textContent = '已讀取備份，只預覽尚未更動點數。可從清單選擇主資料或歷史備份。';
      } catch (error) { status.textContent = '未匯入：' + error.message; }
      event.target.value = '';
    });
    find('[data-restore]').addEventListener('click', () => {
      try {
        if (!selected?.restorable) return;
        const data = window.RewardHistory.parse(selected.raw);
        if (!confirm(`將以此備份取代「目前設定檔」的所有星光點數：\n${selected.label}\n${window.RewardHistory.summary(data)}\n操作前會再備份。名單及任務閱讀紀錄不變，任務已給點狀態不會回溯。確定還原？`)) return;
        if (!save(data, '還原選取紀錄', true)) return;
        render(); refresh(); status.textContent = '已還原星光點數，還原前資料也已保留。任務閱讀的已給點狀態未變更，請勿重複給點。';
      } catch (error) { status.textContent = '未還原：' + error.message; }
    });
    if (loadError()) {
      const warning = document.createElement('p'); warning.setAttribute('role', 'alert'); warning.className = 'p-4 font-bold text-red-800'; warning.textContent = loadError();
      document.getElementById('rewardHistoryButton').parentElement.after(warning);
    }
  };
})();
