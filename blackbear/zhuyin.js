// Explicit character cells avoid inconsistent browser support for ruby inter-character.
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readingText(text, readings, enabled) {
  if(!enabled || !Array.isArray(readings) || readings.length!==Array.from(text).length) return escapeHtml(text);
  return `<span class="zh-text" aria-label="${escapeHtml(text)}"><span aria-hidden="true">${Array.from(text).map((char,i)=>{
    const value=readings[i];
    if(!value || !/^[ㄅ-ㄩˊˇˋ˙]+$/.test(value)) return escapeHtml(char);
    const tone=value.match(/[ˊˇˋ˙]/)?.[0]||'';
    const symbols=value.replace(/[ˊˇˋ˙]/g,'');
    return `<span class="zh-cell"><span class="zh-han">${escapeHtml(char)}</span><span class="zh-side"><span class="zh-symbols">${symbols}</span>${tone?`<span class="zh-tone ${tone==='˙'?'zh-neutral':''}">${tone}</span>`:''}</span></span>`;
  }).join('')}</span></span>`;
}
