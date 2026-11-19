/* Supabase client 單例＋匿名登入＋session 保存／重連。
   getClient() 回傳 Promise<client>；測試時可被替換：
   - 網址帶 ?sbfake=ws://127.0.0.1:PORT → 動態載入 <site>/test/fake-supabase/client.js 的 createFakeClient(wsUrl)（M4 提供）
   - node 單元測試 → __setClient(假物件) */
import { SB } from './config.js';

export const SESSION_KEY = 'dengjie-sb-auth'; /* supabase-js 存 session 的 localStorage 鍵 */
let client = null, clientP = null, sessP = null, curUid = null, wired = false;

const qs = () => { try { return typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null; } catch (e) { return null; } };
export const fakeUrl = () => { const q = qs(); return q && q.has('sbfake') ? q.get('sbfake') || '' : null; }; /* null＝沒有 sbfake；字串＝假後端網址 */
export const isFake = () => fakeUrl() !== null;
export const sbKey = () => SB.publishableKey || SB.anonKey || ''; /* 新版 publishable key（sb_publishable_…）優先，相容舊 anon 金鑰（eyJ…） */
export const configured = () => isFake() || !!(SB.url && sbKey());

export function sbError(code, message, extra) { const e = new Error(message || code); e.code = code; if (extra) Object.assign(e, extra); return e; }
export const withTimeout = (p, ms, what) => new Promise((res, rej) => { const t = setTimeout(() => rej(sbError('timeout', (what || 'request') + ' timeout')), Math.max(1, ms)); Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

async function make() {
  const f = fakeUrl();
  if (f !== null) { const m = await import('../../test/fake-supabase/client.js'); return await m.createFakeClient(f); }
  if (!SB.url || !sbKey()) throw sbError('not_configured', 'Supabase 沒有設定');
  const { createClient } = await import('./vendor/supabase.js');
  return createClient(SB.url, sbKey(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: SESSION_KEY } });
}
export function getClient() {
  if (client) return Promise.resolve(client);
  if (!clientP) clientP = make().then(c => { client = c; wire(c); return c; }, e => { clientP = null; throw e; });
  return clientP;
}

/* 斷線重連：網路回來時叫 getSession 一下（supabase-js 會順便把過期的 token 換新）；被登出就清掉快取，下次用到再取得身分 */
function wire(c) {
  if (wired) return; wired = true;
  try { c.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') sessP = null; else if (s && s.user && !curUid) curUid = s.user.id; }); } catch (e) {}
  try { if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => { try { Promise.resolve(c.auth.getSession()).catch(() => {}); } catch (e) {} }); } catch (e) {}
}

/* 取得目前的登入身分 { id }；沒有 session 才匿名登入。成功後快取（失敗不快取，下次重試）。 */
export function ensureSession() {
  if (!sessP) sessP = (async () => {
    const c = await getClient();
    const g = await c.auth.getSession(); let s = g && g.data && g.data.session;
    if (!s || !s.user) {
      let tok = null; try { tok = typeof SB.getCaptchaToken === 'function' ? await SB.getCaptchaToken() : null; } catch (e) { tok = null; } /* 預留 CAPTCHA 掛點：config.js 的 SB.getCaptchaToken（第一版不開） */
      const r = await (tok ? c.auth.signInAnonymously({ options: { captchaToken: tok } }) : c.auth.signInAnonymously());
      if (!r || r.error || !r.data || !(r.data.user || (r.data.session && r.data.session.user))) { const er = (r && r.error) || {}; throw sbError(er.code === 'anonymous_provider_disabled' ? 'anon_disabled' : /fetch|network/i.test(er.message || '') ? 'unavailable' : 'unauthenticated', er.message || '匿名登入失敗', { status: er.status }); }
      s = r.data.session || { user: r.data.user }; s.user = s.user || r.data.user;
    }
    curUid = s.user.id; return { id: s.user.id };
  })().catch(e => { sessP = null; throw e; });
  return sessP;
}
export const sessionUserId = () => curUid;

/* token 過期（401）時用：只刷新，絕不重新匿名登入（那會變成另一個玩家）。刷新後身分必須和原本一樣。 */
export async function refreshSession() {
  const c = await getClient(); const r = await c.auth.refreshSession();
  const u = r && r.data && (r.data.user || (r.data.session && r.data.session.user));
  if (!u || (r && r.error)) throw sbError('unauthenticated', (r && r.error && r.error.message) || '登入已失效');
  if (curUid && u.id !== curUid) throw sbError('not_granted', '登入身分已改變');
  return { id: u.id };
}

/* 測試用 */
export function __setClient(c) { client = c; clientP = Promise.resolve(c); sessP = null; curUid = null; wired = true; }
export function __reset() { client = null; clientP = null; sessP = null; curUid = null; wired = false; }
