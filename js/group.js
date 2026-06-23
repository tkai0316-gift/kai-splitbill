import { getGroup, saveGroup, uuid, guardedAction } from './db.js';

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function imeEnter(el, fn) {
  let c = false;
  el.addEventListener('compositionstart', () => { c = true; });
  el.addEventListener('compositionend',   () => { setTimeout(() => { c = false; }, 0); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !c) { e.preventDefault(); fn(); } });
}

const params = new URLSearchParams(location.search);
const CODE   = params.get('code')?.toUpperCase();
if (!CODE) { location.href = 'index.html'; throw 0; }

let group = await getGroup(CODE);
if (!group) {
  alert('找不到群組，請確認連結是否正確');
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:1.5rem;background:#f9fafb;font-family:Inter,sans-serif">
      <div style="font-size:3rem;margin-bottom:1rem">🔍</div>
      <h2 style="font-size:1.25rem;font-weight:700;color:#111827;margin-bottom:0.5rem">找不到群組</h2>
      <p style="font-size:0.875rem;color:#6b7280">此連結對應的群組已不存在或已被刪除</p>
      <p style="font-size:0.75rem;color:#9ca3af;margin-top:0.75rem;font-family:monospace">${esc(CODE)}</p>
    </div>`;
  throw 0;
}

if (!group.paid_transfers) group.paid_transfers = {};
if (group.locked === undefined) group.locked = false;

// 記錄最近開啟的群組
;(function saveRecent() {
  const KEY = 'splitbill_recent';
  const item = { code: CODE, name: group.name, ts: Date.now() };
  const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    .filter(g => g.code !== CODE);
  list.unshift(item);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 5)));
})();

function applyLockState() {
  const locked = group.locked;
  document.getElementById('locked-banner').classList.toggle('hidden', !locked);
  document.getElementById('btn-fab').classList.toggle('hidden', locked);
  document.getElementById('member-input-area').classList.toggle('hidden', locked);
  renderMembers();
  renderExpenseCards();
  renderSettleResult(calcSettlement());
}

document.getElementById('btn-unlock').addEventListener('click', async e => {
  await guardedAction(e.currentTarget, async () => {
    group.locked = false;
    await saveGroup(group);
    applyLockState();
  });
});

document.title = `${group.name} ｜ 帳務總覽`;
const _nameEl = document.getElementById('group-name');
_nameEl.textContent = `${group.name} ｜ 帳務總覽`;
_nameEl.style.fontSize = group.name.length <= 5 ? '1.1rem' : group.name.length <= 12 ? '0.9rem' : '0.8rem';

// ── 分享 ──
const shareURL = `${location.origin}${location.pathname}?code=${CODE}`;

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) { /* noop */ }
  const el = Object.assign(document.createElement('textarea'), { value: text });
  el.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  return ok;
}

document.getElementById('btn-copy').addEventListener('click', async () => {
  const btn = document.getElementById('btn-copy');
  const ok = await copyToClipboard(shareURL);
  if (ok) {
    btn.textContent = '已複製！';
    setTimeout(() => { btn.textContent = '複製連結'; }, 2000);
  } else {
    prompt('群組連結：', shareURL);
  }
});

// ── Tab 切換 ──
const fab = document.getElementById('btn-fab');

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      const active = b === btn;
      b.className = `tab-btn py-3 px-5 text-sm font-semibold border-b-2 -mb-px ${
        active ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent'
      }`;
    });
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById(`pane-${tab}`).classList.remove('hidden');
    fab.classList.toggle('hidden', tab !== 'expense');
  });
});

// ── Modal ──
const modal = document.getElementById('modal-expense');
const modalIdentity = document.getElementById('modal-identity');

function showIdentityPicker(callback) {
  const chipsEl = document.getElementById('identity-chips');
  chipsEl.innerHTML = '';
  group.members.forEach(m => {
    const [bg, text] = memberColor(m.name);
    const btn = document.createElement('button');
    btn.className = `${bg} ${text} px-5 py-2.5 rounded-full text-sm font-semibold hover:opacity-80 transition`;
    btn.textContent = m.name;
    btn.addEventListener('click', () => {
      myId = m.id;
      localStorage.setItem(IDENTITY_KEY, myId);
      modalIdentity.classList.remove('open');
      renderMembers();
      renderStatusCard();
      if (callback) callback();
    });
    chipsEl.appendChild(btn);
  });
  modalIdentity.classList.add('open');
}

let _identityModalDown = false;
modalIdentity.addEventListener('pointerdown', e => { _identityModalDown = e.target === modalIdentity; });
modalIdentity.addEventListener('click', e => { if (e.target === modalIdentity && _identityModalDown) modalIdentity.classList.remove('open'); });

function openModal() {
  if (!group.members.length) {
    alert('請先新增成員再新增消費');
    return;
  }
  if (!myId) {
    showIdentityPicker(() => {
      renderExpenseForm();
      if (!editingExpenseId) {
        document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
        const ps = document.getElementById('select-payer');
        if (ps.querySelector(`option[value="${myId}"]`)) ps.value = myId;
      }
      modal.classList.add('open');
      setTimeout(() => document.getElementById('input-title').focus(), 100);
    });
    return;
  }
  renderExpenseForm();
  if (!editingExpenseId) {
    document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
    const ps = document.getElementById('select-payer');
    if (myId && ps.querySelector(`option[value="${myId}"]`)) ps.value = myId;
  }
  modal.classList.add('open');
  setTimeout(() => document.getElementById('input-title').focus(), 100);
}

function closeModal() {
  modal.classList.remove('open');
  clearExpenseForm();
}

fab.addEventListener('click', openModal);
document.getElementById('btn-modal-close').addEventListener('click', closeModal);
let _groupModalDown = false;
modal.addEventListener('pointerdown', e => { _groupModalDown = e.target === modal; });
modal.addEventListener('click', e => { if (e.target === modal && _groupModalDown) closeModal(); });

// ── 成員 + 身份 ──
const IDENTITY_KEY = `splitbill_identity_${CODE}`;
let myId = localStorage.getItem(IDENTITY_KEY) || null;
const myName = () => group.members.find(m => m.id === myId)?.name ?? null;
const FOLD_THRESHOLD = 6;
let membersExpanded = false;

function hasMemberExpenses(id) {
  return group.expenses.some(e => e.payer_id === id || e.participant_ids.includes(id));
}

// 根據名稱產生色彩（穩定）
const CHIP_COLORS = [
  ['bg-blue-100', 'text-blue-700'],
  ['bg-purple-100', 'text-purple-700'],
  ['bg-pink-100', 'text-pink-700'],
  ['bg-orange-100', 'text-orange-700'],
  ['bg-teal-100', 'text-teal-700'],
  ['bg-yellow-100', 'text-yellow-700'],
];

function memberColor(name) {
  return CHIP_COLORS[name.charCodeAt(0) % CHIP_COLORS.length];
}

function renderMembers() {
  const chips = document.getElementById('members-chips');
  chips.innerHTML = '';

  const total = group.members.length;
  const needsFold = !membersExpanded && total > FOLD_THRESHOLD && window.innerWidth < 768;

  let visible = group.members;
  if (needsFold) {
    const base = group.members.slice(0, FOLD_THRESHOLD);
    const myMember = myId && !base.find(m => m.id === myId)
      ? group.members.find(m => m.id === myId) : null;
    visible = myMember ? [...group.members.slice(0, FOLD_THRESHOLD - 1), myMember] : base;
  }

  visible.forEach(member => {
    const isMe = member.id === myId;
    const chip = document.createElement('div');
    chip.className = `inline-flex items-center rounded-full overflow-hidden border transition ${
      isMe ? 'bg-blue-600 border-blue-600' : 'bg-gray-100 border-gray-200'
    }`;

    const nameBtn = document.createElement('button');
    nameBtn.className = `px-3 py-1 text-xs font-medium ${isMe ? 'text-white' : 'text-gray-600'}`;
    nameBtn.title = isMe ? '點擊更換身份' : '點擊設為我的身份';
    nameBtn.textContent = member.name;
    nameBtn.addEventListener('click', () => {
      if (isMe) { showIdentityPicker(); return; }
      myId = member.id;
      localStorage.setItem(IDENTITY_KEY, myId);
      renderMembers();
      renderStatusCard();
    });
    chip.appendChild(nameBtn);

    if (!hasMemberExpenses(member.id) && !group.locked) {
      const del = document.createElement('button');
      del.className = `px-2 py-1 text-xs border-l transition ${isMe ? 'border-blue-500 text-blue-200 hover:text-white' : 'border-gray-200 text-gray-300 hover:text-red-400'}`;
      del.textContent = '×';
      del.addEventListener('click', async e => {
        await guardedAction(e.currentTarget, async () => {
          if (!confirm(`刪除「${member.name}」？`)) return;
          group.members = group.members.filter(m => m.id !== member.id);
          if (myId === member.id) { myId = null; localStorage.removeItem(IDENTITY_KEY); }
          group.last_action = { type: 'remove_member', actor: myName(), target: member.name };
          await saveGroup(group);
          membersExpanded = false;
          renderMembers();
          renderExpenseForm();
          renderPaymentSettings();
        });
      });
      chip.appendChild(del);
    }
    chips.appendChild(chip);
  });

  if (needsFold) {
    const hidden = total - visible.length;
    const badge = document.createElement('button');
    badge.className = 'px-3 py-1 text-xs font-medium bg-gray-100 border border-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition';
    badge.textContent = `+${hidden}`;
    badge.addEventListener('click', () => { membersExpanded = true; renderMembers(); });
    chips.appendChild(badge);
  } else if (total > FOLD_THRESHOLD && membersExpanded) {
    const badge = document.createElement('button');
    badge.className = 'px-3 py-1 text-xs font-medium bg-gray-100 border border-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition';
    badge.textContent = '收起';
    badge.addEventListener('click', () => { membersExpanded = false; renderMembers(); });
    chips.appendChild(badge);
  }

  if (!myId && group.members.length) {
    const hint = document.createElement('span');
    hint.className = 'text-xs text-gray-300 self-center';
    hint.textContent = '↑ 點選認領身份';
    chips.appendChild(hint);
  }
}

document.getElementById('btn-add-member').addEventListener('click', async e => {
  await guardedAction(e.currentTarget, async () => {
    const input = document.getElementById('input-member-name');
    const name = input.value.trim();
    if (!name) {
      input.classList.add('!border-red-400');
      setTimeout(() => input.classList.remove('!border-red-400'), 800);
      input.focus(); return;
    }
    if (group.members.some(m => m.name === name)) { alert(`「${name}」已存在`); return; }
    group.members.push({ id: uuid(), name, payment_info: '' });
    group.last_action = { type: 'add_member', actor: myName(), target: name };
    await saveGroup(group);
    input.value = '';
    membersExpanded = false;
    renderMembers();
    renderExpenseForm();
    renderPaymentSettings();
  });
});

imeEnter(document.getElementById('input-member-name'), () => document.getElementById('btn-add-member').click());

// ── 格式化 ──
function fmt(n) {
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ── 狀態卡 ──
function renderStatusCard() {
  const total = group.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  document.getElementById('total-amount').textContent = `$${fmt(total)}`;
  document.getElementById('expense-count').textContent = `${group.expenses.length} 筆`;

  const statusMy = document.getElementById('status-my');
  if (myId) {
    const myPaid = group.expenses.filter(e => e.payer_id === myId).reduce((s, e) => s + Number(e.amount), 0);
    const myOwed = group.expenses.filter(e => e.participant_ids.includes(myId)).reduce((s, e) => {
      if (e.split_type === 'custom' && e.custom_amounts) {
        return s + Number(e.custom_amounts[myId] || 0);
      }
      return s + Number(e.amount) / e.participant_ids.length;
    }, 0);
    document.getElementById('my-paid').textContent = `$${fmt(myPaid)}`;
    document.getElementById('my-owed').textContent = `$${fmt(Math.round(myOwed))}`;
    statusMy.classList.remove('hidden');
    statusMy.classList.add('flex');
  } else {
    statusMy.classList.add('hidden');
    statusMy.classList.remove('flex');
  }
}

// ── 個人消費明細 ──
const modalStatement = document.getElementById('modal-statement');

function openMyStatement() {
  const me = group.members.find(m => m.id === myId);
  if (!me) return;

  document.getElementById('statement-title').textContent = `${me.name} 的消費明細`;

  const myExpenses = [...group.expenses]
    .filter(e => e.participant_ids.includes(myId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const myPaid = group.expenses
    .filter(e => e.payer_id === myId)
    .reduce((s, e) => s + Number(e.amount), 0);
  let myOwed = 0;
  let paidInList = 0;
  const listEl = document.getElementById('statement-list');
  listEl.innerHTML = myExpenses.length ? '' : '<p class="text-sm text-gray-300 text-center py-4">尚無消費記錄</p>';

  myExpenses.forEach(e => {
    const rawShare = e.split_type === 'custom' && e.custom_amounts ? e.custom_amounts[myId] : undefined;
    if (e.split_type === 'custom' && e.custom_amounts && rawShare === undefined)
      console.warn('[splitbill] custom_amounts missing key:', myId, e.title);
    const share = rawShare !== undefined
      ? Number(rawShare)
      : (e.participant_ids.length ? Number(e.amount) / e.participant_ids.length : 0);
    const isPayer = e.payer_id === myId;
    if (isPayer) paidInList += Number(e.amount);
    const payer = group.members.find(m => m.id === e.payer_id);
    myOwed += share;

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-2.5 border-b border-gray-50';
    row.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium text-gray-900 truncate">${esc(e.title)}</div>
        <div class="text-xs text-gray-400">${esc(e.date)} · ${isPayer ? '<span class="text-emerald-600">我墊付</span>' : esc(payer?.name ?? '?') + ' 墊付'}</div>
      </div>
      <div class="text-sm font-semibold text-gray-800 flex-shrink-0 ml-3">$${fmt(Math.round(share))}</div>
    `;
    listEl.appendChild(row);
  });

  const paidForOthers = myPaid - paidInList;
  const net = myPaid - myOwed;
  document.getElementById('statement-footer').innerHTML = `
    <div class="w-full">
      ${paidForOthers > 0 ? `<div class="flex justify-between text-xs text-gray-400 mb-1.5"><span>代墊他人（未列入清單）</span><span class="text-gray-600">+$${fmt(Math.round(paidForOthers))}</span></div>` : ''}
      <div class="flex justify-between items-center">
        <span class="text-xs text-gray-400">淨額</span>
        <span class="text-base font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}">${net >= 0 ? `可收 $${fmt(Math.round(net))}` : `需補 $${fmt(Math.round(-net))}`}</span>
      </div>
    </div>
  `;

  modalStatement.classList.remove('hidden');
  modalStatement.classList.add('open');
}

document.getElementById('btn-my-statement').addEventListener('click', openMyStatement);
document.getElementById('btn-statement-close').addEventListener('click', () => {
  modalStatement.classList.remove('open');
  modalStatement.classList.add('hidden');
});
modalStatement.addEventListener('click', e => {
  if (e.target === modalStatement) {
    modalStatement.classList.remove('open');
    modalStatement.classList.add('hidden');
  }
});

// ── 消費表單 ──
function renderExpenseForm() {
  const payerSelect = document.getElementById('select-payer');
  const cbContainer = document.getElementById('participant-checkboxes');
  if (!group.members.length) return;

  const prevPayer = payerSelect.value || myId || group.members[0].id;
  const prevChecked = [...cbContainer.querySelectorAll('input:checked')].map(i => i.value);
  const prevAllIds  = [...cbContainer.querySelectorAll('input')].map(i => i.value);

  payerSelect.innerHTML = '';
  group.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.name;
    if (m.id === prevPayer) opt.selected = true;
    payerSelect.appendChild(opt);
  });

  cbContainer.innerHTML = '';
  group.members.forEach(m => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-1.5 cursor-pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = m.id;
    // 新成員（第一次出現）→ 預設勾選；既有成員 → 保留上次狀態
    cb.checked = prevAllIds.includes(m.id) ? prevChecked.includes(m.id) : true;
    cb.className = 'accent-blue-600';
    cb.addEventListener('change', () => renderCustomInputs());
    const span = document.createElement('span');
    span.className = 'text-sm text-gray-700';
    span.textContent = m.name;
    label.append(cb, span);
    cbContainer.appendChild(label);
  });

  payerSelect.onchange = () => {
    cbContainer.querySelectorAll('input').forEach(cb => {
      if (cb.value === payerSelect.value) cb.checked = true;
    });
  };
}

['input-title', 'input-amount', 'input-date'].forEach(id => {
  imeEnter(document.getElementById(id), () => document.getElementById('btn-add-expense').click());
});
document.getElementById('input-amount').addEventListener('input', () => { if (splitMode === 'custom') updateCustomHint(); });

document.getElementById('input-date').value = new Date().toISOString().split('T')[0];

// ── 消費 CRUD ──
let editingExpenseId = null;
let splitMode = 'equal';

function updateCustomHint() {
  const total = parseFloat(document.getElementById('input-amount').value) || 0;
  const sum = [...document.querySelectorAll('.custom-amt')].reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
  const hint = document.getElementById('custom-split-hint');
  const diff = Math.round((total - sum) * 100) / 100;
  if (diff === 0) {
    hint.textContent = '✓ 合計正確';
    hint.className = 'text-xs text-right mt-1 text-emerald-600';
  } else {
    hint.textContent = diff > 0 ? `還差 $${diff}` : `超出 $${Math.abs(diff)}`;
    hint.className = `text-xs text-right mt-1 ${diff > 0 ? 'text-orange-500' : 'text-red-500'}`;
  }
}

function renderCustomInputs(prevAmounts = {}) {
  const area = document.getElementById('custom-split-area');
  const hint = document.getElementById('custom-split-hint');
  if (splitMode !== 'custom') {
    area.classList.add('hidden');
    hint.classList.add('hidden');
    return;
  }
  const checked = [...document.querySelectorAll('#participant-checkboxes input:checked')];
  area.innerHTML = '';
  area.classList.remove('hidden');
  hint.classList.remove('hidden');
  checked.forEach(cb => {
    const member = group.members.find(m => m.id === cb.value);
    if (!member) return;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    const label = document.createElement('span');
    label.className = 'text-sm text-gray-600 w-16 flex-shrink-0 truncate';
    label.textContent = member.name;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.dataset.memberId = member.id;
    input.className = 'custom-amt flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 transition';
    input.placeholder = '0';
    if (prevAmounts[member.id] != null) input.value = prevAmounts[member.id];
    input.addEventListener('input', updateCustomHint);
    row.append(label, input);
    area.appendChild(row);
  });
  updateCustomHint();
}

document.getElementById('btn-split-equal').addEventListener('click', () => {
  splitMode = 'equal';
  document.getElementById('btn-split-equal').className = 'px-3 py-1.5 bg-blue-600 text-white transition';
  document.getElementById('btn-split-custom').className = 'px-3 py-1.5 text-gray-500 hover:bg-gray-50 transition';
  renderCustomInputs();
});

document.getElementById('btn-split-custom').addEventListener('click', () => {
  splitMode = 'custom';
  document.getElementById('btn-split-equal').className = 'px-3 py-1.5 text-gray-500 hover:bg-gray-50 transition';
  document.getElementById('btn-split-custom').className = 'px-3 py-1.5 bg-blue-600 text-white transition';
  renderCustomInputs();
});

document.getElementById('btn-add-expense').addEventListener('click', async e => {
  await guardedAction(e.currentTarget, async () => {
  const title  = document.getElementById('input-title').value.trim();
  const amount = parseFloat(document.getElementById('input-amount').value);
  const date   = document.getElementById('input-date').value;
  const payerId = document.getElementById('select-payer').value;
  const participantIds = [...document.querySelectorAll('#participant-checkboxes input:checked')].map(cb => cb.value);

  if (!title)                 { const el = document.getElementById('input-title');  el.classList.add('!border-red-400'); setTimeout(() => el.classList.remove('!border-red-400'), 800); el.focus(); return; }
  if (!amount || amount <= 0) { const el = document.getElementById('input-amount'); el.classList.add('!border-red-400'); setTimeout(() => el.classList.remove('!border-red-400'), 800); el.focus(); return; }
  if (!date)                  { document.getElementById('input-date').focus(); return; }
  if (!payerId)               { alert('請選擇付款人'); return; }
  if (!participantIds.length) { alert('至少選擇一位參與者'); return; }

  let custom_amounts = null;
  if (splitMode === 'custom') {
    const inputs = [...document.querySelectorAll('.custom-amt')];
    if (inputs.some(i => (parseFloat(i.value) || 0) < 0)) { alert('自訂金額不可為負數'); return; }
    const sum = inputs.reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    if (Math.round(Math.abs(sum - amount) * 100) > 0) { alert('自訂金額合計須等於總金額'); return; }
    custom_amounts = {};
    inputs.forEach(i => { custom_amounts[i.dataset.memberId] = parseFloat(i.value) || 0; });
  }

  const expenseData = { title, amount, date, payer_id: payerId, participant_ids: participantIds, split_type: splitMode, custom_amounts };
  if (editingExpenseId) {
    const idx = group.expenses.findIndex(e => e.id === editingExpenseId);
    if (idx !== -1) group.expenses[idx] = { ...group.expenses[idx], ...expenseData };
    group.last_action = { type: 'edit_expense', actor: myName(), title, amount };
  } else {
    group.expenses.push({ id: uuid(), ...expenseData, created_at: new Date().toISOString() });
    const payer = group.members.find(m => m.id === payerId)?.name ?? null;
    group.last_action = { type: 'add_expense', actor: payer, title, amount };
  }

  const highlightId = editingExpenseId ? null : group.expenses[group.expenses.length - 1].id;
  await saveGroup(group);
  closeModal();
  renderExpenseCards(highlightId);
  renderStatusCard();
  renderSettleResult(calcSettlement());
  renderPaymentSettings();
  });
});

function clearExpenseForm() {
  document.getElementById('input-title').value = '';
  document.getElementById('input-amount').value = '';
  document.getElementById('input-date').value = new Date().toISOString().split('T')[0];
  const ps = document.getElementById('select-payer');
  if (myId && ps.querySelector(`option[value="${myId}"]`)) ps.value = myId;
  document.querySelectorAll('#participant-checkboxes input').forEach(cb => cb.checked = true);
  editingExpenseId = null;
  splitMode = 'equal';
  document.getElementById('btn-split-equal').className = 'px-3 py-1.5 bg-blue-600 text-white transition';
  document.getElementById('btn-split-custom').className = 'px-3 py-1.5 text-gray-500 hover:bg-gray-50 transition';
  renderCustomInputs();
  document.getElementById('modal-title').textContent = '新增消費';
  document.getElementById('btn-add-expense').textContent = '新增消費';
}

function loadExpenseToForm(expense) {
  document.getElementById('input-title').value = expense.title;
  document.getElementById('input-amount').value = expense.amount;
  document.getElementById('input-date').value = expense.date;
  document.getElementById('select-payer').value = expense.payer_id;
  document.querySelectorAll('#participant-checkboxes input').forEach(cb => {
    cb.checked = expense.participant_ids.includes(cb.value);
  });
  splitMode = expense.split_type === 'custom' ? 'custom' : 'equal';
  document.getElementById('btn-split-equal').className = splitMode === 'equal'
    ? 'px-3 py-1.5 bg-blue-600 text-white transition'
    : 'px-3 py-1.5 text-gray-500 hover:bg-gray-50 transition';
  document.getElementById('btn-split-custom').className = splitMode === 'custom'
    ? 'px-3 py-1.5 bg-blue-600 text-white transition'
    : 'px-3 py-1.5 text-gray-500 hover:bg-gray-50 transition';
  renderCustomInputs(expense.custom_amounts || {});
  editingExpenseId = expense.id;
  document.getElementById('modal-title').textContent = '編輯消費';
  document.getElementById('btn-add-expense').textContent = '更新消費';
  openModal();
}

// ── 消費卡片（icon = 首字 + 色彩） ──
const ICON_COLORS = ['bg-orange-100 text-orange-600','bg-blue-100 text-blue-600','bg-purple-100 text-purple-600','bg-pink-100 text-pink-600','bg-teal-100 text-teal-600','bg-yellow-100 text-yellow-600'];

function renderExpenseCards(highlightId = null) {
  const container = document.getElementById('expense-cards');
  container.innerHTML = '';

  if (!group.expenses.length) {
    container.innerHTML = `<div class="text-center py-14">
      <svg class="mx-auto mb-3 text-gray-200" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="3"/>
        <path d="M2 10h20"/><path d="M6 15h4"/><path d="M14 15h4"/>
      </svg>
      <p class="text-gray-300 text-sm">尚無消費記錄</p>
      <p class="text-gray-200 text-xs mt-1">點擊下方按鈕新增</p>
    </div>`;
    return;
  }

  [...group.expenses]
    .sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : b.created_at.localeCompare(a.created_at))
    .forEach(expense => {
      const payer = group.members.find(m => m.id === expense.payer_id);
      const iconColor = ICON_COLORS[expense.title.charCodeAt(0) % ICON_COLORS.length];

      const card = document.createElement('div');
      card.className = 'bg-white border border-gray-100 p-4 rounded-3xl flex items-center gap-4 shadow-sm hover:border-blue-100 transition';

      card.innerHTML = `
        <div class="w-14 h-14 rounded-2xl ${iconColor} text-xl font-bold flex items-center justify-center flex-shrink-0">
          ${esc(expense.title[0] ?? '?')}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-baseline mb-0.5">
            <h4 class="font-semibold text-gray-950 text-base truncate pr-2">${esc(expense.title)}</h4>
            <span class="text-xl font-bold text-gray-950 flex-shrink-0">$${fmt(expense.amount)}</span>
          </div>
          <p class="text-sm text-gray-400">${esc(expense.date)} | ${esc(payer?.name ?? '?')} 墊付 · ${expense.split_type === 'custom' ? '自訂分攤' : `${expense.participant_ids.length} 人均分`}</p>
          ${!group.locked ? `<div class="expense-card-actions flex gap-1 mt-2">
            <button class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition edit-btn" aria-label="編輯">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition del-btn" aria-label="刪除">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>` : ''}
        </div>
      `;

      if (!group.locked) card.querySelector('.edit-btn').addEventListener('click', () => loadExpenseToForm(expense));
      if (!group.locked) card.querySelector('.del-btn').addEventListener('click', async e => {
        await guardedAction(e.currentTarget, async () => {
          if (!confirm(`確定刪除「${expense.title}」？`)) return;
          group.expenses = group.expenses.filter(e => e.id !== expense.id);
          group.last_action = { type: 'delete_expense', actor: myName(), title: expense.title, amount: expense.amount };
          await saveGroup(group);
          renderExpenseCards();
          renderStatusCard();
          renderSettleResult(calcSettlement());
          renderPaymentSettings();
        });
      });

      if (expense.id === highlightId) card.classList.add('card-new');
      container.appendChild(card);
    });
}

// ── 結算演算法 ──
function calcSettlement() {
  const bal = {};
  group.members.forEach(m => { bal[m.id] = 0; });
  group.expenses.forEach(e => {
    if (bal[e.payer_id] !== undefined) bal[e.payer_id] += Number(e.amount);
    if (e.split_type === 'custom' && e.custom_amounts) {
      e.participant_ids.forEach(id => {
        if (bal[id] !== undefined) bal[id] -= Number(e.custom_amounts[id] || 0);
      });
    } else {
      const share = e.participant_ids.length ? Number(e.amount) / e.participant_ids.length : 0;
      e.participant_ids.forEach(id => {
        if (bal[id] !== undefined) bal[id] -= share;
      });
    }
  });
  Object.keys(bal).forEach(id => { bal[id] = Math.round(bal[id]); }); // 確保整數

  const ri = n => Math.round(n); // 整數
  const creditors = group.members.filter(m => bal[m.id] > 0).map(m => ({ ...m, bal: bal[m.id] })).sort((a,b) => b.bal - a.bal);
  const debtors   = group.members.filter(m => bal[m.id] < 0).map(m => ({ ...m, bal: bal[m.id] })).sort((a,b) => a.bal - b.bal);

  const transfers = [];
  while (creditors.length && debtors.length) {
    const c = creditors[0], d = debtors[0];
    const amount = ri(Math.min(c.bal, -d.bal));
    if (amount > 0) transfers.push({ from_id: d.id, from_name: d.name, to_id: c.id, to_name: c.name, amount, payment_info: c.payment_info || '' });
    c.bal = ri(c.bal - amount); d.bal = ri(d.bal + amount);
    if (c.bal <= 0) creditors.shift();
    if (d.bal >= 0) debtors.shift();
  }
  return transfers;
}

function renderSettleResult(transfers) {
  const container = document.getElementById('settle-result');
  container.innerHTML = '';
  // 清除帳目金額變動後殘留的孤兒 key
  const validKeys = new Set(transfers.map(t => `${t.from_id}_${t.to_id}_${Math.round(t.amount * 100)}`));
  const stale = Object.keys(group.paid_transfers || {}).filter(k => !validKeys.has(k));
  if (stale.length) {
    stale.forEach(k => delete group.paid_transfers[k]);
    saveGroup(group);
  }
  const btn = document.getElementById('btn-save-settlement');

  if (!group.expenses.length) {
    container.innerHTML = `<p class="text-gray-300 text-sm">尚無消費記錄</p>`;
    btn.classList.add('hidden'); return;
  }

  btn.classList.toggle('hidden', group.locked);

  if (!transfers.length) {
    container.innerHTML = `<p class="text-emerald-600 font-semibold text-sm">✓ 已平帳，無需轉帳</p>`;
    return;
  }

  // ── 進度條 ──
  const totalAmt = transfers.reduce((s, t) => s + t.amount, 0);
  const paidAmt  = transfers.reduce((s, t) => {
    const k = `${t.from_id}_${t.to_id}_${Math.round(t.amount * 100)}`;
    return s + (group.paid_transfers[k] ? t.amount : 0);
  }, 0);
  const pct = totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0;
  const allDone = pct === 100;
  const bar = document.createElement('div');
  bar.className = 'mb-3';
  bar.innerHTML = `
    <div class="flex justify-between text-xs mb-1">
      <span class="text-gray-400">已結清 <span class="font-semibold text-gray-600">$${fmt(paidAmt)}</span></span>
      <span class="font-semibold ${allDone ? 'text-emerald-600' : 'text-gray-400'}">${pct}%</span>
    </div>
    <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-400' : 'bg-emerald-500'}" style="width:${pct}%"></div>
    </div>
    ${allDone ? '<p class="text-xs text-emerald-600 font-semibold mt-1">✓ 全部結清！</p>' : `<p class="text-xs text-gray-300 mt-1">待結清 $${fmt(totalAmt - paidAmt)}</p>`}
  `;
  container.appendChild(bar);

  transfers.forEach(t => {
    const key = `${t.from_id}_${t.to_id}_${Math.round(t.amount * 100)}`;
    const paid = !!group.paid_transfers[key];
    const div = document.createElement('div');
    div.className = `flex items-center justify-between p-4 rounded-2xl border transition ${paid ? 'bg-gray-50 border-gray-100' : 'bg-emerald-50 border-emerald-100'}`;
    div.innerHTML = `
      <div>
        <div class="flex items-center gap-1.5 text-sm ${paid ? 'text-gray-300' : ''}">
          <span class="font-semibold">${esc(t.from_name)}</span>
          <span class="text-base ${paid ? '' : 'text-emerald-500'}">→</span>
          <span class="font-semibold">${esc(t.to_name)}</span>
        </div>
        ${t.payment_info && !paid ? `<div class="text-xs text-gray-400 mt-0.5">收款：${esc(t.payment_info)}</div>` : ''}
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-lg font-bold ${paid ? 'text-gray-300 line-through' : 'text-emerald-700'}">$${fmt(t.amount)}</span>
        <button class="transfer-toggle text-xs px-2.5 py-1 rounded-full border transition ${paid ? 'bg-gray-100 border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200' : 'border-emerald-400 text-emerald-600 hover:bg-emerald-100'}">${paid ? '撤銷' : '標記已付'}</button>
      </div>
    `;
    div.querySelector('.transfer-toggle').addEventListener('click', async () => {
      const wasPaid = !!group.paid_transfers[key];
      if (wasPaid) { delete group.paid_transfers[key]; } else { group.paid_transfers[key] = true; }
      group.last_action = { type: 'toggle_transfer', actor: myName(), paid: !wasPaid, from: t.from_name, to: t.to_name, amount: t.amount };
      await saveGroup(group);
      renderSettleResult(calcSettlement());
      renderPaymentSettings();
    });
    container.appendChild(div);
  });

  btn.classList.toggle('hidden', group.locked);
  btn.dataset.pending = JSON.stringify(transfers);
}

function renderSettlementHistory() {
  const container = document.getElementById('settlement-history');
  container.innerHTML = '';
  if (!group.settlements.length) return;

  const title = document.createElement('p');
  title.className = 'text-xs text-gray-300 uppercase tracking-wider mt-4 mb-2';
  title.textContent = '歷史紀錄';
  container.appendChild(title);

  [...group.settlements].reverse().forEach(s => {
    const div = document.createElement('div');
    div.className = 'pl-3 border-l-2 border-blue-200 mb-2';
    const dt = new Date(s.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const summary = s.transfers.length ? s.transfers.map(t => `${esc(t.from_name)}→${esc(t.to_name)} $${fmt(t.amount)}`).join('、') : '已平帳';
    div.innerHTML = `<p class="text-xs font-semibold text-gray-500">${dt}</p><p class="text-xs text-gray-400">${summary}</p>`;
    container.appendChild(div);
  });
}

document.getElementById('btn-save-settlement').addEventListener('click', async e => {
  await guardedAction(e.currentTarget, async () => {
    if (!confirm('確認結束此群組？結束後消費記錄將鎖定，可點「解除鎖定」繼續編輯。')) return;
    const transfers = calcSettlement();
    if (transfers.length) {
      group.settlements.push({ id: uuid(), created_at: new Date().toISOString(), transfers });
    }
    group.locked = true;
    group.last_action = { type: 'lock', actor: myName() };
    await saveGroup(group);
    applyLockState();
    renderSettlementHistory();
  });
});

// ── 收款設定 ──
function renderPaymentSettings() {
  const container = document.getElementById('payment-list');
  container.innerHTML = '';
  if (!group.members.length) {
    container.innerHTML = `<p class="text-gray-300 text-sm">尚無成員</p>`; return;
  }
  const transfers = calcSettlement();
  const creditorIds = [...new Set(transfers.map(t => t.to_id))];
  const targets = group.expenses.length && creditorIds.length
    ? group.members.filter(m => creditorIds.includes(m.id))
    : group.members;
  targets.forEach(member => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 py-2 border-b border-gray-50 last:border-0';
    const name = document.createElement('span');
    name.className = 'text-sm font-medium text-gray-700 w-14 flex-shrink-0';
    name.textContent = member.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'flex-1 text-sm px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 transition';
    input.value = member.payment_info || '';
    input.placeholder = 'LINE Pay / 銀行帳號 / 街口';
    const _origPaymentInfo = member.payment_info || '';
    input.addEventListener('blur', async () => {
      const newVal = input.value.trim();
      if (newVal === _origPaymentInfo) return;
      member.payment_info = newVal;
      await saveGroup(group);
      renderSettleResult(calcSettlement());
      renderStatusCard();
    });
    imeEnter(input, () => input.blur());
    row.append(name, input);
    container.appendChild(row);
  });
}

// ── 初始化 ──
applyLockState();
renderExpenseForm();
renderStatusCard();
renderSettlementHistory();
renderPaymentSettings();
