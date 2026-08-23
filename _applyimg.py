#!/usr/bin/env python3
"""把人工看圖確認過的候選正式下載、壓縮、寫入 places.json 與授權表。"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.parse

UA = {"User-Agent": "NZTripPlanner/1.0 (neil01428@gmail.com)"}

# 人工在接觸表上確認過的：id → (來源, 索引)
#   "geo" = scored.json 的 best；"re" = retry.json 的第 n 筆
PICK = {
 "sealy-tarns": ("geo", 0), "mt-iron-track": ("geo", 0), "nttm-wanaka": ("geo", 0),
 "knobs-flat": ("geo", 0), "monkey-creek": ("geo", 0), "cathedral-caves": ("geo", 0),
 "mclean-falls": ("geo", 0), "slope-point": ("geo", 0), "bushy-beach": ("geo", 0),
 "south-canterbury-museum": ("geo", 0), "chch-cathedral-square": ("geo", 0),
 "turanga": ("geo", 0), "nz-maritime-museum": ("geo", 0), "takapo-regional-park": ("geo", 0),
 "bennetts-bluff-lookout": ("geo", 0), "lake-marian-falls": ("geo", 0),
 "purakaunui-falls": ("geo", 0), "roaring-bay-hide": ("geo", 0),
 "bluff-hill-lookout": ("geo", 0), "hermitage-planetarium": ("geo", 0),
 "queenstown-gardens": ("re", 1), "waipapa-point-lighthouse": ("re", 2),
 "bannockburn-sluicings": ("re", 0), "doc-mtcook-visitor": ("re", 0),
 "lakes-district-museum": ("re", 0), "highlands-motorsport-park": ("re", 0),
 "kiwi-park-queenstown": ("re", 0), "queenstown-hill-walk": ("re", 0),
 "auckland-domain": ("re", 2), "mount-eden": ("re", 0),
 "chch-art-gallery": ("re", 0), "canterbury-museum-popup": ("re", 2),
 "giants-house": ("re", 0), "akaroa-dolphins": ("re", 0),
 "eastern-southland-gallery": ("re", 0),
 "croydon-aviation": ("re", 0), "lake-gunn-nature-walk": ("re", 0),
 "oi-manawa": ("re", 0), "geraldine-vintage-museum": ("re", 2),
}


def meta(title, w=1400):
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": title, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": w})
    r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
    pg = list(r["query"]["pages"].values())[0]
    ii = pg["imageinfo"][0]; em = ii["extmetadata"]
    return {"url": ii.get("thumburl") or ii["url"],
            "page": ii["descriptionurl"],
            "lic": em.get("LicenseShortName", {}).get("value", "?"),
            "artist": re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "")).strip()
                      or "未署名",
            "title": title.removeprefix("File:")}


def main():
    scored = json.load(open("scratchpad/img/scored.json", encoding="utf-8"))
    retry = json.load(open("scratchpad/img/retry.json", encoding="utf-8"))
    d = json.load(open("data/places.json", encoding="utf-8"))
    by = {x["id"]: x for x in d["places"]}
    cr = json.load(open("images/credits.json", encoding="utf-8"))

    done = fail = 0
    for pid, (src, idx) in PICK.items():
        if pid not in by:
            print(f"  ✗ {pid} 不在 places.json"); fail += 1; continue
        try:
            title = (scored[pid]["best"]["title"] if src == "geo"
                     else retry[pid][idx]["title"])
        except (KeyError, IndexError):
            print(f"  ✗ {pid} 找不到候選"); fail += 1; continue
        try:
            m = meta(title)
        except Exception as e:
            print(f"  ✗ {pid} 抓 metadata 失敗 {e}"); fail += 1; continue
        out = f"images/{pid}.jpg"
        subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0 NZTripPlanner/1.0",
                        m["url"], "-o", "/tmp/_dl.jpg"], capture_output=True)
        if not os.path.exists("/tmp/_dl.jpg") or os.path.getsize("/tmp/_dl.jpg") < 6000:
            print(f"  ✗ {pid} 下載失敗"); fail += 1; continue
        subprocess.run(["sips", "-Z", "1400", "/tmp/_dl.jpg", "--out", out], capture_output=True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72",
                        out, "--out", out], capture_output=True)
        if not os.path.exists(out):
            print(f"  ✗ {pid} 壓縮失敗"); fail += 1; continue
        by[pid]["img"] = out
        cr[pid] = {"file": out, "title": m["title"], "lic": m["lic"],
                   "artist": m["artist"], "page": m["page"]}
        kb = os.path.getsize(out) // 1024
        print(f"  ✓ {pid:28} {kb:4}KB  {m['lic']:14} {m['title'][:40]}")
        done += 1
        time.sleep(0.25)

    json.dump(d, open("data/places.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(cr, open("images/credits.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    rows = sorted(cr.items())
    md = ["# 圖片來源與授權", "",
          f"共 {len(rows)} 張，全部取自 Wikimedia Commons。使用時請保留原作者署名與授權標示。", "",
          "| 檔案 | 原始標題 | 作者 | 授權 | 來源頁 |", "|---|---|---|---|---|"]
    for k, v in rows:
        md.append(f"| `{v['file']}` | {v['title']} | {v['artist']} | {v['lic']} | "
                  f"[Commons]({v['page']}) |")
    open("images/CREDITS.md", "w", encoding="utf-8").write("\n".join(md) + "\n")
    print(f"\n✓ 成功 {done}、失敗 {fail}；授權表共 {len(rows)} 張")


main()
