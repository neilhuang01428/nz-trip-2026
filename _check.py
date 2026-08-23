#!/usr/bin/env python3
"""產出後的整站檢查。只看標記層（把 <script> 內容剝掉再算）。"""
import json, re, glob, os, sys
ok = True
d = json.load(open("data/places.json", encoding="utf-8"))
c = json.load(open("data/culture.json", encoding="utf-8"))
t = json.load(open("data/talk.json", encoding="utf-8"))
print(f"地點 {len(d['places'])}｜有深度知識 "
      f"{sum(1 for p in d['places'] if (p.get('deep') or {}).get('lead'))}"
      f"｜文化卡 {len(c['cards'])}｜會話 {len(t['entries'])}")
for name, ids in (("places", [p['id'] for p in d['places']]),
                  ("culture", [x['id'] for x in c['cards']]),
                  ("talk", [e['id'] for e in t['entries']])):
    if len(ids) != len(set(ids)):
        print(f"  ⚠ {name} 有重複 id"); ok = False
# 同一個地點被收兩次（不同 id、同名、座標幾乎重疊）
import math
P = d["places"]
dups = []
for i in range(len(P)):
    for j in range(i + 1, len(P)):
        a, b = P[i], P[j]
        if not (a.get("lat") and b.get("lat")):
            continue
        na = a["name"].lower().replace("'", "").replace("\u2019", "")
        nb = b["name"].lower().replace("'", "").replace("\u2019", "")
        # 只有名稱幾乎一樣才算重複：「Glenorchy」與「Glenorchy Lagoon Scenic Walkway」
        # 雖然一個包含另一個，但是兩個不同的東西
        short, long_ = sorted((na, nb), key=len)
        similar = (na == nb) or (short in long_ and len(short) / len(long_) >= 0.7)
        if similar and \
           math.dist((a["lat"], a["lng"]), (b["lat"], b["lng"])) * 111 < 0.35:
            dups.append(f"{a['id']} vs {b['id']}（{a['name'][:30]}）")
if dups:
    print("  ⚠ 疑似重複地點:", dups[:5]); ok = False

# 內文只允許 <b>
bad = []
def scan(txt, where):
    for tag in set(re.findall(r'</?([a-zA-Z]+)', txt or '')):
        if tag != 'b': bad.append(f"{where}:{tag}")
    if (txt or '').count('<b>') != (txt or '').count('</b>'):
        bad.append(f"{where}:b未配對")
for p in d['places']:
    scan(p.get('note'), p['id'] + '.note')
    dp = p.get('deep') or {}
    scan(dp.get('lead'), p['id'] + '.lead')
    for i, x in enumerate(dp.get('paras', [])): scan(x, f"{p['id']}.p{i}")
    for i, x in enumerate(dp.get('tips', [])): scan(x, f"{p['id']}.t{i}")
for x in c['cards']:
    scan(x.get('lead'), x['id'] + '.lead')
    for i, y in enumerate(x.get('paras', [])): scan(y, f"{x['id']}.p{i}")
for e in t['entries']:
    for k in ('zh', 'when', 'note', 'zhsound'): scan(e.get(k), f"{e['id']}.{k}")
if bad: print("  ⚠ 標籤問題:", bad[:10]); ok = False
print()
for f in sorted(glob.glob("*.html")):
    s = open(f, encoding="utf-8").read()
    body = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    mk = re.findall(r'<!--(NZCSS|NZJS|PLACES|ROUTESGEO|CULTURE|TALK|PRDBODY|NAV|TABBAR|LEAFLET)-->', s)
    o, cl = body.count("<div"), body.count("</div>")
    miss = [u for u in set(re.findall(r'<img[^>]+src="(images/[^"]+)"', body))
            if not os.path.exists(u)]
    fl = []
    if mk: fl.append("未替換:" + ",".join(mk))
    if o != cl: fl.append(f"div {o}/{cl}")
    if miss: fl.append("缺圖:" + ",".join(miss))
    if fl: ok = False
    print(f"  {f:16} {'⚠ ' + ' | '.join(fl) if fl else '✓'}")
imgs = {os.path.basename(x) for x in glob.glob("images/*.jpg")}
html = " ".join(open(f, encoding="utf-8").read() for f in glob.glob("*.html"))
unused = sorted(n for n in imgs if n.removesuffix('.jpg') not in html)
cr = json.load(open("images/credits.json", encoding="utf-8"))
nocred = sorted(n for n in imgs if n.removesuffix('.jpg') not in cr)
print(f"\n圖片 {len(imgs)} 張｜未被引用 {unused or '無'}｜無授權記錄 {nocred or '無'}")
print("\n" + ("✓ 全部通過" if ok and not unused and not nocred else "⚠ 有問題"))
sys.exit(0 if ok else 1)
