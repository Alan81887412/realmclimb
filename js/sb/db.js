/* db 轉接：和 window.claude.use('db') 同介面（db.doc(path).get/set/update/acquire），底層走 Supabase RPC（見 sql/schema.sql）。
   路徑：players/<uid>、names/n<hex>、meta/counter；其他一律 not_granted。
   所有操作保證在 7.5 秒內結束（成功或拋錯），網路錯誤／token 過期會自動重試一次；
   錯誤是 Error 物件，e.code：not_granted｜unauthenticated｜anon_disabled｜unavailable｜timeout｜too_large｜not_found｜name_taken｜name_limit｜bad_request｜schema_missing｜error */
import { getClient, ensureSession, refreshSession, sbError, withTimeout } from './client.js';

export const DB = { deadlineMs: 7500, retryDelayMs: 400, maxBytes: 65536 };
const KEY_RE = /^n[0-9a-f]{2,96}$/;
const bytes = o => new TextEncoder().encode(JSON.stringify(o)).length;
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* supabase 的 error（{message,code,status}）→ 平台風格的 e.code */
export function mapError(er, status) {
  if (er instanceof Error && er.code && !('details' in er)) return er;
  const code = String((er && er.code) || ''), msg = String((er && er.message) || er || ''), st = status != null ? status : (er && er.status);
  let c = 'error';
  if (code === '42501' || st === 403) c = 'not_granted';
  else if (code === '23514') c = 'too_large';
  else if (code === 'PGRST202' || code === '42883') c = 'schema_missing';
  else if (st === 401 || code === 'PGRST301' || code === 'PGRST303' || /\bJWT\b/i.test(msg)) c = 'unauthenticated';
  else if (st === 0 || /failed to fetch|networkerror|network request failed|load failed|fetch failed|retryablefetch/i.test(msg) || st >= 500) c = 'unavailable';
  else if (msg === 'not_found') c = 'not_found';
  else if (msg === 'name_taken') c = 'name_taken';
  else if (msg === 'name_limit') c = 'name_limit';
  else if (msg === 'bad_key' || msg === 'bad_data') c = 'bad_request';
  else if (msg === 'not_signed_in') c = 'unauthenticated';
  const e = sbError(c, msg || c, { raw: code || undefined }); return e;
}

async function rpc(name, args) {
  const end = Date.now() + DB.deadlineMs;
  for (let attempt = 0; ; attempt++) {
    try {
      const left = () => end - Date.now();
      if (left() <= 0) throw sbError('timeout', name + ' timeout');
      await withTimeout(ensureSession(), left(), name);
      const c = await getClient();
      const res = await withTimeout(c.rpc(name, args), left(), name);
      if (res && res.error) throw mapError(res.error, res.status);
      return res ? res.data : null;
    } catch (e0) {
      const e = mapError(e0);
      const retry = attempt < 1 && (e.code === 'unavailable' || e.code === 'unauthenticated') && end - Date.now() > DB.retryDelayMs + 500;
      if (!retry) throw e;
      if (e.code === 'unauthenticated') { try { await withTimeout(refreshSession(), end - Date.now(), 'refresh'); } catch (e2) { throw e; } } else await sleep(DB.retryDelayMs);
    }
  }
}
async function me() { const u = await withTimeout(ensureSession(), DB.deadlineMs, 'session'); return u.id; }
const denied = why => sbError('not_granted', 'not_granted: ' + why);

export function createDb() {
  const serials = new Map(); /* meta/counter：acquire 時由伺服器配發的流水號 */
  const bad = why => { const f = async () => { throw denied(why); }; return { get: f, set: f, update: f, acquire: f }; };

  const players = uid => ({
    async get() { if (uid !== await me()) throw denied('players/' + uid); const d = await rpc('player_get', {}); const ex = isObj(d); return { exists: ex, data: () => (ex ? d : undefined) }; },
    async set(obj) { if (uid !== await me()) throw denied('players/' + uid); if (!isObj(obj)) throw sbError('bad_request', 'set 需要物件'); if (bytes(obj) > DB.maxBytes) throw sbError('too_large', '存檔超過 ' + DB.maxBytes + ' 位元組'); await rpc('player_set', { p_data: obj }); },
    async update(obj) { if (uid !== await me()) throw denied('players/' + uid); if (!isObj(obj)) throw sbError('bad_request', 'update 需要物件'); if (bytes(obj) > DB.maxBytes) throw sbError('too_large', '存檔超過 ' + DB.maxBytes + ' 位元組'); await rpc('player_update', { p_patch: obj }); },
    async acquire() { throw denied('players 沒有租約'); },
  });
  const names = key => ({
    async get() { const d = await rpc('name_get', { p_key: key }); const ex = isObj(d) && !!d.owner; return { exists: ex, data: () => (ex ? { owner: d.owner, name: d.name } : undefined) }; },
    async set(obj) { const uid = await me(); if (!isObj(obj) || obj.owner !== uid) throw denied('names owner 必須是自己'); await rpc('name_claim', { p_key: key, p_name: String(obj.name == null ? '' : obj.name) }); },
    async update(obj) { return this.set(obj); },
    async acquire(o) { const ms = o && Number.isFinite(+o.ttlMs) ? +o.ttlMs : 5000; /* holder 一律是自己，伺服器用 auth.uid() */ const r = await rpc('name_acquire', { p_key: key, p_ttl_ms: Math.round(ms) }); return { acquired: r === true }; },
  });
  const counter = () => ({
    async acquire() { const n = await rpc('next_serial', {}); if (!Number.isInteger(n) || n < 1) throw sbError('error', 'next_serial 回傳異常'); serials.set('meta/counter', n); return { acquired: true }; },
    async get() { const n = serials.get('meta/counter'); return { exists: n != null, data: () => (n != null ? { next: n } : undefined) }; },
    async set(obj) { const n = serials.get('meta/counter'); if (n == null || !isObj(obj) || +obj.next !== n + 1) throw denied('meta/counter 只能由伺服器配發'); /* 流水號已在 acquire 時原子配發，這裡不用寫 */ },
    async update(obj) { return this.set(obj); },
  });

  return {
    doc(path) {
      const p = String(path || ''), m = /^([a-z]+)\/([^/]+)$/.exec(p);
      if (!m) return bad(p);
      if (m[1] === 'players') return players(m[2]);
      if (m[1] === 'names' && KEY_RE.test(m[2])) return names(m[2]);
      if (p === 'meta/counter') return counter();
      return bad(p);
    },
  };
}
