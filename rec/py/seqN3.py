#!/usr/bin/env python3
"""（11-27 N3：seqN.py 的複本＋W 段＝真的警告：玩家走近→野牛警告→玩家退開→回待機。WA 玩家從牛朝向偏幾度走來、WD 起點距離、WI 停在幾公尺、WH 停幾秒、WO 退到幾公尺、WT 退開後再錄幾秒）
野牛遊戲內動作補錄（由 seqB.py 複製）。SC：a 走路 r 追擊奔跑 g 鬥牛衝（接回身再衝） q 回身再衝 o 角挑 k 後踢 z 撞暈 i 被打 j 倒地；GD＝鏡頭距離。
夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000, RN = Date.now.bind(Date); Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：Date.now 跟著遊戲步進時間走（原本跟真實時鐘走，錄 20～30 分鐘會跨進下一段天氣，前後段亮度差到一倍）      # 錄影用：遊戲天氣照現實時鐘排雨（weather08），固定在每段的無雨時段，畫面亮度、野獸察覺距離每次都一樣
SETUP = SETUP.replace("new TH.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 })", "new TH.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#5f8a3c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#527a33'; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32); const t = new TH.CanvasTexture(c); t.wrapS = t.wrapT = TH.RepeatWrapping; t.repeat.set(60, 60); t.colorSpace = TH.SRGBColorSpace; window.__gtex = t; return t; })() })").replace("gm.position.set(px, py + 0.02, pz);", "gm.position.set(px, py + 0.02, pz); if (window.__gtex) window.__gtex.offset.set(px / 2, -pz / 2);")      # 錄影地面：2 公尺一格的棋盤格，格子固定在世界上（鏡頭跟著平移時看得出移動、腳有沒有滑）
SETUP = SETUP.replace('fy = root.rotation.y', 'fy = (window.__fyFix != null ? window.__fyFix : root.rotation.y)').replace("const m = v.model, root = m.root, fy =", "const m = v.model, root = m.root; let fy =").replace("px = root.position.x, py = root.position.y, pz = root.position.z;", "px = root.position.x, py = root.position.y, pz = root.position.z; if (m.lx && m.lx.stage) { const _p = m.lx.stage.getWorldPosition(new TH.Vector3()); px = _p.x; pz = _p.z; }")      # 11-27 N1：鏡頭對準外觀位置（stage；野牛 cuV 在命中停頓時外觀位置會比遊戲位置平順），和 seqQ 一樣      # FIXCAM：鏡頭方向固定在世界（看得到回身）          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
GD = float(os.environ.get('GD', '11'))
STATJS = r'''() => { const m = __v.model, X = m.lx; if (!X) return null; const st = X.stage, TH = st.position.constructor; const v = new TH(), out = { body: 1e9, head: 1e9, leg: 1e9, tail: 1e9, fleg: 1e9 };
  const legB = new Set(), headB = new Set(), tailB = new Set(), fB = new Set(); for (const L of X.LEGS) L.ch[0].traverse(o => { if (o.isBone) { legB.add(o); if (L.kind === 'F') fB.add(o); } }); const hd = X.root.getObjectByName('head'); if (hd) hd.traverse(o => { if (o.isBone) headB.add(o); }); const tl = X.root.getObjectByName('tail_01'); if (tl) tl.traverse(o => { if (o.isBone) tailB.add(o); });
  const gy = st.getWorldPosition(new TH()).y, sc = st.getWorldScale(new TH()).x;
  X.root.traverse(o => { if (!o.isSkinnedMesh) return; const g = o.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bs = o.skeleton.bones;
    for (let i = 0; i < g.attributes.position.count; i += 7) { let k = 0; for (let q = 1; q < 4; q++) if (SW.getComponent(i, q) > SW.getComponent(i, k)) k = q; const b = bs[SI.getComponent(i, k)]; o.getVertexPosition(i, v); o.localToWorld(v); const y = (v.y - gy) / sc; const c = legB.has(b) ? 'leg' : headB.has(b) ? 'head' : tailB.has(b) ? 'tail' : 'body'; if (y < out[c]) out[c] = y; if (c === 'leg' && fB.has(b) && y < out.fleg) out.fleg = y; } });
  for (const k in out) out[k] = +out[k].toFixed(3); return out; }'''
def grab(page, name, k, D=None):
    D = D or GD
    if os.environ.get('STAT'): print('STAT', name, k, page.evaluate(STATJS), flush=True)
    if os.environ.get('NOFADE'): page.evaluate("() => { __v.model.root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const M of ms) { const U = M.userData && M.userData.mfx; if (U && __w.st !== 6) { U.fade.value = 1; M.opacity = 1; } } }); }")      # 錄影用：關掉遊戲『大型野獸擋住鏡頭時變網點』的功能（錄影鏡頭不是遊戲鏡頭）
    for vw in ('side', 'd45'):
        u = page.evaluate("([a,b]) => window.__shot(a,b)", [vw, D]); open(f'{outd}/{name}_{vw}_{k:03d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
WXJS = 'JSON.stringify(__v.model.lx.LEGS.map(L => { const X = __v.model.lx, TH = X.root.position.constructor, h = L.h.getWorldPosition(new TH()), t = L.t.getWorldPosition(new TH()), g = X.stage.getWorldPosition(new TH()).y; return [L.id, +h.x.toFixed(3), +h.z.toFixed(3), +(h.y - g).toFixed(3), +(t.y - g).toFixed(3), L.c && L.c.air ? 1 : 0, L.c && L.c.air ? +(L.c.u || 0).toFixed(2) : -1, +t.x.toFixed(3), +t.z.toFixed(3), ...(L.fin && L.fin.p ? (q => [+q.x.toFixed(3), +q.z.toFixed(3)])(X.stage.localToWorld(L.fin.p.clone())) : [0, 0]), ...(L.c && L.c.Wl ? [+L.c.Wl.x.toFixed(3), +L.c.Wl.z.toFixed(3)] : [0, 0]), L.dbg && L.dbg.err != null ? +L.dbg.err.toFixed(3) : -1]; }).concat([[+(__v.model.root.position.x).toFixed(3), +(__v.model.root.position.z).toFixed(3), +(__v.model.root.rotation.y * 57.3).toFixed(1), ...(p => [+p.x.toFixed(3), +p.z.toFixed(3)])(__v.model.lx.stage.getWorldPosition(new (__v.model.lx.root.position.constructor)()))]]))'      # 11-27 N1：每格腳掌根／趾尖世界座標（同 seqI 的 WX）
LAJS = "JSON.stringify((X => { const TH = X.root.position.constructor, W = b => b.getWorldPosition(new TH()), an = (a, b, c) => +(b.clone().sub(a).angleTo(c.clone().sub(b)) * 57.3).toFixed(1); return X.LEGS.map(L => { const P = [L.s, L.e, L.w, L.h, L.t].map(W); return [L.id, an(P[0], P[1], P[2]), an(P[1], P[2], P[3]), an(P[2], P[3], P[4]), +P[3].y.toFixed(3), +P[4].y.toFixed(3), +P[3].x.toFixed(3), +P[3].z.toFixed(3)]; }); })(__v.model.lx))"      # 11-27 N2：畫面上實際關節角（同 seqQ 的 LA；LD 是解算要的角度、限速前）：[腳, 第1-2節, 第2-3節, 第3-4節, 掌根y, 腳尖y, 掌根x, 掌根z]
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
    page.evaluate("async () => { window.__fx = (await import('/js/actors.js')).fx; window.__hsM = 0; }")      # 11-27 N1：記下命中停頓（hitstop）有沒有發生，YAW 探針印出（驗證 hsR）
    adv = lambda: page.evaluate('() => { const h = window.__fx ? window.__fx.hitstop : 0; window.__hsM = Math.max(window.__hsM || 0, h); return window.__adv(); }'); J = page.evaluate
    J(RESET)
    for i in range(240): adv()
    def settle(n=90):
        J(RESET)
        for i in range(n): adv()
        for i in range(900):      # 11-27 雲端：新模型（含凍結引擎清單）是非同步載入，settle 完可能還沒建好；等到 lx 出現才開始錄
            if J('() => !!(window.__v && __v.model && __v.model.lx)'): break
            adv(); page.wait_for_timeout(20)
    def run(name, steps, every=4, each=None):
        k = 0
        for i in range(steps):
            if each: J(each)
            r = adv()
            if i % every == 0:
                if os.environ.get('PRST'): print('ST', name, k, r.get('st'), r.get('stT'), J('JSON.stringify([__v.model.lx && __v.model.lx.ctl.mode, +(__v.model.lx.INR.look||0).toFixed(1), +(__v.model.lx.INR.hk||0).toFixed(2), __v.model.lx.ctl.tA, __v.model.lx.RB.tail.length])'), flush=True)
                if os.environ.get('SPD'): print('SP', name, k, r.get('st'), r.get('sp'), r.get('run'), r.get('sc'), flush=True)
                if os.environ.get('YAW'): print('YW', name, k, J("JSON.stringify((() => { const X = __v.model.lx, T = X.root.quaternion.constructor, V3 = X.root.position.constructor, y = o => { const q = new T(); o.getWorldQuaternion(q); const f = new V3(0, 0, 1).applyQuaternion(q); return +(Math.atan2(f.x, f.z) * 57.3).toFixed(1); }; return [__w.st, +(__w.t||0).toFixed(2), y(X.stage), X.stage.parent ? y(X.stage.parent) : null, y(X.root), X.ctl.vyW != null ? +(X.ctl.vyW * 57.3).toFixed(1) : null, X.ctl.mode, X.ctl.sT != null ? +X.ctl.sT.toFixed(3) : null, X.ctl.hkT != null ? +X.ctl.hkT.toFixed(3) : null, +((X.INR && X.INR.dt) || 0).toFixed(4), +(window.__hsM || 0).toFixed(3) + (window.__hsM = 0), +(window.__rdt || 0).toFixed(4), +((X.ctl && X.ctl.vg) || 0).toFixed(2), X.ctl && X.ctl.cvD]; })())"), flush=True)
                if os.environ.get('WX'): print('WX', name, k, J(WXJS), flush=True)
                if os.environ.get('LD'): print('LD', name, k, J("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA, L.dbg.df, L.dbg.fL, L.dbg.r] : [L.id]))"), flush=True)
                if os.environ.get('LA'): print('LA', name, k, J(LAJS), flush=True)
                grab(page, name, k); k += 1
        print(name, 'frames', k, 'last', {a: r.get(a) for a in ('st', 'stT', 'd')}, flush=True)
    J('window.__dy = 0.2')
    SC = os.environ.get('SC', 'c,s,k,h,i,j').split(',')
    def chase(name, nmax):
        J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 34; g.me.z = v.z + Math.cos(v.f) * 34; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }'); k = 0; ok = 0
        for i in range(1500):
            r = adv()
            if r.get('nomodel'): continue
            ok = ok + 1 if (r['st'] == 1 and r.get('sp', 0) > 0.7 * r.get('run', 9)) else 0
            if ok > 30 and i % 4 == 0:      # 11-27 N1：奔跑段也印腿資料（LD／WX／YAW），審核要的
                if os.environ.get('LD'): print('LD', name, k, J("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA, L.dbg.df, L.dbg.fL, L.dbg.r] : [L.id]))"), flush=True)
                if os.environ.get('LA'): print('LA', name, k, J(LAJS), flush=True)
                if os.environ.get('WX'): print('WX', name, k, J(WXJS), flush=True)
                grab(page, name, k); k += 1
            if k >= nmax or r.get('d', 99) < 9: break
        print(name, 'frames', k, flush=True)
    if 'a' in SC: settle(); J('() => { const w = __w; w.wx = w.x; w.wz = w.z + 16; w.wanderT = 99; }'); run('a_walk', int(os.environ.get('AN', '720')), each='() => { __w.wanderT = 99; }')
    if 'r' in SC: settle(); chase('r_run', 40)
    def face(deg):      # 11-27 N1：固定出生朝向（每次錄影朝向隨機，衝的路線上有時有樹石＝撞暈，前後版本沒法比）；轉完先站定讓外觀朝向追上
        for _ in range(150): J("(f) => { const w = __w, v = __v; w.f = v.f = f; w.st = 0; w.t = 0; w.wanderT = 99; w.wx = w.x; w.wz = w.z; w.target = null; }", deg / 57.2958); adv()
    if 'g' in SC: settle(); os.environ.get('GF') and face(float(os.environ['GF'])); print('force gore', J(FORCEC, ['bison_gore', 12.0, 1.35, 1.15, 2.4, ['bison_regore'], 2])); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); run('g_gore', int(os.environ.get('GN', '1000'))); J('window.__fyFix = null')
    if 'q' in SC: settle(); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); print('force regore', J(FORCEC, ['bison_regore', -9.0, 1.0, 1.0, 1.1, None, 2])); run('q_regore', 420); J('window.__fyFix = null')
    if 'o' in SC: settle(); print('force hook', J(FORCEC, ['bison_hook', 2.6, 0.72, 0.25, 0.75, None, 2])); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y'); run('o_hook', 260); J('window.__fyFix = null')      # 11-27 探針：甩角後轉身其實每秒約 110°（有限速），是鏡頭跟著遊戲朝向（一格轉 20°）在甩，看起來像牛急轉；鏡頭固定在世界
    if 'k' in SC: settle(); print('force buck', J(FORCEC, ['bison_buck', -2.6, 0.5, 0.22, 0.6, None, 2])); run('k_buck', 200)
    if 'z' in SC: settle(); print('force daze', J(FORCEC, ['bison_daze', 6.0, 0.1, 0.1, 2.6, None, 4])); run('z_daze', 340)
    if 'w' in SC: settle(); face(J('() => __w.f') * 57.2958); J("() => { window.__t8 = 0; }"); run('w_warn', int(os.environ.get('WN', '300')), each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; w.st = 8; w.t = window.__t8; v.st = 8; v.stT = window.__t8; w.target = null; }")      # 11-27 N1 查到：野牛 temper＝neutral，遊戲裡沒有警告狀態（只有 territorial 會進 st 8）；這段強制 st＝8 下一步就被遊戲改回 0，錄到的其實是待機（探針 mode＝idle）。維持原樣（審核看的「警告」就是待機）
    if 'i' in SC: settle(); J("() => { window.__t8 = 0; }"); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y');      # 11-27 N1：被打段鏡頭固定在世界（原本跟著遊戲朝向轉，結尾看起來被拖著轉）
    if 'i' in SC:
        for _ in range(int(os.environ.get('IHOLD', '150'))): J("() => { const w = __w; w.st = 0; w.t = 0; w.wanderT = 99; w.wx = w.x; w.wz = w.z; w.target = null; }"); adv()      # 11-27 N1：被打前先站定 1.25 秒（settle 後還在閒晃轉向，外觀朝向落後遊戲朝向 130°，被打整段看起來在原地轉）
        J("() => { window.__t8 = 0; }"); os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y')
        run('i_stagger', int(os.environ.get('IN', '180')), each="() => { const w = __w, v = __v; window.__t8 += 1 / 120; if (window.__t8 < 0.9) { w.st = 5; w.t = window.__t8; w.stagDur = 1.0; v.st = 5; v.stT = window.__t8; } else { w.st = 0; w.wanderT = 99; w.wx = w.x; w.wz = w.z; w.target = null; } }")      # 11-27 N1：被打結束後原地站穩（不接 AI 閒晃轉向），錄到動作停住
        J('window.__fyFix = null')
    if 'j' in SC: settle(); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 200)
    if 'W' in SC:      # 11-27 N3：真的警告（遊戲 AI 自己進出 st 8，不強制狀態）
        settle(); A = float(os.environ.get('WA', '70')) / 57.2958; D0 = float(os.environ.get('WD', '11')); DI = float(os.environ.get('WI', '6')); WH = float(os.environ.get('WH', '10')); WO = float(os.environ.get('WO', '13')); WT = float(os.environ.get('WT', '3'))
        for _ in range(int(os.environ.get('WHOLD', '150'))): J("() => { const w = __w; w.st = 0; w.t = 0; w.wanderT = 99; w.wx = w.x; w.wz = w.z; w.target = null; }"); adv()      # 先站定（吃草）
        os.environ.get('FIXCAM') and J('window.__fyFix = __v.model.root.rotation.y')
        J("([a, d]) => { const w = __w, g = __game, f = w.f + a; window.__wp = { f, d, ph: 0, t: 0 }; g.me.x = w.x + Math.sin(f) * d; g.me.z = w.z + Math.cos(f) * d; }", [A, D0])
        STEP = "([di, wh, wo]) => { const P = window.__wp, w = __w, g = __game, dt = 1 / 120; P.t += dt; if (P.ph === 0) { P.d -= 1.6 * dt; if (P.d <= di) { P.d = di; P.ph = 1; P.t = 0; } } else if (P.ph === 1) { if (P.t >= wh) { P.ph = 2; P.t = 0; } } else if (P.ph === 2) { P.d = Math.min(wo, P.d + 2.5 * dt); if (P.d >= wo) { P.ph = 3; P.t = 0; } } g.me.x = w.x + Math.sin(P.f) * P.d; g.me.z = w.z + Math.cos(P.f) * P.d; return P.ph; }"
        WNJS = "JSON.stringify((() => { const X = __v.model.lx, S = X.ctl.wn, P = window.__wp; return [__w.st, +(__w.t || 0).toFixed(2), X.ctl.mode, S && X.ctl.mode === 'warn' ? [+S.t.toFixed(2), +S.c.toFixed(2), S.k, S.n] : null, X.ctl.wnSn || 0, +(__w.f * 57.3).toFixed(1), P.ph, +P.d.toFixed(2), (X.ctl.np || []).filter(s => s.visible).length]; })())"
        k = 0; i = 0; tail = 0
        while True:
            ph = J(STEP, [DI, WH, WO]); r = adv()
            if i % 4 == 0:
                print('WN', 'W_warn', k, J(WNJS), flush=True)
                if os.environ.get('WX'): print('WX', 'W_warn', k, J(WXJS), flush=True)
                if os.environ.get('LD'): print('LD', 'W_warn', k, J("JSON.stringify(__v.model.lx.LEGS.map(L => L.dbg ? [L.id, L.dbg.aE, L.dbg.aW, L.dbg.kA, L.dbg.df, L.dbg.fL, L.dbg.r] : [L.id]))"), flush=True)
                if os.environ.get('LA'): print('LA', 'W_warn', k, J(LAJS), flush=True)
                if os.environ.get('YAW'): print('YW', 'W_warn', k, J("JSON.stringify((() => { const X = __v.model.lx, T = X.root.quaternion.constructor, V3 = X.root.position.constructor, y = o => { const q = new T(); o.getWorldQuaternion(q); const f = new V3(0, 0, 1).applyQuaternion(q); return +(Math.atan2(f.x, f.z) * 57.3).toFixed(1); }; return [__w.st, y(X.stage)]; })())"), flush=True)
                grab(page, 'W_warn', k); k += 1
            i += 1
            if ph == 3: tail += 1
            if tail > WT * 120 or i > 120 * 40: break
        print('W_warn frames', k, flush=True); J('window.__fyFix = null')
    if os.environ.get('RB'): print('RB', J('JSON.stringify(__v.model.lx && __v.model.lx.RB)'), flush=True)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
