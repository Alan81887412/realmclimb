// 0.7 存檔代碼（w7-map）：設定裡的「存檔」——匯出一段文字代碼（能下載就另給檔案）、匯入前先顯示角色名、等級、金幣讓你確認。
// 擁有者、編輯者（雲端存檔）、檢視者（只存在這個瀏覽器）三種身分都能匯出匯入。代碼附檢查碼：貼錯會被發現；擋不住會寫程式的人改內容（和存在瀏覽器裡一樣）。
// 存在本機的玩家：進遊戲時、每升 3 級，看到一行提醒。
// 這個檔只在函式裡用 game.js 的東西（game.js 會靜態匯入這個檔）。
import { Store, P, Net, ui, input } from './game.js';
import { WORLD } from './core.js';

const PREFIX = 'WSY7', LS_KEY = 'wanshou-profile-v2';
export const SAVE7 = { warnEvery: 3, maxLen: 60000 };

/* ============================== 編碼 ============================== */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = s => { let c = 0xFFFFFFFF; for (let i = 0; i < s.length; i++) c = CRC[(c ^ s.charCodeAt(i)) & 255] ^ (c >>> 8); return ((c ^ 0xFFFFFFFF) >>> 0).toString(36); };
const b64u = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function pipe(u8, Stream, kind) { if (typeof Stream !== 'function') return null; try { const s = new Blob([u8]).stream().pipeThrough(new Stream(kind)); return new Uint8Array(await new Response(s).arrayBuffer()); } catch (e) { return null; } }
const deflate = u8 => pipe(u8, typeof CompressionStream !== 'undefined' ? CompressionStream : null, 'deflate-raw');
const inflate = u8 => pipe(u8, typeof DecompressionStream !== 'undefined' ? DecompressionStream : null, 'deflate-raw');

// 匯出：現有存檔＋0.7 的新欄位（Store.snapshot 已經包含各模組的 save）。ex（0.5a 相容用的 96×96 迷霧）是 ex2 的一部分，代碼裡不放
export async function makeCode(snap) {
  const d = Object.assign({}, snap || Store.snapshot()); delete d.ex;
  const json = JSON.stringify({ v: 7, t: Date.now(), d }); let u8 = new TextEncoder().encode(json), flag = 'j';
  const z = await deflate(u8); if (z && z.length < u8.length) { u8 = z; flag = 'z'; }
  const body = b64u(u8); return `${PREFIX}.${flag}.${body}.${crc32(flag + body)}`;
}
// 檢查代碼：回傳 { ok, d（存檔）, t（匯出時間）} 或 { ok: false, msg }
export async function readCode(text) {
  const s = String(text || '').replace(/\s+/g, ''); if (!s) return { ok: false, msg: '先把存檔代碼貼進來。' };
  if (s.length > SAVE7.maxLen) return { ok: false, msg: '代碼太長，不像是存檔代碼。' };
  const m = /^WSY7\.([jz])\.([A-Za-z0-9_-]+)\.([0-9a-z]{1,8})$/.exec(s);
  if (!m) return { ok: false, msg: s.startsWith(PREFIX) ? '代碼不完整：開頭或結尾少了一段。請整段重新複製（從 WSY7. 一直到最後）。' : '這不是《登界》的存檔代碼（應該以「WSY7.」開頭）。' };
  if (crc32(m[1] + m[2]) !== m[3]) return { ok: false, msg: '代碼不完整或被改過（檢查碼對不上）。請整段重新複製一次。' };
  let u8; try { u8 = unb64u(m[2]); } catch (e) { return { ok: false, msg: '代碼裡有不該出現的字元。' }; }
  if (m[1] === 'z') { u8 = await inflate(u8); if (!u8) return { ok: false, msg: '這個瀏覽器解不開壓縮過的代碼。請換新版的 Chrome、Edge 或 Safari 再試。' }; }
  let o; try { o = JSON.parse(new TextDecoder().decode(u8)); } catch (e) { return { ok: false, msg: '代碼內容讀不出來。' }; }
  const d = o && o.d; if (!d || typeof d !== 'object' || typeof d.name !== 'string' || !d.name || typeof d.lv !== 'number') return { ok: false, msg: '代碼裡沒有角色資料。' };
  return { ok: true, d, t: +o.t || 0 };
}

/* ============================== 身分與匯入 ============================== */
// 擁有者／編輯者：雲端存檔（資料庫寫得進去）；檢視者：只存在這個瀏覽器
export async function role() {
  const u = Net.user; let owner = false, edit = false;
  try { if (u && typeof u.isOwner === 'function') owner = !!(await u.isOwner()); } catch (e) {}
  try { if (u && typeof u.canEdit === 'function') edit = !!(await u.canEdit()); } catch (e) {}
  if (!owner && !edit && u && typeof u.me === 'function') { try { const m = await u.me(); owner = !!(m && m.isOwner); edit = !!(m && m.canEdit); } catch (e) {} }
  return owner ? 'owner' : edit || Store.mode === 'cloud' ? 'editor' : 'viewer';
}
export const ROLE_NAME = { owner: '擁有者', editor: '編輯者', viewer: '檢視者' };
const nameKey = n => 'names/n' + Array.from(new TextEncoder().encode(n.toLowerCase())).map(b => b.toString(16).padStart(2, '0')).join('');
const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
// 覆蓋現在的角色，然後重新載入頁面（重新載入前擋住自動存檔，免得舊角色又被寫回去）
export async function applyImport(d) {
  d = Object.assign({}, d); d.name = String(d.name).slice(0, 12); d.updated = new Date().toISOString();
  if (Store.mode === 'cloud' && Net.db && Store.uid) {
    const db = Net.db, uid = Store.uid;
    try {
      if (d.name.toLowerCase() !== String(P.name).toLowerCase()) {      // 照常檢查角色名重複（和註冊時一樣）
        const kd = db.doc(nameKey(d.name)), cur = await withTimeout(kd.get(), 8000), cd = (cur.exists && cur.data()) || {};
        if (cd.owner && cd.owner !== uid) return { ok: false, msg: `角色名「${d.name}」在這裡已經有人用了，不能匯入成這個名字。` };
        const lease = await withTimeout(kd.acquire({ holder: uid, ttlMs: 5000 }), 8000); if (lease && lease.acquired === false) return { ok: false, msg: '這個名字正在被別人註冊，請稍後再試。' };
        await withTimeout(kd.set({ owner: uid, name: d.name }), 8000);
      }
      const doc = db.doc('players/' + uid), cur = await withTimeout(doc.get(), 8000), old = (cur.exists && cur.data()) || {};
      Store.saving = true; Store.dirty = false;
      await withTimeout(doc.set(Object.assign({ uid: old.uid != null ? old.uid : P.serial, created: old.created || new Date().toISOString() }, d)), 8000);
    } catch (e) { Store.saving = false; return { ok: false, msg: '寫不進雲端存檔（' + ((e && (e.code || e.message)) || '錯誤') + '）。角色沒有改變。' }; }
  } else if (Store.mode === 'local' || Store.mode === 'pending') {
    try { Store.saving = true; Store.dirty = false; localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) { Store.saving = false; return { ok: false, msg: '這個瀏覽器不讓網頁存東西，沒辦法匯入。' }; }
  } else return { ok: false, msg: '這個環境不存檔（' + (Store.reason || '不明') + '），沒辦法匯入。' };
  setTimeout(() => { try { location.reload(); } catch (e) {} }, 900); return { ok: true };
}

/* ============================== 視窗 ============================== */
const $ = id => document.getElementById(id);
const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const CSS = `
#winSave7{left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,94vw)}
#winSave7 textarea{width:100%;box-sizing:border-box;height:84px;resize:vertical;font:11.5px/1.45 ui-monospace,Consolas,monospace;color:#e9e2cf;background:rgba(0,0,0,.42);border:1px solid var(--line-strong);border-radius:5px;padding:6px 8px;word-break:break-all}
#winSave7 .s7who{padding:8px 10px;border-radius:6px;background:rgba(0,0,0,.25);font-size:13px;line-height:1.65;color:var(--ink-dim)} #winSave7 .s7who b{color:var(--ink)} #winSave7 .s7who .w{color:var(--warn)}
#winSave7 .s7bt{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px} #winSave7 .s7bt button{padding:4px 12px;font-size:13px} #winSave7 .s7bt small{color:var(--ink-dim);font-size:12px}
#winSave7 .s7msg{margin-top:6px;font-size:12.5px;line-height:1.55} #winSave7 .s7msg.bad{color:var(--bad)} #winSave7 .s7msg.ok{color:var(--ok)}
#winSave7 .s7card{margin-top:8px;padding:10px 12px;border-radius:6px;border:1px solid var(--brass-dark);background:rgba(201,163,90,.08)} #winSave7 .s7card dl{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;margin:0 0 8px;font-size:13.5px} #winSave7 .s7card dt{color:var(--ink-dim)} #winSave7 .s7card dd{margin:0}
#winSave7 .s7card .w{font-size:12.5px;color:var(--warn);line-height:1.55;margin-bottom:8px}
#save7Row{margin-bottom:4px} #save7Row span small{display:block;font-size:11.5px;color:var(--ink-dim);margin-top:1px}
`;
function build() {
  if ($('winSave7')) return;
  const st = el('style'); st.id = 'css7s'; st.textContent = CSS; document.head.appendChild(st);
  const s = el('section', 'win'); s.id = 'winSave7'; s.hidden = true; s.innerHTML = '<header><h2>存檔代碼</h2><button class="x" data-close>×</button></header><div class="body"></div>'; document.body.appendChild(s);
  const set = $('winSet'), body = set && set.querySelector('.body'); if (body) { const h = el('h3', '', '存檔'), r = el('div', 'rowline'); r.id = 'save7Row'; r.innerHTML = '<span>存檔代碼<small id="save7Where"></small></span><button id="save7Btn">匯出／匯入</button>'; body.insertBefore(r, body.firstChild); body.insertBefore(h, r); $('save7Btn').onclick = () => open(); }
}
if (typeof document !== 'undefined' && document.body) build();      // 視窗要在 ui.js 第一次查 WINS 之前就存在
export function open() { build(); if (ui.win7) ui.win7('save7', true); else $('winSave7').hidden = false; render(); }
const V = { code: '', roleK: '', parsed: null, msg: '', msgCls: '', imp: '', busy: false };
export async function render() {
  const w = $('winSave7'); if (!w || w.hidden) return; const body = w.querySelector('.body'); body.textContent = '';
  if (!V.roleK) { V.roleK = 'viewer'; role().then(r => { V.roleK = r; render(); }); }
  const local = Store.mode !== 'cloud', who = el('div', 's7who');
  who.innerHTML = `你的身分：<b>${ROLE_NAME[V.roleK] || '檢視者'}</b>　存檔在：<b>${Store.label()[0]}</b><br>` + (local ? '<span class="w">角色只存在這個瀏覽器，換電腦或清掉瀏覽器資料就會不見。把代碼存好（貼到記事本、寄給自己都可以），換電腦時再匯入。</span>' : '角色存在雲端，換電腦用同一個帳號進來就在。代碼可以當備份，或把角色帶到別的瀏覽器。');
  body.appendChild(who);
  if (local && Net.db && Store.uid) { const r = el('div', 's7bt'), b = el('button', '', V.busy ? '處理中…' : '存到雲端'), sm = el('small', '', V.roleK === 'viewer' ? '檢視者寫不進雲端；請擁有者把你改成編輯者' : '編輯者、擁有者可以把這個角色搬到雲端存檔（之後換電腦用同一個帳號就在）'); b.disabled = V.busy; b.onclick = () => toCloud(); r.append(b, sm); body.appendChild(r); }
  body.appendChild(el('h3', '', '匯出'));
  const ta = el('textarea'); ta.readOnly = true; ta.id = 's7out'; ta.value = V.code; ta.placeholder = '按「產生存檔代碼」'; ta.onfocus = () => ta.select(); body.appendChild(ta);
  const bt = el('div', 's7bt'), gen = el('button', 'primary', V.code ? '重新產生' : '產生存檔代碼'), cp = el('button', '', '複製'), dl = el('button', '', '下載檔案'), info = el('small', '', V.code ? `${V.code.length.toLocaleString()} 字元（包含手繪地圖、收到的地圖、陷阱紀錄……）` : '');
  gen.style.cssText = 'padding:4px 14px;font-size:13px'; gen.onclick = async () => { Store.flush(); V.code = await makeCode(); V.msg = ''; render(); };
  cp.disabled = dl.disabled = !V.code;
  cp.onclick = async () => { let ok = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(V.code); ok = true; } } catch (e) {} if (!ok) { const t = $('s7out'); t.focus(); t.select(); try { ok = document.execCommand('copy'); } catch (e) {} } msg(ok ? '已經複製到剪貼簿。' : '瀏覽器不讓網頁寫入剪貼簿：文字框已經全選，請按 Ctrl+C（Mac 是 ⌘C）自己複製。', ok ? 'ok' : 'bad'); };
  dl.onclick = () => { let ok = false; try { const a = document.createElement('a'), d = new Date(); a.href = URL.createObjectURL(new Blob([V.code + '\n'], { type: 'text/plain' })); a.download = `萬獸原野存檔-${P.name}-${d.getMonth() + 1}${String(d.getDate()).padStart(2, '0')}.txt`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); ok = true; } catch (e) {} msg(ok ? '已經送出下載。如果沒有看到檔案，可能是平台擋下了下載：請改用「複製」。' : '這裡不能下載檔案：請改用「複製」，或在文字框裡全選自己複製。', ok ? 'ok' : 'bad'); };
  bt.append(gen, cp, dl, info); body.appendChild(bt);
  body.appendChild(el('h3', '', '匯入（會覆蓋現在的角色）'));
  const ti = el('textarea'); ti.id = 's7in'; ti.placeholder = '把存檔代碼（WSY7. 開頭的一整段）貼在這裡'; ti.value = V.imp; ti.oninput = () => { V.imp = ti.value; V.parsed = null; }; body.appendChild(ti);
  const bi = el('div', 's7bt'), file = el('input'), fb = el('button', '', '選檔案'), chk = el('button', '', '檢查代碼');
  file.type = 'file'; file.accept = '.txt,text/plain'; file.hidden = true; file.onchange = () => { const f = file.files && file.files[0]; if (!f) return; f.text().then(t => { V.imp = t.trim(); V.parsed = null; render(); check(); }).catch(() => msg('讀不到這個檔案。', 'bad')); };
  fb.onclick = () => file.click(); chk.onclick = () => check(); bi.append(fb, chk, file); body.appendChild(bi);
  if (V.parsed && V.parsed.ok) {
    const d = V.parsed.d, c = el('div', 's7card'), dl2 = el('dl'), t = V.parsed.t ? new Date(V.parsed.t) : null, h7 = (d.m7 && Array.isArray(d.m7.mp)) ? d.m7.mp.length : 0;
    for (const [k, v] of [['角色名', d.name], ['等級', d.lv], ['金幣', (d.gold | 0).toLocaleString()], ['手繪地圖', h7 + ' 張'], ['匯出時間', t ? `${t.getMonth() + 1} 月 ${t.getDate()} 日 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '不明']]) { dl2.append(el('dt', '', k), el('dd', '', String(v))); }
    c.appendChild(dl2); c.appendChild(el('div', 'w', `確認後會用這個角色覆蓋你現在的角色「${P.name}」（等級 ${P.lv}），不能復原。不確定的話，先在上面匯出現在的角色存起來。` + (Store.mode === 'cloud' && d.name.toLowerCase() !== String(P.name).toLowerCase() ? `角色名會改成「${d.name}」（這裡要沒有別人用）。` : '')));
    const b2 = el('div', 's7bt'), ok = el('button', 'primary', V.busy ? '匯入中…' : '確認覆蓋'), no = el('button', '', '取消'); ok.disabled = V.busy; ok.style.cssText = 'padding:4px 14px;font-size:13px';
    ok.onclick = async () => { V.busy = true; render(); const r = await applyImport(d); V.busy = false; if (r.ok) { V.parsed = null; msg('匯入完成，馬上重新載入……', 'ok'); } else { msg(r.msg, 'bad'); } };
    no.onclick = () => { V.parsed = null; render(); }; b2.append(ok, no); c.appendChild(b2); body.appendChild(c);
  }
  if (V.msg) body.appendChild(el('div', 's7msg ' + V.msgCls, V.msg));
}
// 本機的角色搬到雲端：用原本註冊的流程（角色名重複會被擋）。寫不進去（檢視者）就留在本機
async function toCloud() {
  if (V.busy) return; V.busy = true; render(); const was = Store.mode, reason = Store.reason; let r = null;
  try { Store.mode = 'cloud-new'; r = await Store.register(P.name); } catch (e) { r = { ok: false, msg: '寫不進雲端。' }; }
  V.busy = false;
  if (Store.mode === 'cloud') { V.roleK = ''; msg(`已經存到雲端（UID #${String(P.serial).padStart(3, '0')}）。之後換電腦用同一個帳號進來就在。`, 'ok'); return; }
  if (Store.mode === 'cloud-new') { Store.mode = was; Store.reason = reason; }
  msg(r && !r.ok && r.msg ? r.msg : '寫不進雲端：你目前是檢視者（只能看、不能寫），角色只能存在這個瀏覽器。請擁有者把你改成編輯者，或用存檔代碼帶著走。', 'bad');
}
function msg(t, cls) { V.msg = t; V.msgCls = cls || ''; render(); }
async function check() { const r = await readCode(V.imp); V.parsed = r; if (!r.ok) msg(r.msg, 'bad'); else msg('', ''); }

/* ============================== 本機存檔的提醒 ============================== */
const WARN = '角色只存在這個瀏覽器，換電腦會不見。到設定匯出存檔代碼。';
let warnLv = 0, started = false, whereT = 0;
export function tick(dt) {
  if (!input.started || input.creator) return;
  if ((whereT -= dt) <= 0) { whereT = 2; const e = $('save7Where'); if (e) e.textContent = Store.mode === 'cloud' ? '換電腦、換瀏覽器時帶走角色，或當備份' : '角色只存在這個瀏覽器：換電腦前先匯出'; }
  if (Store.mode !== 'local') return;
  if (!started) { started = true; warnLv = P.lv; setTimeout(() => { ui.log(WARN); ui.toast(WARN); }, (P.lv | 0) <= 1 && !(P.exp > 0) ? 90000 : 4000); return; }      /* 製作人 11-18：全新角色的頭 90 秒在聽開場與托比，提醒晚一點出，免得三段字疊在畫面上方 */
  if (P.lv > warnLv) { const hit = Math.floor(P.lv / SAVE7.warnEvery) > Math.floor(warnLv / SAVE7.warnEvery); warnLv = P.lv; if (hit) { ui.log(WARN); ui.toast(WARN); } }
}
export const debug7s = { makeCode, readCode, applyImport, role, open, render, toCloud, V };
if (typeof window !== 'undefined') window.__s7 = debug7s;
void WORLD;
