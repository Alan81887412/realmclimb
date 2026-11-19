/* room 轉接層（M3）：用 Supabase Realtime 提供和 window.claude.use('room') 一模一樣的介面。
   介面：presence(patch)｜peers()｜connected()｜onConnection(cb, errCb)｜onPeers(cb, errCb)。
   設計（免費方案每月 200 萬則、每秒 100 則；一則 broadcast 計 1 + 收到的人數）：
   - 傳輸層可換（同一套語意）：transport-supabase.js（Broadcast 傳資料、Presence 只放 { p, u, t } 用來知道誰在線）｜transport-ws.js（WebSocket 連中繼伺服器，協定見 ws協定.md）。
     選擇：網址 ?relay=wss://… 或 config.js 的 SB.relayUrl 有值 → ws；否則 Supabase。測試可傳 opts.transport。
   - presence(patch) 先在本機淺合併、和「上次送出的值」比對，沒變就不送；多個欄位合併成一則。
   - 頻率：一個人時完全不送；有變化最多 5 Hz，人多時自動降低（N 人：f = min(5, 60/N²)，最低 0.8 Hz）；
     沒變化只送心跳（2 秒，6 人以上 2.5 秒；遊戲逾時是 3.5 秒）；急件欄位（r、say、ev、dv、hr…）最短間隔 100 毫秒。
   - 訊息：'p' 變更（d＝只有變的欄位；沒有 d＝心跳）｜'f' 完整快照｜'q' 要求快照｜'b' 離開。每則帶 s（送出者序號），
     收到的序號跳號就送 'q' 給對方補快照；新加入者、有人新出現在 presence 時也送快照；另外每 15 秒一次保險快照。
   - peer 身分：每個分頁一個 peer（時間戳 base36 ＋ 亂數，先加入的字串較小）；uid 是登入者 id（isMe＝uid 相同；sameTab＝這個分頁）。
   - 計數器：window.__sbStats（送出／收到則數、估計計費則數、每秒速率）。
   註解只用區塊註解。 */

const URGENT = new Set(['r', 'say', 'ev', 'dv', 'hr', 'kd', 'iv', 'ia', 'h7', 'c8', 'g8', 'l8', 'e8', 'e8h', 'k8', 'sk8', 'mg']);
const URG_GAP = 100, MOVE_HZ = 5, MIN_HZ = 0.8, BUDGET = 60, HB_GAP = 2000, HB_GAP_BIG = 2500, SNAP_EVERY = 15000, SILENT_DROP = 60000, PRUNE_GRACE = 3000;

const deviceId = () => { try { const k = 'dengjie-device'; let v = localStorage.getItem(k); if (!v) { v = 'd' + Math.random().toString(36).slice(2, 12); localStorage.setItem(k, v); } return v; } catch (e) { return null; } };
const same = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
const sig = v => (v && typeof v === 'object' ? '\u0000' + JSON.stringify(v) : v); /* 物件存成字串簽名：遊戲之後就地改動送過的物件，也不會誤判成沒變 */
const clone = v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

export function createRoom(opts = {}) {
  const now = opts.now || (() => Date.now());
  const st = opts.setTimeout || ((f, ms) => setTimeout(f, ms)), ct = opts.clearTimeout || (t => clearTimeout(t));
  const rnd = opts.random || Math.random;
  const win = typeof window !== 'undefined' ? window : null;
  const peerId = opts.peerId || (now().toString(36).padStart(9, '0') + '-' + Math.floor(rnd() * 1679616).toString(36).padStart(4, '0'));
  const getUidFn = opts.getUid || (async () => { try { const m = await import('./client.js'); const s = await m.ensureSession(); if (s && s.id) return s.id; } catch (e) {} return deviceId(); });
  const mkTransport = opts.transport || (async env => {
    let relay = ''; try { const q = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search) : null; relay = (q && q.get('relay')) || ''; } catch (e) {}
    if (!relay) { try { relay = (await import('./config.js')).SB.relayUrl || ''; } catch (e) {} }
    if (relay) return (await import('./transport-ws.js')).wsTransport({ ...env, url: relay, getToken: opts.getToken || (async () => { try { const c = await (await import('./client.js')).getClient(); const g = await c.auth.getSession(); return (g && g.data && g.data.session && g.data.session.access_token) || null; } catch (e) { return null; } }) });
    return (await import('./transport-supabase.js')).supabaseTransport({ ...env, getClient: opts.getClient, channel: opts.channel });
  });

  const stats = { sent: 0, sentP: 0, sentF: 0, sentQ: 0, sentB: 0, sentHb: 0, recv: 0, recvP: 0, recvF: 0, recvQ: 0, billed: 0, sentBytes: 0, recvBytes: 0, skipped: 0, calls: 0, gaps: 0, reconnects: 0, peerId, started: now(), win: [], rate() { const t = now(), w = stats.win.filter(x => t - x[0] <= 5000); const span = Math.max(1, Math.min(5000, t - stats.started)); return { sentPerSec: w.reduce((a, x) => a + x[1], 0) / (span / 1000), recvPerSec: w.reduce((a, x) => a + x[2], 0) / (span / 1000) }; }, reset() { for (const k of ['sent', 'sentP', 'sentF', 'sentQ', 'sentB', 'sentHb', 'recv', 'recvP', 'recvF', 'recvQ', 'billed', 'sentBytes', 'recvBytes', 'skipped', 'calls', 'gaps']) stats[k] = 0; stats.win = []; stats.started = now(); } };
  const tickWin = (s, r) => { const t = now(); stats.win.push([t, s, r]); while (stats.win.length && t - stats.win[0][0] > 6000) stats.win.shift(); };
  if (win) win.__sbStats = stats;

  let uid = null, transport = null, connected = false, started = false, destroyed = false, disconnectedAt = now();
  let seq = 0, lastSend = 0, lastSnap = 0, timer = null, timerAt = 0, snapTimer = null, lastSnapSent = 0, needSnap = true;
  const self = { peer: peerId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: {}, updatedAt: now() };
  const selfJson = {}, sentJson = {}; const dirty = new Set(); let urgentDirty = false;
  const others = new Map(); /* peer → { entry, uid, last(收到的序號), json, first, hasBase, qAt } */
  let cache = null; const connCbs = [], peerCbs = []; let notifyQ = false;

  function notifyPeers() { if (notifyQ) return; notifyQ = true; Promise.resolve().then(() => { notifyQ = false; for (const cb of peerCbs) try { cb(peers()); } catch (e) {} }); }
  function setConnected(v) { v = !!v; if (v === connected) return; connected = v; if (v) disconnectedAt = 0; else disconnectedAt = now(); cache = null; for (const cb of connCbs) try { cb(v); } catch (e) {} notifyPeers(); schedule(); }
  function peers() { if (!cache) { cache = []; if (connected) cache.push(self); for (const o of others.values()) cache.push(o.entry); } return cache.slice(); }

  /* ---------- 頻率 ---------- */
  const nOthers = () => others.size;
  function changeGap() { const N = nOthers() + 1; const f = Math.max(MIN_HZ, Math.min(MOVE_HZ, BUDGET / (N * N))); return 1000 / f; }
  const hbGap = () => (nOthers() + 1 >= 6 ? HB_GAP_BIG : HB_GAP);
  function hasChange() { for (const k of dirty) if (!(k in sentJson) || selfJson[k] !== sentJson[k]) return true; return false; }

  function schedule() {
    if (destroyed || !started) return;
    let delay;
    if (!connected || !transport || !nOthers()) delay = null;
    else {
      const t = now(), since = t - lastSend;
      if (needSnap || t - lastSnap > SNAP_EVERY) delay = Math.max(0, URG_GAP - since);
      else if (hasChange()) delay = Math.max(0, (urgentDirty ? URG_GAP : changeGap()) - since);
      else delay = Math.max(0, hbGap() - since);
    }
    if (timer) { if (delay !== null && now() + delay >= timerAt) return; ct(timer); timer = null; }
    if (delay === null) return;
    timerAt = now() + delay; timer = st(() => { timer = null; flush(); }, delay);
  }

  function rawSend(event, payload, recipients) {
    if (!transport || !connected) return false;
    const msg = JSON.stringify(payload); if (!transport.send(event, payload)) return false; stats.sent++; stats.billed += 1 + recipients; stats.sentBytes += msg.length; tickWin(1, 0);
    if (event === 'p') stats.sentP++; else if (event === 'f') stats.sentF++; else if (event === 'q') stats.sentQ++; else stats.sentB++;
    return true;
  }
  function fullState() { const d = {}; for (const k in self.presence) d[k] = self.presence[k]; return d; }
  function sendSnap() {
    if (!nOthers()) return; const t = now(); seq++;
    if (rawSend('f', { p: peerId, u: uid, s: seq, d: fullState() }, nOthers())) { lastSend = t; lastSnap = t; lastSnapSent = t; needSnap = false; for (const k in selfJson) sentJson[k] = selfJson[k]; dirty.clear(); urgentDirty = false; }
  }
  function flush() {
    if (destroyed || !connected || !transport || !nOthers()) return;
    const t = now();
    if (needSnap || t - lastSnap > SNAP_EVERY) { sendSnap(); schedule(); return; }
    const d = {}; let n = 0; for (const k of dirty) if (!(k in sentJson) || selfJson[k] !== sentJson[k]) { d[k] = self.presence[k]; n++; }
    const since = t - lastSend, need = n ? (urgentDirty ? URG_GAP : changeGap()) : hbGap();
    if (since + 5 < need) { schedule(); return; }
    seq++; const payload = { p: peerId, u: uid, s: seq }; if (n) payload.d = d; else stats.sentHb++;
    if (rawSend('p', payload, nOthers())) { lastSend = t; for (const k in d) sentJson[k] = selfJson[k]; dirty.clear(); urgentDirty = false; }
    schedule();
  }

  /* ---------- 自己的 presence ---------- */
  function presence(patch) {
    stats.calls++;
    try {
      if (patch && typeof patch === 'object') {
        let ch = null, urgent = false;
        for (const k in patch) { const v = clone(patch[k]); if (k in self.presence && same(self.presence[k], v)) continue; (ch || (ch = {}))[k] = v; if (k !== 'hb') { dirty.add(k); if (URGENT.has(k)) urgent = true; } }
        if (ch) { self.presence = Object.assign({}, self.presence, ch); for (const k in ch) selfJson[k] = sig(ch[k]); if ('hb' in ch) { /* 心跳欄位：只存本機，不當作內容變化；對方靠心跳訊息就知道還活著 */ sentJson.hb = selfJson.hb; } self.updatedAt = now(); cache = null; if (urgent) urgentDirty = true; }
        else stats.skipped++;
        if (urgent && connected && nOthers() && !needSnap && now() - lastSend >= URG_GAP) { flush(); } else schedule();
      }
    } catch (e) {}
    return Promise.resolve();
  }

  /* ---------- 收訊息 ---------- */
  function getOther(p, u, create) {
    let o = others.get(p);
    if (!o && create) { const entry = { peer: p, isMe: !!u && u === uid, sameTab: false, kind: 'viewer', guest: false, presence: {}, updatedAt: now() }; o = { entry, uid: u, last: 0, json: {}, first: now(), hasBase: false, qAt: 0 }; others.set(p, o); cache = null; notifyPeers(); schedule(); }
    return o;
  }
  function applyD(o, d, full) {
    const e = o.entry; let ch = null;
    if (full) { const keys = Object.keys(d); const old = e.presence; let diff = keys.length !== Object.keys(old).length; if (!diff) for (const k of keys) if (!(k in old) || !same(old[k], d[k])) { diff = true; break; } if (diff) ch = d; if (ch) e.presence = Object.assign({}, d); }
    else { for (const k in d) { const v = d[k]; if (k in e.presence && same(e.presence[k], v)) continue; (ch || (ch = {}))[k] = v; } if (ch) e.presence = Object.assign({}, e.presence, ch); }
    return !!ch;
  }
  function onMsg(event, payload) {
    if (destroyed || !payload || typeof payload !== 'object') return; const p = payload.p; if (typeof p !== 'string' || p === peerId) return;
    stats.recv++; stats.recvBytes += 0; tickWin(0, 1);
    if (event === 'q') { stats.recvQ++; if ((payload.to === '*' || payload.to === peerId) && now() - lastSnapSent > 300) { if (payload.to === '*') jitterSnap(); else sendSnap(); } return; }
    if (event === 'b') { if (others.delete(p)) { cache = null; notifyPeers(); schedule(); } return; }
    if (event !== 'p' && event !== 'f') return;
    const o = getOther(p, payload.u, true); o.uid = payload.u || o.uid; o.entry.isMe = !!o.uid && o.uid === uid; const t = now(); o.entry.updatedAt = t;
    const d = payload.d && typeof payload.d === 'object' ? payload.d : null, s = typeof payload.s === 'number' ? payload.s : 0;
    if (event === 'f') { stats.recvF++; o.last = s; o.hasBase = true; if (d && applyD(o, d, true)) notifyPeers(); return; }
    stats.recvP++;
    if (!o.hasBase || (o.last && s !== o.last + 1)) { if (o.hasBase) stats.gaps++; if (t - o.qAt > 1000) { o.qAt = t; o.hasBase = o.hasBase && false; rawSend('q', { p: peerId, to: p }, nOthers()); } }
    o.last = s; if (d && applyD(o, d, false)) notifyPeers();
  }
  function jitterSnap() { if (snapTimer || !nOthers()) return; snapTimer = st(() => { snapTimer = null; if (now() - lastSnapSent > 400) sendSnap(); }, 30 + Math.floor(rnd() * 250)); }

  /* ---------- 成員（傳輸層回報誰在線）---------- */
  let lastMembers = [];
  function onMembers(list) {
    lastMembers = list || []; const t = now(); const online = new Set(); let fresh = false; const grace = transport && typeof transport.graceMs === 'number' ? transport.graceMs : 3000;
    for (const m of lastMembers) { if (!m || !m.peer || m.peer === peerId) continue; online.add(m.peer); if (!others.has(m.peer)) { getOther(m.peer, m.uid, true); fresh = true; } }
    if (!connected) return;
    for (const [p, o] of [...others]) if (!online.has(p) && t - o.first > grace) { others.delete(p); cache = null; notifyPeers(); }
    if (fresh) jitterSnap();
    schedule();
  }
  function onStatus(v) {
    if (destroyed) return;
    if (v) { needSnap = true; for (const o of others.values()) { o.hasBase = false; o.last = 0; } setConnected(true); rawSend('q', { p: peerId, to: '*' }, nOthers()); schedule(); }
    else setConnected(false);
  }
  function dropSilent() {
    const t = now(); let ch = false;
    for (const [p, o] of [...others]) if (t - o.entry.updatedAt > SILENT_DROP && o.entry.presence.r !== 0) { others.delete(p); ch = true; }
    if (ch) { cache = null; notifyPeers(); schedule(); }
  }

  /* ---------- 連線 ---------- */
  async function begin() {
    try { uid = await getUidFn(); } catch (e) { uid = null; } uid = uid || peerId;
    if (destroyed) return;
    try {
      transport = await mkTransport({ stats, peerId, now, setTimeout: st, clearTimeout: ct, getClient: opts.getClient, channel: opts.channel, WebSocket: opts.WebSocket });
      if (destroyed) { try { transport.destroy(); } catch (e) {} return; }
      room.transport = transport.name;
      transport.start({ status: onStatus, members: onMembers, message: onMsg }, { uid, peerId });
    } catch (e) { transport = null; if (!destroyed) st(begin, 5000); }
  }
  function rebuild() { if (destroyed || !transport) return; stats.reconnects++; try { transport.reconnect(); } catch (e) {} }
  function watchdog() { if (destroyed) return; try { dropSilent(); if (connected && transport && transport.resync) transport.resync(); if (!connected && disconnectedAt && now() - disconnectedAt > 25000 && transport) { disconnectedAt = now(); rebuild(); } } catch (e) {} wdT = st(watchdog, 5000); }
  let wdT = null;
  function bye() { try { if (transport && connected) transport.bye(); } catch (e) {} }

  function start() {
    if (started) return; started = true; begin(); wdT = st(watchdog, 5000);
    if (win && win.addEventListener) {
      win.addEventListener('pagehide', bye);
      win.addEventListener('online', () => { if (!connected && transport) rebuild(); });
      if (win.document) win.document.addEventListener('visibilitychange', () => { if (!win.document.hidden && !connected && disconnectedAt && now() - disconnectedAt > 3000 && transport) rebuild(); });
    }
  }
  function destroy() { destroyed = true; bye(); if (timer) ct(timer); if (wdT) ct(wdT); if (snapTimer) ct(snapTimer); try { if (transport) transport.destroy(); } catch (e) {} transport = null; setConnected(false); }

  const room = {
    presence,
    peers,
    connected: () => connected,
    onConnection(cb, errCb) { if (typeof cb === 'function') connCbs.push(cb); if (typeof errCb === 'function') errCbs.push(errCb); return () => { const i = connCbs.indexOf(cb); if (i >= 0) connCbs.splice(i, 1); }; },
    onPeers(cb, errCb) { if (typeof cb === 'function') peerCbs.push(cb); if (typeof errCb === 'function') errCbs.push(errCb); return () => { const i = peerCbs.indexOf(cb); if (i >= 0) peerCbs.splice(i, 1); }; },
    destroy, stats, peerId, transport: '', __onMsg: onMsg
  };
  const errCbs = [];
  start();
  return room;
}
export default createRoom;
