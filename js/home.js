import { createGroup, getGroup } from './db.js';

// 顯示最近開啟的群組
function renderRecent() {
  const KEY = 'splitbill_recent';
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  const container = document.getElementById('recent-groups');
  const listEl = document.getElementById('recent-list');
  if (!list.length) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  listEl.innerHTML = list.map(g => `
    <a href="group.html?code=${g.code}"
       class="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-5 py-3.5 shadow-sm hover:border-blue-200 hover:shadow-blue-50 transition-all active:scale-95">
      <span class="font-bold text-slate-800 text-sm truncate">${g.name}</span>
      <span class="text-[10px] text-slate-400 font-mono ml-3 shrink-0">${g.code}</span>
    </a>`).join('');
}

renderRecent();
window.addEventListener('pageshow', renderRecent);

const inputName = document.getElementById('input-group-name');
const inputCode = document.getElementById('input-share-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin   = document.getElementById('btn-join');

btnCreate.addEventListener('click', async () => {
  const name = inputName.value.trim();
  if (!name) { inputName.focus(); return; }
  const group = await createGroup(name);
  location.href = `group.html?code=${group.share_code}`;
});

btnJoin.addEventListener('click', async () => {
  const code = inputCode.value.trim().toUpperCase();
  if (!code) { inputCode.focus(); return; }
  const group = await getGroup(code);
  if (!group) {
    alert('找不到此邀請碼，請確認後再試');
    return;
  }
  location.href = `group.html?code=${code}`;
});

// Enter 鍵觸發（IME 組字中不觸發）
let _ime = false;
[inputName, inputCode].forEach(el => {
  el.addEventListener('compositionstart', () => { _ime = true; });
  el.addEventListener('compositionend',   () => { setTimeout(() => { _ime = false; }, 0); });
});
inputName.addEventListener('keydown', e => { if (e.key === 'Enter' && !_ime) btnCreate.click(); });
inputCode.addEventListener('keydown', e => { if (e.key === 'Enter' && !_ime) btnJoin.click(); });
