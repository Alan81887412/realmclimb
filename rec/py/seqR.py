#!/usr/bin/env python3
"""棕熊遊戲內動作錄影（11-27 Q1 由 seqI.py 複製）。SC：a 走路 r 追擊奔跑 w 威嚇 s 人立拍地 x 橫掃 c 衝撞 o 咆哮 q 震地 i 被打 j 倒地；GD＝鏡頭距離。
岩羊遊戲內動作補錄（由 seqN.py 複製）。
夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000, RN = Date.now.bind(Date); Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：Date.now 跟著遊戲步進時間走（原本跟真實時鐘走，錄 20～30 分鐘會跨進下一段天氣，前後段亮度差到一倍）      # 錄影用：遊戲天氣照現實時鐘排雨（weather08），固定在每段的無雨時段，畫面亮度、野獸察覺距離每次都一樣
SETUP = SETUP.replace("new TH.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 })", "new TH.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5f8a3c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#527a33'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); const t = new TH.CanvasTexture(c); t.wrapS = t.wrapT = TH.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = TH.SRGBColorSpace; window.__gtex = t; return t; })() })").replace("gm.position.set(px, py + 0.02, pz);", "gm.position.set(px, py + 0.02, pz); if (window.__gtex) window.__gtex.offset.set(px / 2, -pz / 2);")      # 錄影地面：2 公尺一格的棋盤格，格子固定在世界上（鏡頭跟著平移時看得出移動、腳有沒有滑）
SETUP = SETUP.replace('fy = root.rotation.y', 'fy = (window.__fyFix != null ? window.__fyFix : root.rotation.y)')      # FIXCAM：鏡頭方向固定在世界（看得到回身）          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
_S0 = SETUP; SETUP = SETUP.replace("px = root.position.x, py = root.position.y, pz = root.position.z", "px = root.position.x, py = root.position.y, pz = root.position.z; if (m.lx && m.lx.stage) { const _p = m.lx.stage.getWorldPosition(new TH.Vector3()); px = _p.x; pz = _p.z; }").replace("const m = v.model, root = m.root, fy = (window.__fyFix", "const m = v.model, root = m.root; let fy = (window.__fyFix"); assert SETUP.count('m.lx.stage.getWorldPosition') == 1 and 'let fy = (window.__fyFix' in SETUP      # 11-27 R1（同 B1 seqQ）：鏡頭對準外觀位置（stage）；衝撞時遊戲一格把熊搬 2 公尺，鏡頭跟著 root 跳、畫面上熊一格移 160px
if os.environ.get('TGND'):      # 11-27 R2（照 seqD 的 D2）TGND=1：錄影地面改成照真實地形起伏的棋盤格（原本是身體中心高度的平面；錄影點有 5% 橫坡，上坡側的蹄看起來浮空、下坡側插進棋盤）
    INIT += '; window.__TGon = true;'
    SETUP = SETUP.replace("window.__shot = (view, D) =>", """if (window.__TGon) { const CH = (await import('/js/core.js')).height, N = 120, geo = new TH.PlaneGeometry(1, 1, N, N); geo.rotateX(-Math.PI / 2); const pos = geo.attributes.position, uv = geo.attributes.uv, base = []; for (let i = 0; i < pos.count; i++) base.push([pos.getX(i), pos.getZ(i)]);
    const tex = window.__gtex.clone(); tex.repeat.set(1, 1); tex.offset.set(0, 0); tex.needsUpdate = true; const mesh = new TH.Mesh(geo, new TH.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: tex })); mesh.receiveShadow = true; window.__TGm = mesh; let last = null; const f = t => Math.sign(t) * 60 * (2 * Math.abs(t)) ** 2;
    window.__TG = (px, pz) => { if (!last || Math.hypot(px - last[0], pz - last[1]) > 0.25) { last = [px, pz]; for (let i = 0; i < pos.count; i++) { const x = px + f(base[i][0]), z = pz + f(base[i][1]); pos.setXYZ(i, x, CH(x, z) + 0.003, z); uv.setXY(i, x / 2, -z / 2); } pos.needsUpdate = true; uv.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); } return mesh; }; }
  window.__shot = (view, D) =>""",1).replace("W.scene.add(gm);", "if (window.__TG) W.scene.add(window.__TG(px, pz)); else W.scene.add(gm);").replace("W.scene.remove(gm);", "W.scene.remove(gm); if (window.__TGm) W.scene.remove(window.__TGm);")
GD = float(os.environ.get('GD', '11'))
STATJS = r'''() => { const m = __v.model, X = m.lx; if (!X) return null; const st = X.stage, TH = st.position.constructor; const v = new TH(), out = { body: 1e9, head: 1e9, leg: 1e9, tail: 1e9, fleg: 1e9 };
  const legB = new Set(), headB = new Set(), tailB = new Set(), fB = new Set(); for (const L of X.LEGS) L.ch[0].traverse(o => { if (o.isBone) { legB.add(o); if (L.kind === 'F') fB.add(o); } }); const hd = X.root.getObjectByName('head'); if (hd) hd.traverse(o => { if (o.isBone) headB.add(o); }); const tl = X.root.getObjectByName('tail_01'); if (tl) tl.traverse(o => { if (o.isBone) tailB.add(o); });
  const gy = st.getWorldPosition(new TH()).y, sc = st.getWorldScale(new TH()).x;
  X.root.traverse(o => { if (!o.isSkinnedMesh) return; const g = o.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = o.skeleton.bones;
    for (let i = 0; i < g.attributes.position.count; i += 7) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const b = bs[SI.getComponent(i, k)]; o.getVertexPosition(i, v); o.localToWorld(v); const y = (v.y - gy) / sc; const c = legB.has(b) ? 'leg' : headB.has(b) ? 'head' : tailB.has(b) ? 'tail' : 'body'; if (y < out[c]) out[c] = y; if (c === 'leg' && fB.has(b) && y < out.fleg) out.fleg = y; } });
  for (const k in out) out[k] = +out[k].toFixed(3); return out; }'''
def grab(page, name, k, D=None):
    if os.environ.get('LD'): print('LD', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA] : [L.id]))"), flush=True)      # 每條腿 [id, 肘/膝變化角 aE, 腕/飛節變化角 aW, 撐地權重 kA]
    if os.environ.get('WX'): print('WX', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => { const X = __v.model.lx, TH = X.root.position.constructor, h = L.h.getWorldPosition(new TH()), t = L.t.getWorldPosition(new TH()), g = X.stage.getWorldPosition(new TH()).y; return [L.id, +h.x.toFixed(3), +h.z.toFixed(3), +(h.y - g).toFixed(3), +(t.y - g).toFixed(3), L.c && L.c.air ? 1 : 0, L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1, +t.x.toFixed(3), +t.z.toFixed(3), ...(L.fin && L.fin.p ? (q => [+q.x.toFixed(3), +q.z.toFixed(3)])(X.stage.localToWorld(L.fin.p.clone())) : [0, 0]), ...(L.c && L.c.Wl ? [+L.c.Wl.x.toFixed(3), +L.c.Wl.z.toFixed(3)] : [0, 0]), L.dbg && L.dbg.err != null ? +L.dbg.err.toFixed(3) : -1]; }).concat([[+(__v.model.root.position.x).toFixed(3), +(__v.model.root.position.z).toFixed(3), +(__v.model.root.rotation.y * 57.3).toFixed(1)]]))"), flush=True)      # 11-27 A1：每隻腳掌根／趾尖的世界座標（遊戲公尺）、掌根與趾尖離地高、是否擺盪、擺盪進度；最後一組是 root 位置與朝向      # R1：從 seqI 複製
    if os.environ.get('TX'): print('TX', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => { const p = __v.model.lx.T.wp(L.h), q = p.clone().sub(__v.model.lx.T.wp(__v.model.lx.root)), A = __v.model.lx.T.axes(); return [L.id, +q.dot(A.right).toFixed(3), +q.dot(A.fwd).toFixed(3), +p.y.toFixed(3), L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1]; }))"), flush=True)      # 每隻腳掌根相對身體的左右（右為正）、前後位置（stage 尺度）
    if os.environ.get('QJ'): print('QJ', name, k, page.evaluate("(() => { const X = __v.model.lx, P = window.__pq || (window.__pq = {}); return JSON.stringify(X.LEGS.map(L => { const o = [L.id]; [L.e, L.w].forEach((b, j) => { const key = L.id + j, q = b.quaternion; o.push(P[key] ? +(P[key].angleTo(q) * 57.3).toFixed(1) : 0); P[key] = q.clone(); }); return o; })); })()"), flush=True)      # 實際骨頭（解算＋角速度上限之後）肘／腕（膝／飛節）這一格和上一格的局部旋轉差（度）
    if os.environ.get('LD2'): print('LD2', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => [L.id, L.dbg && L.dbg.r, L.dbg && L.dbg.phi, L.dbg && L.dbg.fl, L.dbg && L.dbg.up, L.fin && L.fin.p ? +L.fin.p.y.toFixed(3) : null, L.c ? +(L.c.h || 0).toFixed(3) : null]))"), flush=True)      # [id, r 伸長比, phi, fl 額外彎曲, up 著地修正抬高, 解算目標掌根高度 fin.p.y, 步態抬腳高度 c.h]
    if os.environ.get('HSP'): print('HS', name, k, page.evaluate('() => [+(window.__hs || 0).toFixed(3), +(window.__gt / 1000).toFixed(3), +(__v.stT || 0).toFixed(3), __v.st, +__v.x.toFixed(3), +__v.z.toFixed(3), +((__v.model.lx && __v.model.lx.ctl.cuL) || 0).toFixed(3), (q => +(Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) * 57.3).toFixed(1))(__v.model.lx.stage.getWorldQuaternion(new __v.model.lx.root.quaternion.constructor())), +(__v.model.root.rotation.y * 57.3).toFixed(1)]'), flush=True)      # 最後兩個：外觀朝向（stage 世界 yaw）、遊戲邏輯朝向
    if os.environ.get('GX'): print('GX', name, k, page.evaluate("JSON.stringify((() => { const X = __v.model.lx, TH = X.root.position.constructor, CH = window.__CH, sp = X.stage.getWorldPosition(new TH()), rp = __v.model.root.position; return X.LEGS.map(L => { const h = L.h.getWorldPosition(new TH()), t = L.t.getWorldPosition(new TH()); return [L.id, +(h.y - CH(h.x, h.z)).toFixed(3), +(t.y - CH(t.x, t.z)).toFixed(3)]; }).concat([[+(sp.y - CH(sp.x, sp.z)).toFixed(3), +(rp.y - CH(rp.x, rp.z)).toFixed(3), +CH(sp.x, sp.z).toFixed(3)]]); })())"), flush=True)      # 11-27 R2：每隻腳掌根／趾尖離「真實地形」的高度（公尺），最後一組＝stage、root 離地形高、stage 底下地形高
    D = D or GD
    if os.environ.get('STAT'): print('STAT', name, k, page.evaluate(STATJS), flush=True)
    if os.environ.get('NOFADE'): page.evaluate("() => { __v.model.root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const M of ms) { const U = M.userData && M.userData.mfx; if (U && __w.st !== 6) { U.fade.value = 1; M.opacity = 1; } } }); }")      # 錄影用：關掉遊戲『大型野獸擋住鏡頭時變網點』的功能（錄影鏡頭不是遊戲鏡頭）
    for vw in ('side', 'd45'):
        u = page.evaluate("([a,b]) => window.__shot(a,b)", [vw, D]); open(f'{outd}/{name}_{vw}_{k:03d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
RESET = "() => { const v = __v, w = __w, g = __game; w.st = 0; w.t = 0; w.target = null; w.M = null; w.mvc = 0; w.hp = w.hpMax || w.hp; __place(v.z); g.me.x = v.x; g.me.z = v.z - 60; }"
FORCE = """async ([name, dist, wd, sd, rd]) => { const C = await import('/js/core.js'), v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * dist; g.me.z = v.z + Math.cos(v.f) * dist;
  w.target = 'self'; w.provoked = true; w.seen = {}; w.M = C.MOVES[name]; w.arg = 0; w.mvc = (w.M.i + 1); w.st = 2; w.t = 0; w.wd = wd; w.sd = sd; w.rd = rd; w.cd = 9; w.chain = null; return !!w.M; }"""
FORCEC = """async ([name, dist, wd, sd, rd, ch, st]) => { const C = await import('/js/core.js'), v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * dist; g.me.z = v.z + Math.cos(v.f) * dist;
  w.target = 'self'; w.provoked = true; w.seen = {}; w.M = C.MOVES[name]; w.arg = 0; w.chain = ch ? ch.slice() : null; w.mvc = (w.M.i + 1) | (ch && ch.length ? 256 : 0); w.st = st || 2; w.t = 0; w.wd = wd; w.sd = sd; w.rd = rd; w.cd = 9; return !!w.M; }"""
port = random.randint(11900, 12400); srv = serve(port, site)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True)
    page.evaluate("async () => { window.__CH = (await import('/js/core.js')).height; }")      # 11-27 R2：GX 探針用的地形高度
    page.evaluate("async () => { window.__fx = (await import('/js/actors.js')).fx; window.__nohs = %s; window.__gt = 0; }" % ('true' if os.environ.get('NOHS') else 'false'))      # Q1HS：NOHS=1 關掉遊戲的命中停頓（hitstop＝挨打時整個遊戲 dt 變 0.06 倍，畫面連地面都幾乎不動）；HSP=1 每格印停頓量與遊戲時間
    adv = lambda: page.evaluate('() => { if (window.__fx) { if (window.__nohs) window.__fx.hitstop = 0; window.__hs = window.__fx.hitstop; } const r = window.__adv(); window.__gt += window.__hs > 0 ? 0.06 * 8.333 : 8.333; return r; }'); J = page.evaluate
    J(RESET)
    for i in range(240): adv()
    def settle(n=90):
        J(RESET)
        if os.environ.get('SUNSIDE'): J('() => { const w = __w, v = __v; const W = __game.W; let D = null; W.scene.traverse(x => { if (x.isDirectionalLight && (!D || x.intensity > D.intensity)) D = x; }); const sx = D ? D.position.x - D.target.position.x : 1, sz = D ? D.position.z - D.target.position.z : 0, h = Math.atan2(-sz, sx); w.f = v.f = h; if (v.model && v.model.lx) v.model.lx.ctl.vyW = null; }')      # SUNSIDE=1（外觀朝向也直接對齊，不然轉速上限低的物種在下一段還在慢慢轉）：野獸朝向讓鏡頭那一側向陽（各段亮度一致）
        for i in range(n):
            if os.environ.get('SUNSIDE'): J('() => { const w = __w, v = __v; let D = null; __game.W.scene.traverse(x => { if (x.isDirectionalLight && (!D || x.intensity > D.intensity)) D = x; }); const sx = D ? D.position.x - D.target.position.x : 1, sz = D ? D.position.z - D.target.position.z : 0, h = Math.atan2(-sz, sx); w.f = v.f = h; w.wx = v.x; w.wz = v.z; w.wanderT = 99; __game.me.x = v.x - Math.sin(h) * 30; __game.me.z = v.z - Math.cos(h) * 30; if (v.model) v.model.root.rotation.y = h; if (v.model && v.model.lx && i0 === 0) v.model.lx.ctl.vyW = null; }'.replace('i0 === 0', 'true' if i == 0 else 'false'))      # R1：玩家放在正後方 30 公尺（遊戲 40 公尺內每格都算動作、更新 root 朝向；原本 60 公尺隔格更新，錄影第 1 格 root 朝向才跳到向陽面，鏡頭固定在舊朝向）；settle 期間每步都把朝向釘在向陽面、不閒晃，第一步外觀朝向直接對齊（之後腳有時間站好）（原本只設一次，熊閒晃後出招前外觀還差 45～135°，起手原地被拖著轉、後掌滑）
            adv()
    def __waitlx():      # 雲端機器載模型比較慢：等新模型（lx）建好才開始錄（原本第一格就讀 __v.model.lx 會出錯）
        for _ in range(3000):
            if J('!!(__v.model && __v.model.lx)'): return
            adv()
    def run(name, steps, every=4, each=None):
        __waitlx()
        k = 0; J('window.__mvS = 0')
        if os.environ.get('FIXALL'): J('window.__fyFix = __v.model.root.rotation.y')      # FIXALL=1：每段鏡頭朝向都固定在世界（遊戲邏輯朝向一格轉很多時，鏡頭不跟著甩）
        for i in range(steps):
            if each: J(each)
            if os.environ.get('REST'): J("() => { const w = __w, v = __v, g = __game; if (w.st >= 2 && w.st <= 5) { window.__mvS = 1; window.__mvF = null; } else if (window.__mvS && (w.st === 0 || w.st === 1 || w.st === 7 || w.st === 8)) { if (window.__mvF == null) window.__mvF = v.f; w.st = 0; w.t = 0; w.target = null; w.provoked = false; w.fleeFrom = null; w.cd = 9; w.f = v.f = window.__mvF; w.wx = v.x; w.wz = v.z; w.wanderT = 99; g.me.x = v.x - Math.sin(v.f) * 30; g.me.z = v.z - Math.cos(v.f) * 30; } }")      # REST=1：招式做完、回到走跑時野獸停下來站好（片段錄到動作真的停住）；R1：之後每步都釘住朝向、不閒晃，玩家放正後方 30 公尺（原本放 60 公尺遠，熊收招後原地轉 90° 去閒晃）
            r = adv()
            if i % every == 0:
                if os.environ.get('PRST'): print('ST', name, k, r.get('st'), r.get('stT'), J('JSON.stringify([__v.model.lx && __v.model.lx.ctl.mode, +(__v.model.lx.INR.look||0).toFixed(1), +(__v.model.lx.INR.hk||0).toFixed(2), __v.model.lx.ctl.tA, __v.model.lx.RB.tail.length])'), flush=True)
                if os.environ.get('SPD'): print('SP', name, k, r.get('st'), r.get('sp'), r.get('run'), r.get('sc'), flush=True)
                grab(page, name, k); k += 1
        print(name, 'frames', k, 'last', {a: r.get(a) for a in ('st', 'stT', 'd')}, flush=True)
        if os.environ.get('FIXALL'): J('window.__fyFix = null')
    J('window.__dy = 0.2')
    SC = os.environ.get('SC', 'c,s,k,h,i,j').split(',')
    def chase(name, nmax):
        J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 34; g.me.z = v.z + Math.cos(v.f) * 34; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }'); k = 0; ok = 0
        for i in range(1500):
            r = adv()
            if r.get('nomodel'): continue
            ok = ok + 1 if (r['st'] == 1 and r.get('sp', 0) > 0.7 * r.get('run', 9)) else 0
            if ok > 30 and i % 4 == 0: grab(page, name, k); k += 1
            if k >= nmax or r.get('d', 99) < 9: break
        print(name, 'frames', k, flush=True)
    if 'a' in SC: settle(); J('() => { const w = __w, v = __v; w.wx = w.x + Math.sin(v.f) * 16; w.wz = w.z + Math.cos(v.f) * 16; w.wanderT = 99; }'); run('a_walk', int(os.environ.get('AN', '720')), each='() => { __w.wanderT = 99; }')
    if 'r' in SC: settle(); chase('r_run', 40)
    def flee(name, nmax):
        J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x - Math.sin(v.f) * 7; g.me.z = v.z - Math.cos(v.f) * 7; w.st = 7; w.t = 0; w.target = null; w.fleeFrom = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }'); k = 0; ok = 0
        for i in range(1500):
            r = adv()
            if r.get('nomodel'): continue
            ok = ok + 1 if (r['st'] == 7 and r.get('sp', 0) > 0.6 * r.get('run', 9)) else 0
            if (ok > 20 or k > 0) and i % 4 == 0: grab(page, name, k); k += 1
            if k >= nmax: break
        print(name, 'frames', k, 'last', r, flush=True)
    if 'w' in SC: settle(); J("() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 9; g.me.z = v.z + Math.cos(v.f) * 9; w.st = 0; w.t = 0; w.target = null; w.provoked = false; w.cd = 9; w.seen = {}; }"); run('w_warn', int(os.environ.get('WN', '300')), each="() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 9; g.me.z = v.z + Math.cos(v.f) * 9; w.provoked = false; }")      # 11-27 Q1：熊是領域型，玩家站在領域裡（9 公尺）讓遊戲自己進威嚇（原本硬設 st=8 會被熊的 AI 改回 0）
    if 's' in SC: settle(); print('force slam', J(FORCEC, ['bear_slam', 3.0, 0.95, 0.22, 0.95, None, 2])); run('s_slam', 360)
    if 'x' in SC: settle(); print('force swipe', J(FORCEC, ['bear_swipe', 3.0, 0.68, 0.26, 0.7, None, 2])); run('x_swipe', 300)
    if 'c' in SC: settle(); print('force charge', J(FORCEC, ['bear_charge', 10.0, 0.9, 0.7, 1.2, None, 2])); run('c_charge', 380)
    if 'o' in SC: settle(); print('force roar', J(FORCEC, ['scar_roar', 6.0, 1.2, 0.3, 0.7, None, 2])); run('o_roar', 360)
    if 'q' in SC: settle(); print('force quake', J(FORCEC, ['scar_quake', 3.0, 0.85, 0.22, 1.3, None, 2])); run('q_quake', 380)
    if 'i' in SC: settle(); J("() => { window.__t8 = 0; window.__fl = 0; }"); J('window.__fyFix = __v.model.root.rotation.y' if os.environ.get('FIXCAM') else '0'); run('i_stagger', int(os.environ.get('IN', '150')), each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; if (window.__t8 < 0.9) { w.st = 5; w.t = window.__t8; w.stagDur = 1.0; v.st = 5; v.stT = window.__t8; } }")      # 被打完一定接逃跑（玩家在正前方 4 公尺：要轉 180° 才跑得掉，遊戲裡最常見的情況）; J('window.__fyFix = null')      # FIXCAM：被打接逃跑時鏡頭固定在世界（原本鏡頭跟著遊戲邏輯朝向一格轉 180°，看起來像身體一下轉過去）
    if 'j' in SC: settle(); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 200)
    if os.environ.get('RB'): print('RB', J('JSON.stringify(__v.model.lx && __v.model.lx.RB)'), flush=True)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
