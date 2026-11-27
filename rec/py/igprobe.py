#!/usr/bin/env python3
"""遊戲測試版內：強制出招，逐格記錄引擎內部狀態（找「出招後縮一下」的原因）。用法：igprobe.py <site> <type> <move,dist,wd,sd,rd> [frames]（QS='?wolf=20'）"""
import sys, os, json
sys.argv = [sys.argv[0], sys.argv[1], '/tmp/labcap/igp', sys.argv[2]] + sys.argv[3:]
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
mv = sys.argv[4].split(','); NF = int(sys.argv[5]) if len(sys.argv) > 5 else 260; sys.argv = sys.argv[:4]
exec('\n'.join(src[:56]))
RESET = "() => { const v = __v, w = __w, g = __game; w.st = 0; w.t = 0; w.target = null; w.M = null; w.mvc = 0; w.hp = w.hpMax || w.hp; __place(v.z); g.me.x = v.x; g.me.z = v.z - 60; }"
FORCE = """async ([name, dist, wd, sd, rd]) => { const C = await import('/js/core.js'), v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * dist; g.me.z = v.z + Math.cos(v.f) * dist;
  w.target = 'self'; w.provoked = true; w.seen = {}; w.M = C.MOVES[name]; w.arg = 0; w.mvc = (w.M.i + 1); w.st = 2; w.t = 0; w.wd = wd; w.sd = sd; w.rd = rd; w.cd = 9; return !!w.M; }"""
PROBE = r"""() => { const v = __v, m = v.model, X = m && m.lx; if (!X) return null; const T = X.T, I = X.INR || {}; const L = X.LEGS.map(L => { const c = L.c, a = X.stage.worldToLocal(c.W.clone()); return [c.air ? (c.key ? 2 : c.stp ? 3 : (c.why || 1)) : 0, c.dz || null, +(Math.hypot(a.x - L.anchor.x, a.z - L.anchor.z)).toFixed(3), +(a.x - L.anchor.x).toFixed(2), +(a.z - L.anchor.z).toFixed(2)]; });
  return { dbg: [+(X.INR.vf||0).toFixed(2), +(X.ctl.spd||0).toFixed(2), +(X.ctl.ph||0).toFixed(3), X.LEGS.map(L=>+(L.c.u||0).toFixed(2)).join('/'), X.LEGS.map(L=>+(L.c.k1||1).toFixed(2)).join('/'), +(X.INR.ok?1:0), +(X.INR.pitch||0).toFixed(1), +(X.INR.y||0).toFixed(3), +((X.T.BR&&X.T.BR.f)||0).toFixed(3)], st: v.st, stT: +(v.stT || 0).toFixed(2), mode: X.mode, ry: +X.root.position.y.toFixed(3), rz: +X.root.position.z.toFixed(3), br: T.BR ? [+T.BR.f.toFixed(3), +T.BR.h.toFixed(3)] : null, x: +v.x.toFixed(2), z: +v.z.toFixed(2), f: +v.f.toFixed(2), sp: +(v.speed || 0).toFixed(2), L }; }"""
port = random.randint(11900, 12400); srv = serve(port, site)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True); J = page.evaluate; adv = lambda: J('window.__adv()')
    J(RESET)
    for i in range(240): adv()
    print('force', J(FORCE, [mv[0], float(mv[1]), float(mv[2]), float(mv[3]), float(mv[4])]))
    out = []
    for i in range(NF): adv(); out.append(J(PROBE))
    print('EL', J('JSON.stringify(window.__el||null)')); print('FIT', J('JSON.stringify(Object.fromEntries(Object.entries(__v.model.lx.FIT).map(([k,f])=>[k,[+f.v.toFixed(2),+f.S.toFixed(2)]])))'), 'sW', J('__v.model.lx.INR.sW')); json.dump(out, open('/tmp/labcap/igp.json', 'w')); pst = None
    for i, o in enumerate(out):
        if not o: continue
        if i % 6 == 0 or o["st"] != pst: print(i, o['st'], o['stT'], o['mode'], 'ry', o['ry'], 'rz', o['rz'], 'br', o['br'], 'pos', o['x'], o['z'], o['f'], 'sp', o['sp'], '|', ' '.join(f"{l[0]}:{l[1]}" for l in o['L']))
        pst = o['st']
    b.close()
