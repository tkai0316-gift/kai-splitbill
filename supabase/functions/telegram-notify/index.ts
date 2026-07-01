const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const CHAT_ID   = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const BASE_URL  = 'https://kai-splitbill.pages.dev';

async function sendMessage(text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  });
}

function fmt(n: number) {
  return Number(n).toLocaleString('en-US');
}

function fmtAmt(amount: number, currency?: string, exchange_rate?: number): string {
  if (currency && currency !== 'TWD' && exchange_rate && exchange_rate > 0) {
    const twd = Math.round(amount * exchange_rate);
    return `${currency} ${fmt(amount)} (≈NT$${fmt(twd)})`;
  }
  return `NT$${fmt(Math.round(amount))}`;
}

function groupLink(code: string, name: string) {
  return `[${name}](${BASE_URL}/group.html?code=${code})`;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function isSplitbillEnabled(): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_settings?key=eq.module_splitbill&select=value`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  const rows = await res.json();
  return rows?.[0]?.value !== 'false';
}

Deno.serve(async (req) => {
  try {
    if (!await isSplitbillEnabled()) return new Response('ok');

    const { type, table, record, old_record } = await req.json();
    if (table !== 'splitbill_groups') return new Response('ok');

    const code     = record?.share_code ?? old_record?.share_code ?? '';
    const data     = record?.data ?? {};
    const old_data = old_record?.data ?? {};
    const name     = data.name ?? old_data.name ?? code;
    const link     = groupLink(code, name);

    if (type === 'INSERT') {
      await sendMessage(`📋 新群組建立：${link}`);
      return new Response('ok');
    }

    if (type !== 'UPDATE') return new Response('ok');

    // 優先讀 last_action
    const a = data.last_action;
    const old_a = old_data.last_action;

    if (a && JSON.stringify(a) !== JSON.stringify(old_a)) {
      const actor = a.actor ?? '某人';
      let msg = '';
      switch (a.type) {
        case 'add_member':
          msg = `👤 ${actor} 新增了成員 ${a.target}`; break;
        case 'remove_member':
          msg = `👤 ${actor} 移除了 ${a.target}`; break;
        case 'add_expense':
          msg = `💸 ${actor} 付了 ${a.title} ${fmtAmt(a.amount, a.currency, a.exchange_rate)}`; break;
        case 'edit_expense':
          msg = `✏️ ${actor} 編輯了 ${a.title} ${fmtAmt(a.amount, a.currency, a.exchange_rate)}`; break;
        case 'delete_expense':
          msg = `🗑 ${actor} 刪除了 ${a.title} ${fmtAmt(a.amount, a.currency, a.exchange_rate)}`; break;
        case 'toggle_transfer':
          msg = a.paid
            ? `✅ ${actor} 標記已付：${a.from} → ${a.to} NT$${fmt(a.amount)}`
            : `↩️ ${actor} 撤銷付款：${a.from} → ${a.to} NT$${fmt(a.amount)}`; break;
        case 'lock':
          msg = `🔒 ${actor} 鎖定群組並結算`; break;
        default:
          msg = `📝 資料更新`;
      }
      await sendMessage(`${link}\n${msg}`);
      return new Response('ok');
    }

    // fallback：diff 邏輯
    const members: any[] = data.members ?? [];
    const memberName = (id: string) => members.find((m: any) => m.id === id)?.name ?? '某人';

    const oldMembers: any[] = old_data.members ?? [];
    const newMembers: any[] = data.members ?? [];
    if (newMembers.length > oldMembers.length) {
      const oldIds = new Set(oldMembers.map((m: any) => m.id));
      const added = newMembers.filter((m: any) => !oldIds.has(m.id));
      await sendMessage(`${link}\n👤 新增成員：${added.map((m: any) => m.name).join('、')}`);
      return new Response('ok');
    }
    if (newMembers.length < oldMembers.length) {
      const newIds = new Set(newMembers.map((m: any) => m.id));
      const removed = oldMembers.filter((m: any) => !newIds.has(m.id));
      await sendMessage(`${link}\n👤 ${removed.map((m: any) => m.name).join('、')} 已移除`);
      return new Response('ok');
    }

    const oldExp: any[] = old_data.expenses ?? [];
    const newExp: any[] = data.expenses ?? [];
    if (newExp.length > oldExp.length) {
      const e = newExp[newExp.length - 1];
      await sendMessage(`${link}\n💸 ${memberName(e.payer_id)} 付了 ${e.title ?? '未命名'} ${fmtAmt(e.amount, e.currency, e.exchange_rate)}`);
      return new Response('ok');
    }
    if (newExp.length < oldExp.length) {
      const newIds = new Set(newExp.map((e: any) => e.id));
      const deleted = oldExp.find((e: any) => !newIds.has(e.id));
      await sendMessage(`${link}\n🗑 消費刪除：${deleted?.title ?? '未命名'} ${fmtAmt(deleted?.amount ?? 0, deleted?.currency, deleted?.exchange_rate)}`);
      return new Response('ok');
    }

    const oldPaid: Record<string, boolean> = old_data.paid_transfers ?? {};
    const newPaid: Record<string, boolean> = data.paid_transfers ?? {};
    const added   = Object.keys(newPaid).filter(k => !oldPaid[k]);
    const removed = Object.keys(oldPaid).filter(k => !newPaid[k]);
    if (added.length || removed.length) {
      const settlements: any[] = data.settlements ?? [];
      const lastTransfers: any[] = settlements[settlements.length - 1]?.transfers ?? [];
      const lookup = (key: string) => {
        const parts = key.split('_');
        const amountCents = parseInt(parts[parts.length - 1]);
        const toId   = parts[parts.length - 2];
        const fromId = parts.slice(0, parts.length - 2).join('_');
        const t = lastTransfers.find((x: any) => x.from_id === fromId && x.to_id === toId);
        return t ? `${t.from_name} → ${t.to_name} $${fmt(amountCents / 100)}` : `$${fmt(amountCents / 100)}`;
      };
      const lines: string[] = [];
      added.forEach(k   => lines.push(`✅ 標記已付：${lookup(k)}`));
      removed.forEach(k => lines.push(`↩️ 撤銷付款：${lookup(k)}`));
      await sendMessage(`${link}\n${lines.join('\n')}`);
      return new Response('ok');
    }

    if (old_data.locked !== data.locked) {
      await sendMessage(`${link}\n${data.locked ? '🔒 群組已鎖定' : '🔓 群組已解除鎖定'}`);
      return new Response('ok');
    }

    await sendMessage(`${link}\n📝 資料更新`);
    return new Response('ok');

  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });
  }
});
