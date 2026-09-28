# kai-splitbill 專案規則

## Agent Navigation（讀 code 前先看）

| 要找什麼 | 先看這裡 |
|---------|---------|
| 首頁（建立/加入群組） | `index.html` + `js/home.js` |
| 群組頁（消費/結算/收款） | `group.html` + `js/group.js` |
| DB 存取（optimistic lock） | `js/db.js` |
| XSS 工具 / 共用函式 | `js/utils.js`（`esc()` / `safeParse()` 唯一來源） |
| Telegram 通知 | `supabase/functions/telegram-notify/` |
| 多幣別匯率 | `js/group.js` 內（open.er-api.com，結算固定 TWD） |

## 技術棧

- 前端：Vanilla JS + Tailwind CDN
- 後端：Cloudflare Pages + Supabase Edge Function（telegram-notify）
- 部署：Cloudflare Pages（push to main 自動部署）
- 設計優先：Mobile-first

## 結算規則（2026-09-28）
- 各人淨額用**最大餘數法**取整（`calcBalances`）：合計仍為 0、每人誤差 < $1。不得改回付款人吸收或各自四捨五入（差額會集中到一人，隨機壓測可達 $5～6）
- 結算頁、個人明細淨額、概覽卡「我應付」都由同一份轉帳推回（`myNet`），不要各自 `Math.round`
- **已結束（locked）的群組讀 `settlements` 最後一筆快照，不重算**：大家照那份金額轉帳，`paid_transfers` 的 key 含金額，重算會讓已付標記失效。結束群組時已平帳也存空快照
- 改取整或配對算法前，先模擬現有群組的 `paid_transfers` 會不會失效
- 🔴 **kai-admin 後台 Excel 匯出有一份同算法副本**（`kai-admin/js/splitbill.js` 的 `calcSettlement`／`calcBalances`）：改這裡的取整、配對或快照規則，要同步改那邊

## XSS 防護
- `esc()` / `safeUrl()` 已集中在 `utils.js` 定義並 export（2026-06-01 資安修補），各模組 import，禁止 local 重複定義
- `href` 動態插值必須套 `safeUrl()`

## 安全
- 前端直接用 anon key 打 Supabase，防線全靠 RLS，新增 table 必設 RLS
- anon key 為 `sb_publishable_*` 開頭，設計公開，真正防線是 RLS policy
