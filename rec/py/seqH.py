#!/usr/bin/env python3
"""11-27 玩家新身體（?hero=20）逐格錄影＋腳滑量測。用法：seqH.py <site> <outdir> <g 0男/1女>
環境變數 SC（逗號分隔）：i 待機、w 走路、r 跑步、s 衝刺、v 變速（停→走→跑→停）、t 轉彎跑、d 翻滾、a 三連擊、h 被打、x 倒地。
做法：停掉遊戲迴圈，自己逐格呼叫 me.avatar.update(dt, s)、自己移動角色，鏡頭跟著角色（側面／斜前方），地面是棋盤格，看得出腳有沒有滑。
同時量：撐地的那隻腳（腳尖最低、離地 <2cm）在世界座標裡每格移動多少（理想是 0）。"""
import sys, os, json, base64, math
sys.path.insert(0, '/tmp/gt')
from common import serve, launch, route_cdn, watch
from playwright.sync_api import sync_playwright
site, outd, G = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(outd, exist_ok=True)
SC = os.environ.get('SC', 'i,w,r,s,v,t,d,a,h,x').split(',')
PORT = int(os.environ.get('GT_PORT', str(8840 + os.getpid() % 50)))
INIT = "localStorage.setItem('intro1120','off'); window.__capture=true; window.__hour=14.5; window.__noRender=true; { let s=7; Math.random=()=>{ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }"
SETUP = r'''
async () => {
  const g = __game, TH = await import('/js/three.bundle.js'), me = g.me, A = me.avatar, W = g.W;
  window.__q = []; window.requestAnimationFrame = cb => { window.__q.push(cb); return 1; };
  await new Promise(r => setTimeout(r, 400));
  const info = { hero: !!A.heroOn, g: A.heroG, H: null };
  // 舊身體身高（同樣的外觀，舊做法）做對照
  { const B = new TH.Box3(); const old = new (A.constructor)(me.avatar.look); old.group.position.set(0, 0, 0); old.update(0.016, { speed01: 0 }); old.group.updateMatrixWorld(true); B.setFromObject(old.group); info.oldH = +(B.max.y - B.min.y).toFixed(3); old.dispose(); }
  { const B = new TH.Box3(); A.group.updateMatrixWorld(true); B.setFromObject(A.root); info.newBox = +(B.max.y - B.min.y).toFixed(3); }
  const ck = document.createElement('canvas'); ck.width = ck.height = 256; const cx = ck.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { cx.fillStyle = (i + j) % 2 ? '#6f8f4a' : '#86a85c'; cx.fillRect(i * 32, j * 32, 32, 32); }
  const tex = new TH.CanvasTexture(ck); tex.wrapS = tex.wrapT = TH.RepeatWrapping; tex.repeat.set(60, 60); tex.colorSpace = TH.SRGBColorSpace;
  const gm = new TH.Mesh(new TH.PlaneGeometry(120, 120), new TH.MeshStandardMaterial({ map: tex, roughness: 1 })); gm.rotation.x = -Math.PI / 2; gm.receiveShadow = true;
  const st = { x: 0, z: 0, f: 0, t: 0 };
  const toes = []; A.root.traverse(o => { if (o.isBone && /(Left|Right)ToeBase$/.test(o.name)) toes.push(o); });
  const prev = [null, null], v = new TH.Vector3();
  window.__step = (dt, s, vel, turn) => {
    st.f += (turn || 0) * dt; st.x += Math.sin(st.f) * vel * dt; st.z += Math.cos(st.f) * vel * dt; st.t += dt;
    A.group.position.set(st.x, 0, st.z); A.group.rotation.set(0, st.f, 0); A.update(dt, s); A.group.updateMatrixWorld(true);
    // 腳滑：最低的那隻腳尖、離地 2 cm 內，這一格在水平面上移動多少（公分）
    const p = toes.map(b => b.getWorldPosition(new TH.Vector3())); const lo = p[0].y < p[1].y ? 0 : 1; let slip = null;
    if (p[lo].y < 0.05 && prev[lo]) slip = Math.hypot(p[lo].x - prev[lo].x, p[lo].z - prev[lo].z) * 100;
    prev[0] = p[0]; prev[1] = p[1]; return { slip, y: +p[lo].y.toFixed(3) };
  };
  window.__shot = view => { const cam = W.camera, comp = W.composer, fy = st.f, rt = [Math.cos(fy), -Math.sin(fy)], fw = [Math.sin(fy), Math.cos(fy)], s2 = Math.SQRT1_2;
    const dir = view === 'side' ? rt : [(fw[0] + rt[0]) * s2, (fw[1] + rt[1]) * s2], D = +(window.__D || 4.4), h = 0.95;
    const hid = []; W.scene.children.forEach(c => { if (c.visible && !c.isLight && c !== A.group && c.type !== 'Object3D') { c.visible = false; hid.push(c); } }); W.scene.add(gm);
    cam.position.set(st.x + dir[0] * D, h + 0.9, st.z + dir[1] * D); cam.lookAt(st.x, h, st.z); cam.fov = 38; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    comp.render(0.016); const u = W.renderer.domElement.toDataURL('image/jpeg', 0.9); W.scene.remove(gm); hid.forEach(o => { o.visible = true; }); return u; };
  window.__reset = () => { st.x = 0; st.z = 0; st.f = 0; prev[0] = prev[1] = null; };
  return info;
}
'''
DT = 1 / 30
with sync_playwright() as p:
    srv = serve(PORT, site); b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errs = []; watch(page, 'p', errs)
    page.goto(f'http://127.0.0.1:{PORT}/index.html?hero=20&hg={G}')
    page.wait_for_function("window.__game || document.getElementById('fatal')", timeout=300000)
    info = page.evaluate(SETUP); print('INFO', json.dumps(info), flush=True)
    def seg(name, frames, fn):
        page.evaluate("() => __reset()"); slips = []
        for i in range(frames):
            s, vel, turn = fn(i, i * DT)
            r = page.evaluate("([s, v, t]) => __step(%f, s, v, t)" % DT, [s, vel, turn])
            if r['slip'] is not None: slips.append(r['slip'])
            for vw in ('side', 'd45'):
                u = page.evaluate("v => __shot(v)", vw); open(f'{outd}/{name}_{vw}_{i:03d}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
        sl = sorted(slips); print('SEG', name, 'frames', frames, 'stance', len(sl), 'slip cm/frame median %.2f p90 %.2f max %.2f' % (sl[len(sl) // 2] if sl else 0, sl[int(len(sl) * 0.9)] if sl else 0, sl[-1] if sl else 0), flush=True)
    base = lambda **k: dict(dict(speed01=0, dead=0, flash=0, swim=0), **k)
    RUN = 7.2
    if 'i' in SC: seg('i_idle', 60, lambda i, t: (base(), 0, 0))
    if 'w' in SC: seg('w_walk', 60, lambda i, t: (base(speed01=1.8 / RUN), 1.8, 0))
    if 'r' in SC: seg('r_run', 45, lambda i, t: (base(speed01=1.0), RUN, 0))
    if 's' in SC: seg('s_sprint', 45, lambda i, t: (base(speed01=1.0, sprint=1), RUN * 1.38, 0))
    def vprof(i, t):
        v = RUN * (min(1, t / 1.2) if t < 2.2 else max(0, 1 - (t - 2.2) / 0.5)) if t > 0.4 else 0
        return (base(speed01=v / RUN), v, 0)
    if 'v' in SC: seg('v_vary', 90, vprof)
    if 't' in SC: seg('t_turn', 60, lambda i, t: (base(speed01=1.0), RUN, 2.2))
    if 'd' in SC: seg('d_roll', 30, lambda i, t: (base(roll=min(1, t / 0.55) if t < 0.55 else None, speed01=0), 9.0 if t < 0.55 else 0, 0))
    def atk(i, t):
        k = int(t / 0.62); p = (t % 0.62) / 0.62
        return (base(act={'clip': ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab'][min(k, 2)], 'p': p, 'dur': 0.62, 'hit': 0.24}), 0.6, 0) if t < 1.86 else (base(), 0, 0)
    if 'a' in SC: seg('a_atk', 66, atk)
    if 'b' in SC: seg('b_block', 40, lambda i, t: (base(block=True), 0, 0))
    if 'h' in SC: seg('h_hit', 30, lambda i, t: (base(flash=1.0 if i < 2 else max(0, 1 - t * 3)), 0, 0))
    if 'x' in SC: seg('x_dead', 100, lambda i, t: (base(dead=t + 0.01), 0, 0))
    print('ERRS', [e for e in errs if 'favicon' not in e][:8])
    b.close(); srv.shutdown()
