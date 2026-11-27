#!/usr/bin/env python3
"""手部座標軸探測：在右手、左手、中指第一節掛座標軸（紅 X、綠 Y、藍 Z），待機姿勢下從前、右、上三個方向拍手的特寫。用法：heroprobe.py <site> <out> <g>"""
import sys, os, json, base64
sys.path.insert(0, '/tmp/gt'); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import serve, launch, route_cdn, watch
from playwright.sync_api import sync_playwright
site, outd, G = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(outd, exist_ok=True); PORT = 8899
INIT = "localStorage.setItem('intro1120','off'); window.__capture=true; window.__hour=14.5; window.__noRender=true;"
JS = r'''
async ([clip, t]) => {
  const g = __game, TH = await import('/js/three.bundle.js'), A = g.me.avatar, W = g.W;
  window.__q = []; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; };
  A.group.position.set(0, 0, 0); A.group.rotation.set(0, 0, 0);
  for (const m of A.weap) m.visible = false;
  const names = []; A.root.traverse(o => { if (o.isBone) names.push(o.name); });
  const add = re => { let b = null; A.root.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); if (b && !b.userData.ax) { const ax = new TH.AxesHelper(0.12 / (A.root.scale.x)); ax.material.depthTest = false; ax.renderOrder = 9; b.add(ax); b.userData.ax = ax; } return b; };
  const hr = add(/RightHand$/), hl = add(/LeftHand$/); add(/RightHandMiddle1$/); add(/RightHandThumb1$/);
  A.update(0.016, { speed01: 0, dead: 0, flash: 0, act: clip ? { clip: 'X', p: t, dur: 0.62, hit: 0.24 } : null });
  for (let i = 0; i < 12; i++) A.update(0.03, { speed01: 0, dead: 0, flash: 0, act: clip ? { clip: 'X', p: t, dur: 0.62, hit: 0.24 } : null });
  A.group.updateMatrixWorld(true);
  const p = hr.getWorldPosition(new TH.Vector3()), out = {}, cam = W.camera;
  const hid = []; W.scene.children.forEach(c => { if (c.visible && !c.isLight && c !== A.group && c.type !== 'Object3D') { c.visible = false; hid.push(c); } });
  for (const [k, d] of Object.entries({ front: [0, 0, 1], right: [-1, 0, 0], top: [0, 1, 0.01] })) { cam.position.set(p.x + d[0] * 0.9, p.y + d[1] * 0.9, p.z + d[2] * 0.9); cam.lookAt(p); cam.fov = 30; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); W.composer.render(0.016); out[k] = W.renderer.domElement.toDataURL('image/jpeg', 0.9); }
  hid.forEach(o => { o.visible = true; });
  const q = hr.getWorldQuaternion(new TH.Quaternion()), ex = new TH.Vector3(1,0,0).applyQuaternion(q), ey = new TH.Vector3(0,1,0).applyQuaternion(q), ez = new TH.Vector3(0,0,1).applyQuaternion(q);
  out.axes = { x: ex.toArray().map(v => +v.toFixed(2)), y: ey.toArray().map(v => +v.toFixed(2)), z: ez.toArray().map(v => +v.toFixed(2)) };
  out.names = names.filter(n => /Hand/.test(n)).join(' ');
  return out;
}
'''
with sync_playwright() as p:
    srv = serve(PORT, site); b = launch(p); ctx = b.new_context(viewport={'width': 640, 'height': 480}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errs = []; watch(page, 'p', errs)
    page.goto(f'http://127.0.0.1:{PORT}/index.html?hero=20&hg={G}'); page.wait_for_function("window.__game || document.getElementById('fatal')", timeout=300000)
    for tag, clip, t in (('idle', None, 0), ('hit', 'X', 0.39)):
        r = page.evaluate(JS, [clip, t])
        for k in ('front', 'right', 'top'): open(f'{outd}/{tag}_{k}.jpg', 'wb').write(base64.b64decode(r[k].split(',', 1)[1]))
        print(tag, 'axes(world) of RightHand', r['axes'])
    print('bones', r['names'][:600])
    b.close(); srv.shutdown()
