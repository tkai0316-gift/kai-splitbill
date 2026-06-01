# kai-splitbill 專案規則

## 技術棧

- 前端：Vanilla JS + Tailwind CDN
- 後端：Cloudflare Pages + Supabase Edge Function（telegram-notify）
- 部署：Cloudflare Pages（push to main 自動部署）
- 設計優先：Mobile-first

## XSS 防護
- `esc()` 目前在 `home.js` / `group.js` 各自定義（無 utils.js）
- 新增模組時應先建立 `utils.js` 集中定義並 export，不再另起一份
- `href` 動態插值目前用 `esc()` 處理 query param，可接受；若未來有外部 URL 插值需補 `safeUrl()`

## 安全
- 前端直接用 anon key 打 Supabase，防線全靠 RLS，新增 table 必設 RLS
- anon key 為 `sb_publishable_*` 開頭，設計公開，真正防線是 RLS policy
