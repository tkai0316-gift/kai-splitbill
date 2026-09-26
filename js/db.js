import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://cbdqlyprejzvndvesfpa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZHFseXByZWp6dm5kdmVzZnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTExNDEsImV4cCI6MjA5MjQ4NzE0MX0.Ir5R3F_J7xe-biBB1Gai0Bdt6bUjUJo-ygRGCyyUnFA'
);

let currentVersion = 0;
let saveSeq = 0;                 // 每次存檔 +1：讀取期間若有存檔，讀回的資料可能比記憶體舊，要丟棄
const pendingSaves = new Set();

// 版本衝突（別人剛存過）：呼叫端照一般失敗處理 revert，再重抓最新資料
export class ConflictError extends Error {
  constructor() { super('有人剛更新了資料'); this.name = 'ConflictError'; }
}

export function uuid() {
  try { return crypto.randomUUID(); } catch (_) { /* noop */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function fetchRow(code) {
  // 2026-09-18 改走 SECURITY DEFINER RPC（ADR-013 Tier D）：主表不再對 anon 開放，防不帶 share_code 的枚舉
  const { data, error } = await supabase
    .rpc('splitbill_get', { p_code: code })
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message); // PGRST116＝查無此代碼，不算連線錯誤
  return data ?? null;
}

// 連線失敗會 throw；查無此群組回 null
export async function getGroup(code) {
  const row = await fetchRow(code);
  if (row) currentVersion = row.version ?? 0;
  return row?.data ?? null;
}

// 重抓最新版：先等自己送出中的存檔落地，抓取期間若又有存檔就丟棄結果（避免舊資料蓋回記憶體）。
// onlyIfNewer：版本沒變回 null；canApply：抓回後呼叫端已不能套用（例如正在輸入）就回 null 且不動版本號
export async function fetchLatest(code, { onlyIfNewer = false, canApply = () => true } = {}) {
  await Promise.allSettled([...pendingSaves]);
  const seq = saveSeq;
  const row = await fetchRow(code);
  if (!row || seq !== saveSeq || pendingSaves.size || !canApply()) return null;
  const version = row.version ?? 0;
  if (onlyIfNewer && version === currentVersion) return null;
  currentVersion = version;
  return row.data;
}

export async function saveGroup(group) {
  saveSeq++;
  // Promise.resolve 包一層：supabase builder 每次 then 都會重送請求，fetchLatest 的 allSettled 不能再觸發一次
  const req = Promise.resolve(supabase
    .rpc('splitbill_save', { p_code: group.share_code, p_data: group, p_version: currentVersion }));
  pendingSaves.add(req);
  let res;
  try { res = await req; } finally { pendingSaves.delete(req); }

  // 網路 / RLS 錯誤 → throw 給呼叫端 revert；回空陣列＝版本已被別人改過
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new ConflictError();
  currentVersion = res.data[0].version;
}

export async function createGroup(name) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
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
    const { error } = await supabase
      .rpc('splitbill_create', { p_code: code, p_data: group });
    if (!error) {
      currentVersion = 0;
      return group;
    }
    lastError = error;
    if (error.code !== '23505') break; // 只有撞碼（unique violation）才換碼重試
  }
  throw lastError;
}

export async function guardedAction(el, asyncFn) {
  if (el?._busy) return
  if (el) { el._busy = true; el.disabled = true }
  try { await asyncFn() }
  finally { if (el) { el._busy = false; el.disabled = false } }
}
