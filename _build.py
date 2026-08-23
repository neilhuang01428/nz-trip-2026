#!/usr/bin/env python3
"""
組裝器：把 _src/*.html 的佔位標記換成共用資源，輸出到專案根目錄。

標記：
  <!--NZCSS-->        → _nz-style.css（inline，避免 file:// 下的 CORS 問題）
  <!--NZJS-->         → assets/app.js
  <!--PLACES-->       → data/places.json（inline 成 <script type="application/json">）
  <!--CULTURE-->      → data/culture.json（文化頁的卡片資料）
  <!--TALK-->         → data/talk.json（會話頁的詞條資料）
  <!--NAV:key-->      → 桌機頂部導覽列（key = 目前頁）
  <!--TABBAR:key-->   → 手機底部 tab bar ＋ 更多選單
  <!--LEAFLET-->      → Leaflet 的 CSS/JS CDN 標籤

用法：python3 _build.py            # 全部
      python3 _build.py _src/eat.html
"""
import glob, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

# key, 檔名, 顯示名, icon, 是否放進手機底部主列
PAGES = [
    ("index",     "index.html",     "總覽",   "🏔", False),
    ("sights",    "sights.html",    "景點",   "📸", True),
    ("eat",       "eat.html",       "吃的",   "🍽", True),
    ("book",      "book.html",      "需預約", "🎟", True),
    ("skydive",   "skydive.html",   "跳傘",   "🪂", False),
    ("mtcook",    "mtcook.html",    "健行",   "🥾", False),
    # glacier.html 仍然存在（保留為決策紀錄），但已從導覽列拿掉——
    # 冰川健行沒有要去了，入口改由 mtcook.html 與 index.html 連過去。
    ("culture",   "culture.html",   "文化",   "🗿", False),
    ("talk",      "talk.html",      "會話",   "💬", False),
    ("prepare",   "prepare.html",   "行前",   "🎒", False),
    ("itinerary", "itinerary.html", "行程",   "🗓", True),
]

PRDNOTE = (
    '<p class="prdnote">🧭 這個網站是一套<b>可以複製到其他旅程</b>的架構。'
    '<a href="prd.html">看架構說明（PRD）</a>——'
    '裡面有資料結構、內容品質規則、以及可以直接貼給 AI 的提示詞。'
    '<a href="PRD.md">原始 Markdown</a></p>\n'
)

RATENOTE = (
    '<p class="ratenote">⭐ 卡片上的評分是<b>查證當下的快照，不是即時資料</b>。'
    '沒有免費且合乎服務條款的方式即時取得 Google 評分（官方途徑是付費的 Places API）。'
    '標<b>「約」</b>的評論數是估算值，沒標的是實際解析頁面拿到的數字。'
    '兩邊數字差很多時我保留實際值，另一個記在滑鼠提示裡。'
    '<b>評分只是參考，季節、公休與是否已歇業比星等重要得多。</b></p>\n'
)

LEAFLET = (
    '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"\n'
    '  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">\n'
    '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"\n'
    '  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>'
)




# ── 極簡 Markdown → HTML ─────────────────────────────────────────
# 只支援 PRD.md 實際用到的語法：標題、表格、圍籬程式碼、清單、
# 引用、粗體、行內程式碼、連結、水平線。不做完整解析，夠用就好。
import html as _html
import re as _re


def _inline(t):
    t = _html.escape(t)
    t = _re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = _re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = _re.sub(r'(?<!\*)\*([^*\n]+)\*(?!\*)', r'<em>\1</em>', t)
    t = _re.sub(r'\[([^\]]+)\]\(([^)]+)\)',
                r'<a href="\2" target="_blank" rel="noopener">\1</a>', t)
    t = _re.sub(r'(?<![">=])\b(https?://[^\s<)]+)',
                r'<a href="\1" target="_blank" rel="noopener">\1</a>', t)
    return t


def md2html(src):
    out, i = [], 0
    lines = src.split("\n")
    n = len(lines)
    while i < n:
        ln = lines[i]

        # 圍籬程式碼
        if ln.startswith("```"):
            lang = ln[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            out.append('<pre class="code"' + (f' data-lang="{_html.escape(lang)}"' if lang else '')
                       + '><code>' + _html.escape("\n".join(buf)) + '</code></pre>')
            continue

        # 表格
        if "|" in ln and i + 1 < n and _re.match(r'^\s*\|?[\s:|-]+\|[\s:|-]*$', lines[i + 1]):
            def cells(row):
                return [c.strip() for c in row.strip().strip("|").split("|")]
            head = cells(ln); i += 2
            rows = []
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(cells(lines[i])); i += 1
            t = '<div class="tw"><table><thead><tr>'
            t += "".join("<th>" + _inline(c) + "</th>" for c in head)
            t += "</tr></thead><tbody>"
            for r in rows:
                t += "<tr>" + "".join("<td>" + _inline(c) + "</td>" for c in r) + "</tr>"
            out.append(t + "</tbody></table></div>")
            continue

        # 標題
        m = _re.match(r'^(#{1,6})\s+(.*)$', ln)
        if m:
            lv = len(m.group(1))
            txt = m.group(2).strip()
            anchor = _re.sub(r'[^\w\u4e00-\u9fff-]+', '-', txt).strip('-').lower()
            out.append(f'<h{lv} id="{anchor}">{_inline(txt)}</h{lv}>')
            i += 1
            continue

        # 水平線
        if _re.match(r'^\s*---+\s*$', ln):
            out.append("<hr>"); i += 1; continue

        # 引用
        if ln.startswith(">"):
            buf = []
            while i < n and lines[i].startswith(">"):
                buf.append(lines[i].lstrip(">").strip()); i += 1
            out.append("<blockquote>" + "<br>".join(_inline(x) for x in buf if x) + "</blockquote>")
            continue

        # 清單
        m = _re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', ln)
        if m:
            ordered = not m.group(2) in ("-", "*")
            tag = "ol" if ordered else "ul"
            buf = []
            while i < n:
                mm = _re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)$', lines[i])
                if not mm:
                    if lines[i].startswith("  ") and lines[i].strip() and buf:
                        buf[-1] += " " + lines[i].strip(); i += 1; continue
                    break
                buf.append(mm.group(3)); i += 1
            out.append(f"<{tag}>" + "".join("<li>" + _inline(x) + "</li>" for x in buf) + f"</{tag}>")
            continue

        # 段落
        if ln.strip():
            buf = []
            while i < n and lines[i].strip() and not _re.match(
                    r'^(#{1,6}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\s*---+\s*$)', lines[i]) \
                    and "|" not in lines[i]:
                buf.append(lines[i].strip()); i += 1
            if buf:
                out.append("<p>" + _inline(" ".join(buf)) + "</p>")
            else:
                i += 1
            continue
        i += 1
    return "\n".join(out)


def topnav(cur):
    """桌機頂部導覽列。

    包成一條「軌道」是刻意的——一整排純文字看起來像標籤，
    有底色的軌道才讀得出「這是一組可以切換的分頁」。
    圖示另外包 span，窄一點的桌機可以只留文字，避免擠成兩行。
    """
    names = dict((p[0], p[2]) for p in PAGES)
    # 不在導覽列上、但仍然存在的頁：標題列還是要有名字
    names.setdefault("glacier", "冰川（存查）")
    names.setdefault("prd", "架構說明")
    out = ['<header class="topbar"><div class="inner">',
           '<a class="logo" href="index.html">南島 <em>2026</em></a>',
           f'<span class="pagename">{names.get(cur, "")}</span>',
           '<nav aria-label="分頁導覽">',
           '<span class="navlbl" aria-hidden="true">分頁</span>',
           '<div class="navtrack">']
    for key, href, label, icon, _ in PAGES:
        on = ' class="on" aria-current="page"' if key == cur else ''
        out.append(f'<a href="{href}"{on}>'
                   f'<span class="ic" aria-hidden="true">{icon}</span>'
                   f'<span class="tx">{label}</span></a>')
    out.append('</div></nav></div></header>')
    return "\n".join(out)


def tabbar(cur):
    main = [p for p in PAGES if p[4]]
    more = [p for p in PAGES if not p[4]]
    rows = ['<nav class="tabbar" aria-label="主要分頁"><div class="row">']
    for key, href, label, icon, _ in main:
        on = ' on' if key == cur else ''
        rows.append(f'<a class="{on.strip()}" href="{href}">'
                    f'<span class="ic">{icon}</span>{label}</a>')
    more_on = ' on' if cur in [p[0] for p in more] else ''
    rows.append(f'<button type="button" data-more aria-expanded="false" '
                f'aria-controls="more-sheet" class="{more_on.strip()}">'
                f'<span class="ic">☰</span>更多</button>')
    rows.append('</div></nav>')
    rows.append('<div class="sheet" id="more-sheet" data-sheet hidden>')
    for key, href, label, icon, _ in more:
        on = ' class="on"' if key == cur else ''
        rows.append(f'<a href="{href}"{on}><span>{icon}</span>{label}</a>')
    rows.append('</div>')
    return "\n".join(rows)


def build(src):
    out = os.path.basename(src)
    key = out.replace(".html", "")
    html = open(src, encoding="utf-8").read()

    if "<!--NZCSS-->" in html:
        css = open("_nz-style.css", encoding="utf-8").read()
        html = html.replace("<!--NZCSS-->", "<style>\n" + css + "\n</style>")
    if "<!--LEAFLET-->" in html:
        html = html.replace("<!--LEAFLET-->", LEAFLET)
    if "<!--PLACES-->" in html:
        data = open("data/places.json", encoding="utf-8").read()
        html = html.replace(
            "<!--PLACES-->",
            '<script id="places-data" type="application/json">\n' + data + '\n</script>')
    if "<!--CULTURE-->" in html:
        cul = open("data/culture.json", encoding="utf-8").read()
        html = html.replace(
            "<!--CULTURE-->",
            '<script id="culture-data" type="application/json">\n' + cul + '\n</script>')
    if "<!--PRDBODY-->" in html:
        html = html.replace("<!--PRDBODY-->", md2html(open("PRD.md", encoding="utf-8").read()))
    if "<!--TALK-->" in html:
        talk = open("data/talk.json", encoding="utf-8").read()
        html = html.replace(
            "<!--TALK-->",
            '<script id="talk-data" type="application/json">\n' + talk + '\n</script>')
    if "<!--ROUTESGEO-->" in html:
        geo = open("data/routes-geo.json", encoding="utf-8").read()
        html = html.replace(
            "<!--ROUTESGEO-->",
            '<script id="routes-geo" type="application/json">' + geo + '</script>')
    if "<!--NZJS-->" in html:
        js = open("assets/app.js", encoding="utf-8").read()
        html = html.replace("<!--NZJS-->", "<script>\n" + js + "\n</script>")
    # 每一頁的頁尾都放 PRD 連結：這份網站的架構說明，之後要複製到別的旅程時給 AI 讀
    if key != "prd" and "</footer>" in html:
        extra = PRDNOTE
        if 'id="app"' in html:          # 有地點卡片的分頁才需要說明評分來源
            extra = RATENOTE + extra
        html = html.replace("</footer>", extra + "</footer>", 1)
    html = html.replace("<!--NAV-->", topnav(key))
    html = html.replace("<!--TABBAR-->", tabbar(key))

    open(out, "w", encoding="utf-8").write(html)
    return out, os.path.getsize(out)


targets = sys.argv[1:] or sorted(glob.glob("_src/*.html"))
total = 0
for src in targets:
    name, size = build(src)
    total += size
    print(f"✓ {name:24} {size // 1024:4} KB")
print(f"  {'共':24} {total // 1024:4} KB")
