import { createGroup, getGroup } from './db.js';
import { esc, safeParse } from './utils.js';

function showAlert(msg) {
  return new Promise(resolve => {
    document.getElementById('modal-alert-msg').textContent = msg;
    const overlay = document.getElementById('modal-alert');
    overlay.classList.add('open');
    const btn = document.getElementById('modal-alert-ok');
    const handler = () => {
      overlay.classList.remove('open');
      btn.removeEventListener('click', handler);
      resolve();
    };
    btn.addEventListener('click', handler);
  });
}

// 顯示最近開啟的群組
function renderRecent() {
  const KEY = 'splitbill_recent';
  const stored = safeParse(localStorage.getItem(KEY), []);
  const list = Array.isArray(stored) ? stored : [];
  const container = document.getElementById('recent-groups');
  const listEl = document.getElementById('recent-list');
  if (!list.length) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  listEl.innerHTML = list.map(g => `
    <a href="group.html?code=${esc(g.code)}"
       class="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-5 py-3.5 shadow-sm hover:border-blue-200 hover:shadow-blue-50 transition-all active:scale-95">
      <span class="font-bold text-slate-800 text-sm truncate">${esc(g.name)}</span>
      <div class="flex items-center gap-2 shrink-0 ml-3">
        <span class="text-[10px] text-slate-400 font-mono">${esc(g.code)}</span>
        <svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </div>
    </a>`).join('');
}

renderRecent();
window.addEventListener('pageshow', renderRecent);

const inputName = document.getElementById('input-group-name');
const inputCode = document.getElementById('input-share-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin   = document.getElementById('btn-join');

let _creating = false;
btnCreate.addEventListener('click', async () => {
  if (_creating) return;
  const name = inputName.value.trim();
  if (!name) { inputName.focus(); return; }
  _creating = true;
  btnCreate.disabled = true;
  try {
    const group = await createGroup(name);
    location.href = `group.html?code=${group.share_code}`;
  } catch {
    await showAlert('建立失敗，請再試一次');
  } finally {
    _creating = false;
    btnCreate.disabled = false;
  }
});

let _joining = false;
btnJoin.addEventListener('click', async () => {
  if (_joining) return;
  const code = inputCode.value.trim().toUpperCase();
  if (!code) { inputCode.focus(); return; }
  _joining = true;
  btnJoin.disabled = true;
  try {
    const group = await getGroup(code);
    if (!group) {
      await showAlert('找不到此邀請碼，請確認後再試');
      return;
    }
    location.href = `group.html?code=${code}`;
  } finally {
    _joining = false;
    btnJoin.disabled = false;
  }
});

// Enter 鍵觸發（IME 組字中不觸發）
let _ime = false;
[inputName, inputCode].forEach(el => {
  el.addEventListener('compositionstart', () => { _ime = true; });
  el.addEventListener('compositionend',   () => { setTimeout(() => { _ime = false; }, 0); });
});
inputName.addEventListener('keydown', e => { if (e.key === 'Enter' && !_ime) btnCreate.click(); });
inputCode.addEventListener('keydown', e => { if (e.key === 'Enter' && !_ime) btnJoin.click(); });
