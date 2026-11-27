#!/usr/bin/env python3
"""夜鉤猞遊戲內動作補錄：強制指定招式與狀態，逐格錄影。用法同 seq2：seq3.py <site> <outdir> tiger（環境變數 QS='?tiger=20'）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))          # 沿用 seq2 的 INIT／SETUP（確定性步進、棚拍鏡頭）
def grab(page, name, k, D=7):
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
    def run(name, steps, every=4, each=None):
        k = 0
        for i in range(steps):
            J('() => { if (__v.model) __v.model.camFade = 1; }')
            if each: J(each)
            r = adv()
            if i % every == 0: grab(page, name, k); k += 1
        print(name, 'frames', k, 'last', {a: r.get(a) for a in ('st', 'stT', 'd')}, flush=True)
    J('window.__dy = 0.2')
    SC = os.environ.get('SC', 'a,r,e,f,g,j').split(','); EV = int(os.environ.get('EVERY', '4'))
    def chase(name, nmax):
        J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 34; g.me.z = v.z + Math.cos(v.f) * 34; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }'); k = 0; ok = 0
        for i in range(1500):
            r = adv()
            if r.get('nomodel'): continue
            ok = ok + 1 if (r['st'] == 1 and r.get('sp', 0) > 0.7 * r.get('run', 9)) else 0
            if ok > 30 and i % EV == 0: grab(page, name, k); k += 1
            if k >= nmax or r.get('d', 99) < 9: break
        print(name, 'frames', k, flush=True)
    if 'c' in SC:
        for i in range(40): adv()
        J("""() => { const ext = (M) => { const v = M.position.clone(), n = M.geometry.attributes.position.count; let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, x0 = 1e9, x1 = -1e9; M.updateWorldMatrix(true, false); for (let i = 0; i < n; i += 7) { M.getVertexPosition(i, v); v.applyMatrix4(M.matrixWorld); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); } return [+(y1 - y0).toFixed(3), +Math.hypot(x1 - x0, z1 - z0).toFixed(3)]; };
          const m = __v.model, X = m.lx; let nm = null; if (X) X.model.traverse(o => { if (o.isSkinnedMesh) nm = o; }); const vis = m.mesh.visible; window.__kinfo = { old: ext(m.mesh), neu: nm ? ext(nm) : null, k: X ? X.k : null, rootScale: m.root.scale.y }; }"""); print('kinfo', J('JSON.stringify(window.__kinfo)'))
        grab(page, 'c_old' if not os.environ.get('QS') else 'c_fx0', 0)
        if os.environ.get('QS') and not os.environ.get('NOFX'):
            for n, (sat, gain, gam) in enumerate([(1.1, 1.0, 1.0), (0.8, 1.15, 0.72), (0.75, 1.3, 0.65), (0.8, 1.0, 0.6)]):
                J("async ([s,g,gm]) => { const F = await import('/js/meshyfx.js'); F.fixMeshyMaterials(__v.model.lx.stage, { sat: s, gain: g, gam: gm }); __v.model.camFade = 1; }", [sat, gain, gam])
                for i in range(3): adv()
                grab(page, 'c_fx%d' % (n + 1), 0)
    if 'a' in SC:
        run('a_walk', 240, every=EV)
    if 'h' in SC:
        HOLD = "() => { const w = __w; w.st = 0; w.wanderT = 9999; w.wx = w.x; w.wz = w.z; w.hx = w.x; w.hz = w.z; }"
        for i in range(90): J(HOLD); adv()
        J("() => { const X = __v.model.lx; if (X) X.ctl.flWait = 0.2; }"); run('h_howl', 540, every=EV, each=HOLD)
    if 'r' in SC: settle(); chase('r_run', 40)
    if 'e' in SC: settle(); print('force leap', J(FORCE, ['wolf_leap', 8.0, 0.8, 0.5, 0.9])); run('e_leap', 420, every=EV)
    if 'f' in SC: settle(); print('force snap', J(FORCE, ['wolf_snap', 2.2, 0.42, 0.18, 0.55])); run('f_snap', 340, every=EV)
    if 'g' in SC: settle(); print('force bite', J(FORCE, ['wolf_bite', 4.5, 0.6, 0.34, 0.75])); run('g_bite', 400, every=EV)
    if 'j' in SC: settle(); J("() => { const w = __w; w.hp = 0; w.st = 6; w.t = 0; }"); run('j_dead', 300, every=EV)
    print('lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad(), mode: __v.model.lx && __v.model.lx.mode})'), 'errs', errors[:5], flush=True)
    b.close()
