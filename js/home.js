import { createGroup, getGroup } from './db.js';

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
