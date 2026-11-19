/* Supabase access token 驗證掛點（第一版 AUTH_MODE=off 不會呼叫）。
   做法：Supabase 新專案用非對稱金鑰簽 JWT，公鑰在 <SUPABASE_URL>/auth/v1/.well-known/jwks.json。
   這裡用 WebCrypto 驗 ES256／RS256 簽章，並檢查 exp、iss、aud。JWKS 快取在 isolate 記憶體 10 分鐘。
   舊專案若還是 HS256 共用密鑰，要把密鑰放 Worker secret（不可放程式碼），本檔不處理 HS256。 */

const b64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const dec = s => JSON.parse(new TextDecoder().decode(b64u(s)));
let jwksCache = { url: '', at: 0, keys: null };

async function getJwks(url, fetchFn) {
  const t = Date.now();
  if (jwksCache.url === url && jwksCache.keys && t - jwksCache.at < 600000) return jwksCache.keys;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error('jwks_http_' + r.status);
  const j = await r.json();
  jwksCache = { url, at: t, keys: j.keys || [] };
  return jwksCache.keys;
}

/* 回傳 { sub, claims }；失敗丟 Error */
export async function verifySupabaseToken(token, env, fetchFn = fetch, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('bad_token');
  const parts = token.split('.'); if (parts.length !== 3) throw new Error('bad_token');
  const header = dec(parts[0]), claims = dec(parts[1]);
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, ''); if (!base) throw new Error('no_supabase_url');
  const alg = header.alg;
  let algo, hash;
  if (alg === 'ES256') { algo = { name: 'ECDSA', namedCurve: 'P-256' }; hash = { name: 'ECDSA', hash: 'SHA-256' }; }
  else if (alg === 'RS256') { algo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }; hash = { name: 'RSASSA-PKCS1-v1_5' }; }
  else throw new Error('alg_not_supported');
  const keys = await getJwks(base + '/auth/v1/.well-known/jwks.json', fetchFn);
  const jwk = keys.find(k => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null); if (!jwk) throw new Error('kid_not_found');
  const key = await crypto.subtle.importKey('jwk', jwk, algo, false, ['verify']);
  const ok = await crypto.subtle.verify(hash, key, b64u(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad_signature');
  if (typeof claims.exp !== 'number' || claims.exp < nowSec) throw new Error('expired');
  if (claims.iss !== base + '/auth/v1') throw new Error('bad_iss');
  if (claims.aud !== 'authenticated') throw new Error('bad_aud');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('no_sub');
  return { sub: claims.sub, claims };
}
