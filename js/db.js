import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://cbdqlyprejzvndvesfpa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZHFseXByZWp6dm5kdmVzZnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTExNDEsImV4cCI6MjA5MjQ4NzE0MX0.Ir5R3F_J7xe-biBB1Gai0Bdt6bUjUJo-ygRGCyyUnFA'
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
    .from('splitbill_groups')
    .select('data')
    .eq('share_code', code)
    .single();
  return data?.data ?? null;
}

export async function saveGroup(group) {
  await supabase.from('splitbill_groups').upsert({
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
