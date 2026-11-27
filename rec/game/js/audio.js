// 音訊模組：實錄音效（合併檔）、環境音循環、音樂串流。
// 這個檔案不依賴遊戲其他模組；資料全部來自 assets/audio/audio-index.json（事件對照、音量、區域配置都在那裡，改對照不用動程式）。
//
// 用法（詳見 接入說明.md）：
//   import * as GA from './audio.js';
//   GA.init();                                   // 載入畫面：抓索引與核心音效（回傳 Promise，永遠不會 reject，也不會擋住遊戲）
//   GA.unlock();                                 // 第一次點擊／按鍵時呼叫（之後每次呼叫都無害）：建立或恢復 AudioContext、解碼、開始環境音與音樂
//   GA.play('hit', true, { x, z }) || 合成音();   // 有對應的實錄音效而且播得了就回傳 true；否則 false，由呼叫的人退回合成音
//   GA.setListener(me.x, me.z, 鏡頭水平角);       // 每幀：聽者位置＝自己的角色，方向＝鏡頭
//   GA.setZone('meadow', 夜晚程度0到1, 是否戰鬥中, { water: 離最近水面幾公尺 });
//   GA.setVolume('music', 0.5);                  // 組別：master 總音量／sfx 音效（含介面）／ambient 環境／music 音樂
//   GA.setSpots([...]);                          // （可選）換掉位置固定的環境音清單（瀑布、營火、湖岸）；不呼叫就用索引 ambience.spots
//   GA.pauseAll(); GA.resumeAll();               // 切到背景分頁時模組自己會暫停；這兩個給遊戲另外需要時用

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => performance.now() / 1000;
const noop = () => {};

const S = {
  base: './assets/audio/', idx: null, state: 'new',        // new → loading → ready｜failed
  ctx: null, unlocked: false, hidden: false, userPaused: false,
  vol: { master: 0.8, sfx: 0.9, ambient: 0.6, music: 0.5 },
  n: {},                                                     // 節點：comp 壓縮器、master、sfx、amb
  sprites: {},                                               // 合併檔：id → { st, ab, buf, off, tries }
  voices: [], last: {}, lastSeg: {},                         // 發聲中的聲音、每組上次播放時間、每組最近播過的段
  L: { x: 0, z: 0, fx: 0, fz: 1 },                           // 聽者
  scene: { zone: 'town', night: 0, combat: false, water: Infinity, rain: 0 },
  beds: {}, shots: [], spots: null, sshots: [], spotInfo: {}, // 環境音循環、遠處叫聲的排程；spots＝位置固定的環境音（瀑布、營火、湖岸），sshots＝位置固定的單發聲
  M: { decks: [], pool: [], parked: {}, cur: null, key: null, combat: false, cT: 0, zoneKey: null, zonePending: undefined, zT: 0, blocked: false, bad: {} },      // bad：載入失敗的曲子（隔一段時間才再試）
  duck: 1, duckTo: 1, duckUntil: 0,
  steps: new Map(), timer: 0, tPrev: 0,
  stat: { played: 0, fallback: 0, throttled: 0, dropped: 0, far: 0, errors: [] }
};
const paused = () => S.hidden || S.userPaused;
const err = (where, e) => { if (S.stat.errors.length < 20) S.stat.errors.push(where + '：' + (e && e.message ? e.message : e)); };

/* ============================== 載入 ============================== */
// 抓檔案：任何失敗都只記錄、回傳 null，不往外丟
async function grab(file, type) {
  try { const r = await fetch(S.base + file); if (!r.ok) throw new Error('HTTP ' + r.status); return type === 'json' ? await r.json() : await r.arrayBuffer(); }
  catch (e) { err('載入 ' + file, e); return null; }
}
async function fetchSprite(id) {
  const sp = S.sprites[id]; if (!sp || sp.st !== 'idle') return;
  sp.st = 'loading'; const ab = await grab(S.idx.sprites[id].file);
  if (!ab) { sp.st = ++sp.tries < 2 ? 'idle' : 'error'; return; }
  sp.ab = ab; sp.st = 'fetched'; if (S.ctx) decodeSprite(id);
}
const decode = ab => new Promise((res, rej) => { try { const p = S.ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); } catch (e) { rej(e); } });
// MP3 解碼後開頭會多一小段空白，長短依瀏覽器而定。每個合併檔在固定位置（cal 秒）放了一個短記號，量它實際出現的時間就知道要補多少
function calibrate(buf, cal) {
  const d = buf.getChannelData(0), n = Math.min(d.length, Math.floor(buf.sampleRate * 0.5)); let m = 0;
  for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > m) m = v; }
  if (m < 0.05) return 0;                                   // 找不到記號：不校正
  for (let i = 0; i < n; i++) if (Math.abs(d[i]) >= m * 0.5) { const off = i / buf.sampleRate - cal; return Math.abs(off) < 0.15 ? off : 0; }
  return 0;
}
async function decodeSprite(id) {
  const sp = S.sprites[id]; if (!sp || sp.st !== 'fetched' || !S.ctx) return;
  sp.st = 'decoding';
  try { sp.buf = await decode(sp.ab); sp.ab = null; sp.off = calibrate(sp.buf, S.idx.sprites[id].cal || 0); sp.st = 'ready'; }
  catch (e) { sp.st = 'error'; sp.ab = null; err('解碼 ' + id, e); }
}
// 進遊戲後才需要的合併檔：一個一個在背景抓，不和畫面搶資源
function startDeferred() { if (S.deferred || S.state !== 'ready' || !S.unlocked) return; S.deferred = true; loadDeferred().catch(noop); }
async function loadDeferred() {
  const ids = Object.keys(S.idx.sprites).filter(k => !S.idx.sprites[k].core).sort((a, b) => (S.idx.sprites[a].order || 0) - (S.idx.sprites[b].order || 0));
  for (const id of ids) { await new Promise(r => setTimeout(r, 400)); await fetchSprite(id); if (S.sprites[id].st === 'fetched') await decodeSprite(id); }
}

/** 載入畫面呼叫。抓索引與核心音效；回傳 Promise<boolean>（成功與否），最多等 opts.timeout 毫秒，永遠不會 reject。 */
export function init(opts = {}) {
  if (S.state !== 'new') return S.initP || Promise.resolve(S.state === 'ready');
  S.state = 'loading'; if (opts.base) S.base = opts.base;
  if (opts.autoPause !== false && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { S.hidden = document.hidden; applyPause(); });
    S.hidden = !!document.hidden;
  }
  const work = (async () => {
    const idx = await grab(opts.index || 'audio-index.json', 'json');
    if (!idx || !idx.sounds || !idx.sprites) { S.state = 'failed'; return false; }
    S.idx = idx; Object.assign(S.vol, idx.volumes || {}, opts.volumes || {}, S.volSet || {});
    for (const id in idx.sprites) S.sprites[id] = { st: 'idle', ab: null, buf: null, off: 0, tries: 0 };
    for (const id in (idx.ambience || {}).beds || {}) S.beds[id] = { st: 'idle', buf: null, src: null, g: null, cur: 0, zeroT: 0 };
    S.shots = (((idx.ambience || {}).oneshots) || []).map(o => ({ o, next: 0 }));
    if (!S.spots) S.spots = ((idx.ambience || {}).spots) || [];
    S.sshots = (((idx.ambience || {}).spotShots) || []).map(o => ({ o, next: 0 }));
    S.state = 'ready'; if (S.ctx) buildGraph();
    await Promise.all(Object.keys(idx.sprites).filter(k => idx.sprites[k].core).map(fetchSprite));
    startDeferred();                                         // unlock 比 init 早呼叫的情況：這裡補上
    return true;
  })().catch(e => { err('init', e); S.state = 'failed'; return false; });
  S.initP = Promise.race([work, new Promise(r => setTimeout(() => r(S.state === 'ready'), opts.timeout || 8000))]);
  return S.initP;
}

/* ============================== AudioContext ============================== */
function buildGraph() {
  const c = S.ctx, n = S.n; if (!c || n.master) return;
  const L = (S.idx && S.idx.limits) || {}, C = L.compressor || {};
  n.comp = c.createDynamicsCompressor();                     // 總輸出的壓縮器：很多聲音疊在一起時收住，不爆音
  n.comp.threshold.value = C.threshold ?? -12; n.comp.knee.value = C.knee ?? 8; n.comp.ratio.value = C.ratio ?? 6; n.comp.attack.value = C.attack ?? 0.003; n.comp.release.value = C.release ?? 0.14;
  n.master = c.createGain(); n.sfx = c.createGain(); n.amb = c.createGain();
  n.sfx.connect(n.comp); n.amb.connect(n.comp); n.comp.connect(n.master); n.master.connect(c.destination);
  n.master.gain.value = S.vol.master; n.sfx.gain.value = S.vol.sfx; n.amb.gain.value = S.vol.ambient;
}
/** 使用者第一次點擊或按鍵時呼叫（瀏覽器規定要有使用者操作才能出聲）。可以重複呼叫。回傳是否有 AudioContext 可用。 */
export function unlock() {
  try {
    if (!S.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; S.ctx = new AC({ latencyHint: 'interactive' }); if (S.idx) buildGraph(); }
    if (S.ctx.state === 'suspended' && !paused()) S.ctx.resume().catch(noop);
  } catch (e) { err('建立 AudioContext', e); S.ctx = null; return false; }
  if (!S.unlocked) {
    S.unlocked = true; S.tPrev = now(); S.timer = setInterval(tick, 50);
    (S.initP || Promise.resolve()).then(async () => {
      if (S.state !== 'ready') return; buildGraph();
      for (const id in S.sprites) if (S.sprites[id].st === 'fetched') await decodeSprite(id);
      startDeferred();
    });
  }
  if (S.M.blocked) { S.M.blocked = false; for (const d of S.M.decks) if (d.blocked) { d.blocked = false; tryPlay(d); } }      // 音樂上次被瀏覽器擋下：趁這次使用者操作再試
  return true;
}
function applyPause() {
  const p = paused();
  try { if (S.ctx) { if (p && S.ctx.state === 'running') S.ctx.suspend().catch(noop); else if (!p && S.unlocked && S.ctx.state === 'suspended') S.ctx.resume().catch(noop); } } catch (e) {}
  for (const d of S.M.decks) { try { if (p) d.el.pause(); else if (!d.blocked) tryPlay(d); } catch (e) {} }
  if (!p) S.tPrev = now();
}
export function pauseAll() { S.userPaused = true; applyPause(); }
export function resumeAll() { S.userPaused = false; applyPause(); }

/* ============================== 音量 ============================== */
/** 組別：'master' 總音量、'sfx' 音效（含介面）、'ambient' 環境、'music' 音樂；v 為 0–1。init 之前呼叫也會記住。 */
export function setVolume(group, v) {
  if (!(group in S.vol)) return; v = clamp(+v || 0); S.vol[group] = v; (S.volSet || (S.volSet = {}))[group] = v;
  const node = { master: S.n.master, sfx: S.n.sfx, ambient: S.n.amb }[group];
  if (node && S.ctx) { try { node.gain.setTargetAtTime(v, S.ctx.currentTime, 0.03); } catch (e) { node.gain.value = v; } }
}
export const getVolume = group => S.vol[group];

/* ============================== 短音效 ============================== */
// 事件名稱＋參數 → 索引裡的對照。標籤順序：武器表查到的、a（字串是它本身，其他為真是 'strong'）、opt.tag；從最具體的組合找起
function resolve(name, a, opt) {
  const E = S.idx.events, tags = [], w = opt && opt.wp != null && S.idx.weapons ? S.idx.weapons[opt.wp] : null;
  if (w) { const t = Object.prototype.hasOwnProperty.call(w, name) ? w[name] : (name === 'parry' || name === 'break') ? w.block : null; if (typeof t === 'string' && t) tags.push(t); }
  if (typeof a === 'string') { if (a) tags.push(a); } else if (a) tags.push('strong');
  if (opt && opt.tag) for (const t of [].concat(opt.tag)) if (typeof t === 'string' && t) tags.push(t);
  const n = Math.min(tags.length, 5), own = k => Object.prototype.hasOwnProperty.call(E, k);
  if (n) {
    const subs = [];
    for (let m = 1; m < (1 << n); m++) { const s = []; for (let i = 0; i < n; i++) if (m & (1 << i)) s.push(tags[i]); subs.push([s, m]); }
    subs.sort((p, q) => q[0].length - p[0].length || p[1] - q[1]);        // 標籤多的優先；一樣多時，前面的標籤（武器、a）優先
    for (const [s] of subs) { const k = name + '/' + s.join('/'); if (own(k)) return E[k]; }
  }
  return own(name) ? E[name] : null;
}
/** 這個事件有沒有對應的實錄音效（不管載好了沒）。 */
export function has(name, a, opt) { if (!S.idx) return false; const e = resolve(name, a, opt); return !!e; }

// 距離衰減與左右定位：自己算，不用 3D 定位節點。回傳 [音量倍率, 左右(-1..1)]；沒給位置就是不衰減、置中
function place(opt, range) {
  if (!opt || opt.x == null || opt.z == null) return [1, opt && opt.pan != null ? opt.pan : 0];
  const Lm = S.idx.limits || {}, ref = Lm.refDist || 6, dx = opt.x - S.L.x, dz = opt.z - S.L.z, d = Math.hypot(dx, dz);
  if (!range) return [1, 0];
  if (d >= range) return [0, 0];
  const att = d <= ref ? 1 : Math.pow(1 - (d - ref) / Math.max(1, range - ref), 1.6);
  const lat = d > 0.001 ? (dx * -S.L.fz + dz * S.L.fx) / d : 0;        // 往鏡頭右邊的分量（右向量＝(-fz, fx)）
  return [att, clamp(lat * (Lm.panWidth || 0.75) * clamp((d - 0.5) / 3.5), -1, 1)];
}
function stopVoice(v, t = 0.03) { try { v.g.gain.setTargetAtTime(0, S.ctx.currentTime, t / 3); v.src.stop(S.ctx.currentTime + t + 0.02); } catch (e) {} }
// 播一層。回傳 true＝處理了（包含因為太遠、太密、同時發聲滿了而刻意不播），false＝播不了（還沒載好）
function fire(spec, opt, strict) {
  const I = S.idx, G = I.sounds[spec.g]; if (!G) return false;
  const sp = S.sprites[G.sp]; if (!sp) return false;
  if (sp.st !== 'ready') { if (sp.st === 'idle') fetchSprite(G.sp).catch(noop); return false; }      // 還沒抓（背景還沒輪到，或上次失敗）：現在抓，這一次由呼叫的人退回合成音
  const c = S.ctx, t = c.currentTime, [att, pan] = place(opt, G.range);
  if (att <= 0.004) { S.stat.far++; return true; }
  if (t - (S.last[spec.g] ?? -9) < (G.gap || 0)) { S.stat.throttled++; return true; }          // 同一組的最短間隔
  let same = 0; for (const v of S.voices) if (v.gid === spec.g) same++;
  if (same >= (G.max || 4)) { S.stat.throttled++; return true; }
  const limit = (I.limits && I.limits.voices) || 16;
  if (S.voices.length >= limit) {                            // 同時發聲滿了：擠掉優先度最低（一樣低就最舊）的那個；新的優先度更低就不播
    let k = -1; for (let i = 0; i < S.voices.length; i++) if (k < 0 || S.voices[i].prio < S.voices[k].prio || (S.voices[i].prio === S.voices[k].prio && S.voices[i].t0 < S.voices[k].t0)) k = i;
    if (k < 0 || S.voices[k].prio > (G.prio || 0)) { S.stat.dropped++; return true; }
    stopVoice(S.voices[k]); S.voices.splice(k, 1);
  }
  // 變化輪播：不連續播同一段；有四段以上時連前前一段也避開
  const segs = G.segs, hist = S.lastSeg[spec.g] || (S.lastSeg[spec.g] = []); let i = 0;
  if (opt && opt.seg != null) i = clamp(opt.seg | 0, 0, segs.length - 1);
  else if (spec.seg != null) i = clamp(spec.seg | 0, 0, segs.length - 1);
  else if (segs.length > 1) { const avoid = hist.slice(0, segs.length > 3 ? 2 : 1); do { i = Math.floor(Math.random() * segs.length); } while (avoid.includes(i)); }
  hist.unshift(i); hist.length = Math.min(hist.length, 2);
  const seg = segs[i], vj = G.vj || 0, rj = G.rj || 0;
  const gain = G.vol * seg[2] * (spec.vol ?? 1) * ((opt && opt.vol) ?? 1) * att * (1 + rnd(-vj, vj));
  const rate = clamp((spec.rate ?? 1) * ((opt && opt.rate) ?? 1) * (1 + rnd(-rj, rj)), 0.4, 2.5);
  try {
    const src = c.createBufferSource(), g = c.createGain(), when = t + (spec.delay || 0) + ((opt && opt.delay) || 0); let tail = g;
    src.buffer = sp.buf; src.playbackRate.value = rate; g.gain.value = gain;
    const lp = (opt && opt.lp) || spec.lp;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); f.connect(g); } else src.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    tail.connect(S.n.sfx);
    const len = Math.min(seg[1], spec.len || seg[1]);        // spec.len：只播前面這麼長（例如只要地面重擊的開頭），結尾 60 毫秒淡出
    src.start(when, Math.max(0, sp.off + seg[0]), len);     // 第三個參數是「要播多長的內容」，不受音高倍率影響
    if (len < seg[1]) { const end = when + len / rate; g.gain.setValueAtTime(gain, Math.max(when, end - 0.06)); g.gain.linearRampToValueAtTime(0.0001, end); }
    const v = { src, g, gid: spec.g, prio: G.prio || 0, t0: when };
    src.onended = () => { const k = S.voices.indexOf(v); if (k >= 0) S.voices.splice(k, 1); try { tail.disconnect(); } catch (e) {} };
    S.voices.push(v); S.last[spec.g] = t; S.stat.played++;
    if (G.duck) { S.duckTo = Math.min(S.duckTo, G.duck); S.duckUntil = Math.max(S.duckUntil, now() + len / rate + 0.25); }       // 提示樂句響的時候把音樂壓小
    return true;
  } catch (e) { err('播放 ' + spec.g, e); return strict ? false : true; }
}
/**
 * 播放一個遊戲事件。回傳 true＝有對應的實錄音效而且處理了；false＝沒有對應或還播不了（呼叫的人退回合成音）。
 * a：事件原本的參數（重擊與否、閃避種類、技能代號、怪物種類…）。
 * opt：{ x, z 聲音的世界座標（不給就是自己身上，不衰減）, wp 武器編號, tag 額外標籤（字串或陣列）, vol, rate, lp, delay }
 */
export function play(name, a, opt) {
  const r = play1(name, a, opt); if (S.trace) { try { S.trace(name, a, opt, r, S.why); } catch (e) {} } return r;
}
// S.why：這一次的結果——ok 播了（或刻意不播：太遠、太密）｜paused 分頁在背景｜off 模組還沒就緒｜stalled AudioContext 沒在跑｜nomap 沒有對照｜notready 音檔還沒載好
function play1(name, a, opt) {
  S.why = 'off'; if (S.state !== 'ready' || !S.ctx || !S.unlocked || !S.n.master) return false;
  S.why = 'paused'; if (paused()) return true;              // 分頁在背景：整個靜音，也不要退回合成音
  // AudioContext 沒在跑（剛建立、被瀏覽器擋住或中斷）：不要排進去（之後恢復時會一口氣全部響），交給呼叫的人
  if (S.ctx.state !== 'running') { S.why = 'stalled'; try { S.ctx.resume().catch(noop); } catch (e) {} return false; }
  let ev; try { ev = resolve(name, a, opt); } catch (e) { ev = null; }
  if (!ev) { S.why = 'nomap'; S.stat.fallback++; return false; }
  const main = typeof ev === 'string' ? { g: ev } : ev;
  if (!fire(main, opt, true)) { S.why = 'notready'; S.stat.fallback++; return false; }
  if (main.layers) for (const l of main.layers) fire(l, opt, false);
  S.why = 'ok'; return true;
}
/** 試聽用：直接播某一組的第 i 段（測試頁用）。 */
export function preview(gid, i, opt) { if (!S.ctx || !S.n.master) return false; return fire({ g: gid }, Object.assign({ seg: i }, opt), true); }

/* ============================== 腳步 ============================== */
/**
 * 腳步的節拍。每幀對每個要發出腳步聲的角色呼叫一次；到了該踩地的時候自己播 'step'。
 * key：角色的識別（自己用 'me'，別人用連線代號）；speed01：0–1 的移動速度（和動畫用的同一個值）；mat：地面材質（見索引的 events：step/…）；
 * x、z：別的角色才給（自己不給，置中不衰減）；phase：跑步動畫目前的相位 0–1（給了就照動畫踩地的時間點，沒給就用同樣的速度公式自己數拍子）。
 */
export function footstep(key, dt, speed01, mat, x, z, phase) {
  if (!S.idx) return false; const P = S.idx.steps || {}, st = S.steps.get(key) || { ph: 0, last: -1 }; S.steps.set(key, st);
  if (!(speed01 > (P.min ?? 0.2))) { st.ph = 0.4; st.last = -1; return false; }       // 停下來：下次起步很快就踩第一步
  let hit = false;
  if (phase != null) { for (const c of P.contacts || [0.05, 0.55]) { const a = (st.last - c + 1) % 1, b = (phase - c + 1) % 1; if (st.last >= 0 && b < a && a - b > 0.5) hit = true; } st.last = phase; }
  else { st.ph += dt * ((P.base ?? 0.95) + clamp(speed01) * (P.k ?? 0.35)) / ((P.cycle ?? 0.8) / 2); if (st.ph >= 1) { st.ph -= Math.floor(st.ph); hit = true; } }
  if (!hit) return false;
  return play('step', mat || '', { x, z, vol: lerp(P.volMin ?? 0.55, 1, clamp(speed01)) * (S.alongK ? S.alongK.sk : 1) });
}

/* ============================== 聽者與場景 ============================== */
/** 聽者位置（自己的角色）與鏡頭水平角 yaw（弧度；鏡頭朝向＝(sin yaw, cos yaw)，和 main.js 的 input.cam.yaw 同一個定義；俯視視角給 Math.PI）。 */
export function setListener(x, z, yaw) { S.L.x = x; S.L.z = z; if (yaw != null) { S.L.fx = Math.sin(yaw); S.L.fz = Math.cos(yaw); } }
/**
 * 場景狀態：決定環境音與音樂。可以每幀呼叫（內部自己做淡入淡出與防抖）。
 * zone：'town'｜'meadow'｜'forest'｜'canyon'｜'lair'；night：是否夜晚，或 0–1 的夜晚程度；combat：是否戰鬥中；
 * env：{ water: 離最近水面的公尺數（在水裡給 0；附近沒有水就不給） }
 */
export function setZone(zone, night, combat, env) {
  const sc = S.scene; if (zone) sc.zone = zone; sc.sub = (env && env.sub) || sc.zone; /* 0.8 X11：新區名（古道、鹽原…）；舊區域與子區域沒有自己的配置時退回 zone */ sc.night = night === true ? 1 : clamp(+night || 0); sc.combat = !!combat;
  const wt = env && env.water != null && isFinite(env.water) ? Math.max(0, env.water) : Infinity; sc.water = wt;
  if (env && env.rain != null) sc.rain = clamp(+env.rain || 0);      // 0.8：雨量 0–1（給了就一直有效，直到下次給）
}

/* ============================== 環境音 ============================== */
async function loadBed(id) {
  const b = S.beds[id]; if (b.st !== 'idle' || !S.ctx) return; b.st = 'loading';
  const ab = await grab(S.idx.ambience.beds[id].file); if (!ab) { b.st = 'error'; return; }
  try { b.buf = await decode(ab); b.st = 'ready'; } catch (e) { b.st = 'error'; err('解碼環境音 ' + id, e); }
}
// 位置固定的環境音（索引 ambience.spots）：at＝一個點，或 line＝折線［x, z, 半寬］（離水邊多遠）。near 以內最大聲（max），far 以外聽不到；
// lp：［近處, 遠處］的低通頻率（遠的只剩低頻）；pan：依方向分左右的程度；duck：{ 別的環境音: 比例 }＝站在這裡時把那一層壓小（例如長灣把溪流聲壓掉）。
// 同一層被好幾個點用到（六處營火）時，取最近、最大聲的那一個決定音量、左右與低通。
function spotDist(sp) {
  const L = S.L;
  if (sp.at) return [Math.hypot(sp.at[0] - L.x, sp.at[1] - L.z), sp.at[0], sp.at[1]];
  let best = [Infinity, L.x, L.z]; const P = sp.line || [];
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], ux = b[0] - a[0], uz = b[1] - a[1], l2 = ux * ux + uz * uz || 1, t = clamp(((L.x - a[0]) * ux + (L.z - a[1]) * uz) / l2);
    const px = a[0] + ux * t, pz = a[1] + uz * t, d = Math.max(0, Math.hypot(L.x - px, L.z - pz) - lerp(a[2] || 0, b[2] || 0, t));
    if (d < best[0]) best = [d, px, pz];
  }
  return best;
}
function spotTargets(out) {
  const info = {}, duck = {};
  for (const sp of S.spots || []) {
    if (!sp || !sp.bed || !(sp.bed in out)) continue;
    const [d, x, z] = spotDist(sp), far = sp.far || 40, near = sp.near || 3; if (d >= far) continue;
    const u = clamp((d - near) / Math.max(0.1, far - near)), w = Math.pow(1 - u, 1.6) * (sp.when === 'day' ? 1 - S.scene.night : sp.when === 'night' ? S.scene.night : 1), v = (sp.max ?? 1) * w;      // when：只在白天／夜裡（隨夜晚程度交叉淡化）
    if (sp.duck) for (const k in sp.duck) duck[k] = Math.min(duck[k] ?? 1, 1 - sp.duck[k] * Math.min(1, w * 1.5));
    const cur = info[sp.bed]; if (cur && cur.v >= v) continue;
    const dx = x - S.L.x, dz = z - S.L.z, dd = Math.hypot(dx, dz), lat = dd > 0.01 ? (dx * -S.L.fz + dz * S.L.fx) / dd : 0;
    info[sp.bed] = { v, d: +d.toFixed(1), pan: clamp(lat * (sp.pan || 0) * clamp((dd - near * 0.5) / Math.max(1, near)), -1, 1), lp: sp.lp ? sp.lp[0] * Math.pow(sp.lp[1] / sp.lp[0], u) : 0 };
  }
  for (const id in info) out[id] = Math.max(out[id], info[id].v);
  for (const id in duck) if (id in out) out[id] *= duck[id];
  S.spotInfo = info;
}
/* 0.8 X11：沿著一條線走的進度 0–1（古道：入口 a → 門前 b） */
function alongProg(AL) { const dx = AL.b[0] - AL.a[0], dz = AL.b[1] - AL.a[1]; return clamp(((S.L.x - AL.a[0]) * dx + (S.L.z - AL.a[1]) * dz) / (dx * dx + dz * dz)); }
function bedTargets() {
  const A = S.idx.ambience, sc = S.scene, Z = A.zones[sc.sub] || A.zones[sc.zone] || {}, D = Z.day || {}, N = Z.night || {}, out = {};
  for (const id in A.beds) out[id] = lerp(D[id] || 0, N[id] || 0, sc.night);
  S.alongK = null;
  try { const AL = Z.along; if (AL) { const t = alongProg(AL), u = Math.pow(t, AL.k || 1); for (const id in AL.beds || {}) if (id in out) out[id] = lerp(AL.beds[id][0], AL.beds[id][1], u); S.alongK = { t, mk: lerp((AL.music || [1, 1])[0], (AL.music || [1, 1])[1], t), sk: lerp((AL.step || [1, 1])[0], (AL.step || [1, 1])[1], t) }; } } catch (e) { err('along', e); }
  for (const id in A.water || {}) { const w = A.water[id]; if (id in out && sc.water < w.far) out[id] = Math.max(out[id], w.max * clamp((w.far - sc.water) / Math.max(0.1, w.far - w.near))); }
  // 0.8：下雨——雨層加上來，其他環境音壓低（索引 ambience.rain：bed、max、duck）
  try { { const RN = A.rain; if (RN && sc.rain > 0.01 && RN.bed in out) { for (const id in RN.duck || {}) if (id in out && id !== RN.bed) out[id] *= 1 - RN.duck[id] * sc.rain; out[RN.bed] = Math.max(out[RN.bed], (RN.max ?? 1) * sc.rain); } } spotTargets(out); } catch (e) { err('spots', e); }
  for (const id in out) out[id] *= A.beds[id].gain ?? 1;
  return out;
}
/** 換掉位置固定的環境音清單（格式同索引的 ambience.spots）。例如營火搬家時由遊戲傳入新的位置；不呼叫就用索引裡的。 */
export function setSpots(list) { S.spots = Array.isArray(list) ? list : null; }
function tickAmbience(dt) {
  const A = S.idx.ambience; if (!A || !S.n.amb) return; const c = S.ctx, T = bedTargets(), mute = S.vol.ambient * S.vol.master <= 0.001;
  for (const id in T) {
    const b = S.beds[id], want = mute ? 0 : T[id];
    if (want > 0.002 && b.st === 'idle') loadBed(id);       // 用到才抓、才解碼
    if (b.st !== 'ready') continue;
    // 解碼後的立體聲循環一層約 19 MB：停用超過 75 秒就放掉，之後用到再從瀏覽器快取抓回來解碼
    if (!b.src && want <= 0.002) { b.idleT = (b.idleT || 0) + dt; if (b.idleT > 75) { b.buf = null; b.st = 'idle'; b.idleT = 0; } continue; } else b.idleT = 0;
    if (want > 0.002 && !b.src) {
      try {                                                  // 檔案內容是週期訊號（循環長度 loopLen，前後各多 0.25 秒），所以起點有幾十毫秒的誤差也接得起來
        const src = c.createBufferSource(), g = c.createGain(), d = A.beds[id]; src.buffer = b.buf; src.loop = true; src.loopStart = d.loopStart; src.loopEnd = d.loopStart + d.loopLen;
        g.gain.value = 0; let tail = src;
        const si = S.spotInfo[id];                           // 位置固定的環境音：多接一個低通（遠的悶）與左右定位
        if (si) { b.f = c.createBiquadFilter(); b.f.type = 'lowpass'; b.f.frequency.value = si.lp || 18000; tail.connect(b.f); tail = b.f; if (c.createStereoPanner) { b.p = c.createStereoPanner(); b.p.pan.value = si.pan; tail.connect(b.p); tail = b.p; } }
        tail.connect(g); g.connect(S.n.amb); src.start(0, d.loopStart + Math.random() * d.loopLen * 0.98); b.src = src; b.g = g; b.cur = 0; b.zeroT = 0;
      } catch (e) { err('環境音 ' + id, e); b.st = 'error'; continue; }
    }
    if (!b.src) continue;
    if (Math.abs(want - b.cur) > 0.004) { b.cur = want; try { b.g.gain.setTargetAtTime(want, c.currentTime, (A.fade || 1.6) / 3); } catch (e) {} }
    const si = S.spotInfo[id];
    if (si) { try { if (b.f && si.lp) b.f.frequency.setTargetAtTime(si.lp, c.currentTime, 0.25); if (b.p) b.p.pan.setTargetAtTime(si.pan, c.currentTime, 0.15); } catch (e) {} }
    if (want <= 0.002) { b.zeroT += dt; if (b.zeroT > (A.fade || 1.6) * 2 + 2) { try { b.src.stop(); b.g.disconnect(); } catch (e) {} b.src = b.g = b.f = b.p = null; } } else b.zeroT = 0;
  }
  // 遠處的動物叫聲（夜晚的狼嚎、白天的鹿鳴）：隨機間隔、隨機左右、低通模擬距離；戰鬥中不播
  const t = now(), sc = S.scene;
  for (const s of S.shots) {
    const o = s.o; if (!s.next) s.next = t + rnd(o.every[0], o.every[1]) * 0.5;
    if (t < s.next) continue; s.next = t + rnd(o.every[0], o.every[1]);
    if (mute || sc.combat || !(o.zones.includes(sc.sub || sc.zone) || (!A.zones[sc.sub] && o.zones.includes(sc.zone))) || sc.night < o.night[0] || sc.night > o.night[1]) continue;
    fire({ g: o.g, vol: o.vol * S.vol.ambient / Math.max(0.05, S.vol.sfx), lp: o.lp, rate: rnd(0.95, 1.02) }, { pan: rnd(-0.8, 0.8) }, false);
  }
  // 位置固定的單發聲（例如採石場吊架的吱嘎）：聽者在 hear 公尺內才排；聲音從 at 附近 r 公尺內的隨機位置發出（依距離變小、分左右）
  for (const s of S.sshots) {
    const o = s.o; if (!o.on || (o.night && (S.scene.night < o.night[0] || S.scene.night > o.night[1]))) { s.next = 0; continue; }      // night：［最小, 最大］夜晚程度，範圍外不排
    if (mute || Math.hypot(o.at[0] - S.L.x, o.at[1] - S.L.z) > (o.hear || 60)) { s.next = 0; continue; }      // 不在附近：不排；一走進來，第一聲在 every 的四成左右就會出現
    if (!s.next) { s.next = t + rnd(o.every[0], o.every[1]) * 0.4; continue; }
    if (t < s.next) continue; s.next = t + rnd(o.every[0], o.every[1]);
    const a = Math.random() * Math.PI * 2, rr = Math.random() * (o.r || 0);
    fire({ g: o.g, vol: (o.vol ?? 1) * S.vol.ambient / Math.max(0.05, S.vol.sfx), rate: rnd(0.94, 1.04) }, { x: o.at[0] + Math.cos(a) * rr, z: o.at[1] + Math.sin(a) * rr }, false);
  }
}

/* ============================== 音樂 ============================== */
// 用 <audio> 串流（不整首解碼）。每首的檔尾已經做好淡出；快到檔尾（loopAt）時用另一個元素從頭開始，兩者交疊——所以循環不靠 loop 屬性。
// 全程不做跳轉（不設 currentTime）：有些主機不支援分段下載，跳轉會失敗。打完架要接回原本那首時，是把原本那個元素暫停著留下來（park），回來再繼續播
function tryPlay(d) { try { const p = d.el.play(); if (p && p.catch) p.catch(() => { d.blocked = true; S.M.blocked = true; }); } catch (e) { d.blocked = true; S.M.blocked = true; } }
function freeDeck(d) { try { d.el.pause(); d.el.onended = d.el.onerror = null; d.el.removeAttribute('src'); d.el.load(); } catch (e) {} if (S.M.pool.length < 3) S.M.pool.push(d.el); }
function startDeck(key, fadeIn) {
  const M = S.M, T = S.idx.music.tracks[key]; if (!T) return null;
  const el = M.pool.pop() || new Audio(); el.preload = 'auto'; el.loop = false; el.volume = 0;
  const d = { el, key, g: fadeIn > 0 ? 0 : 1, tg: 1, rate: fadeIn > 0 ? 1 / fadeIn : 99, ending: false, blocked: false, dead: false, park: false, parkedAt: 0 };
  el.onended = () => { d.dead = true; };
  el.onerror = () => { d.dead = true; err('音樂 ' + key, '載入失敗'); const b = M.bad[key] || (M.bad[key] = { n: 0, until: 0 }); b.n++; b.until = now() + Math.min(300, 10 * 2 ** b.n); };      // 抓不到：20 秒後再試，之後每次加倍（最多 5 分鐘），不要每一拍都重抓
  try { el.src = S.base + T.file; } catch (e) { d.dead = true; }
  if (!paused()) tryPlay(d);
  M.decks.push(d); return d;
}
function wantedTrack(dt) {
  const Mu = S.idx.music, M = S.M, sc = S.scene, zk = Mu.zones[sc.zone] || null;
  // 區域：站穩一段時間才換曲（沿著邊界走不會一直切）；戰鬥：開打一下子就進，結束後多留幾秒
  if (zk !== M.zonePending) { M.zonePending = zk; M.zT = 0; } else M.zT += dt;
  if (M.zoneKey == null || M.zT >= (Mu.zoneHold ?? 2.5)) M.zoneKey = zk;
  const fight = sc.combat && !(Mu.noCombatIn || []).includes(sc.zone);
  const out = (Mu.noCombatIn || []).includes(sc.zone) ? Math.min(1.5, Mu.combatOut ?? 7) : Mu.combatOut ?? 7;      // 回到城裡（倒下後甦醒、逃回城）：戰鬥曲很快退掉
  if (fight !== M.combat) { M.cT += dt; if (M.cT >= (fight ? Mu.combatIn ?? 1 : out)) { M.combat = fight; M.cT = 0; } } else M.cT = 0;
  return M.combat && Mu.combat ? Mu.combat : M.zoneKey;
}
function tickMusic(dt) {
  const Mu = S.idx.music; if (!Mu) return; const M = S.M, level = S.vol.music * S.vol.master, t = now(); let want = level > 0.001 ? wantedTrack(dt) : null;
  if (want && M.bad[want] && t < M.bad[want].until) want = null;      // 這首剛才載入失敗：先不放音樂
  if (want !== M.key) {
    const fade = Mu.switchFade ?? 2.2;
    for (const d of M.decks) { d.park = !!Mu.resume && d === M.cur && !d.ending && !!want; d.tg = 0; d.rate = 1 / fade; }       // 正在播的這首淡出後留著；音樂被關掉（want 為空）時不留
    M.key = want; M.cur = null;
    if (want) {
      const p = M.parked[want];
      if (p) { delete M.parked[want]; p.g = 0; p.tg = 1; p.rate = 1 / (fade * 0.7); p.park = false; M.decks.push(p); if (!paused()) tryPlay(p); M.cur = p; }       // 剛才留下來的：從停的地方接著播
      else M.cur = startDeck(want, fade * 0.7);
    }
  }
  const cur = M.cur;
  if (cur && !cur.ending) {
    const T = Mu.tracks[cur.key]; let ct = 0; try { ct = cur.el.currentTime; } catch (e) {}
    if (ct >= T.loopAt || cur.dead) { cur.ending = true; M.cur = startDeck(cur.key, T.fadeIn || 0); }       // 快到檔尾：下一輪從頭進來
  }
  // 提示樂句響的時候音樂壓小一點，結束後回來
  if (S.duckTo < 1 && t > S.duckUntil) S.duckTo = 1;
  S.duck += clamp((S.duckTo - S.duck), -dt * 5, dt * 1.6);
  const mkT = S.alongK && !S.scene.combat ? S.alongK.mk : 1; S.mk = (S.mk ?? 1) + (mkT - (S.mk ?? 1)) * Math.min(1, dt * 0.8); /* 0.8 X11：古道上音樂慢慢淡出 */
  const k = level * S.duck * lerp(1, Mu.nightGain ?? 1, S.scene.night) * S.mk;
  for (let i = M.decks.length - 1; i >= 0; i--) {
    const d = M.decks[i]; d.g = d.g < d.tg ? Math.min(d.tg, d.g + d.rate * dt) : Math.max(d.tg, d.g - d.rate * dt);
    try { d.el.volume = clamp(d.g * d.g * k * (Mu.tracks[d.key].gain ?? 1)); } catch (e) {}       // 平方曲線：淡入淡出聽起來比較平順
    if (d.dead || (d.tg === 0 && d.g <= 0.001)) {
      M.decks.splice(i, 1); if (M.cur === d) { M.cur = null; M.key = null; }
      if (!d.dead && d.park) { try { d.el.pause(); } catch (e) {} d.parkedAt = t; if (M.parked[d.key]) freeDeck(M.parked[d.key]); M.parked[d.key] = d; }
      else freeDeck(d);
    }
  }
  // 留太久就放掉（下次從頭播）；最多同時留兩首，多的放掉最舊的
  const pk = Object.keys(M.parked).sort((a, b) => M.parked[b].parkedAt - M.parked[a].parkedAt);
  pk.forEach((key, i) => { if (i >= 2 || t - M.parked[key].parkedAt > (Mu.parkFor ?? 120)) { freeDeck(M.parked[key]); delete M.parked[key]; } });
}

function tick() {
  const t = now(), dt = clamp(t - S.tPrev, 0, 0.25); S.tPrev = t;
  if (S.state !== 'ready' || paused()) return;
  try { tickAmbience(dt); } catch (e) { err('環境音', e); }
  try { tickMusic(dt); } catch (e) { err('音樂', e); }
}

/* ============================== 狀態（除錯與測試用） ============================== */
export function stats() {
  const sp = {}; for (const id in S.sprites) sp[id] = { st: S.sprites[id].st, off: +S.sprites[id].off.toFixed(4) };
  const beds = {}; for (const id in S.beds) { const si = S.spotInfo[id]; beds[id] = { st: S.beds[id].st, on: !!S.beds[id].src, gain: +S.beds[id].cur.toFixed(3) }; if (si) Object.assign(beds[id], { spotD: si.d, pan: +si.pan.toFixed(2), lp: Math.round(si.lp) }); }
  return { state: S.state, unlocked: S.unlocked, ctx: S.ctx ? S.ctx.state : null, rate: S.ctx ? S.ctx.sampleRate : 0, paused: paused(), vol: Object.assign({}, S.vol), sprites: sp, beds, voices: S.voices.length,
    music: { key: S.M.key, combat: S.M.combat, blocked: S.M.blocked, parked: Object.keys(S.M.parked), decks: S.M.decks.map(d => ({ key: d.key, g: +d.g.toFixed(2), tg: d.tg, ending: d.ending, t: +(d.el.currentTime || 0).toFixed(1), paused: d.el.paused })) },
    scene: Object.assign({}, S.scene), stat: Object.assign({}, S.stat, { errors: S.stat.errors.slice() }) };
}
/** 索引（唯讀用途：設定畫面要列出處、測試頁要列出每一段）。 */
export const index = () => S.idx;
/** 測試頁用：拿到解碼後的合併檔與校正值；音樂播放器的內部狀態（用來驗證循環交疊）。 */
export const _sprite = id => S.sprites[id];
export const _music = () => S.M;
/** 測試與診斷用：fn(name, a, opt, 回傳值, 原因) 會在每一次 play() 之後被呼叫；_nodes() 拿到 AudioContext 與輸出節點（接 AnalyserNode 量峰值）。 */
export const _trace = fn => { S.trace = fn || null; };
export const _nodes = () => ({ ctx: S.ctx, n: S.n });
/** 測試用：事件會對到索引裡的哪一個規格（不播放）。 */
export const _resolve = (name, a, opt) => (S.idx ? resolve(name, a, opt) : null);
export default { init, unlock, play, has, preview, footstep, setListener, setZone, setSpots, setVolume, getVolume, pauseAll, resumeAll, stats, index };
