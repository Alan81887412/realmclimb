/* room 傳輸層：一般 WebSocket 連中繼伺服器（協定見 /home/claude/team/sb08/ws協定.md v1）。
   介面同 transport-supabase.js。伺服器維護成員表（welcome／join／leave），所以 graceMs＝0。
   env：{ url, peerId, getToken（async → Supabase access_token；每次連線都重新取，token 刷新後下次重連就用新的）, stats（room.js 的 __sbStats，錯誤記在 stats.wsError）, WebSocket（測試可注入）, now, setTimeout, clearTimeout }。
   關閉碼：4003 房間滿 → 每 30 秒重試；4005 hello 不合法／同 peer 不同 uid／驗證失敗 → 最多重試 1 次，之後停止（不再連），記 stats.wsError；4002 被同 peer 取代 → 不重連（舊連線讓位）；其他 → 指數退避。註解只用區塊註解。 */
export function wsTransport(env) {
  const { peerId, url } = env;
  const st = env.setTimeout || ((f, ms) => setTimeout(f, ms)), ct = env.clearTimeout || (t => clearTimeout(t));
  const WS = env.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const BACKOFF = [500, 1000, 2000, 5000, 10000];
  let stopped = false, h = null, uid = null, fatal = 0, ws = null, welcomed = false, destroyed = false, tries = 0, retryT = null, pingT = null, helloT = null, lastRx = 0, wdT = null, gen = 0;
  const members = new Map();
  const emit = () => h.members([...members.values()]);
  const clearTimers = () => { for (const t of [pingT, helloT, wdT]) if (t) ct(t); pingT = helloT = wdT = null; };

  function connect() {
    if (destroyed || stopped || !WS) return; const my = ++gen;
    try { ws = new WS(url); } catch (e) { scheduleRetry(); return; }
    const w = ws; welcomed = false; members.clear();
    w.onopen = async () => {
      if (my !== gen) return; lastRx = Date.now();
      let token = null; try { token = await Promise.race([Promise.resolve(env.getToken ? env.getToken() : null), new Promise(r => setTimeout(() => r(null), 2000))]); } catch (e) { token = null; }
      if (my !== gen || w.readyState !== 1) return;
      const hello = { t: 'hello', v: 1, peer: peerId, tab: peerId, uid, guest: false, kind: 'viewer' }; if (token) hello.token = token;
      try { w.send(JSON.stringify(hello)); } catch (e) {}
      helloT = st(() => { if (my === gen && !welcomed) try { w.close(); } catch (e) {} }, 5000);
      const tick = () => { if (my !== gen) return; try { w.send('ping'); } catch (e) {} if (Date.now() - lastRx > 45000) { try { w.close(); } catch (e) {} return; } pingT = st(tick, 20000); };
      pingT = st(tick, 20000);
    };
    w.onmessage = ev => {
      if (my !== gen) return; lastRx = Date.now(); const raw = ev && ev.data; if (typeof raw !== 'string' || raw === 'pong') return;
      let m; try { m = JSON.parse(raw); } catch (e) { return; } if (!m || typeof m !== 'object') return;
      if (m.t === 'welcome') { welcomed = true; tries = 0; if (helloT) { ct(helloT); helloT = null; } members.clear(); for (const x of m.members || []) if (x && x.peer && x.peer !== peerId) members.set(x.peer, { peer: x.peer, uid: x.uid }); h.status(true); emit(); }
      else if (m.t === 'join' && m.member && m.member.peer !== peerId) { members.set(m.member.peer, { peer: m.member.peer, uid: m.member.uid }); emit(); }
      else if (m.t === 'leave') { if (members.delete(m.peer)) emit(); }
      else if (m.t === 'm' && typeof m.from === 'string' && m.d && typeof m.d === 'object') { m.d.p = m.from; h.message(m.e, m.d); }
      else if (m.t === 'err') { if (m.code === 'full') tries = 99; if (env.stats) env.stats.wsError = { code: m.code, at: Date.now() }; }
    };
    w.onclose = ev => {
      if (my !== gen) return; clearTimers(); const was = welcomed; welcomed = false; members.clear(); if (was) h.status(false); else h.status(false);
      const code = ev && ev.code;
      if (code === 4003) { tries = 99; if (env.stats) env.stats.wsError = { code: 4003, at: Date.now(), msg: 'room full' }; }
      if (code === 4005) { fatal++; if (env.stats) env.stats.wsError = { code: 4005, at: Date.now(), reason: ev.reason || '', tries: fatal }; if (fatal > 1) { stopped = true; return; } }
      else if (code === 4002) { if (env.stats) env.stats.wsError = { code: 4002, at: Date.now(), msg: 'replaced by same peer' }; return; }
      scheduleRetry();
    };
    w.onerror = () => {};
  }
  function scheduleRetry() { if (destroyed || stopped || retryT) return; const ms = tries >= 99 ? 30000 : BACKOFF[Math.min(tries, BACKOFF.length - 1)]; tries = tries >= 99 ? 0 : tries + 1; retryT = st(() => { retryT = null; connect(); }, ms); }
  return {
    name: 'ws', graceMs: 0,
    start(handlers, info) { h = handlers; uid = info.uid; connect(); },
    send(event, payload) { if (!ws || !welcomed || ws.readyState !== 1) return false; try { const m = { t: 'm', e: event, d: payload }; if (payload && payload.to && payload.to !== '*') m.to = payload.to; ws.send(JSON.stringify(m)); } catch (e) { return false; } return true; },
    resync() {},
    bye() { try { if (ws) ws.close(1000); } catch (e) {} },
    reconnect() { if (destroyed || stopped) return; gen++; clearTimers(); const old = ws; try { if (old) old.close(); } catch (e) {} welcomed = false; members.clear(); h.status(false); tries = 0; if (retryT) { ct(retryT); retryT = null; } connect(); },
    destroy() { destroyed = true; gen++; clearTimers(); if (retryT) ct(retryT); try { if (ws) ws.close(1000); } catch (e) {} ws = null; welcomed = false; }
  };
}
export default wsTransport;
