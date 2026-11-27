#!/usr/bin/env python3
"""Q2 通用錄影（由 seqD 複製）：環境變數 MT＝把這隻野獸的模型種類換成別的（例：遊戲裡沒有水豚，用野鹿的行為＋水豚模型 MT=capy）；FM＝強制招式清單 名稱,距離,wd,sd,rd;…；LD=1 每格印每條腿 [id, aE, aW, kA]。原說明：SC：a 走路、r 逃跑奔跑、f 轉身逃跑、c 角頂、k 後蹬、i 被打、j 倒地。夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000; Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：天氣照遊戲步進時間（固定在無雨時段），整段錄影亮度一致
SETUP = SETUP.replace("c !== root && !(c.getObjectById && c.getObjectById(root.id))", "c !== root && c !== window.__keep && !(c.getObjectById && c.getObjectById(root.id))")      # Q2：KEEPME=1 錄影時留下玩家（沼蟒扭絞纏著的人）
SETUP = SETUP.replace('fy = root.rotation.y', 'fy = (window.__fyFix != null ? window.__fyFix : root.rotation.y)')
SETUP = SETUP.replace("view === 'front' ? fw :", "view === 'front' ? fw : view === 'b45' ? [(-fw[0] + rt[0]) * s2, (-fw[1] + rt[1]) * s2] :")      # Q2：斜後方視角 b45      # FIXCAM：鏡頭方向固定在世界（看得到轉身）          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
def grab(page, name, k, D=None):
    D = D or float(os.environ.get('CAMD', 7))
    if os.environ.get('NOFADE'): page.evaluate("() => { __v.model.root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const M of ms) { const U = M.userData && M.userData.mfx; if (U && __w.st !== 6) { U.fade.value = 1; M.opacity = 1; } } }); }")      # 錄影用：關掉遊戲『大型野獸擋住鏡頭時變網點』的功能（錄影鏡頭不是遊戲鏡頭）
    for vw in os.environ.get('VIEWS', 'side,d45').split(','):
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
    if os.environ.get('MT'): print('model type ->', page.evaluate("t => { const m = __v.model; m.type = t; if (m.lx) { m.lx.stage.parent && m.lx.stage.parent.remove(m.lx.stage); m.lx = null; } return m.type; }", os.environ['MT']), flush=True)
    adv = lambda: page.evaluate('window.__adv()'); J = page.evaluate
    J(RESET)
    for i in range(240): adv()
    if os.environ.get('PRB'): print('RB', J("JSON.stringify({rb: __v.model.lx && __v.model.lx.RB, k: __v.model.lx && __v.model.lx.k, wlen: __v.model.lx && __v.model.lx.SIZE.len * __v.model.lx.k * __v.model.root.scale.x, wh: __v.model.lx && __v.model.lx.SIZE.h * __v.model.lx.k * __v.model.root.scale.x, size: __v.model.lx && __v.model.lx.SIZE, legs: __v.model.lx && __v.model.lx.LEGS.map(L => ({id: L.id, sE: L.sE, sW: L.sW, mE0: +(L.mE0*57.3).toFixed(1), mW0: +(L.mW0*57.3).toFixed(1), l: [L.l1,L.l2,L.l3,L.l4].map(x=>+x.toFixed(3)), hy: +L.hy.toFixed(3), d0: +L.d0.toFixed(3), dMax: +L.dMax.toFixed(3)})), bad: window.__lynx20 && __lynx20.bad && __lynx20.bad()})"), flush=True)
    def settle(n=90):      # 11-27 B1：先等新模型建好，再重設亂數＋RESET＋步進（等模型的步數每次不同，AI 閒晃會不一樣；重設後同一段前後版本可逐格比對）
        if not J('!!(window.__v && __v.model && __v.model.lx)'): need()
        J("() => { let s = 7; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }")
        J(RESET)
        for i in range(n): adv()
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
                if os.environ.get('VYP'): print('VY', name, k, J("JSON.stringify((X => { const q = new X.root.quaternion.constructor(); X.stage.parent.getWorldQuaternion(q); const v = new X.root.position.constructor(0, 0, 1).applyQuaternion(q); return [+(Math.atan2(v.x, v.z) * 57.3).toFixed(1), +((X.ctl.vyW || 0) * 57.3).toFixed(1), +((X.ctl.vyT || 0) * 57.3).toFixed(1), +(X.stage.rotation.y * 57.3).toFixed(1), X.ctl.mode, __v.st, +(__w.f * 57.3).toFixed(1), +(__v.f * 57.3).toFixed(1), ...(p => [+p.x.toFixed(3), +p.z.toFixed(3)])(X.stage.getWorldPosition(new X.root.position.constructor())), ...(p => [+p.x.toFixed(3), +p.z.toFixed(3)])(__v.model.root.position)]; })(__v.model.lx))"), flush=True)      # B1：後面加 stage 世界位置、模型 root 位置
                if os.environ.get('CRL'): print('CL', name, k, r.get('st'), round(r.get('stT') or 0, 2), J("JSON.stringify((X => { const TH = X.root.position.constructor, f = v => +v.toFixed(3), hb = X.model.getObjectByName('hips') || X.model.getObjectByName('root'), hp = X.root.worldToLocal(hb.getWorldPosition(new TH())); return [X.ctl.mode, ...X.LEGS.map(L => { const a = X.root.worldToLocal(L.t.getWorldPosition(new TH())), b = X.root.worldToLocal(L.e.getWorldPosition(new TH())); return [L.id, f(a.y - hp.y), f(b.y - hp.y)]; })]; })(__v.model.lx))"), flush=True)
                if os.environ.get('BRD'): print('BD', name, k, r.get('st'), round(r.get('stT') or 0, 2), J("JSON.stringify((X => { const c = X.ctl, S = c.S || {}, f = v => +(+v || 0).toFixed(3), TH = X.root.position.constructor, gp = n => { const b = X.model.getObjectByName(n), p = b.getWorldPosition(new TH()); return X.stage.worldToLocal(p); }, pe = gp('Bone_001'), ch = gp('Bone_002'), hd = gp('Bone_016'), bk = gp('Bone_065'), fL = gp('Bone_009'), fR = gp('Bone_013'); return [c.mode, c.fly, f(c.alt), f(S.air), f(S.open), f(S.pitch), f(S.legT), f(S.legF), f(Math.atan2(ch.y - pe.y, Math.hypot(ch.x - pe.x, ch.z - pe.z)) * 57.3), f(Math.atan2(bk.y - hd.y, Math.hypot(bk.x - hd.x, bk.z - hd.z)) * 57.3), f(hd.y), f(fL.y), f(fR.y), f(fL.z), f(fR.z), c.nx]; })(__v.model.lx))"), flush=True)
                if os.environ.get('SNK'): print('SN', name, k, r.get('st'), round(r.get('stT') or 0, 2), J("JSON.stringify((X => { const S = X.ctl.sm || {}, f = v => +(+v).toFixed(3), hp = new X.root.position.constructor(); X.model.traverse(o => { if (o.isBone && !(o.parent && o.parent.isBone)) o.getWorldPosition(hp); }); X.stage.worldToLocal(hp); const sw = X.stage.getWorldPosition(new X.root.position.constructor()); return [X.ctl.mode, f(S.fw), f(S.c), f(S.h), f(S.pitch), f(S.sw), f(S.cw), f(S.roll), f(hp.x), f(hp.y), f(hp.z), f(sw.x), f(sw.z), f(X.ctl.vy * 57.3), f(__v.f * 57.3)]; })(__v.model.lx))"), flush=True)
                if os.environ.get('LA'): print('LA', name, k, J("JSON.stringify((X => { const TH = X.root.position.constructor, W = b => b.getWorldPosition(new TH()), an = (a, b, c) => +(b.clone().sub(a).angleTo(c.clone().sub(b)) * 57.3).toFixed(1); return X.LEGS.map(L => { const P = [L.s, L.e, L.w, L.h, L.t].map(W); return [L.id, an(P[0], P[1], P[2]), an(P[1], P[2], P[3]), an(P[2], P[3], P[4]), +P[3].y.toFixed(3), +P[4].y.toFixed(3), +P[3].x.toFixed(3), +P[3].z.toFixed(3)]; }); })(__v.model.lx))"), flush=True)      # 11-27 B1：畫面上實際的關節角（世界座標三點夾角，含限速後的結果）：[腳, 第1-2節, 第2-3節, 第3-4節, 掌根y, 腳尖y, 掌根x, 掌根z]
                if os.environ.get('LD'): print('LD', name, k, J("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA] : [L.id]))"), flush=True)
                if not os.environ.get('NOGRAB'): grab(page, name, k)
                k += 1
        print(name, 'frames', k, 'last', {a: r.get(a) for a in ('st', 'stT', 'd')}, flush=True)
    PROBE = """() => { const X = __v.model.lx, TH = X.root.position.constructor, v = new TH(); let sk = null; X.model.traverse(o => { if (o.isSkinnedMesh) sk = o; }); const bn = sk.skeleton.bones, SI = sk.geometry.attributes.skinIndex, SW = sk.geometry.attributes.skinWeight, n = sk.geometry.attributes.position.count;
      const grp = b => { for (let o = b; o; o = o.parent) { const m = o.name; if (/^head$/.test(m)) return 'head'; if (/^front.*L|clavicle.L/.test(m)) return 'FL'; if (/^front.*R|clavicle.R/.test(m)) return 'FR'; if (/^rear.*L/.test(m)) return 'HL'; if (/^rear.*R/.test(m)) return 'HR'; if (/^(hips|root)$/.test(m)) return 'body'; } return 'body'; };
      const G = {}; for (let i = 0; i < n; i += 2) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const g = grp(bn[SI.getComponent(i, k)]); sk.getVertexPosition(i, v); sk.localToWorld(v); X.stage.worldToLocal(v); (G[g] = G[g] || []).push(v.y); }
      const o = {}; for (const g in G) { const a = G[g].sort((x, y) => x - y); o[g] = +a[Math.floor(a.length * 0.005)].toFixed(3); } const hp = X.T.wp(X.model.getObjectByName('head')); o.ip = +X.INR.pitch.toFixed(1); o.hd = X.LEGS.map(L => +X.T.wp(L.t).distanceTo(hp).toFixed(2)).join('/'); return JSON.stringify(o); }"""
    P2 = """() => { const X = __v.model.lx, f = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; const hd = X.model.getObjectByName('head'), q = hd.getWorldQuaternion(new X.root.quaternion.constructor()), st = X.stage.getWorldQuaternion(new X.root.quaternion.constructor()); const fw = new X.root.position.constructor(0, 0, 1).applyQuaternion(st.invert().multiply(q));
      return JSON.stringify({ m: X.mode, ry: +X.root.position.y.toFixed(3), rz: +X.root.position.z.toFixed(3), t: X.LEGS.map(L => f(X.T.wp(L.t))), hf: f(fw), bl: +(X.ctl.bl || 0).toFixed(2), air: X.LEGS.map(L => L.c ? (L.c.air ? 1 : 0) : -1).join(''), vy: +(Math.atan2(...(v => [v.x, v.z])(new X.root.position.constructor(0, 0, 1).applyQuaternion(X.stage.getWorldQuaternion(new X.root.quaternion.constructor())))) * 57.3).toFixed(1), ly: +(Math.atan2(...(v => [v.x, v.z])(new X.root.position.constructor(0, 0, 1).applyQuaternion(X.stage.parent.getWorldQuaternion(new X.root.quaternion.constructor())))) * 57.3).toFixed(1) }); }"""
    J('window.__dy = ' + os.environ.get('DY', '0.2'))
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
    def need():      # 11-27 B1：settle 之後模型（或新模型 lx，GLB 還在載入）有時還沒建，先步進＋等待到出現再錄
        for i in range(1200):
            if J('!!(window.__v && __v.model && __v.model.root && __v.model.lx)'): return
            adv(); page.wait_for_timeout(25)
        print('need: model/lx 一直沒出現', flush=True)
    FX = lambda: (need(), os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'))      # 11-27：鏡頭固定在世界（跟著遊戲朝向轉的鏡頭會讓畫面看起來像急轉）
    if 'a' in SC: settle(); FX(); run('a_walk', 240); J('window.__fyFix = null')
    FLEE = """([d0, keep]) => { const v = __v, w = __w, g = __game; if (d0 != null) { g.me.x = v.x + Math.sin(v.f) * d0; g.me.z = v.z + Math.cos(v.f) * d0; w.target = null; w.fleeFrom = null; w.cd = 9; w.st = 7; w.t = 0; return; }
      const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > keep) { g.me.x = v.x - dx / d * keep; g.me.z = v.z - dz / d * keep; } w.cd = 9; }"""
    def flee(name, d0, keep, steps, skip=0):
        J(FLEE, [d0, keep])
        for i in range(skip): J(FLEE, [None, keep]); adv()
        run(name, steps, each="() => { const v = __v, w = __w, g = __game; const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > %s) { g.me.x = v.x - dx / d * %s; g.me.z = v.z - dz / d * %s; } w.cd = 9; }" % (keep, keep, keep))
    if 'r' in SC: settle(); FX(); flee('r_run', -6.0, 9.0, 240, skip=180); J('window.__fyFix = null')
    if 'C' in SC:      # Q2：沼蟒扭絞（錄影裡沒人被纏，遊戲會立刻鬆開）：只改送進動作引擎的狀態（預備 0.1→扭絞 CS 秒→鬆開 1.2 秒），人站在蛇的原點
        settle(); J('window.__fyFix = __v.model.root.rotation.y'); J("() => { const X = __v.model.lx; if (!X.__u0) { X.__u0 = X.update; X.update = o => X.__u0(window.__ovr ? Object.assign({}, o, window.__ovr(o)) : o); } window.__ck = 0; }")
        CS = float(os.environ.get('CS', '3.5'))
        if os.environ.get('KEEPME'): print('keep', J('(() => { window.__keep = __game.me.avatar && __game.me.avatar.group; return !!window.__keep; })()'))
        run('C_crush', int((0.1 + CS + 1.6) * 120), each="() => { const v = __v, w = __w, g = __game, t = (window.__ck++) / 120, CS = %s; w.cd = 9; w.st = 0; w.t = 0; w.target = null; g.me.x = v.x; g.me.z = v.z; window.__ovr = () => t < 0.1 ? { st: 2, stT: t, anim: 'crush', wind: 0.1, strike: CS, recover: 1.2 } : t < 0.1 + CS ? { st: 3, stT: t - 0.1, anim: 'crush', wind: 0.1, strike: CS, recover: 1.2 } : t < 1.3 + CS ? { st: 4, stT: t - 0.1 - CS, anim: 'crush', wind: 0.1, strike: CS, recover: 1.2 } : { st: 1, stT: t - 1.3 - CS, anim: '' }; }" % CS)
        J('window.__ovr = null; window.__fyFix = null; window.__keep = null')
    if 'O' in SC:      # Q2：只改送進動作引擎的招式狀態（OV＝名稱,anim,grab,wind,strike,recover;…）；搭 MT 用別的動物的 AI 站著不動（沼蟒在自己的獸坑會沉下去、鏡頭對不到）
        for q, ov in enumerate([x for x in os.environ.get('OV', '').split(';') if x]):
            a = ov.split(','); wd, sd, rd = float(a[3]), float(a[4]), float(a[5]); settle(); J('window.__fyFix = __v.model.root.rotation.y'); J("() => { const X = __v.model.lx; if (!X.__u0) { X.__u0 = X.update; X.update = o => X.__u0(window.__ovr ? Object.assign({}, o, window.__ovr(o)) : o); } window.__ck = 0; }")
            run('o%d_%s' % (q, a[0]), int((wd + sd + rd + 0.7) * 120), each="() => { const v = __v, w = __w, g = __game, t = (window.__ck++) / 120, W = %s, S = %s, R = %s, an = '%s', gb = %s; w.cd = 9; w.st = 0; w.t = 0; w.target = null; g.me.x = v.x + Math.sin(v.f) * 40; g.me.z = v.z + Math.cos(v.f) * 40; const A = { anim: an, wind: W, strike: S, recover: R, grab: gb, speed: 0 }; window.__ovr = () => t < W ? Object.assign({ st: 2, stT: t }, A) : t < W + S ? Object.assign({ st: 3, stT: t - W }, A) : t < W + S + R ? Object.assign({ st: 4, stT: t - W - S }, A) : { st: 0, stT: t, anim: '' }; }" % (wd, sd, rd, a[1], 'true' if a[2] == '1' else 'false'))
            J('window.__ovr = null; window.__fyFix = null')
    if 'L' in SC:      # Q2：起飛→飛→盤旋→降落（鷺）：逃跑 LFL 步後不逃了，再錄 LN 步
        settle(); J('window.__fyFix = __v.model.root.rotation.y'); J(FLEE, [-6.0, 9.0]); J("() => { window.__lk = 0; }")
        run('L_fly', int(os.environ.get('LFL', '180')) + int(os.environ.get('LN', '720')), each="() => { const v = __v, w = __w, g = __game, k = window.__lk++; w.cd = 9; if (k < %s) { const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > 9) { g.me.x = v.x - dx / d * 9; g.me.z = v.z - dz / d * 9; } } else { g.me.x = v.x; g.me.z = v.z - 80; if (w.st === 7) { w.st = 0; w.t = 0; } w.fleeFrom = null; w.target = null; } }" % os.environ.get('LFL', '180')); J('window.__fyFix = null')
    if 'f' in SC:
        settle(); pre = int(os.environ.get('PRE', '40')); J("() => { window.__fk = 0; }")
        if os.environ.get('FIXCAM'): J('window.__fyFix = __v.model.root.rotation.y')
        run('f_flee', pre + 240, each="""() => { const v = __v, w = __w, g = __game, k = window.__fk++, P = %d; w.cd = 9;
          if (k < P) { g.me.x = v.x; g.me.z = v.z - 60; w.st = 0; w.t = 0; w.target = null; return; }
          if (k === P) { g.me.x = v.x + Math.sin(v.f) * 6; g.me.z = v.z + Math.cos(v.f) * 6; w.fleeFrom = null; w.st = 7; w.t = 0; return; }
          const dx = v.x - g.me.x, dz = v.z - g.me.z, d = Math.hypot(dx, dz); if (d > 9) { g.me.x = v.x - dx / d * 9; g.me.z = v.z - dz / d * 9; } }""" % pre)
        J('window.__fyFix = null')
    if 'c' in SC: settle(); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); print('force charge', J(FORCE, (lambda a: [a[0]] + [float(x) for x in a[1:]])(os.environ.get('CHG', 'deer_charge,7.0,0.55,0.4,0.6').split(',')))); run('c_charge', int(os.environ.get('CN', '230'))); J('window.__fyFix = null')
    if 'w' in SC: settle(); run('w_idle', 200)
    if 'q' in SC: settle(); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 20; g.me.z = v.z + Math.cos(v.f) * 20; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }'); run('q_chase', 200, each='() => { const w = __w; w.cd = 9; if (w.st >= 2 && w.st <= 4) { w.st = 1; w.t = 0; } }'); J('window.__fyFix = null')
    if 't' in SC: settle(); need(); J('() => { window.__tk = 0; const g = __game, v = __v; g.me.x = v.x + 25; g.me.z = v.z - 8; }'); J('window.__fyFix = __v.model.root.rotation.y'); run('t_turn', 200, each="() => { const w = __w, v = __v; if (++window.__tk === 40) { w.f += 1.3; v.f = w.f; } const g = __game; g.me.x = v.x + 25; g.me.z = v.z - 8; if (window.__tk === 130) { w.f -= 2.2; v.f = w.f; } }")
    if 'T' in SC:      # 11-27 B1：站著原地轉身（乾淨版）：位置釘住、AI 不閒晃，只在第 40 步左轉 75°、第 130 步右轉 126°（TA1、TA2 可改角度，弧度）；鏡頭固定在世界
        settle(); need(); J("() => { const v = __v, w = __w, g = __game; window.__tk = 0; window.__T0 = { x: w.x, z: w.z, f: w.f }; g.me.x = v.x + 40; g.me.z = v.z - 40; }"); J('window.__fyFix = __v.model.root.rotation.y')
        PIN = "() => { const w = __w, v = __v, g = __game, T = window.__T0; w.x = v.tx = T.x; w.z = v.tz = T.z; w.f = v.f = T.f; w.st = 0; w.t = 0; w.target = null; w.cd = 9; g.me.x = T.x + 40; g.me.z = T.z - 40; }"
        for i in range(360): J(PIN); adv()      # 先站好 3 秒（視覺朝向追上邏輯朝向、四腳站定）再開始錄
        J('window.__tk = 0')
        run('T_turn', int(os.environ.get('TN', '220')), each="() => { const w = __w, v = __v, g = __game, T = window.__T0, k = ++window.__tk; if (k === 40) T.f += %s; if (k === 130) T.f -= %s; w.x = v.tx = T.x; w.z = v.tz = T.z; w.f = v.f = T.f; w.st = 0; w.t = 0; w.target = null; w.cd = 9; g.me.x = T.x + 40; g.me.z = T.z - 40; }" % (os.environ.get('TA1', '1.3'), os.environ.get('TA2', '2.2')))
        J('window.__fyFix = null')
    for q, fm in enumerate([x for x in os.environ.get('FM', '').split(';') if x]):
        a = fm.split(','); settle(); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); print('force', a, J(FORCE, [a[0]] + [float(x) for x in a[1:5]])); run('m%d_%s' % (q, a[0]), int(a[5]) if len(a) > 5 else 200); J('window.__fyFix = null')
    if 's' in SC: settle(); print('force spin', J(FORCE, ['boar_spin', 2.4, 0.5, 0.3, 0.6])); run('s_spin', 200)
    if 'k' in SC: settle(); print('force kick', J(FORCE, ['deer_kick', -2.4, 0.36, 0.2, 0.45])); run('k_kick', 140)
    if 'h' in SC: settle(); J("() => { window.__t8 = 0; }"); run('h_warn', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; w.st = 8; w.t = window.__t8; v.st = 8; v.stT = window.__t8; w.target = null; }")
    if 'i' in SC: settle(); FX(); J("() => { window.__t8 = 0; }"); run('i_stagger', 150, each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; if (window.__t8 < 0.9) { w.st = 5; w.t = window.__t8; w.stagDur = 1.0; v.st = 5; v.stT = window.__t8; } }")
    if 'j' in SC: settle(int(os.environ.get('JSET', '90'))); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 260)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
