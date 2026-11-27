#!/usr/bin/env python3
"""野鹿遊戲內動作錄影（由 seqB 複製）。SC：a 走路、r 逃跑奔跑、f 轉身逃跑、c 角頂、k 後蹬、i 被打、j 倒地。夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000; Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：天氣照遊戲步進時間（固定在無雨時段），整段錄影亮度一致
SETUP = SETUP.replace("px = root.position.x, py = root.position.y, pz = root.position.z", "px = root.position.x, py = root.position.y, pz = root.position.z; if (m.lx && m.lx.stage) { const _p = m.lx.stage.getWorldPosition(new TH.Vector3()); px = _p.x; pz = _p.z; }").replace("const m = v.model, root = m.root, fy = root.rotation.y, px", "const m = v.model, root = m.root; let fy = root.rotation.y, px")      # 11-27 D1（照 seqQ B1）：鏡頭對準外觀位置（OPT.cuR 命中停頓時外觀照真實時間走，遊戲 root 會卡住再追），不然畫面整個跟著跳
SETUP = SETUP.replace('fy = root.rotation.y', 'fy = (window.__fyFix != null ? window.__fyFix : root.rotation.y)')      # FIXCAM：鏡頭方向固定在世界（看得到轉身）          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
SETUP = SETUP.replace("new TH.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 })", "new TH.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5f8a3c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#527a33'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); const t = new TH.CanvasTexture(c); t.wrapS = t.wrapT = TH.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = TH.SRGBColorSpace; window.__gtex = t; return t; })() })").replace("gm.position.set(px, py + 0.02, pz);", "gm.position.set(px, py + 0.02, pz); if (window.__gtex) window.__gtex.offset.set(px / 2, -pz / 2);")      # 錄影地面：2 公尺一格的棋盤格，格子固定在世界上（鏡頭跟著平移時看得出移動、腳有沒有滑）      # 11-27 審核：棋盤格地面才看得出腳有沒有滑（照 seqN）
def grab(page, name, k, D=7):
    if os.environ.get('NOFADE'): page.evaluate("() => { __v.model.root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const M of ms) { const U = M.userData && M.userData.mfx; if (U && __w.st !== 6) { U.fade.value = 1; M.opacity = 1; } } }); }")      # 錄影用：關掉遊戲『大型野獸擋住鏡頭時變網點』的功能（錄影鏡頭不是遊戲鏡頭）
    for vw in ('side', 'd45'):
        u = page.evaluate("([a,b]) => window.__shot(a,b)", [vw, D]); open(f'{outd}/{name}_{vw}_{k:03d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
RESET = "() => { const v = __v, w = __w, g = __game; w.st = 0; w.t = 0; w.target = null; w.M = null; w.mvc = 0; w.hp = w.hpMax || w.hp; __place(v.z); g.me.x = v.x; g.me.z = v.z - 60; }"
FORCE = """async ([name, dist, wd, sd, rd]) => { const C = await import('/js/core.js'), v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * dist; g.me.z = v.z + Math.cos(v.f) * dist;
  w.target = 'self'; w.provoked = true; w.seen = {}; w.M = C.MOVES[name]; w.arg = 0; w.mvc = (w.M.i + 1); w.st = 2; w.t = 0; w.wd = wd; w.sd = sd; w.rd = rd; w.cd = 9; return !!w.M; }"""
port = random.randint(11900, 12400); srv = serve(port, site)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True)
    adv = lambda: page.evaluate('window.__adv()'); J = page.evaluate
    J(RESET)
    for i in range(240): adv()
    def settle(n=90):
        J(RESET)
        for i in range(n): adv()
        for i in range(900):      # 11-27 雲端：新模型（含凍結引擎清單）是非同步載入，settle 完可能還沒建好；等到 lx 出現才開始錄
            if J('() => !!(window.__v && __v.model && __v.model.lx)'): break
            adv(); page.wait_for_timeout(20)
    def run(name, steps, every=4, each=None):
        every = int(os.environ.get('EVERY', every))
        k = 0
        for i in range(steps):
            if each: J(each)
            r = adv()
            if i % every == 0:
                if os.environ.get('PRST'): print('ST', name, k, r.get('st'), r.get('stT'), J('JSON.stringify([__v.model.lx && __v.model.lx.ctl.mode, +(__v.model.lx.INR.look||0).toFixed(1), +(__v.model.lx.INR.hk||0).toFixed(2), __v.model.lx.ctl.tA, __v.model.lx.RB.tail.length])'), flush=True)
                if os.environ.get('SPD'): print('SP', name, k, r.get('st'), r.get('sp'), r.get('run'), r.get('sc'), flush=True)
                if os.environ.get('PROBE') and name[0] in os.environ.get('PROBE'): print('PR', name, k, J(PROBE), flush=True)
                if os.environ.get('P2') and name[0] in os.environ.get('P2'): print('P2', name, k, r.get('st'), r.get('stT'), r.get('sp'), J(P2), flush=True)
                if os.environ.get('WP'): print('WP', name, k, J("JSON.stringify((() => { const X = __v.model.lx, V3 = X.root.position.constructor, a = new V3(), b = new V3(); X.stage.getWorldPosition(a); X.root.getWorldPosition(b); return [__w.st, +(__w.t||0).toFixed(3), +a.x.toFixed(3), +a.z.toFixed(3), +b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3), X.ctl.mode, +((X.INR && X.INR.dt) || 0).toFixed(4), +(window.__rdt || 0).toFixed(4), +X.root.position.y.toFixed(4), X.ctl.sT != null ? +X.ctl.sT.toFixed(3) : null, +(X.ctl.fLift || 0).toFixed(4), X.ctl.bl != null ? +X.ctl.bl.toFixed(2) : null]; })())"), flush=True)
                if os.environ.get('LDX'): print('LX', name, k, J("JSON.stringify([+__v.model.lx.root.position.y.toFixed(4), +(__v.model.lx.ctl.fLift||0).toFixed(4), __v.model.lx.ctl.mode, __v.model.lx.ctl.dph].concat(__v.model.lx.LEGS.filter(L => L.kind === 'F').map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.kA, L.dbg.r, L.dbg.pi, L.dbg.err, L.c && +((L.c.u)||0).toFixed(2)] : [L.id])))"), flush=True)
                if os.environ.get('LD'): print('LD', name, k, J("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA, L.dbg.df, L.dbg.fL, L.dbg.r] : [L.id]))"), flush=True)
                if os.environ.get('WX'): print('WX', name, k, J("JSON.stringify(__v.model.lx.LEGS.map(L => { const X = __v.model.lx, TH = X.root.position.constructor, h = L.h.getWorldPosition(new TH()), t = L.t.getWorldPosition(new TH()), g = X.stage.getWorldPosition(new TH()).y; return [L.id, +h.x.toFixed(3), +h.z.toFixed(3), +(h.y - g).toFixed(3), +(t.y - g).toFixed(3), L.c && L.c.air ? 1 : 0, L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1, +t.x.toFixed(3), +t.z.toFixed(3)]; }).concat([(X => { const TH = X.root.position.constructor, a = X.stage.getWorldPosition(new TH()), b = X.root.getWorldPosition(new TH()); return [+a.x.toFixed(3), +a.z.toFixed(3), +b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)]; })(__v.model.lx)]))"), flush=True)      # 11-27 D1：每隻腳掌根／趾尖世界座標、離地高、是否擺盪、擺盪進度；最後一組 stage xz、root xyz
                if os.environ.get('LA'): print('LA', name, k, J("JSON.stringify((X => { const TH = X.root.position.constructor, W = b => b.getWorldPosition(new TH()), an = (a, b, c) => +(b.clone().sub(a).angleTo(c.clone().sub(b)) * 57.3).toFixed(1); return X.LEGS.map(L => { const P = [L.s, L.e, L.w, L.h, L.t].map(W); return [L.id, an(P[0], P[1], P[2]), an(P[1], P[2], P[3]), an(P[2], P[3], P[4]), +P[3].y.toFixed(3), +P[4].y.toFixed(3), +P[3].x.toFixed(3), +P[3].z.toFixed(3)]; }); })(__v.model.lx))"), flush=True)      # 11-27 D1（照 seqQ B1）：畫面上實際關節角
                if os.environ.get('KD'): print('KD', name, k, J("JSON.stringify(__v.model.lx.LEGS.map(L => { const TH = __v.model.lx.root.position.constructor, s = L.s.getWorldPosition(new TH()), c = L.c || {}; return [L.id, c.air ? 1 : 0, c.ok ? 1 : 0, c.W ? +c.W.x.toFixed(3) : null, c.W ? +c.W.z.toFixed(3) : null, +s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3), L.dbg && L.dbg.err != null ? +L.dbg.err.toFixed(3) : -1, +(L.grm || 0).toFixed(4), c.stp ? 1 : 0, +(c.su || 0).toFixed(2)]; }).concat([[__v.model.lx.ctl.kdF != null ? +__v.model.lx.ctl.kdF.toFixed(3) : null, __v.model.lx.ctl.kdP]]))"), flush=True)      # 11-27 D1：倒地探針（接觸點、腿根世界座標、IK 誤差）
                if not os.environ.get('NOGRAB'): grab(page, name, k)
                k += 1
        print(name, 'frames', k, 'last', {a: r.get(a) for a in ('st', 'stT', 'd')}, flush=True)
    PROBE = """() => { const X = __v.model.lx, TH = X.root.position.constructor, v = new TH(); let sk = null; X.model.traverse(o => { if (o.isSkinnedMesh) sk = o; }); const bn = sk.skeleton.bones, SI = sk.geometry.attributes.skinIndex, SW = sk.geometry.attributes.skinWeight, n = sk.geometry.attributes.position.count;
      const grp = b => { for (let o = b; o; o = o.parent) { const m = o.name; if (/^head$/.test(m)) return 'head'; if (/^front.*L|clavicle.L/.test(m)) return 'FL'; if (/^front.*R|clavicle.R/.test(m)) return 'FR'; if (/^rear.*L/.test(m)) return 'HL'; if (/^rear.*R/.test(m)) return 'HR'; if (/^(hips|root)$/.test(m)) return 'body'; } return 'body'; };
      const G = {}; for (let i = 0; i < n; i += 2) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const g = grp(bn[SI.getComponent(i, k)]); sk.getVertexPosition(i, v); sk.localToWorld(v); X.stage.worldToLocal(v); (G[g] = G[g] || []).push(v.y); }
      const o = {}; for (const g in G) { const a = G[g].sort((x, y) => x - y); o[g] = +a[Math.floor(a.length * 0.005)].toFixed(3); } const hp = X.T.wp(X.model.getObjectByName('head')); o.ip = +X.INR.pitch.toFixed(1); o.hd = X.LEGS.map(L => +X.T.wp(L.t).distanceTo(hp).toFixed(2)).join('/'); return JSON.stringify(o); }"""
    P2 = """() => { const X = __v.model.lx, f = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; const hd = X.model.getObjectByName('head'), q = hd.getWorldQuaternion(new X.root.quaternion.constructor()), st = X.stage.getWorldQuaternion(new X.root.quaternion.constructor()); const fw = new X.root.position.constructor(0, 0, 1).applyQuaternion(st.invert().multiply(q));
      return JSON.stringify({ m: X.mode, ry: +X.root.position.y.toFixed(3), rz: +X.root.position.z.toFixed(3), t: X.LEGS.map(L => f(X.T.wp(L.t))), hf: f(fw), bl: +(X.ctl.bl || 0).toFixed(2), air: X.LEGS.map(L => L.c ? (L.c.air ? 1 : 0) : -1).join(''), vy: +(Math.atan2(...(v => [v.x, v.z])(new X.root.position.constructor(0, 0, 1).applyQuaternion(X.stage.getWorldQuaternion(new X.root.quaternion.constructor())))) * 57.3).toFixed(1), ly: +(Math.atan2(...(v => [v.x, v.z])(new X.root.position.constructor(0, 0, 1).applyQuaternion(X.stage.parent.getWorldQuaternion(new X.root.quaternion.constructor())))) * 57.3).toFixed(1) }); }"""
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
    if 'a' in SC: settle(); J('() => { const w = __w; w.wx = w.x; w.wz = w.z + 16; w.wanderT = 99; }'); run('a_walk', int(os.environ.get('AN', '720')), each='() => { __w.wanderT = 99; }')      # 11-27 審核：原本 2 秒內只踏 5 格就站著（遊戲閒晃），改成跟野牛一樣指定 16 公尺外的走路目標
    FLEE = """([d0, keep]) => { const v = __v, w = __w, g = __game; if (d0 != null) { g.me.x = v.x + Math.sin(v.f) * d0; g.me.z = v.z + Math.cos(v.f) * d0; w.target = null; w.fleeFrom = null; w.cd = 9; w.st = 7; w.t = 0; return; }
      const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > keep) { g.me.x = v.x - dx / d * keep; g.me.z = v.z - dz / d * keep; } w.cd = 9; }"""
    def flee(name, d0, keep, steps, skip=0):
        J(FLEE, [d0, keep])
        for i in range(skip): J(FLEE, [None, keep]); adv()
        run(name, steps, each="() => { const v = __v, w = __w, g = __game; const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > %s) { g.me.x = v.x - dx / d * %s; g.me.z = v.z - dz / d * %s; } w.cd = 9; }" % (keep, keep, keep))
    if 'r' in SC: settle(); flee('r_run', -6.0, 9.0, 240, skip=180)
    if 'f' in SC:
        settle(); pre = int(os.environ.get('PRE', '40')); J("() => { window.__fk = 0; }")
        if os.environ.get('FIXCAM'): J('window.__fyFix = __v.model.root.rotation.y')
        run('f_flee', pre + 240, each="""() => { const v = __v, w = __w, g = __game, k = window.__fk++, P = %d; w.cd = 9;
          if (k < P) { g.me.x = v.x; g.me.z = v.z - 60; w.st = 0; w.t = 0; w.target = null; return; }
          if (k === P) { g.me.x = v.x + Math.sin(v.f) * 6; g.me.z = v.z + Math.cos(v.f) * 6; w.fleeFrom = null; w.st = 7; w.t = 0; return; }
          const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > 9) { g.me.x = v.x - dx / d * 9; g.me.z = v.z - dz / d * 9; } }""" % pre)
        J('window.__fyFix = null')
    if 'c' in SC: settle(); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); print('force charge', J(FORCE, (lambda a: [a[0]] + [float(x) for x in a[1:]])(os.environ.get('CHG', 'deer_charge,7.0,0.55,0.4,0.6').split(',')))); run('c_charge', int(os.environ.get('CN', '230'))); J('window.__fyFix = null')
    if 's' in SC: settle(); print('force spin', J(FORCE, ['boar_spin', 2.4, 0.5, 0.3, 0.6])); run('s_spin', 200)
    if 'k' in SC: settle(); print('force kick', J(FORCE, ['deer_kick', -2.4, 0.36, 0.2, 0.45])); run('k_kick', 140)
    if 'h' in SC: settle(); J("() => { window.__t8 = 0; }"); run('h_warn', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; w.st = 8; w.t = window.__t8; v.st = 8; v.stT = window.__t8; w.target = null; }")
    if 'i' in SC: settle(); J("() => { window.__t8 = 0; }"); run('i_stagger', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; if (window.__t8 < 0.9) { w.st = 5; w.t = window.__t8; w.stagDur = 1.0; v.st = 5; v.stT = window.__t8; } }")
    if 'j' in SC: settle(); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 260)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
