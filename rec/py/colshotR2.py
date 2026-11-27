#!/usr/bin/env python3
"""R2（棕熊）顏色比對：colshotR 的複本，另加 TEXS（逗號分隔的貼圖網址，逐一換熊的 baseColor 貼圖再拍）、NOSH=1（另拍一張熊不接收陰影的，診斷用）。
R1（棕熊）顏色比對：同 colshot.py，另外先把野獸朝向固定成向陽面對鏡頭（同 seqR SUNSIDE）、停住不閒晃，鏡頭距離 GD（預設 11，同 seqR）。
遊戲內顏色比對：同一隻生物站著，依序套多組材質參數（sat／gain／gam）各拍一張側面。用法：colshot.py <site> <outdir> tiger 'sat,gain,gam;...'（QS 環境變數同 seq3）"""
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seq2.py')).read().split('\n')
exec('\n'.join(src[:56]))
INIT += '; { const d0 = Date.now(), b = (Math.floor(d0 / 1000 / 4608) * 4608 + 3000) * 1000; Date.now = () => b + (window.__t != null ? window.__t - (window.__tD0 ??= window.__t) : 0); }'      # 11-27 Q1：天氣固定（原本跟真實時鐘走，兩次拍的亮度不同）
sets = [tuple(float(x) for x in s.split(',')) for s in os.environ['SETS'].split(';')]
RESET = "() => { const v = __v, w = __w, g = __game; w.st = 0; w.t = 0; w.target = null; w.M = null; w.mvc = 0; __place(v.z); g.me.x = v.x; g.me.z = v.z - 60; }"
APPLY = "([s, g, m, tr, tg, tb]) => { let n = 0; __v.model.root.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const M of ms) { const U = M.userData && M.userData.mfx; if (U) { U.sat.value = s; U.gain.value = g; U.gam.value = m; if (U.tint) U.tint.value.set(tr, tg, tb); n++; } } }); return n; }"
port = random.randint(11900, 12400); srv = serve(port, site)
with sync_playwright() as p:
    b = launch(p); ctx = b.new_context(viewport={'width': 960, 'height': 540}); route_cdn(ctx); ctx.add_init_script(INIT)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html' + os.environ.get('QS', '')); page.wait_for_function('window.__game || document.getElementById("fatal")', timeout=300000)
    page.fill('#nameIn', '測試員'); page.click('#enterBtn'); page.wait_for_function('__game.input.creator === true'); page.click('#crDone'); page.wait_for_function('__game.input.started === true')
    print('setup', page.evaluate(SETUP, [typ, elite]), flush=True)
    J = page.evaluate; J(RESET)
    for i in range(240): J('window.__adv()')
    SUN = '() => { const w = __w, v = __v; let D = null; __game.W.scene.traverse(x => { if (x.isDirectionalLight && (!D || x.intensity > D.intensity)) D = x; }); const sx = D ? D.position.x - D.target.position.x : 1, sz = D ? D.position.z - D.target.position.z : 0, h = Math.atan2(-sz, sx); w.f = v.f = h; w.wx = v.x; w.wz = v.z; w.wanderT = 99; w.st = 0; if (v.model && v.model.lx) v.model.lx.ctl.vyW = null; }'
    for i in range(150): J(SUN); J('window.__adv()')
    TEXS = [t for t in os.environ.get('TEXS', '').split(',') if t] or [None]
    SWAP = "async (u) => { const img = new Image(); img.src = u; await img.decode(); let n = 0; __v.model.root.traverse(o => { if (o.isMesh && o.material && o.material.map) { o.material.map.image = img; o.material.map.needsUpdate = true; n++; } }); return n; }"
    RS = "(f) => { let n = 0; __v.model.root.traverse(o => { if (o.isMesh) { o.receiveShadow = f; o.material.needsUpdate = true; n++; } }); return n; }"
    for ti, tx in enumerate(TEXS):
      if tx: print('tex', ti, tx, J(SWAP, tx), flush=True)
      for k, st in enumerate(sets):
        st = list(st) + [1, 1, 1][len(st) - 3:] if len(st) < 6 else list(st)
        print(k, st, 'mats', J(APPLY, st), flush=True)
        for i in range(3): J(SUN); J('window.__adv()')
        for ns in ([0, 1] if os.environ.get('NOSH') else [0]):
          J(RS, not ns)
          for vw in ('side', 'd45'):
            u = J("([a,b]) => window.__shot(a,b)", [vw, float(os.environ.get("GD", "11"))]); open(f'{outd}/t{ti}c{k}{"ns" if ns else ""}_{vw}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
          J(RS, True)
    b.close()
