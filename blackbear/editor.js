import {readingText} from './zhuyin.js';

export async function openQuestionEditor({api,run,view,esc,books,onBack}) {
 let bookId=books[0].id, rows=[], selected=0, draft, dirty=false, previewed=false;
 const $=s=>document.querySelector(s);
 const endpoint='/blackbear/teacher/questions';
 const confirmLeave=()=>!dirty||confirm('還有未儲存的修改。確定放棄這些修改？');
 const active=()=>!!$('#question-editor');
 const unload=e=>{if(active()&&dirty){e.preventDefault();e.returnValue='';}};
 // One guard per editor session; remove when leaving to another screen.
 const cleanup=()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',guard,true);};
 const guard=e=>{if(!active()){cleanup();return;}if(e.target.closest('header button,header a')){if(!confirmLeave()){e.preventDefault();e.stopImmediatePropagation();}else{dirty=false;cleanup();}}};
 window.addEventListener('beforeunload',unload);document.addEventListener('click',guard,true);
 const load=async()=>{const d=await api(endpoint+'?'+new URLSearchParams({bookId}));rows=d.questions;};
 const changed=()=>{dirty=true;previewed=false;$('#editor-publish').disabled=true;$('#editor-preview').hidden=true;$('#editor-state').textContent='尚未儲存';};
 const field=(key,label,text,z)=>`<div class="edit-field" data-field="${key}"><label for="edit-${key}">${label}</label><textarea id="edit-${key}" maxlength="${key==='question'?300:200}" rows="2">${esc(text)}</textarea><details><summary>${label}的逐字注音（點此修改）</summary><div class="phonetic-grid">${phoneticInputs(text,z,key)}</div></details></div>`;
 const phoneticInputs=(text,z,key)=>Array.from(text).map((c,i)=>/\p{Script=Han}/u.test(c)?`<label class="phonetic-cell"><span>${esc(c)}</span><input data-index="${i}" maxlength="5" aria-label="${key==='question'?'題目':'選項'+key.slice(1)}第${i+1}字「${esc(c)}」的注音" value="${esc(z[i]||'')}" placeholder="注音"></label>`:'').join('');
 const getField=key=>key==='question'?{text:draft.question,z:draft.zhuyin}:{text:draft.options[Number(key.slice(1))-1].text,z:draft.options[Number(key.slice(1))-1].zhuyin};
 function render(message=''){
  const row=rows[selected];draft=structuredClone(row.draft||row.published);dirty=false;previewed=false;
  view(`<section class="panel wide" id="question-editor"><span class="eyebrow">教師題庫編輯</span><h1>校對題目與注音</h1>
   <p>儲存草稿後先預覽，再確認發布。發布只影響新開始的認證；學生原有成績與作答中的題目不變。</p>
   <div class="toolbar"><button id="editor-back">返回認證統計</button><label for="editor-book">書籍</label><select id="editor-book">${books.map(b=>`<option value="${esc(b.id)}" ${b.id===bookId?'selected':''}>${esc(b.title)}</option>`).join('')}</select></div>
   <label for="editor-question">選擇題目</label><select id="editor-question">${rows.map((r,i)=>`<option value="${i}" ${i===selected?'selected':''}>第 ${r.sourceNumber} 題${r.draft?'【有草稿】':''}｜${esc((r.draft||r.published).question)}</option>`).join('')}</select>
   <p id="editor-state" role="status">${esc(message|| (row.draft?'已儲存草稿，尚未發布':'目前顯示正式題目'))}</p>
   <p class="muted">國字注音放在字的右側，只提供三年級。修改文字後，請展開逐字注音補齊空格；請依原書核對多音字及聲調。</p>
   <form id="editor-form">${field('question','題目',draft.question,draft.zhuyin)}
   <fieldset class="editor-options"><legend>選項與正確答案（學生作答時會重新亂數排列）</legend>${draft.options.map((o,i)=>`<div class="editor-option"><label><input type="radio" name="editor-answer" value="${o.id}" ${o.id===draft.correct_option_id?'checked':''}> ${'ABCD'[i]} 為正確答案</label>${field(o.id,'選項 '+ 'ABCD'[i],o.text,o.zhuyin)}</div>`).join('')}</fieldset>
   <label for="editor-skill">評量能力</label><input id="editor-skill" maxlength="60" value="${esc(draft.reading_skill)}">
   <div class="toolbar"><button type="submit" class="primary">儲存草稿</button><button type="button" id="editor-show">預覽已儲存草稿</button><button type="button" id="editor-publish" disabled>確認發布這一題</button></div></form>
   <section id="editor-preview" class="editor-preview" hidden aria-label="草稿預覽"></section>
   <details><summary>查看原始題目／還原</summary><p>${esc(row.original.question)}</p><ol type="A">${row.original.options.map(o=>`<li>${esc(o.text)}${o.id===row.original.correct_option_id?'（正確答案）':''}</li>`).join('')}</ol><button id="editor-restore">將原始題目帶入編輯</button><p class="muted">帶入後仍需儲存、預覽及發布，才會更改正式題目。</p></details>
  </section>`);
  $('#editor-back').onclick=()=>{if(confirmLeave()){cleanup();run(onBack);}};
  $('#editor-book').onchange=e=>{const next=e.target.value;e.target.value=bookId;if(!confirmLeave())return;run(async()=>{const old=bookId;bookId=next;try{await load();selected=0;render();}catch(error){bookId=old;throw error;}});};
  $('#editor-question').onchange=e=>{const next=Number(e.target.value);e.target.value=String(selected);if(confirmLeave()){selected=next;render();}};
  $('#editor-form').oninput=changed;
  document.querySelectorAll('[data-field]').forEach(container=>{
   const key=container.dataset.field,area=container.querySelector('textarea');
   container.querySelector('.phonetic-grid').oninput=e=>{if(e.target.matches('input'))getField(key).z[Number(e.target.dataset.index)]=e.target.value.trim();};
   area.oninput=()=>{
    const old=getField(key),before=Array.from(old.text),after=Array.from(area.value),z=after.map(()=> '');
    let start=0;while(start<before.length&&start<after.length&&before[start]===after[start]){z[start]=old.z[start];start++;}
    let a=before.length-1,b=after.length-1;while(a>=start&&b>=start&&before[a]===after[b]){z[b]=old.z[a];a--;b--;}
    if(key==='question'){draft.question=area.value;draft.zhuyin=z;}else{const option=draft.options[Number(key.slice(1))-1];option.text=area.value;option.zhuyin=z;}
    container.querySelector('.phonetic-grid').innerHTML=phoneticInputs(area.value,z,key);
   };
  });
  $('#editor-form').onsubmit=e=>{e.preventDefault();draft.correct_option_id=$('input[name="editor-answer"]:checked')?.value;draft.reading_skill=$('#editor-skill').value;run(async()=>{const r=await api(endpoint,{action:'save',bookId,questionId:row.id,revision:row.revision,question:draft});row.revision=r.revision;row.draft=structuredClone(draft);render('草稿已儲存。請預覽並核對後發布。');});};
  $('#editor-show').onclick=()=>{
   if(dirty){$('#editor-state').textContent='請先儲存目前的修改，再預覽。';return;}
   if(!row.draft){$('#editor-state').textContent='請先儲存一份草稿，再預覽。';return;}
   const q=row.draft;$('#editor-preview').innerHTML=`<h2>草稿預覽（一～三年級注音版）</h2><p>${readingText(q.question,q.zhuyin,true)}</p><ol type="A">${q.options.map(o=>`<li>${readingText(o.text,o.zhuyin,true)}${o.id===q.correct_option_id?'<strong class="answer-tag"> 正確答案</strong>':''}</li>`).join('')}</ol><p>評量能力：${esc(q.reading_skill)}</p><p class="muted">此處標示答案供教師核對，學生測驗不顯示答案。四～六年級使用相同文字、不顯示注音。</p>`;
   $('#editor-preview').hidden=false;previewed=true;$('#editor-publish').disabled=false;$('#editor-preview').scrollIntoView({block:'nearest'});
  };
  $('#editor-publish').onclick=()=>{if(dirty||!previewed||!row.draft)return;if(!confirm('已核對題目、正確答案及注音？發布後，學生新開始的認證會使用這一版。'))return;run(async()=>{const r=await api(endpoint,{action:'publish',bookId,questionId:row.id,revision:row.revision});row.revision=r.revision;row.published=row.draft;row.draft=null;render('已發布，新開始的認證將使用更新後的題目。');});};
  $('#editor-restore').onclick=()=>{if(!confirmLeave())return;const saved=row.draft;row.draft=structuredClone(row.original);render();row.draft=saved;changed();$('#editor-state').textContent='已帶入原始題目，請儲存草稿、預覽後再發布。';};
 }
 try{await load();render();}catch(e){cleanup();throw e;}
}
