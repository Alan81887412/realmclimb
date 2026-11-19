/* Supabase 設定。url 或金鑰沒填＝不用 Supabase，遊戲照舊存在本機。
   填法：Supabase 後台 → Project Settings → API Keys：
   - url：Project URL（https://xxxx.supabase.co）
   - publishableKey：新版「Publishable key」（sb_publishable_… 開頭）。舊專案還在用 anon 金鑰（eyJ… 開頭）的話填 anonKey 也行（兩個都填以 publishableKey 為準）。
   這兩種都是公開金鑰，放網頁裡沒問題；安全靠資料庫的 RLS（見 sql/schema.sql）。
   絕對不要貼 後台的 secret（私密）金鑰。
   getCaptchaToken：預留給匿名登入的 CAPTCHA（開了才需要；回傳 Promise<token>），第一版留 null。
   relayUrl：多人連線中繼伺服器（wss://…，Cloudflare Durable Object；協定見 ws協定.md）。有值＝多人連線改走它（user／db 仍用 Supabase）；空字串＝多人連線走 Supabase Realtime。網址也可用 ?relay=wss://… 臨時指定。 */
export const SB = { url: "https://neouufqengayfuessbal.supabase.co", publishableKey: "sb_publishable_p_7pG-EdJ69o01ejRLPM3w_qRB4HX7H", anonKey: '', getCaptchaToken: null, relayUrl: '' };
