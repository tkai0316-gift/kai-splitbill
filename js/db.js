import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://cbdqlyprejzvndvesfpa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZHFseXByZWp6dm5kdmVzZnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTExNDEsImV4cCI6MjA5MjQ4NzE0MX0.Ir5R3F_J7xe-biBB1Gai0Bdt6bUjUJo-ygRGCyyUnFA'
);

let currentVersion = 0;

function showConflictToast() {
  const el = document.createElement('div');
  el.textContent = '資料已被他人更新，即將重新載入…';
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:8px;font-size:.85rem;z-index:9999;color:#fff;background:#dc2626;font-family:Outfit,sans-serif';
  document.body.appendChild(el);
  setTimeout(() => location.reload(), 2000);
}

export function uuid() {
  try { return crypto.randomUUID(); } catch (_) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function getGroup(code) {
  const { data } = await supabase
    .from('splitbill_groups')
    .select('data, version')
    .eq('share_code', code)
    .single();
  if (data) currentVersion = data.version ?? 0;
  return data?.data ?? null;
}

export async function saveGroup(group) {
  const { data } = await supabase
    .from('splitbill_groups')
    .update({
      data: group,
      updated_at: new Date().toISOString(),
      version: currentVersion + 1
    })
    .eq('share_code', group.share_code)
    .eq('version', currentVersion)
    .select('version');

  if (!data?.length) {
    showConflictToast();
    return;
  }
  currentVersion = data[0].version;
}

export async function createGroup(name) {
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
    .from('splitbill_groups')
    .insert({ share_code: code, data: group, updated_at: new Date().toISOString() });
  if (error) throw error;
  currentVersion = 0;
  return group;
}

export async function guardedAction(el, asyncFn) {
  if (el?._busy) return
  if (el) { el._busy = true; el.disabled = true }
  try { await asyncFn() }
  finally { if (el) { el._busy = false; el.disabled = false } }
}
