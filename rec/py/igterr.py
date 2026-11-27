#!/usr/bin/env python3
"""遊戲測試版內的地形檢查：把生物放到真正的斜坡上走、跑，量每隻踩著的腳「腳底離真正地面多高」，並拍照（不隱藏場景）。
用法：igterr.py <site> <outdir> <type>（環境變數 QS='?wolf=20' 或 '?wolf=20&gnd=0'）"""
import sys, os, json, base64
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
FIND = r"""async ([lo, hi]) => { const Wd = await import('/js/world.js'), v = __v, w = __w; let best = null; window.__Hgt = Wd.Hgt; const hist = {};
  for (let x = -160; x <= 160; x += 4) for (let z = -160; z <= 160; z += 4) { let ok = true, smn = 9, smx = 0; for (const [dx, dz] of [[0,0],[5,0],[-5,0],[0,5],[0,-5],[9,0],[0,9],[-9,0],[0,-9]]) { const s = Wd.slopeAt(x + dx, z + dz).s; smn = Math.min(smn, s); smx = Math.max(smx, s); if (Wd.blockedAt(x + dx, z + dz) || Wd.waterDepth(x + dx, z + dz) > -0.5) ok = false; }
    { const kk = ok ? Math.floor(Wd.slopeAt(x, z).s * 10) / 10 : 'x'; hist[kk] = (hist[kk] || 0) + 1; } if (!ok || smn < lo || smx > hi) continue; const sc = Math.abs(Wd.slopeAt(x, z).s - 0.5 * (lo + hi)); if (!best || sc < best.sc) best = { x, z, sc, s: Wd.slopeAt(x, z).s, smn, smx }; }
  if (!best) return { none: 1, hist }; for (const o of [w, v]) { o.hx = best.x; o.hz = best.z; o.x = best.x; o.z = best.z; } v.tx = best.x; v.tz = best.z; v.lx = best.x; v.lz = best.z; w.home = null; window.__Hgt = Wd.Hgt;
  window.__place = () => {}; __game.me.x = best.x; __game.me.z = best.z - 60; return best; }"""
MEAS = r"""() => { const m = __v.model, X = m.lx; if (!X) return null; const out = [], ws = X.stage.matrixWorld.elements, sW = Math.hypot(ws[0], ws[1], ws[2]), u = X.root.position.clone();
  for (const L of X.LEGS) { let mn = 1e9; for (const q of L.sole) { q.m.getVertexPosition(q.i, u); q.m.localToWorld(u); const d = (u.y - __Hgt(u.x, u.z)) / sW; if (d < mn) mn = d; } out.push([L.c && L.c.air ? 1 : 0, +mn.toFixed(4)]); }
  return { L: out, mode: X.mode, tilt: m.sl ? m.sl.map(x => +x.toFixed(3)) : null, sW: +sW.toFixed(3) }; }"""
SHOT = r"""([D, side]) => { const g = __game, W = g.W, cam = W.camera, v = __v, root = v.model.root, fy = root.rotation.y, px = root.position.x, py = root.position.y, pz = root.position.z, sv = [cam.position.clone(), cam.quaternion.clone(), cam.fov];
  const dir = side ? [Math.cos(fy), -Math.sin(fy)] : [(Math.sin(fy) + Math.cos(fy)) * 0.7071, (Math.cos(fy) - Math.sin(fy)) * 0.7071]; cam.position.set(px + dir[0] * D, Math.max(py + 0.7, __Hgt(px + dir[0] * D, pz + dir[1] * D) + 0.5), pz + dir[1] * D); cam.lookAt(px, py + 0.45, pz); cam.fov = 34; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  if (v.model) v.model.camFade = 1; W.composer.render(0.016); const u = W.renderer.domElement.toDataURL('image/jpeg', 0.9); cam.position.copy(sv[0]); cam.quaternion.copy(sv[1]); cam.fov = sv[2]; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); return u; }"""
port = random.randint(11900, 12400); srv = serve(port, site); lo, hi = float(os.environ.get('SLO', '0.2')), float(os.environ.get('SHI', '0.45'))
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True); J = page.evaluate; adv = lambda: J('window.__adv()')
    sp = J(FIND, [lo, hi]); print('slope spot', sp, flush=True)
    if sp.get('none'): b.close(); sys.exit(1)
    for i in range(200): adv()
    R = {}
    def seg(name, n, pre=None, every=10, shots=6):
        if pre: J(pre)
        A = []; k = 0
        for i in range(n):
            r = adv(); mm = J(MEAS)
            if mm: A.append(mm)
            if i % max(1, n // shots) == n // shots // 2 and k < shots:
                u = J(SHOT, [float(os.environ.get('D', '4.2')), True]); open(f'{outd}/{name}_{k:02d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1])); k += 1
        pl = [x[1] for a in A for x in a['L'] if x[0] == 0]; al = [x[1] for a in A for x in a['L']]
        R[name] = dict(n=len(A), planted_min=min(pl) if pl else None, planted_max=max(pl) if pl else None, planted_mean_abs=sum(abs(x) for x in pl) / max(1, len(pl)), all_min=min(al) if al else None, tilt=A[-1]['tilt'] if A else None, mode=A[-1]['mode'] if A else None, last=r)
        print(name, json.dumps(R[name]), flush=True)
    seg('idle', 60)
    seg('walk', 420)
    seg('run', 260, '() => { const v = __v, w = __w, g = __game; g.me.x = v.x + Math.sin(v.f) * 30; g.me.z = v.z + Math.cos(v.f) * 30; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }')
    json.dump(R, open(f'{outd}/r.json', 'w')); print('errs', errors[:5], 'lynx', J('JSON.stringify({bad: window.__lynx20 && __lynx20.bad()})'), flush=True); b.close()
