/* 登界 0.8 多人連線中繼：Cloudflare Worker（入口、白名單）＋ Durable Object「Room」（每個房間一個）。
   協定：../../ws協定.md（v1）。伺服器只做三件事：記成員、轉訊息、通知加入／離開；不解讀、不保存遊戲資料。
   成員表放在每條連線的 attachment（serializeAttachment），所以 DO 休眠醒來後不會遺失；
   「新加入的人拿完整狀態」由瀏覽器端 room.js 的快照機制（f／q 訊息）負責，伺服器不需要保存合併狀態。
   註解只用區塊註解。 */
import { DurableObject } from 'cloudflare:workers';
import { verifySupabaseToken } from './auth.js';

const PEER_RE = /^[A-Za-z0-9_-]{1,40}$/;
const enc = new TextEncoder();
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

function originAllowed(origin, env) {
  if (!origin) return env.ALLOW_NO_ORIGIN === '1';
  const o = origin.toLowerCase().replace(/\/+$/, '');
  for (let e of list(env.ALLOWED_ORIGINS)) {
    e = e.toLowerCase().replace(/\/+$/, '');
    if (e.includes('__pages_origin__')) continue; /* 沒被取代的占位符不算 */
    if (e.endsWith(':*')) { const pre = e.slice(0, -1); if (o.startsWith(pre) && /^\d{1,5}$/.test(o.slice(pre.length))) return true; }
    else if (o === e) return true;
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([^/]+)\/?$/);
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';
    const name = m ? decodeURIComponent(m[1]) : url.searchParams.get('room');
    if (!upgrade && !name) return new Response('realmclimb relay ok\n', { headers: { 'content-type': 'text/plain' } });
    if (!name) return new Response('not found', { status: 404 });
    const rooms = list(env.ROOMS || 'realmclimb-08');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(name) || !(rooms.includes(name) || rooms.includes('*'))) /* '*' 只給本機測試用 */
      return new Response('unknown room', { status: 404 });
    if (!upgrade) return new Response('expected websocket', { status: 426 });
    if (!originAllowed(request.headers.get('Origin'), env)) return new Response('origin not allowed', { status: 403 });
    return env.ROOM.get(env.ROOM.idFromName(name)).fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /* 醒來會重跑 constructor：只放輕量設定。ping／pong 由平台自動回，不喚醒本物件、不計請求。 */
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.cfg = {
      maxPeers: num(env.MAX_PEERS, 24), maxBytes: num(env.MAX_MSG_BYTES, 65536), rate: num(env.RATE_PER_SEC, 30),
      killSecs: num(env.RATE_KILL_SECS, 5), helloMs: num(env.HELLO_TIMEOUT_MS, 5000), auth: env.AUTH_MODE || 'off',
    };
    if (env.DEBUG === '1') console.log('ROOM_CTOR sockets=' + this.ctx.getWebSockets().length); /* 只在本機測試用：看有沒有休眠醒來 */
    this.cache = new WeakMap(); /* ws → attachment 內容（記憶體快取；醒來後清空，再從 attachment 讀） */
    this.rates = new WeakMap(); /* ws → 速率計數（只存記憶體；醒來歸零無妨） */
  }

  /* ---------- 小工具 ---------- */
  info(ws) { let a = this.cache.get(ws); if (!a) { try { a = ws.deserializeAttachment(); } catch (e) {} if (!a) a = { hello: false, at: Date.now() }; this.cache.set(ws, a); } return a; }
  setInfo(ws, a) { this.cache.set(ws, a); try { ws.serializeAttachment(a); } catch (e) {} }
  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {} }
  kill(ws, code, reason) { try { ws.close(code, reason); } catch (e) {} }
  live(ws) { return !(typeof ws.readyState === 'number' && ws.readyState > 1); }
  members(except) { const out = []; for (const w of this.ctx.getWebSockets()) { if (w === except || !this.live(w)) continue; const a = this.info(w); if (a.hello && !a.left && !a.replaced) out.push({ ws: w, a }); } return out; }
  pub(a) { return { peer: a.peer, uid: a.uid, guest: !!a.guest, kind: 'viewer' }; }
  bad(ws, code, wsCode) { this.send(ws, { t: 'err', code }); this.kill(ws, wsCode, code); }

  /* ---------- 連線進來 ---------- */
  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 });
    /* 還沒 hello 的連線也佔名額，所以硬上限比人數上限多留一點，避免被塞滿 */
    if (this.ctx.getWebSockets().length >= this.cfg.maxPeers + 8) return new Response('busy', { status: 503 });
    const pair = new WebSocketPair(); const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    this.setInfo(server, { hello: false, at: Date.now() });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + this.cfg.helloMs);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* 5 秒沒 hello 就關（alarm 只在有人還沒 hello 時才排，不會一直喚醒） */
  async alarm() {
    const t = Date.now(); let next = 0;
    for (const w of this.ctx.getWebSockets()) {
      const a = this.info(w); if (a.hello || !this.live(w)) continue;
      const due = a.at + this.cfg.helloMs;
      if (due <= t) this.kill(w, 4001, 'no hello'); else next = next ? Math.min(next, due) : due;
    }
    if (next) await this.ctx.storage.setAlarm(next);
  }

  /* ---------- 收訊息 ---------- */
  async webSocketMessage(ws, message) {
    const c = this.cfg;
    if (typeof message !== 'string') return this.kill(ws, 1003, 'text only');
    let bytes = message.length; if (bytes > c.maxBytes) bytes = Infinity; else if (bytes * 3 > c.maxBytes) bytes = enc.encode(message).length;
    if (bytes > c.maxBytes) return this.bad(ws, 'too_large', 1009);
    if (message === 'ping') return; /* 正常情況平台已自動回 pong，不會走到這 */

    /* 每連線速率：每秒 c.rate 則；超過的丟掉並回 err rate；連續 killSecs 秒超速就斷線 */
    const t = Date.now(), sec = Math.floor(t / 1000); let r = this.rates.get(ws);
    if (!r) { r = { sec, n: 0, over: 0, warned: false }; this.rates.set(ws, r); }
    if (sec !== r.sec) { r.over = (r.n > c.rate && sec === r.sec + 1) ? r.over + 1 : 0; r.sec = sec; r.n = 0; r.warned = false; }
    r.n++;
    if (r.n > c.rate) {
      if (!r.warned) { r.warned = true; this.send(ws, { t: 'err', code: 'rate' }); }
      if (r.over + 1 >= c.killSecs) this.kill(ws, 4004, 'rate');
      return;
    }

    let m; try { m = JSON.parse(message); } catch (e) { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    const a = this.info(ws);
    if (!a.hello) { if (m.t === 'hello' && !this.authing?.has(ws)) await this.onHello(ws, m); return; }
    if (a.left || a.replaced) return;
    if (m.t !== 'm') return;
    if (typeof m.e !== 'string' || !m.e || m.e.length > 32) return;
    const out = { t: 'm', from: a.peer, e: m.e }; if (m.d !== undefined) out.d = m.d;
    const str = JSON.stringify(out);
    const to = m.to;
    if (to !== undefined && to !== '*') { if (typeof to !== 'string') return; for (const x of this.members(ws)) if (x.a.peer === to) { this.send(x.ws, str); break; } return; }
    for (const x of this.members(ws)) this.send(x.ws, str);
  }

  async onHello(ws, h) {
    const c = this.cfg;
    if ((h.v !== undefined && h.v !== 1) || typeof h.peer !== 'string' || !PEER_RE.test(h.peer)) return this.bad(ws, 'bad_hello', 4005);
    let uid = h.uid;
    if (typeof uid !== 'string' || !uid || uid.length > 64) return this.bad(ws, 'bad_hello', 4005);
    /* 身分驗證掛點：AUTH_MODE=off 時完全不看 token；optional／required 時用 Supabase JWKS 驗，uid 以 token 的 sub 為準 */
    if (c.auth !== 'off') {
      if (typeof h.token === 'string' && h.token) {
        (this.authing || (this.authing = new WeakSet())).add(ws);
        try { uid = (await verifySupabaseToken(h.token, this.env)).sub; }
        catch (e) { this.authing.delete(ws); return this.bad(ws, 'bad_hello', 4005); }
        this.authing.delete(ws);
      } else if (c.auth === 'required') return this.bad(ws, 'bad_hello', 4005);
    }
    if (!this.live(ws) || this.info(ws).hello) return;
    /* await 之後才檢查名額與重複，避免同時兩條 hello 互相穿插 */
    const others = this.members(ws);
    const dup = others.find(x => x.a.peer === h.peer);
    if (dup && dup.a.uid !== uid) return this.bad(ws, 'bad_hello', 4005); /* 同 peer 卻是不同玩家：不准搶，也不踢人 */
    if (others.length - (dup ? 1 : 0) >= c.maxPeers) return this.bad(ws, 'full', 4003);
    if (dup) { /* 同一玩家同一 peer 重連：舊的被取代，其他人先看到 leave 再看到 join */
      this.setInfo(dup.ws, Object.assign({}, dup.a, { replaced: true }));
      const lv = JSON.stringify({ t: 'leave', peer: dup.a.peer });
      for (const x of others) if (x !== dup) this.send(x.ws, lv);
      this.kill(dup.ws, 4002, 'replaced');
    }
    const a = { hello: true, peer: h.peer, uid, guest: h.guest === true, kind: 'viewer', at: Date.now() };
    this.setInfo(ws, a);
    const rest = others.filter(x => x !== dup);
    this.send(ws, { t: 'welcome', peer: a.peer, members: rest.map(x => this.pub(x.a)), now: Date.now() });
    const jn = JSON.stringify({ t: 'join', member: this.pub(a) });
    for (const x of rest) this.send(x.ws, jn);
  }

  /* ---------- 關閉／錯誤：通知大家 ---------- */
  gone(ws, code) {
    const a = this.info(ws);
    if (a.hello && !a.left && !a.replaced) {
      this.setInfo(ws, Object.assign({}, a, { left: true }));
      const lv = JSON.stringify({ t: 'leave', peer: a.peer });
      for (const x of this.members(ws)) this.send(x.ws, lv);
    }
    const ok = Number.isInteger(code) && code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 && code !== 1015;
    this.kill(ws, ok ? code : 1000, 'bye');
  }
  async webSocketClose(ws, code) { this.gone(ws, code); }
  async webSocketError(ws) { this.gone(ws, 1011); }
}
