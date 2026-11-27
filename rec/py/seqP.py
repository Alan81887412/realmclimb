#!/usr/bin/env python3
"""箭豬遊戲內動作錄影（由 seqD 複製；先用 __beast08a.spawn 生一隻箭豬再棚拍）。SC：a 走、r 追擊奔跑、q 豎刺、b 噴刺環、k 倒衝、i 被打、j 倒地。野鹿遊戲內動作錄影（由 seqB 複製）。SC：a 走路、r 逃跑奔跑、f 轉身逃跑、c 角頂、k 後蹬、i 被打、j 倒地。夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000; Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：天氣照遊戲步進時間（固定在無雨時段），整段錄影亮度一致
SETUP = SETUP.replace("new TH.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 })", "new TH.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5f8a3c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#527a33'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); const t = new TH.CanvasTexture(c); t.wrapS = t.wrapT = TH.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = TH.SRGBColorSpace; window.__gtex = t; return t; })() })").replace("gm.position.set(px, py + 0.02, pz);", "gm.position.set(px, py + 0.02, pz); if (window.__gtex) window.__gtex.offset.set(px / 2, -pz / 2);")      # 錄影地面：2 公尺一格的棋盤格，格子固定在世界上（鏡頭跟著平移時看得出移動、腳有沒有滑）
SETUP = SETUP.replace('fy = root.rotation.y', 'fy = (window.__fyFix != null ? window.__fyFix : root.rotation.y)')      # FIXCAM：鏡頭方向固定在世界（看得到轉身）          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
def grab(page, name, k, D=float(os.environ.get('SHOTD', 7))):
    if os.environ.get('LD'): print('LD', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA] : [L.id]))"), flush=True)      # 每條腿 [id, 肘/膝變化角 aE, 腕/飛節變化角 aW, 撐地權重 kA]
    if os.environ.get('WX'): print('WX', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => { const X = __v.model.lx, TH = X.root.position.constructor, h = L.h.getWorldPosition(new TH()), t = L.t.getWorldPosition(new TH()), g = X.stage.getWorldPosition(new TH()).y; return [L.id, +h.x.toFixed(3), +h.z.toFixed(3), +(h.y - g).toFixed(3), +(t.y - g).toFixed(3), L.c && L.c.air ? 1 : 0, L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1, +t.x.toFixed(3), +t.z.toFixed(3)]; }).concat([[+(__v.model.root.position.x).toFixed(3), +(__v.model.root.position.z).toFixed(3), +(__v.model.root.rotation.y * 57.3).toFixed(1)]]))"), flush=True)      # 11-27 P1（抄 A1 seqI）：每隻腳掌根／趾尖世界座標、離地高、是否擺盪；最後一組 root 位置與朝向
    if os.environ.get('LA'): print('LA', name, k, page.evaluate("JSON.stringify((X => { const TH = X.root.position.constructor, W = b => b.getWorldPosition(new TH()), an = (a, b, c) => +(b.clone().sub(a).angleTo(c.clone().sub(b)) * 57.3).toFixed(1); return X.LEGS.map(L => { const P = [L.s, L.e, L.w, L.h, L.t].map(W); return [L.id, an(P[0], P[1], P[2]), an(P[1], P[2], P[3]), an(P[2], P[3], P[4]), +P[3].y.toFixed(3), +P[4].y.toFixed(3), +P[3].x.toFixed(3), +P[3].z.toFixed(3)]; }); })(__v.model.lx))"), flush=True)      # 11-27 P1（抄 B1 seqQ）：畫面上實際關節角 [腳, 第1-2節, 第2-3節, 第3-4節, 掌根y, 腳尖y, 掌根x, 掌根z]；也印頭的世界位置 HD
    if os.environ.get('LA'): print('HD', name, k, page.evaluate("JSON.stringify((X => { const TH = X.root.position.constructor, h = X.model.getObjectByName('head'), p = h.getWorldPosition(new TH()), g = X.stage.getWorldPosition(new TH()); return [+(p.x).toFixed(3), +(p.y - g.y).toFixed(3), +(p.z).toFixed(3), +(X.INR.pitch||0).toFixed(1)]; })(__v.model.lx))"), flush=True)
    if os.environ.get('TX'): print('TX', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => { const p = __v.model.lx.T.wp(L.h), q = p.clone().sub(__v.model.lx.T.wp(__v.model.lx.root)), A = __v.model.lx.T.axes(); return [L.id, +q.dot(A.right).toFixed(3), +q.dot(A.fwd).toFixed(3), +p.y.toFixed(3), L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1]; }))"), flush=True)      # 每隻腳掌根相對身體的左右（右為正）、前後位置（stage 尺度）
    if os.environ.get('QJ'): print('QJ', name, k, page.evaluate("(() => { const X = __v.model.lx, P = window.__pq || (window.__pq = {}); return JSON.stringify(X.LEGS.map(L => { const o = [L.id]; [L.e, L.w].forEach((b, j) => { const key = L.id + j, q = b.quaternion; o.push(P[key] ? +(P[key].angleTo(q) * 57.3).toFixed(1) : 0); P[key] = q.clone(); }); return o; })); })()"), flush=True)      # 實際骨頭（解算＋角速度上限之後）肘／腕（膝／飛節）這一格和上一格的局部旋轉差（度）
    if os.environ.get('LD2'): print('LD2', name, k, page.evaluate("JSON.stringify(__v.model.lx.LEGS.map(L => [L.id, L.dbg && L.dbg.r, L.dbg && L.dbg.phi, L.dbg && L.dbg.fl, L.dbg && L.dbg.up, L.fin && L.fin.p ? +L.fin.p.y.toFixed(3) : null, L.c ? +(L.c.h || 0).toFixed(3) : null]))"), flush=True)      # [id, r 伸長比, phi, fl 額外彎曲, up 著地修正抬高, 解算目標掌根高度 fin.p.y, 步態抬腳高度 c.h]
    if os.environ.get('HSP'): print('HS', name, k, page.evaluate('() => [+(window.__hs || 0).toFixed(3), +(window.__gt / 1000).toFixed(3), +(__v.stT || 0).toFixed(3), __v.st, +__v.x.toFixed(3), +__v.z.toFixed(3), +((__v.model.lx && __v.model.lx.ctl.cuL) || 0).toFixed(3), (q => +(Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)) * 57.3).toFixed(1))(__v.model.lx.stage.getWorldQuaternion(new __v.model.lx.root.quaternion.constructor())), +(__v.model.root.rotation.y * 57.3).toFixed(1)]'), flush=True)
    if os.environ.get('NOFADE'): page.evaluate("() => { __v.model.root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const M of ms) { const U = M.userData && M.userData.mfx; if (U && __w.st !== 6) { U.fade.value = 1; M.opacity = 1; } } }); }")      # 錄影用：關掉遊戲『大型野獸擋住鏡頭時變網點』的功能（錄影鏡頭不是遊戲鏡頭）
    for vw in ('side', 'd45'):
        u = page.evaluate("([a,b]) => window.__shot(a,b)", [vw, D]); open(f'{outd}/{name}_{vw}_{k:03d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
RESET = "() => { const v = __v, w = __w, g = __game; w.st = 0; w.t = 0; w.target = null; w.M = null; w.mvc = 0; w.hp = w.hpMax || w.hp; __place(v.z); g.me.x = v.x; g.me.z = v.z - 60; }"
FORCE = """async ([name, dist, wd, sd, rd]) => { const C = await import('/js/core.js'), v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * dist; g.me.z = v.z + Math.cos(v.f) * dist;
  w.target = 'self'; w.provoked = true; w.seen = {}; w.M = C.MOVES[name]; w.arg = 0; w.mvc = (w.M.i + 1); w.st = 2; w.t = 0; w.wd = wd; w.sd = sd; w.rd = rd; w.cd = 9; return !!w.M; }"""
port = random.randint(11900, 12400); srv = serve(port, site)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT + '; window.__dev07 = true;')
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('spawn', page.evaluate("async () => { const o = await window.__beast08a.spawn('porc', { d: 12, n: 1 }); return o.length; }"), flush=True)
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True)
    page.evaluate("async () => { window.__fx = (await import('/js/actors.js')).fx; window.__nohs = %s; window.__gt = 0; }" % ('true' if os.environ.get('NOHS') else 'false'))      # Q1HS：NOHS=1 關掉遊戲的命中停頓（hitstop＝挨打時整個遊戲 dt 變 0.06 倍，畫面連地面都幾乎不動）；HSP=1 每格印停頓量與遊戲時間
    adv = lambda: page.evaluate('() => { if (window.__fx) { if (window.__nohs) window.__fx.hitstop = 0; window.__hs = window.__fx.hitstop; } const r = window.__adv(); window.__gt += window.__hs > 0 ? 0.06 * 8.333 : 8.333; return r; }'); J = page.evaluate
    J(RESET)
    for i in range(240): adv()
    def settle(n=90):
        __waitlx()      # 11-27 P1：雲端載模型慢，先等新模型建好（原本 RB 那行讀 __v.model.lx 直接報錯）
        J(RESET)
        if os.environ.get('SUNSIDE'): J('() => { const w = __w, v = __v; const W = __game.W; let D = null; W.scene.traverse(x => { if (x.isDirectionalLight && (!D || x.intensity > D.intensity)) D = x; }); const sx = D ? D.position.x - D.target.position.x : 1, sz = D ? D.position.z - D.target.position.z : 0, h = Math.atan2(-sz, sx); w.f = v.f = h; if (v.model && v.model.lx) v.model.lx.ctl.vyW = null; }')      # SUNSIDE=1（外觀朝向也直接對齊，不然轉速上限低的物種在下一段還在慢慢轉）：野獸朝向讓鏡頭那一側向陽（各段亮度一致）
        for i in range(n): adv()
    def __waitlx():      # 雲端機器載模型比較慢：等新模型（lx）建好才開始錄（原本第一格就讀 __v.model.lx 會出錯）
        for _ in range(3000):
            if J('!!(__v.model && __v.model.lx)'): return
            adv()
    def run(name, steps, every=4, each=None):
        __waitlx()
        steps = int(dict(x.split(':') for x in os.environ.get('XN', '').split(',') if ':' in x).get(name[0], steps))      # 11-27 P1：XN=q:680,i:320 改各段錄幾步（錄到動作真的停住）
        every = int(os.environ.get('EVERY', every))
        k = 0; J('window.__mvS = 0; window.__mvH = null')
        if os.environ.get('FIXALL'): J('window.__fyFix = __v.model.root.rotation.y')      # FIXALL=1：每段鏡頭朝向都固定在世界（遊戲邏輯朝向一格轉很多時，鏡頭不跟著甩）
        for i in range(steps):
            if each: J(each)
            if os.environ.get('REST'): J("() => { const w = __w, v = __v, g = __game; if (w.st >= 2 && w.st <= 5) { window.__mvS = 1; if (w.st === 4) { g.me.x = v.x; g.me.z = v.z - 60; } } else if (window.__mvS && (w.st === 0 || w.st === 1 || w.st === 7)) { w.st = 0; w.t = 0; w.target = null; w.provoked = false; w.fleeFrom = null; w.cd = 9; g.me.x = v.x; g.me.z = v.z - 60; if (!window.__mvH) window.__mvH = [w.x, w.z]; } if (window.__mvH && w.st === 0) { w.wanderT = 99; w.wx = window.__mvH[0]; w.wz = window.__mvH[1]; } }")      # 11-27 P1：收招（st 4）時玩家先移遠（倒衝收招不會再接一次往後蹬）；回到待機後原地站著不閒晃（片段錄到真的停住）      # REST=1：招式做完、回到走跑時把玩家移遠，野獸停下來站好（片段錄到動作真的停住）
            r = adv()
            if i % every == 0:
                if os.environ.get('PRST'): print('ST', name, k, r.get('st'), r.get('stT'), J('JSON.stringify([__v.model.lx && __v.model.lx.ctl.mode, +(__v.model.lx.INR.look||0).toFixed(1), +(__v.model.lx.INR.hk||0).toFixed(2), __v.model.lx.ctl.tA, __v.model.lx.RB.tail.length])'), flush=True)
                if os.environ.get('SPD'): print('SP', name, k, r.get('st'), r.get('sp'), r.get('run'), r.get('sc'), flush=True)
                if os.environ.get('PROBE') and name[0] in os.environ.get('PROBE'): print('PR', name, k, J(PROBE), flush=True)
                if os.environ.get('P2') and name[0] in os.environ.get('P2'): print('P2', name, k, r.get('st'), r.get('stT'), J(P2), flush=True)
                if not os.environ.get('NOGRAB'): grab(page, name, k)
                k += 1
        print(name, 'frames', k, 'last', {a: r.get(a) for a in ('st', 'stT', 'd')}, flush=True)
        if os.environ.get('FIXALL'): J('window.__fyFix = null')
    PROBE = """() => { const X = __v.model.lx, TH = X.root.position.constructor, v = new TH(); let sk = null; X.model.traverse(o => { if (o.isSkinnedMesh) sk = o; }); const bn = sk.skeleton.bones, SI = sk.geometry.attributes.skinIndex, SW = sk.geometry.attributes.skinWeight, n = sk.geometry.attributes.position.count;
      const grp = b => { for (let o = b; o; o = o.parent) { const m = o.name; if (/^head$/.test(m)) return 'head'; if (/^front.*L|clavicle.L/.test(m)) return 'FL'; if (/^front.*R|clavicle.R/.test(m)) return 'FR'; if (/^rear.*L/.test(m)) return 'HL'; if (/^rear.*R/.test(m)) return 'HR'; if (/^(hips|root)$/.test(m)) return 'body'; } return 'body'; };
      const G = {}; for (let i = 0; i < n; i += 2) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const g = grp(bn[SI.getComponent(i, k)]); sk.getVertexPosition(i, v); sk.localToWorld(v); X.stage.worldToLocal(v); (G[g] = G[g] || []).push(v.y); }
      const o = {}; for (const g in G) { const a = G[g].sort((x, y) => x - y); o[g] = +a[Math.floor(a.length * 0.005)].toFixed(3); } const hp = X.T.wp(X.model.getObjectByName('head')); o.ip = +X.INR.pitch.toFixed(1); o.hd = X.LEGS.map(L => +X.T.wp(L.t).distanceTo(hp).toFixed(2)).join('/'); return JSON.stringify(o); }"""
    P2 = """() => { const X = __v.model.lx, f = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; const hd = X.model.getObjectByName('head'), q = hd.getWorldQuaternion(new X.root.quaternion.constructor()), st = X.stage.getWorldQuaternion(new X.root.quaternion.constructor()); const fw = new X.root.position.constructor(0, 0, 1).applyQuaternion(st.invert().multiply(q));
      return JSON.stringify({ m: X.mode, ry: +X.root.position.y.toFixed(3), rz: +X.root.position.z.toFixed(3), t: X.LEGS.map(L => f(X.T.wp(L.t))), hf: f(fw), bl: +(X.ctl.bl || 0).toFixed(2), vy: +(Math.atan2(...(v => [v.x, v.z])(new X.root.position.constructor(0, 0, 1).applyQuaternion(X.stage.getWorldQuaternion(new X.root.quaternion.constructor())))) * 57.3).toFixed(1), ly: +(Math.atan2(...(v => [v.x, v.z])(new X.root.position.constructor(0, 0, 1).applyQuaternion(X.stage.parent.getWorldQuaternion(new X.root.quaternion.constructor())))) * 57.3).toFixed(1) }); }"""
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
    if 'a' in SC: settle(); print('RB', J('JSON.stringify(__v.model.lx && { RB: __v.model.lx.RB, L: __v.model.lx.LEGS.map(L => [L.id, +L.l1.toFixed(3), +L.l2.toFixed(3), +L.l3.toFixed(3), +L.l4.toFixed(3)]), FIT: { w: __v.model.lx.FIT.walk.v, t: __v.model.lx.FIT.trot.v, g: __v.model.lx.FIT.gallop.v }, k: __v.model.lx.k })'), flush=True); run('a_walk', 240)
    FLEE = """([d0, keep]) => { const v = __v, w = __w, g = __game; if (d0 != null) { g.me.x = v.x + Math.sin(v.f) * d0; g.me.z = v.z + Math.cos(v.f) * d0; w.target = null; w.fleeFrom = null; w.cd = 9; w.st = 7; w.t = 0; return; }
      const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > keep) { g.me.x = v.x - dx / d * keep; g.me.z = v.z - dz / d * keep; } w.cd = 9; }"""
    def flee(name, d0, keep, steps, skip=0):
        J(FLEE, [d0, keep])
        for i in range(skip): J(FLEE, [None, keep]); adv()
        run(name, steps, each="() => { const v = __v, w = __w, g = __game; const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > %s) { g.me.x = v.x - dx / d * %s; g.me.z = v.z - dz / d * %s; } w.cd = 9; }" % (keep, keep, keep))
    if 'r' in SC: settle(); chase('r_run', 50)
    def phold(seg):      # 11-27 P1：PHOLD=步數 → 招式／被打前先站定（原本 settle 後還在閒晃轉向，遊戲朝向剛轉、外觀還在追，開頭幾格看起來原地被拖著轉）
        n = int(os.environ.get('PHOLD', '0')) if seg in os.environ.get('PHSEG', 'qbki') else 0
        for _ in range(n): J("() => { const w = __w; w.st = 0; w.t = 0; w.wanderT = 99; w.wx = w.x; w.wz = w.z; }"); adv()
    if 'q' in SC: settle(); phold('q'); print('force quill', J(FORCE, ['porc_quill', 3.0, 0.6, 2.2, 0.8])); run('q_quill', 560)
    if 'b' in SC: settle(); phold('b'); print('force burst', J(FORCE, ['porc_burst', 3.0, 0.9, 0.25, 0.9])); run('b_burst', 360)
    if 'k' in SC:
        settle(); phold('k'); print('force back', J(FORCE, ['porc_back', -3.0, 0.6, 0.5, 0.9]))
        if os.environ.get('FIXCAM'): J('window.__fyFix = __v.model.root.rotation.y')      # 倒衝：鏡頭固定在世界，看得出往後衝的位移
        run('k_back', 340); J('window.__fyFix = null')
    if 'f' in SC:
        settle(); pre = int(os.environ.get('PRE', '40')); J("() => { window.__fk = 0; }")
        if os.environ.get('FIXCAM'): J('window.__fyFix = __v.model.root.rotation.y')
        run('f_flee', pre + 240, each="""() => { const v = __v, w = __w, g = __game, k = window.__fk++, P = %d; w.cd = 9;
          if (k < P) { g.me.x = v.x; g.me.z = v.z - 60; w.st = 0; w.t = 0; w.target = null; return; }
          if (k === P) { g.me.x = v.x + Math.sin(v.f) * 6; g.me.z = v.z + Math.cos(v.f) * 6; w.fleeFrom = null; w.st = 7; w.t = 0; return; }
          const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > 9) { g.me.x = v.x - dx / d * 9; g.me.z = v.z - dz / d * 9; } }""" % pre)
        J('window.__fyFix = null')
    if 'c' in SC: settle(); print('force charge', J(FORCE, (lambda a: [a[0]] + [float(x) for x in a[1:]])(os.environ.get('CHG', 'deer_charge,7.0,0.55,0.4,0.6').split(',')))); run('c_charge', 230)
    if 's' in SC: settle(); print('force spin', J(FORCE, ['boar_spin', 2.4, 0.5, 0.3, 0.6])); run('s_spin', 200)
    if 'h' in SC: settle(); J("() => { window.__t8 = 0; }"); run('h_warn', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; w.st = 8; w.t = window.__t8; v.st = 8; v.stT = window.__t8; w.target = null; }")
    if 'i' in SC: settle(); phold('i'); J("() => { window.__t8 = 0; }"); J('window.__fyFix = __v.model.root.rotation.y' if os.environ.get('FIXCAM') else '0'); run('i_stagger', 220, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; if (window.__t8 < 0.9) { w.st = 5; w.t = window.__t8; w.stagDur = 1.0; v.st = 5; v.stT = window.__t8; } }"); J('window.__fyFix = null')
    if 'j' in SC: settle(); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 260)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
