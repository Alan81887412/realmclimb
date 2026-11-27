import os, sys, time, json, base64, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
SITE = os.environ.get('GT_SITE', '/home/claude/mmorpg-game')
PORT = int(os.environ.get('GT_PORT', '8811'))
THREE = '/tmp/preview/node_modules/three'
SHOTS = os.environ.get('GT_SHOTS', '/tmp/gt/shots'); os.makedirs(SHOTS, exist_ok=True)
MIME = {'.js': 'application/javascript'}
def serve(port, site=SITE):
    class H(http.server.SimpleHTTPRequestHandler):
        extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{'.js': 'application/javascript', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json'})
        def log_message(self, *a, **k): pass
    handler = functools.partial(H, directory=site)
    class Q(socketserver.ThreadingTCPServer):
        allow_reuse_address = True; daemon_threads = True
    srv = Q(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
def route_cdn(ctx):
    def h(route):
        u = route.request.url
        if not u.startswith('http://127.0.0.1'):
            return route.abort()
        return route.continue_()
    ctx.route('**/*', h)
ARGS = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
def launch(p):
    return p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
def watch(page, tag, errors):
    page.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))
def canvas_png(page, path):
    data = page.evaluate("document.getElementById('scene').toDataURL('image/jpeg', 0.92)")
    open(path, 'wb').write(base64.b64decode(data.split(',', 1)[1]))

def frame(page, n=2):
    page.evaluate("""(n) => new Promise(res => { window.__noRender = false; let k = 0; const f = () => { if (++k >= n) { window.__noRender = true; res(true); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })""", n)
def shot(page, name, full=True):
    frame(page)
    path = f'{SHOTS}/{name}.jpg'
    if full: page.screenshot(path=path, type='jpeg', quality=90, timeout=120000)
    else: canvas_png(page, path)
    print('shot', name)
def boot(p, port=PORT, w=1600, h=900, init='', name='測試員'):
    b = launch(p); ctx = b.new_context(viewport={'width': w, 'height': h}); route_cdn(ctx)
    ctx.add_init_script("window.__capture = true; window.__hour = 14.5; window.__noRender = true;" + init)
    page = ctx.new_page(); page.set_default_timeout(300000); errors = []; watch(page, 'p', errors)
    page.goto(f'http://127.0.0.1:{port}/index.html')
    page.wait_for_function("window.__game || document.getElementById('fatal')", timeout=300000)
    fatal = page.evaluate("document.getElementById('fatal') ? document.getElementById('fatal').innerText : null")
    if fatal: print('FATAL', fatal)
    return b, page, errors
def tp(page, x, z, f=None):
    page.evaluate("([x, z, f]) => { const g = __game; g.me.x = x; g.me.z = z; if (f != null) g.me.f = f; g.cam.ready = false; }", [x, z, f])
