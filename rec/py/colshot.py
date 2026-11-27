#!/usr/bin/env python3
"""遊戲內顏色比對：同一隻生物站著，依序套多組材質參數（sat／gain／gam）各拍一張側面。用法：colshot.py <site> <outdir> tiger 'sat,gain,gam;...'（QS 環境變數同 seq3）"""
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
    for k, st in enumerate(sets):
        st = list(st) + [1, 1, 1][len(st) - 3:] if len(st) < 6 else list(st)
        print(k, st, 'mats', J(APPLY, st), flush=True)
        for i in range(3): J('window.__adv()')
        for vw in ('side', 'd45'):
            u = J("([a,b]) => window.__shot(a,b)", [vw, 7]); open(f'{outd}/c{k}_{vw}.jpg', 'wb').write(base64.b64decode(u.split(',', 1)[1]))
    b.close()
