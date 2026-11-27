/* room 傳輸層：Supabase Realtime（Broadcast 傳資料、Presence 只管誰在線）。
   介面（room.js 呼叫）：start(handlers, { uid })｜send(event, payload) → bool｜bye()｜reconnect()｜destroy()；graceMs＝presence 沒看到某人後多久才移除。
   handlers：status(bool)｜members([{ peer, uid }])｜message(event, payload)。
   註解只用區塊註解。 */
export function supabaseTransport(env) {
  const { peerId, now, setTimeout: st } = env;
  const channelName = env.channel || 'realmclimb-08';
  const getClientFn = env.getClient || (async () => (await import('./client.js')).getClient());
  let h = null, uid = null, client = null, channel = null, ready = false, gen = 0, destroyed = false, retryT = null;

  async function join() {
    const my = ++gen;
    try { client = await getClientFn(); if (!client) throw new Error('no client'); }
    catch (e) { if (my === gen && !destroyed) { h.status(false); if (!retryT) retryT = st(() => { retryT = null; join(); }, e && e.code === 'not_granted' ? 15000 : 4000); } return; }
    if (my !== gen || destroyed) return;
    const ch = client.channel(channelName, { config: { broadcast: { self: false, ack: false }, presence: { key: peerId } } });
    channel = ch; ready = false;
    for (const ev of ['p', 'f', 'q', 'b']) ch.on('broadcast', { event: ev }, m => { if (my === gen) h.message(ev, m && m.payload); });
    ch.on('presence', { event: 'sync' }, () => { if (my === gen) sync(); });
    ch.subscribe(status => {
      if (my !== gen || destroyed) return;
      if (status === 'SUBSCRIBED') {
        ready = true; h.status(true);
        const track = async n => { try { const r = await ch.track({ p: peerId, u: uid, t: now() }); if (r && r !== 'ok' && n < 5 && my === gen) st(() => track(n + 1), 1500); } catch (e) { if (n < 5 && my === gen) st(() => track(n + 1), 1500); } };
        track(0); sync();
      } else { ready = false; h.status(false); }
    });
  }
  function sync() {
    if (!channel) return; let state; try { state = channel.presenceState() || {}; } catch (e) { return; }
    const list = [];
    for (const key in state) { const arr = state[key]; const pl = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null; const p = (pl && pl.p) || key; if (p !== peerId) list.push({ peer: p, uid: pl && pl.u }); }
    h.members(list);
  }
  return {
    name: 'supabase', graceMs: 3000,
    start(handlers, info) { h = handlers; uid = info.uid; join(); },
    send(event, payload) { if (!channel || !ready) return false; try { const r = channel.send({ type: 'broadcast', event, payload }); if (r && r.catch) r.catch(() => {}); } catch (e) {} return true; },
    resync() { sync(); },
    bye() { try { if (channel && ready) { channel.send({ type: 'broadcast', event: 'b', payload: { p: peerId } }); channel.untrack(); } } catch (e) {} },
    reconnect() { if (destroyed) return; const old = channel; channel = null; ready = false; gen++; h.status(false); try { if (old && client) client.removeChannel(old); } catch (e) {} join(); },
    destroy() { destroyed = true; gen++; try { if (channel && client) client.removeChannel(channel); } catch (e) {} channel = null; ready = false; }
  };
}
export default supabaseTransport;
