#!/usr/bin/env python3
"""老虎棚拍（I3）：隱藏場景、鋪一塊地面，確定性步進真遊戲。用法：studio.py <site> <outdir> <type> [seed] [hour] [E]
情境：stand 站立、walk 走路、run 奔跑、prep 撲擊預備（WIND 前段）、pounce 撲擊（STRIKE）。
每個情境各從 side／d45／back 三個機位、8 m 與 25 m 各拍一張（同一格內換機位重畫）。"""
import sys, os, json, random, time, base64
sys.path.insert(0, '/tmp/gt')
from common import serve, launch, route_cdn, watch
from playwright.sync_api import sync_playwright
site, outd, typ = sys.argv[1], sys.argv[2], sys.argv[3]; seed = int(sys.argv[4]) if len(sys.argv) > 4 else 7; hour = float(sys.argv[5]) if len(sys.argv) > 5 else 14.5; elite = len(sys.argv) > 6 and sys.argv[6] == 'E'
os.makedirs(outd, exist_ok=True); DT = 8.333
INIT = ("localStorage.setItem('intro1120','off'); window.__capture=true; window.__hour=%s; window.__noRender=true; { let s=%d; Math.random=()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }" % (hour, seed))
SETUP = r'''
async ([typ, elite]) => {
  const g = __game, dbg = (await import('/js/game.js')).debug, sim = dbg.sim, mons = g.mons, TH = await import('/js/three.bundle.js');
  g.me.x = 0; g.me.z = 52; g.me.f = 0; g.input.cam.mode = 'tps'; document.body.classList.add('tps'); g.input.cam.locked = true; g.cam.ready = false;
  const idx = []; sim.forEach((w, i) => { if (w.type === typ && !!w.elite === elite) idx.push(i); });
  idx.sort((a, b) => Math.hypot(sim[a].hx, sim[a].hz - 80) - Math.hypot(sim[b].hx, sim[b].hz - 80));
  const i = idx[0], w = sim[i], v = mons[i], hz = 52 + 34;
  const place = (z) => { for (const o of [w, v]) { o.hx = 0; o.hz = z; o.x = 0; o.z = z; } v.tx = 0; v.tz = z; v.lx = 0; v.lz = z; w.home = null; w.f = 0; };
  place(hz); window.__place = place; window.__w = w;
  window.__v = v; window.__q = []; window.__t = performance.now(); window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; };
  await new Promise(r => setTimeout(r, 300));
  window.__adv = () => { window.__t += %f; const cbs = window.__q.splice(0); window.__noRender = true; g.me.hp = g.me.hpMax || 9999; cbs.forEach(cb => cb(window.__t));
    const m = v.model; return m ? { st: v.st, sp: +v.speed.toFixed(2), run: m.run, d: +Math.hypot(v.x - g.me.x, v.z - g.me.z).toFixed(1), ph: m.phase || 0, sc: m.root.scale.x, stT: +(v.stT || 0).toFixed(2), M: v.M && v.M.id, wd: w.wd, sd: w.sd, wt: +w.t.toFixed(2) } : { st: v.st, nomodel: 1 }; };
  const W = g.W, comp = W.composer, cam = W.camera;
  const gm = new TH.Mesh(new TH.CircleGeometry(60, 48), new TH.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.receiveShadow = true;
  window.__shot = (view, D) => { const m = v.model, root = m.root, fy = root.rotation.y, px = root.position.x, py = root.position.y, pz = root.position.z;
    const rt = [Math.cos(fy), -Math.sin(fy)], fw = [Math.sin(fy), Math.cos(fy)], saved = [cam.position.clone(), cam.quaternion.clone(), cam.fov, cam.aspect];
    const hid = []; W.scene.children.forEach(c => { if (c.visible && !c.isLight && c !== root && !(c.getObjectById && c.getObjectById(root.id)) && c.type !== 'Object3D') { c.visible = false; hid.push(c); } });
    gm.position.set(px, py + 0.02, pz); W.scene.add(gm);
    const s2 = Math.SQRT1_2, dir = view === 'side' ? rt : view === 'back' ? [-fw[0], -fw[1]] : view === 'front' ? fw : [(fw[0] + rt[0]) * s2, (fw[1] + rt[1]) * s2];
    const sc = root.scale.x, cy = py + 1.6 + D * 0.04 + (window.__dy || 0);
    cam.position.set(px + dir[0] * D, cy, pz + dir[1] * D); cam.lookAt(px, py + 0.5 * sc * 1.0 + (window.__dy || 0), pz); cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    comp.render(0.016); const u = W.renderer.domElement.toDataURL('image/jpeg', 0.92);
    W.scene.remove(gm); hid.forEach(o => { o.visible = true; }); cam.position.copy(saved[0]); cam.quaternion.copy(saved[1]); cam.fov = saved[2]; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); return u; };
  window.__far = () => { g.me.x = 400; g.me.z = 400; };
  return { n: idx.length, id: v.id };
}
''' % DT

STRETCH = r"""
async () => { const m = __v.model, mesh = m.mesh, geo = mesh.geometry, ix = geo.index, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight; mesh.skeleton.update(); m.root.updateMatrixWorld(true);
  const TH = await import('/js/three.bundle.js'), n = pos.count, W = new Array(n), R = new Array(n), t = new TH.Vector3();
  for (let i = 0; i < n; i++) { R[i] = new TH.Vector3().fromBufferAttribute(pos, i); mesh.getVertexPosition(i, t); W[i] = t.clone(); }
  const out = []; for (let k = 0; k < ix.count; k += 3) { const a = ix.getX(k), b = ix.getX(k + 1), c = ix.getX(k + 2); let worst = 0;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const r0 = R[p].distanceTo(R[q]) + 0.01, w0 = W[p].distanceTo(W[q]); worst = Math.max(worst, w0 / r0); }
    if (worst > 2.5) out.push({ r: +worst.toFixed(1), v: [a, b, c].map(i => ({ i, p: R[i].toArray().map(x => +x.toFixed(2)), b: [0, 1, 2, 3].filter(q => sw.getComponent(i, q) > 0.01).map(q => m.bones[si.getComponent(i, q)].name + ':' + sw.getComponent(i, q).toFixed(2)) })) }); }
  out.sort((x, y) => y.r - x.r); return { n: out.length, top: out.slice(0, 6) }; }
"""
FOOT = r"""
async () => { const m = __v.model, mesh = m.mesh, pos = mesh.geometry.attributes.position; mesh.skeleton.update(); m.root.updateMatrixWorld(true);
  const TH = await import('/js/three.bundle.js'), t = new TH.Vector3(), py = m.root.position.y, sc = m.root.scale.x; let mn = 1e9, below = 0, near = 0;
  for (let i = 0; i < pos.count; i++) { mesh.getVertexPosition(i, t); t.applyMatrix4(mesh.matrixWorld); const h = (t.y - py) / sc; if (h < mn) mn = h; if (h < -0.03) below++; if (h < 0.02) near++; }
  return { minY: +mn.toFixed(3), below3cm: below, nearGround: near }; }
"""
port = random.randint(11900, 12400); srv = serve(port, site); log = []
def save(page, name, views=('side', 'd45', 'back'), dists=(8, 25)):
    for vw in views:
        for D in dists:
            u = page.evaluate("([a,b]) => window.__shot(a,b)", [vw, D]); open(f'{outd}/{name}_{vw}_{D}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
    print('saved', name, flush=True); print('FOOT', name, json.dumps(page.evaluate(FOOT)), flush=True)

def grab(page, name, k, views=('side','d45')):
    for vw in views:
        u = page.evaluate("([a,b]) => window.__shot(a,b)", [vw, 9]); open(f'{outd}/{name}_{vw}_{k:03d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True)
    adv = lambda: page.evaluate('window.__adv()'); J = page.evaluate
    J('() => { __game.me.x = 0; __game.me.z = __v.z - 70; }'); J('() => { const w = __w; w.st = 0; w.t = 0; w.target = null; w.wanderT = 9999; w.wx = w.x; w.wz = w.z; }')
    for i in range(200): adv()
    for k in range(24):
        for s in range(3): adv()
        grab(page, 'a_stand', k)
    J('() => { const w = __w; w.st = 0; w.wanderT = 9999; }'); ok = 0; k = 0
    for i in range(3000):
        J('() => { const w = __w; w.hx = w.x; w.hz = w.z; w.wx = w.x + Math.sin(w.f) * 12; w.wz = w.z + Math.cos(w.f) * 12; w.wanderT = 9999; }')
        r = adv()
        if r.get('nomodel'): continue
        if r['st'] == 0 and 0.3 < r['sp'] < 0.8 * r['run']: ok += 1
        else: ok = 0
        if ok > 120 and i % 2 == 0: grab(page, 'b_walk', k); k += 1
        if k >= 48: break
    print('walk frames', k, flush=True)
    J('() => { __game.me.x = 0; __game.me.z = __v.z - 60; __game.me.f = 0; const w = __w; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 9; w.seen = {}; }')
    k = 0
    for i in range(3000):
        r = adv()
        if r.get('nomodel'): continue
        if r['st'] == 1 and r['sp'] > 0.88 * r['run'] and r['d'] > 10: grab(page, 'c_run', k); k += 1
        if k >= 36 or (k > 0 and r['st'] != 1): break
    print('run frames', k, flush=True)
    J('() => { const v = __v, w = __w; w.st = 0; w.target = null; __place(v.z); }')
    for i in range(60): adv()
    J('() => { const v = __v, w = __w, g = __game; g.me.x = v.x; g.me.z = v.z + 5.5; w.st = 1; w.t = 0; w.target = "self"; w.provoked = true; w.cd = 0; w.seen = {}; }')
    k = 0; seen = False
    for i in range(1500):
        J('() => { const g = __game, v = __v; if (__w.st === 1 || __w.st === 2) { g.me.x = v.x + Math.sin(v.f) * 5.5; g.me.z = v.z + Math.cos(v.f) * 5.5; } }')
        r = adv()
        if r.get('nomodel'): continue
        if r['st'] in (2, 3): seen = True
        if seen and i % 2 == 0: J('window.__dy = 0.5'); grab(page, 'd_pounce', k); k += 1
        if seen and (k >= 48 or r['st'] not in (2, 3, 4)): break
    print('pounce frames', k, flush=True)
    b.close()
