#!/usr/bin/env python3
"""果脊猴遊戲內動作補錄（由 seqI.py 複製）。SC：a 走路 r 追擊奔跑 f 逃跑奔跑 s 伸手偷 t 蹲樹待機 k 猴咬 u 扯披肩 i 被打 j 倒地；GD＝鏡頭距離。
夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000, RN = Date.now.bind(Date); Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：Date.now 跟著遊戲步進時間走（原本跟真實時鐘走，錄 20～30 分鐘會跨進下一段天氣，前後段亮度差到一倍）      # 錄影用：遊戲天氣照現實時鐘排雨（weather08），固定在每段的無雨時段，畫面亮度、野獸察覺距離每次都一樣
SETUP = SETUP.replace("new TH.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 })", "new TH.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5f8a3c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#527a33'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); const t = new TH.CanvasTexture(c); t.wrapS = t.wrapT = TH.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = TH.SRGBColorSpace; window.__gtex = t; return t; })() })").replace("gm.position.set(px, py + 0.02, pz);", "gm.position.set(px, py + 0.02, pz); if (window.__gtex) window.__gtex.offset.set(px / 2, -pz / 2);")      # 錄影地面：2 公尺一格的棋盤格，格子固定在世界上（鏡頭跟著平移時看得出移動、腳有沒有滑）
SETUP = SETUP.replace('fy = root.rotation.y', 'fy = (window.__fyFix != null ? window.__fyFix : root.rotation.y)')      # FIXCAM：鏡頭方向固定在世界（看得到回身）          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
GD = float(os.environ.get('GD', '11'))
STATJS = r'''() => { const m = __v.model, X = m.lx; if (!X) return null; const st = X.stage, TH = st.position.constructor; const v = new TH(), out = { body: 1e9, head: 1e9, leg: 1e9, tail: 1e9, fleg: 1e9 };
  const legB = new Set(), headB = new Set(), tailB = new Set(), fB = new Set(); for (const L of X.LEGS) L.ch[0].traverse(o => { if (o.isBone) { legB.add(o); if (L.kind === 'F') fB.add(o); } }); const hd = X.root.getObjectByName('head'); if (hd) hd.traverse(o => { if (o.isBone) headB.add(o); }); const tl = X.root.getObjectByName('tail_01'); if (tl) tl.traverse(o => { if (o.isBone) tailB.add(o); });
  const gy = st.getWorldPosition(new TH()).y, sc = st.getWorldScale(new TH()).x;
  X.root.traverse(o => { if (!o.isSkinnedMesh) return; const g = o.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = o.skeleton.bones;
    for (let i = 0; i < g.attributes.position.count; i += 7) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const b = bs[SI.getComponent(i, k)]; o.getVertexPosition(i, v); o.localToWorld(v); const y = (v.y - gy) / sc; const c = legB.has(b) ? 'leg' : headB.has(b) ? 'head' : tailB.has(b) ? 'tail' : 'body'; if (y < out[c]) out[c] = y; if (c === 'leg' && fB.has(b) && y < out.fleg) out.fleg = y; } });
  for (const k in out) out[k] = +out[k].toFixed(3); return out; }'''
def grab(page, name, k, D=None):
    if os.environ.get('LD'): print('LD', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA] : [L.id]))"), flush=True)      # 每條腿 [id, 肘/膝變化角 aE, 腕/飛節變化角 aW, 撐地權重 kA]
    if os.environ.get('TX'): print('TX', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => { const p = __v.model.lx.T.wp(L.h), q = p.clone().sub(__v.model.lx.T.wp(__v.model.lx.root)), A = __v.model.lx.T.axes(); return [L.id, +q.dot(A.right).toFixed(3), +q.dot(A.fwd).toFixed(3), +p.y.toFixed(3), L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1]; }))"), flush=True)      # 每隻腳掌根相對身體的左右（右為正）、前後位置（stage 尺度）
    if os.environ.get('QJ'): print('QJ', name, k, page.evaluate("(() => { const X = __v.model.lx, P = window.__pq || (window.__pq = {}); return JSON.stringify(X.LEGS.map(L => { const o = [L.id]; [L.e, L.w].forEach((b, j) => { const key = L.id + j, q = b.quaternion; o.push(P[key] ? +(P[key].angleTo(q) * 57.3).toFixed(1) : 0); P[key] = q.clone(); }); return o; })); })()"), flush=True)      # 實際骨頭（解算＋角速度上限之後）肘／腕（膝／飛節）這一格和上一格的局部旋轉差（度）
    if os.environ.get('LD2'): print('LD2', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => [L.id, L.dbg && L.dbg.r, L.dbg && L.dbg.phi, L.dbg && L.dbg.fl, L.dbg && L.dbg.up, L.fin && L.fin.p ? +L.fin.p.y.toFixed(3) : null, L.c ? +(L.c.h || 0).toFixed(3) : null]))"), flush=True)      # [id, r 伸長比, phi, fl 額外彎曲, up 著地修正抬高, 解算目標掌根高度 fin.p.y, 步態抬腳高度 c.h]
    if os.environ.get('LIT'): print('LIT', name, k, page.evaluate("(() => { const W = __game.W, o = []; W.scene.traverse(x => { if (x.isLight) o.push(x.type[0] + x.type[1] + ':' + x.intensity.toFixed(2) + (x.color ? '/' + x.color.getHexString() : '')); }); return JSON.stringify({ L: o.slice(0, 8), exp: W.renderer.toneMappingExposure, zone: __game.me.zone, me: [Math.round(__game.me.x), Math.round(__game.me.z)], v: [Math.round(__v.x), Math.round(__v.z)] }); })()"), flush=True)      # 燈光強度／曝光／玩家所在區（查各段亮度不一）
    if os.environ.get('HSP'): print('HS', name, k, page.evaluate('() => [+(window.__hs || 0).toFixed(3), +(window.__gt / 1000).toFixed(3), +(__v.stT || 0).toFixed(3), __v.st, +__v.x.toFixed(3), +__v.z.toFixed(3), +((__v.model.lx && __v.model.lx.ctl.cuL) || 0).toFixed(3), (q => +(Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) * 57.3).toFixed(1))(__v.model.lx.stage.getWorldQuaternion(new __v.model.lx.root.quaternion.constructor())), +(__v.model.root.rotation.y * 57.3).toFixed(1)]'), flush=True)
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
    page.evaluate("async () => { window.__fx = (await import('/js/actors.js')).fx; window.__nohs = %s; window.__gt = 0; }" % ('true' if os.environ.get('NOHS') else 'false'))      # Q1HS：NOHS=1 關掉遊戲的命中停頓（hitstop＝挨打時整個遊戲 dt 變 0.06 倍，畫面連地面都幾乎不動）；HSP=1 每格印停頓量與遊戲時間
    adv = lambda: page.evaluate('() => { if (window.__fx) { if (window.__nohs) window.__fx.hitstop = 0; window.__hs = window.__fx.hitstop; } const r = window.__adv(); window.__gt += window.__hs > 0 ? 0.06 * 8.333 : 8.333; return r; }'); J = page.evaluate
    J(RESET)
    for i in range(240): adv()
    def settle(n=90):
        J(RESET)
        J('() => { if (__v.model && __v.model.lx) __v.model.lx.ctl.vyW = null; }')      # 外觀朝向直接對齊遊戲朝向（不然下一段開頭還在慢慢轉回來）
        for i in range(n): adv()
    def run(name, steps, every=4, each=None):
        k = 0; J('window.__mvS = 0')
        if os.environ.get('FIXALL'): J('window.__fyFix = __v.model.root.rotation.y')      # FIXALL=1：每段鏡頭朝向都固定在世界（遊戲邏輯朝向一格轉很多時，鏡頭不跟著甩）
        for i in range(steps):
            if each: J(each)
            if os.environ.get('REST'): J("() => { const w = __w, v = __v, g = __game; if (w.st >= 2 && w.st <= 5) window.__mvS = 1; else if (window.__mvS && (w.st === 0 || w.st === 1 || w.st === 7)) { w.st = 0; w.t = 0; w.target = null; w.provoked = false; w.fleeFrom = null; w.cd = 9; g.me.x = v.x; g.me.z = v.z - 60; } }")      # REST=1：招式做完、回到走跑時把玩家移遠，野獸停下來站好（片段錄到動作真的停住）
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
    if 'a' in SC: settle(); J('() => { const w = __w, v = __v; ' + ('const W = __game.W; let D = null; W.scene.traverse(x => { if (x.isDirectionalLight && (!D || x.intensity > D.intensity)) D = x; }); const sx = D ? D.position.x - D.target.position.x : 1, sz = D ? D.position.z - D.target.position.z : 0, h = Math.atan2(-sz, sx); w.f = v.f = h; w.wx = w.x + Math.sin(h) * 16; w.wz = w.z + Math.cos(h) * 16;' if os.environ.get('SUNSIDE') else 'w.wx = w.x; w.wz = w.z + 16;') + ' w.wanderT = 99; }'); run('a_walk', int(os.environ.get('AN', '720')), each='() => { __w.wanderT = 99; }')      # SUNSIDE=1：朝『鏡頭那一側（右側）向陽』的方向走（審核比顏色要看向陽面）
    if 'r' in SC:
        settle()
        if os.environ.get('SUNSIDE'): J('() => { const w = __w, v = __v; const W = __game.W; let D = null; W.scene.traverse(x => { if (x.isDirectionalLight && (!D || x.intensity > D.intensity)) D = x; }); const sx = D ? D.position.x - D.target.position.x : 1, sz = D ? D.position.z - D.target.position.z : 0, h = Math.atan2(-sz, sx); w.f = v.f = h; }')
        chase('r_run', 40)
    def flee(name, nmax):
        J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x - Math.sin(v.f) * 7; g.me.z = v.z - Math.cos(v.f) * 7; w.st = 7; w.t = 0; w.target = null; w.fleeFrom = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }'); k = 0; ok = 0
        for i in range(1500):
            r = adv()
            if r.get('nomodel'): continue
            ok = ok + 1 if (r['st'] == 7 and r.get('sp', 0) > 0.6 * r.get('run', 9)) else 0
            if (ok > 20 or k > 0) and i % 4 == 0: grab(page, name, k); k += 1
            if k >= nmax: break
        print(name, 'frames', k, 'last', r, flush=True)
    if 'f' in SC: settle(); flee('f_flee', int(os.environ.get('FN', '60')))
    if 's' in SC: settle(); print('force steal', J(FORCEC, ['monkey_steal', 3.6, 0.8, 0.6, 0.6, None, 2])); run('s_steal', 260)
    if 't' in SC: settle(); print('force sit', J(FORCEC, ['monkey_st', 6.0, 0.1, 0.1, 3600, None, 4])); run('t_sit', int(os.environ.get('TN', '1120')))
    if 'k' in SC: settle(); print('force bite', J(FORCEC, ['monkey_bite', 1.6, 0.45, 0.2, 0.6, None, 2])); run('k_bite', 170)
    if 'u' in SC: settle(); print('force tug', J(FORCEC, ['monkey_tug', 1.8, 0.55, 0.25, 0.7, None, 2])); run('u_tug', 210)
    if 'w' in SC: settle(); J("() => { window.__t8 = 0; }"); run('w_warn', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; w.st = 8; w.t = window.__t8; v.st = 8; v.stT = window.__t8; w.target = null; }")
    if 'i' in SC: settle(); J("() => { window.__t8 = 0; }"); run('i_stagger', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; if (window.__t8 < 0.9) { w.st = 5; w.t = window.__t8; w.stagDur = 1.0; v.st = 5; v.stT = window.__t8; } }")
    if 'j' in SC: settle(); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 200)
    if os.environ.get('RB'): print('RB', J('JSON.stringify(__v.model.lx && __v.model.lx.RB)'), flush=True)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
