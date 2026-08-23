#!/usr/bin/env python3
"""把 out_B*.json 併成 data/culture.json。"""
import json, glob, os, sys

CATS = {
  "maori":   {"label":"毛利文化", "color":"#8C3B2E", "icon":"🗿"},
  "history": {"label":"歷史",     "color":"#7A6234", "icon":"📜"},
  "society": {"label":"社會與生活","color":"#2E6B7A","icon":"🏘"},
  "geology": {"label":"地質",     "color":"#5B4AA8", "icon":"⛰"},
  "wildlife":{"label":"生態與野生動物","color":"#1E5B4E","icon":"🐧"},
  "sky":     {"label":"星空",     "color":"#1B3A6B", "icon":"✨"},
  "season":  {"label":"季節與天氣","color":"#B4791F","icon":"🍃"},
}
ORDER = list(CATS)

def main():
    cards, seen, warn = [], set(), []
    files = sorted(glob.glob("scratchpad/deep/out_B*.json")) or \
            sorted(glob.glob(os.path.join(os.environ.get("SCRATCH",""), "deep/out_B*.json")))
    if not files:
        sys.exit("找不到 out_B*.json")
    for f in files:
        data = json.load(open(f, encoding="utf-8"))
        got = data if isinstance(data, list) else data.get("cards", [])
        for c in got:
            cid = c.get("id")
            if not cid or cid in seen:
                warn.append(f"跳過重複/無 id：{cid}"); continue
            if c.get("cat") not in CATS:
                warn.append(f"{cid}: 未知分類 {c.get('cat')} → 併入 society"); c["cat"]="society"
            img = c.get("img") or None
            if img:
                base = img.split("/")[-1].removesuffix(".jpg")
                if os.path.exists(f"images/{base}.jpg"):
                    img = base                      # JS 會自己補 images/ 與 .jpg
                else:
                    warn.append(f"{cid}: 缺圖 images/{base}.jpg"); img = None
            c["img"] = img
            if not img and c.get("img_need"):
                warn.append(f"{cid}: 需補圖 → {c['img_need']}")
            c.pop("img_need", None)
            body = " ".join(c.get("paras", []))
            if len(body) < 120:
                warn.append(f"{cid}: 內文偏短 ({len(body)} 字)")
            seen.add(cid); cards.append(c)
        print(f"  {os.path.basename(f)} → {len(got)} 張")
    cards.sort(key=lambda c: (ORDER.index(c["cat"]), c.get("ord", 99)))
    used = {c["cat"] for c in cards}
    out = {"meta":{"cats":{k:v for k,v in CATS.items() if k in used}}, "cards":cards}
    json.dump(out, open("data/culture.json","w",encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n✓ data/culture.json：{len(cards)} 張、{len(used)} 個分類")
    for k in ORDER:
        n = sum(1 for c in cards if c["cat"]==k)
        if n: print(f"    {CATS[k]['icon']} {CATS[k]['label']:6} {n}")
    if warn:
        print("\n⚠ 提醒：")
        for w in warn: print("   -", w)

main()
