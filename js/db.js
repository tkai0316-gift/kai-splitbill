import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
  'https://cbdqlyprejzvndvesfpa.supabase.co',
  'sb_publishable_YVutBvxGMw_PC37YURYsKA_AXn32IKZ'
);

export function uuid() {
  try { return crypto.randomUUID(); } catch (_) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function getGroup(code) {
  const { data } = await supabase
    .from('groups')
    .select('data')
    .eq('share_code', code)
    .single();
  return data?.data ?? null;
}

export async function saveGroup(group) {
  await supabase.from('groups').upsert({
    share_code: group.share_code,
    data: group,
    updated_at: new Date().toISOString()
  });
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
  await saveGroup(group);
  return group;
}
