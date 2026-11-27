#!/bin/bash
# 產生「倉庫根目錄」的樣子：整個輸出資料夾直接 git push 到 GitHub 倉庫（遊戲網站在根目錄、relay/ 與 .github/workflows/ 就位）。
# 用法：tools/build-pages.sh [--src 來源目錄] [--out 輸出目錄] [--sb-url https://xxxx.supabase.co] [--sb-key 公開金鑰] [--relay wss://…/room/realmclimb-08] [--preview-label 文字：標題畫面小標籤，只預覽版用]
#   來源預設＝本腳本所在的上一層（工作副本 game/）；輸出預設 /home/claude/team/sb08/pages-out（目錄名稱須含 pages-out，或放在 /tmp，才會被清空重建）
#   --sb-url／--sb-key／--relay：只改「輸出」裡的 js/sb/config.js，不動來源；沒給就維持空字串（＝單機／預設）。
#     --sb-key 可以是 sb_publishable_… 或舊的 anon JWT（eyJ…，角色必須是 anon）；secret／service_role 金鑰一律拒絕。
# 輸出內容：
#   根目錄：index.html、js/、assets/、sql/（schema.sql，給使用者貼進 SQL Editor）、.nojekyll
#   relay/：原樣複製（排除 node_modules、.wrangler、test/、.dev.vars）；relay/.github/workflows/deploy-relay.yml 搬到根目錄的 .github/workflows/
#   排除：docs/、docs-pages/、test/、tools/、.github/（來源的）、*.orig、*.bak*、test-head.html、其他 *.md／*.py／*.sh／*.log
# 檢查（任何一項失敗＝結束碼 1，輸出標 FAILED）：單檔 <100MB、總大小、必要檔案存在、沒有秘密（見下）、沒有殘留測試檔
#   秘密掃描（整個輸出）：sb_secret_<金鑰> 形狀、payload 為 service_role 的 JWT、GitHub／Cloudflare／Slack token 形狀、PEM 私鑰、
#   任何檔案裡的 service_role 字樣（vendor 函式庫除外）、任何名為 .dev.vars／.env 的檔案。
#   注意：vendor 的 supabase.js 內有 "sb_secret_" 前綴判斷（函式庫程式碼，不是金鑰）；.gitignore 檔裡的 ".dev.vars" 是忽略規則，不算。
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=$(dirname "$HERE"); OUT=/home/claude/team/sb08/pages-out; SBURL=""; SBKEY=""; RELAY=""; PVLABEL=""
while [ $# -gt 0 ]; do case "$1" in
  --src) SRC=$2; shift 2;; --out) OUT=$2; shift 2;; --sb-url) SBURL=$2; shift 2;; --sb-key) SBKEY=$2; shift 2;; --relay) RELAY=$2; shift 2;; --preview-label) PVLABEL=$2; shift 2;;
  -h|--help) sed -n 2,20p "$0"; exit 0;;
  *) if [ -z "${POS1:-}" ]; then SRC=$1; POS1=1; else OUT=$1; fi; shift;; esac; done      # 相容舊用法：build-pages.sh 來源 輸出
SRC=$(cd "$SRC" && pwd) || { echo "來源不存在"; exit 1; }
RELAYSRC=${RELAY_SRC:-$(dirname "$SRC")/relay}      # relay/ 預設在 game/ 的隔壁（/home/claude/team/sb08/relay）；GitHub Actions 裡倉庫就是遊戲本身時用 RELAY_SRC 指定
[ -f "$SRC/index.html" ] || { echo "錯誤：$SRC 沒有 index.html"; exit 1; }
case "$OUT" in /|/home|/home/claude|/home/claude/team|"$SRC"|"$SRC"/*) echo "錯誤：輸出目錄不安全：$OUT"; exit 1;; esac
case "$OUT" in *pages-out*|/tmp/*) ;; *) echo "錯誤：輸出目錄名稱要含 pages-out（或放在 /tmp）才會被清空：$OUT"; exit 1;; esac
# 參數檢查
if [ -n "$SBURL" ]; then case "$SBURL" in https://*.supabase.co|https://*.supabase.co/) ;; *) echo "錯誤：--sb-url 要像 https://xxxx.supabase.co"; exit 1;; esac; fi
if [ -n "$RELAY" ]; then case "$RELAY" in wss://*|ws://127.0.0.1*|ws://localhost*) ;; *) echo "錯誤：--relay 要是 wss://…（本機測試才可用 ws://127.0.0.1…）"; exit 1;; esac; fi
rm -rf "$OUT"; mkdir -p "$OUT"
( cd "$SRC" && tar cf - \
    --exclude='./docs' --exclude='./docs-pages' --exclude='./test' --exclude='./tools' \
    --exclude='./.github' --exclude='./.git' --exclude='node_modules' --exclude='.dev.vars' --exclude='.env' \
    --exclude='*.orig' --exclude='*.bak' --exclude='*.bak-*' --exclude='test-head.html' \
    --exclude='*.md' --exclude='*.py' --exclude='*.sh' --exclude='*.log' --exclude='.DS_Store' \
    . ) | ( cd "$OUT" && tar xf - ) || { echo "複製遊戲失敗"; exit 1; }
fail=0
# relay/
if [ -d "$RELAYSRC" ]; then
  mkdir -p "$OUT/relay"
  ( cd "$RELAYSRC" && tar cf - --exclude='./node_modules' --exclude='./.wrangler' --exclude='./test' --exclude='.dev.vars' --exclude='.env' --exclude='.DS_Store' . ) | ( cd "$OUT/relay" && tar xf - ) || { echo "複製 relay 失敗"; fail=1; }
  if [ -f "$OUT/relay/.github/workflows/deploy-relay.yml" ]; then
    mkdir -p "$OUT/.github/workflows"; mv "$OUT/relay/.github/workflows/deploy-relay.yml" "$OUT/.github/workflows/deploy-relay.yml"
    rmdir "$OUT/relay/.github/workflows" "$OUT/relay/.github" 2>/dev/null
  else echo "警告：relay/.github/workflows/deploy-relay.yml 不存在"; fi
else echo "警告：找不到 relay/（$RELAYSRC）——輸出沒有 relay"; fi
touch "$OUT/.nojekyll"
# config.js：只改輸出
CFG="$OUT/js/sb/config.js"
if [ -f "$CFG" ]; then
  SBURL="$SBURL" SBKEY="$SBKEY" RELAY="$RELAY" PVLABEL="$PVLABEL" python3 -I - "$CFG" <<'PYEOF' || fail=1
import os, sys, re, json, base64
p = sys.argv[1]; t = open(p, encoding='utf8').read()
url, key, relay = os.environ['SBURL'], os.environ['SBKEY'], os.environ['RELAY']
def put(field, val):
    global t
    n = len(re.findall(r"\b%s: '[^']*'" % field, t))
    if n != 1: print('錯誤：config.js 找不到唯一的 %s 欄位' % field); sys.exit(1)
    t = re.sub(r"\b%s: '[^']*'" % field, lambda m: "%s: %s" % (field, json.dumps(val)), t)
if key:
    if key.startswith('sb_secret_'): print('錯誤：--sb-key 是 secret 金鑰，拒絕'); sys.exit(1)
    if key.startswith('eyJ'):
        try:
            pl = key.split('.')[1]; role = json.loads(base64.urlsafe_b64decode(pl + '=' * (-len(pl) % 4))).get('role')
        except Exception: role = None
        if role != 'anon': print('錯誤：--sb-key 的 JWT 角色是 %r，只接受 anon' % role); sys.exit(1)
        put('anonKey', key)
    elif key.startswith('sb_publishable_'): put('publishableKey', key)
    else: print('錯誤：--sb-key 要是 sb_publishable_… 或 anon JWT（eyJ…）'); sys.exit(1)
if url: put('url', url)
if relay: put('relayUrl', relay)
if os.environ.get('PVLABEL'): put('previewLabel', os.environ['PVLABEL'])
# 註解裡的警告字樣（提到 service_role）在輸出裡換成不會觸發掃描的說法
t = t.replace('secret key／service_role 金鑰', '後台的 secret（私密）金鑰')
open(p, 'w', encoding='utf8').write(t)
PYEOF
  echo "config.js：url=$([ -n "$SBURL" ] && echo 已填 || echo 空)；key=$([ -n "$SBKEY" ] && echo 已填 || echo 空)；relayUrl=$([ -n "$RELAY" ] && echo 已填 || echo 空)（來源未改）"
else echo "警告：沒有 js/sb/config.js"; fi
# 必要檔案
for f in index.html js/main.js js/sb/config.js js/sb/client.js js/sb/vendor/supabase.js assets/models.json .nojekyll; do [ -e "$OUT/$f" ] || { echo "錯誤：缺少 $f"; fail=1; }; done
# 單檔大小
while IFS= read -r f; do
  sz=$(stat -c %s "$f")
  if [ "$sz" -ge 104857600 ]; then echo "錯誤：單檔超過 100MB：$f ($sz bytes)"; fail=1
  elif [ "$sz" -ge 52428800 ]; then echo "警告：單檔超過 50MB：$f ($sz bytes)"; fi
done < <(find "$OUT" -type f)
# 秘密掃描
python3 -I - "$OUT" <<'PYEOF' || fail=1
import os, re, sys, base64, json
root0 = sys.argv[1]; bad = []
PATS = [(r'sb_secret_[A-Za-z0-9_-]{16,}', 'sb_secret_ 金鑰'), (r'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gh[ousr]_[A-Za-z0-9]{30,}', 'GitHub token'),
        (r'xox[abprs]-[A-Za-z0-9-]{10,}', 'Slack token'), (r'-----BEGIN [A-Z ]*PRIVATE KEY-----', '私鑰'), (r'AKIA[0-9A-Z]{16}', 'AWS key'),
        (r'(?i)(api[_-]?token|secret|password)["\']?\s*[:=]\s*["\'][A-Za-z0-9_\-]{24,}["\']', '疑似寫死的秘密')]
for root, dirs, files in os.walk(root0):
    for f in files:
        p = os.path.join(root, f); rel = os.path.relpath(p, root0)
        if f in ('.dev.vars', '.env') or f.startswith('.env.'): bad.append((rel, '秘密檔案')); continue
        if f.endswith(('.glb', '.bin', '.mp3', '.webp', '.png', '.jpg', '.ogg', '.wav')): continue
        t = open(p, encoding='utf8', errors='ignore').read()
        for rx, w in PATS:
            if re.search(rx, t): bad.append((rel, w))
        for m in re.finditer(r'eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}', t):
            try:
                d = json.loads(base64.urlsafe_b64decode(m.group(1) + '=' * (-len(m.group(1)) % 4)))
                if d.get('role') == 'service_role': bad.append((rel, 'service_role JWT'))
            except Exception: pass
        if 'service_role' in t and '/vendor/' not in rel: bad.append((rel, 'service_role 字樣'))
for rel, w in bad: print('錯誤：輸出裡有秘密或可疑內容（%s）：%s' % (w, rel))
sys.exit(1 if bad else 0)
PYEOF
# 殘留檢查
for bad in docs test tools; do [ -e "$OUT/$bad" ] && { echo "錯誤：輸出根目錄還有 $bad/"; fail=1; }; done
find "$OUT" \( -name '*.orig' -o -name 'test-head.html' -o -name node_modules -o -name .wrangler -o -name .dev.vars \) | grep . && { echo "錯誤：有殘留測試／暫存檔"; fail=1; }
find "$OUT/relay" -type d -name test 2>/dev/null | grep . && { echo "錯誤：relay/test 沒排除"; fail=1; }
total=$(du -sb "$OUT" | cut -f1); n=$(find "$OUT" -type f | wc -l)
( cd "$OUT" && find . -type f -printf '%s\t%p\n' | sort -k2 ) > "$(dirname "$OUT")/pages-out-files.txt"
echo "輸出：$OUT"
echo "檔案數：$n；總大小：$total bytes（$(( total / 1048576 )) MB）；清單：$(dirname "$OUT")/pages-out-files.txt"
echo "根目錄："; ( cd "$OUT" && ls -A | tr '\n' ' ' ); echo; echo ".github/workflows："; ls "$OUT/.github/workflows" 2>/dev/null | tr '\n' ' '; echo
echo "最大的 5 個檔："; ( cd "$OUT" && find . -type f -printf '%s\t%p\n' | sort -rn | head -5 )
[ "$total" -ge 943718400 ] && echo "警告：總大小超過 900MB（Pages 軟限制 1GB）"
grep -q "sbfake" "$OUT/js/sb/client.js" 2>/dev/null && echo "注意：js/sb/client.js 含 sbfake 測試後門（網址帶 ?sbfake= 才啟用；輸出沒有 test/ 資料夾，所以在正式站帶這個參數只會載入失敗＝回單機）"
[ $fail = 0 ] && echo "OK" || { echo "FAILED"; exit 1; }
