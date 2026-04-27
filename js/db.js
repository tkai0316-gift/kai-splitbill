// 資料層：localStorage mock，Step 9 換成 Supabase 時只改這個檔

const KEY = code => `splitbill_group_${code}`;

export function uuid() {
  try { return crypto.randomUUID(); } catch (_) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function getGroup(code) {
  const raw = localStorage.getItem(KEY(code));
  return raw ? JSON.parse(raw) : null;
}

export function saveGroup(group) {
  localStorage.setItem(KEY(group.share_code), JSON.stringify(group));
}

export function createGroup(name) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const group = {
    id: uuid(),
    name,
    share_code: code,
    members: [],
    expenses: [],
    settlements: [],
    paid_transfers: {},
    locked: false,
    created_at: new Date().toISOString(),
  };
  saveGroup(group);
  return group;
}
