#!/usr/bin/env python3
"""把 out_E*.json（分區研究 agent 的產出）併回 data/places.json。

兩件事：
  ratings → 幫現有地點補上評分快照
  new     → 新增地點

評分的來源平台一定要標出來。Google 評分沒有免費且合乎條款的取得方式，
實務上撈得到的多半是業者官網內嵌的 schema.org 評分或在地評論站，
掛成 Google 會是假訊息。
"""
import json, glob, os, re, sys
from urllib.parse import urlparse

HOST2SRC = {
    "google.com": "google", "maps.google.com": "google", "goo.gl": "google",
    "rankers.co.nz": "rankers",
    # Wanderlog 的頁面直接內嵌 Google 的 rating / numRatings，
    # 評論也都標「— Google review」，所以來源算 Google，只是取得管道不同
    "wanderlog.com": "google",
    "tripadvisor.com": "tripadvisor", "tripadvisor.co.nz": "tripadvisor",
    "klook.com": "klook", "viator.com": "viator",
}
NEED = ("id", "name", "cat", "day", "town", "lat", "lng", "q", "note")
CATS_OK = ("sight", "eat", "book", "skydive", "glacier")
FLAGS_OK = ("star", "ok", "warn", "info", "closed", "unverified")


def src_of(url):
    if not url:
        return "official"
    h = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for k, v in HOST2SRC.items():
        if h.endswith(k):
            return v
    return "official"


def main():
    p = "data/places.json"
    d = json.load(open(p, encoding="utf-8"))
    by = {x["id"]: x for x in d["places"]}
    files = sorted(glob.glob("scratchpad/ext/out_E*.json"))
    if not files:
        sys.exit("找不到 out_E*.json")

    rated = added = 0
    warn = []
    conflicts = []
    # 曾經被判定為重複而刪掉的 id，不要再被同一份 out_E*.json 加回來
    rm_file = "scratchpad/ext/.removed"
    removed = set(open(rm_file, encoding="utf-8").read().split()) \
        if os.path.exists(rm_file) else set()

    # Gemini 提供的資料最後才套，而且只補空缺——它的評論數 66% 是 50 的倍數，
    # 明顯是估算值；研究 agent 解析頁面拿到的才是實際數字。
    gem_file = "scratchpad/ext/gemini-ratings.json"
    for f in files:
        data = json.load(open(f, encoding="utf-8"))
        base = os.path.basename(f)

        for r in data.get("ratings", []):
            x = by.get(r.get("id"))
            if not x:
                warn.append(f"{base}: 找不到 id {r.get('id')}"); continue
            try:
                rr = round(float(r["r"]), 1)
            except Exception:
                warn.append(f"{base}: {r.get('id')} 星等不是數字"); continue
            if not (0 < rr <= 5):
                warn.append(f"{base}: {r['id']} 星等 {rr} 超出範圍"); continue
            n = r.get("n")
            n = int(n) if isinstance(n, (int, float, str)) and str(n).isdigit() else None
            if not r.get("src"):
                warn.append(f"{base}: {r['id']} 沒有來源網址，不採用"); continue
            x["g"] = {"r": rr, "asof": r.get("asof") or "2026/08",
                      "src": src_of(r["src"]), "url": r["src"]}
            if n:
                x["g"]["n"] = n
            if r.get("note"):
                x["g"]["note"] = r["note"]
            rated += 1

        for q in data.get("new", []):
            miss = [k for k in NEED if q.get(k) in (None, "")]
            if miss:
                warn.append(f"{base}: {q.get('id','?')} 缺欄位 {','.join(miss)}"); continue
            if q["id"] in removed:
                continue                      # 之前判定為重複、已合併掉
            if q["id"] in by:
                warn.append(f"{base}: id 重複 {q['id']}，跳過"); continue
            if q["cat"] not in CATS_OK:
                warn.append(f"{base}: {q['id']} 分類 {q['cat']} 不合法"); continue
            if q.get("flag") not in FLAGS_OK:
                q["flag"] = "ok"
            if not (-47.5 < float(q["lat"]) < -34 and 166 < float(q["lng"]) < 179):
                warn.append(f"{base}: {q['id']} 座標不在紐西蘭範圍"); continue
            for t in set(re.findall(r"</?([a-zA-Z]+)", q.get("note", ""))):
                if t != "b":
                    warn.append(f"{base}: {q['id']} note 有不允許的標籤 <{t}>")
            g = q.pop("g", None)
            if g and g.get("r") and g.get("src"):
                q["g"] = {"r": round(float(g["r"]), 1), "asof": g.get("asof") or "2026/08",
                          "src": src_of(g["src"]), "url": g["src"]}
                if str(g.get("n", "")).isdigit():
                    q["g"]["n"] = int(g["n"])
                if g.get("note"):
                    q["g"]["note"] = g["note"]
            q.pop("img", None)          # 圖片另外處理，避免指到不存在的檔案
            d["places"].append(q); by[q["id"]] = q; added += 1

        print(f"  {base} → 評分 {len(data.get('ratings', []))}、新增 {len(data.get('new', []))}")

    # 補上 Gemini 的資料（只填空缺，並標明是估算值）
    if os.path.exists(gem_file):
        g = json.load(open(gem_file, encoding="utf-8"))
        fill = skip = 0
        for r in g.get("ratings", []):
            x = by.get(r.get("id"))
            if not x:
                warn.append(f"gemini: 找不到 id {r.get('id')}"); continue
            if x.get("g"):
                # 已經有實測數字了，只在差異大時記下來
                a = x["g"]
                dr = abs(float(a["r"]) - float(r["r"]))
                an, gn = a.get("n"), r.get("n")
                dn = (abs(an - gn) / max(an, 1)) if (an and gn) else 0
                if dr >= 0.3 or dn > 1.0:
                    conflicts.append(f"{r['id']}: 實測 {a['r']}/{an} vs Gemini {r['r']}/{gn}")
                    a["note"] = (a.get("note", "") +
                                 f"（Gemini 另查到 {r['r']} 分／約 {gn} 則）").strip()
                skip += 1
                continue
            x["g"] = {"r": round(float(r["r"]), 1), "asof": r.get("asof") or "2026/08",
                      "src": "google", "url": r.get("src", ""), "approx": True}
            if str(r.get("n", "")).isdigit():
                x["g"]["n"] = int(r["n"])
            fill += 1
        print(f"\n  gemini-ratings.json → 補上 {fill} 筆（估算值）、跳過 {skip} 筆（已有實測數字）")

    d["places"].sort(key=lambda x: (x.get("day") or 99, x["cat"], x["id"]))
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    tot = len(d["places"])
    with_g = sum(1 for x in d["places"] if x.get("g"))
    print(f"\n✓ 套用評分 {rated} 筆、新增地點 {added} 個")
    print(f"  目前共 {tot} 個地點，其中 {with_g} 個有評分")
    from collections import Counter
    c = Counter(x["g"]["src"] for x in d["places"] if x.get("g"))
    if c:
        print("  評分來源：" + "、".join(f"{k} {v}" for k, v in c.most_common()))
    approx = sum(1 for x in d["places"] if (x.get("g") or {}).get("approx"))
    print(f"  其中 {approx} 筆是估算值（Gemini），{with_g - approx} 筆是實測數字")
    if conflicts:
        print(f"\n⚠ 兩邊數字差很多的（已保留實測值，並在備註記下另一個）：")
        for c in conflicts[:15]:
            print("   -", c)
    if warn:
        print(f"\n⚠ 提醒（{len(warn)}）：")
        for w in warn[:25]:
            print("   -", w)


main()
