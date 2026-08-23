#!/usr/bin/env python3
"""替候選圖打分：檔名跟地點名稱有多像。

地理搜尋會回傳「附近拍的」照片，但附近不等於就是這個地方——
餐廳的地理搜尋常常回傳隔壁的教堂。所以只採用檔名真的對得上的，
其餘留給人工看圖判斷。
"""
import json, re, sys

STOP = {"the","of","and","at","in","on","a","an","new","zealand","nz","cafe","café",
        "restaurant","bar","centre","center","shop","store","co","ltd","track","walk",
        "walkway","reserve","scenic","historic","museum","gallery","park"}


def toks(s):
    s = re.sub(r"[(（].*?[)）]", " ", s)
    s = re.sub(r"[^A-Za-zÀ-ɏĀ-ſ0-9\s]", " ", s)
    return [w.lower() for w in s.split() if len(w) > 2 and w.lower() not in STOP]


def score(place_name, title):
    t = title[5:] if title.startswith("File:") else title
    t = re.sub(r"\.\w+$", "", t)
    pt, tt = set(toks(place_name)), set(toks(t))
    if not pt:
        return 0.0
    hit = len(pt & tt)
    return hit / len(pt)


def main():
    cand = json.load(open("scratchpad/img/candidates.json", encoding="utf-8"))
    d = json.load(open("data/places.json", encoding="utf-8"))
    names = {x["id"]: x["name"] for x in d["places"]}
    strong, weak, none_ = [], [], []
    out = {}
    for pid, v in cand.items():
        best, bs = None, 0.0
        for h in v["hits"]:
            s = score(names.get(pid, v["name"]), h["title"])
            if s > bs:
                best, bs = h, s
        out[pid] = {"name": v["name"], "cat": v["cat"], "score": round(bs, 2),
                    "best": best, "hits": v["hits"]}
        (strong if bs >= 0.6 else weak if bs > 0 else none_).append(pid)
    json.dump(out, open("scratchpad/img/scored.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"檔名高度吻合（≥0.6）：{len(strong)}")
    for p in strong:
        print(f"   {out[p]['score']}  {p:30} ← {out[p]['best']['title'][5:60]}")
    print(f"\n部分吻合（>0）：{len(weak)}")
    for p in weak[:20]:
        print(f"   {out[p]['score']}  {p:30} ← {out[p]['best']['title'][5:60]}")
    print(f"\n完全對不上（只能靠看圖）：{len(none_)}")
    print("  " + "、".join(none_[:20]))


main()
