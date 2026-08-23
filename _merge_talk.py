#!/usr/bin/env python3
"""把 out_L*.json 併成 data/talk.json（會話頁的資料源）。

四個研究 agent 的 sec 命名有兩處撞名，在這裡統一改掉：
  L2 的 shop（店裡看到的字）  → signshop
  L3 的 shop（超市買東西會話）→ buy
"""
import json, glob, os, sys

# key: (顯示名, icon, 顏色, 所屬大區)
SECS = {
  "rules":    ("發音速成",   "🔤", "#5B4AA8", "毛利語"),
  "greet":    ("打招呼",     "👋", "#1B7A93", "毛利語"),
  "thanks":   ("謝謝",       "🙏", "#1E5B4E", "毛利語"),
  "courtesy": ("基本禮貌",   "🤝", "#2E6B7A", "毛利語"),
  "people":   ("稱呼與人",   "👪", "#8C3B2E", "毛利語"),
  "place":    ("地名怎麼念", "📍", "#B4791F", "地名"),
  "road":     ("路上標誌",   "🛣", "#A83A2B", "看得懂"),
  "track":    ("步道標示",   "🥾", "#1E5B4E", "看得懂"),
  "signshop": ("店裡的字",   "🏪", "#7A6234", "看得懂"),
  "slang":    ("紐西蘭腔",   "💬", "#5B4AA8", "看得懂"),
  "border":   ("入境申報",   "🛂", "#A83A2B", "開口說"),
  "car":      ("租車加油",   "🚐", "#1B7A93", "開口說"),
  "stay":     ("住宿",       "🛏", "#2E6B7A", "開口說"),
  "cafe":     ("咖啡店",     "☕", "#B4791F", "開口說"),
  "eat":      ("餐廳",       "🍽", "#8C3B2E", "開口說"),
  "book":     ("活動報到",   "🎟", "#1E5B4E", "開口說"),
  "buy":      ("買東西",     "🛒", "#7A6234", "開口說"),
  "help":     ("求助與緊急", "🆘", "#BE3B2B", "開口說"),
}
ORDER = list(SECS)
RENAME = {"out_L2.json": {"shop": "signshop"},
          "out_L3.json": {"shop": "buy"}}
NEED = ("id", "sec", "lang", "t", "zh", "say", "roma", "zhsound", "when")


def main():
    import os as _o
    src = _o.environ.get("TALKSRC", "scratchpad/deep")
    files = sorted(glob.glob(f"{src}/out_L*.json"))
    if not files:
        sys.exit("找不到 out_L*.json")
    out, seen, warn = [], set(), []
    for f in files:
        base = os.path.basename(f)
        ren = RENAME.get(base, {})
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            warn.append(f"{base}: JSON 讀取失敗 {e}"); continue
        rows = data if isinstance(data, list) else data.get("entries", [])
        kept = 0
        for e in rows:
            eid = e.get("id")
            if not eid:
                warn.append(f"{base}: 有詞條沒有 id，跳過"); continue
            if eid in seen:
                warn.append(f"{base}: id 重複 {eid}，跳過"); continue
            e["sec"] = ren.get(e.get("sec"), e.get("sec"))
            if e["sec"] not in SECS:
                warn.append(f"{eid}: 未知分區 {e['sec']}，跳過"); continue
            miss = [k for k in NEED if not e.get(k)]
            if miss:
                warn.append(f"{eid}: 缺欄位 {','.join(miss)}"); continue
            if e.get("lang") not in ("mi", "en"):
                warn.append(f"{eid}: lang={e.get('lang')} 不合法 → 當成 en"); e["lang"] = "en"
            # say 欄不該帶標點，會讓語音停頓
            e["say"] = " ".join(str(e["say"]).replace("?", "").replace(",", "")
                                .replace(".", "").replace("!", "").split())
            e.pop("_hay", None)
            seen.add(eid); out.append(e); kept += 1
        print(f"  {base} → {kept}/{len(rows)} 條")
    out.sort(key=lambda e: (ORDER.index(e["sec"]), e.get("day", 99)))
    used = [s for s in ORDER if any(e["sec"] == s for e in out)]
    meta = {"secs": {s: {"label": SECS[s][0], "icon": SECS[s][1],
                         "color": SECS[s][2], "group": SECS[s][3]} for s in used}}
    json.dump({"meta": meta, "entries": out},
              open("data/talk.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n✓ data/talk.json：{len(out)} 條、{len(used)} 個分區")
    grp = {}
    for s in used:
        grp.setdefault(SECS[s][3], []).append(
            f"{SECS[s][1]} {SECS[s][0]} {sum(1 for e in out if e['sec'] == s)}")
    for g, items in grp.items():
        print(f"    {g}：" + "、".join(items))
    if warn:
        print(f"\n⚠ 提醒（{len(warn)}）：")
        for w in warn[:25]:
            print("   -", w)


main()
