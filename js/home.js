import { createGroup } from './db.js';

const inputName = document.getElementById('input-group-name');
const btnCreate = document.getElementById('btn-create');

btnCreate.addEventListener('click', async () => {
  const name = inputName.value.trim();
  if (!name) { inputName.focus(); return; }
  const group = await createGroup(name);
  location.href = `group.html?code=${group.share_code}`;
});

// Enter 鍵觸發（IME 組字中不觸發）
let _ime = false;
inputName.addEventListener('compositionstart', () => { _ime = true; });
inputName.addEventListener('compositionend',   () => { setTimeout(() => { _ime = false; }, 0); });
inputName.addEventListener('keydown', e => { if (e.key === 'Enter' && !_ime) btnCreate.click(); });
