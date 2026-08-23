#!/usr/bin/env python3
"""幫沒有照片的地點在 Wikimedia Commons 找候選圖。

只找 Commons，因為授權清楚（CC0 / CC BY / CC BY-SA）且可以本地化。
輸出候選清單供人工挑選——Commons 上「檔名對但內容不對」的情況很常見，
所以一定要人看過才用。
"""
import json, urllib.request, urllib.parse, sys, time, re

UA = {"User-Agent": "NZTripPlanner/1.0 (neil01428@gmail.com)"}
OK_LIC = ("cc0", "public domain", "cc by", "cc by-sa", "cc-by")


def api(params):
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(
                urllib.request.Request(u, headers=UA), timeout=40))
        except Exception:
            if attempt == 2:
                return {}
            time.sleep(1.5)


def geosearch(lat, lng, radius=500, limit=20):
    """找在這個座標附近拍的照片。比關鍵字搜尋準得多——
    關鍵字會把 High Country Salmon 配到 1819 年的人物肖像。"""
    r = api({"action": "query", "format": "json", "generator": "geosearch",
             "ggscoord": f"{lat}|{lng}", "ggsradius": radius,
             "ggslimit": limit, "ggsnamespace": 6,
             "prop": "imageinfo", "iiprop": "url|extmetadata|size",
             "iiurlwidth": 900})
    return _pick(r)


def _pick(r):
    out = []
    for pg in (r.get("query", {}).get("pages") or {}).values():
        ii = (pg.get("imageinfo") or [{}])[0]
        if not ii.get("url"):
            continue
        em = ii.get("extmetadata", {})
        lic = (em.get("LicenseShortName", {}).get("value") or "").lower()
        if not any(k in lic for k in OK_LIC):
            continue
        if ii.get("width", 0) < 700 or ii.get("height", 0) < 450:
            continue
        if re.search(r'\.(svg|gif|pdf|tif|djvu|webm|ogv)$', pg["title"], re.I):
            continue
        out.append({
            "title": pg["title"],
            "thumb": ii.get("thumburl") or ii["url"],
            "page": ii.get("descriptionurl", ""),
            "lic": em.get("LicenseShortName", {}).get("value", "?"),
            "artist": re.sub(r"<[^>]+>", "",
                             em.get("Artist", {}).get("value", "")).strip()[:60] or "未署名",
            "w": ii.get("width"), "h": ii.get("height"),
            "idx": pg.get("index", 99),
        })
    out.sort(key=lambda x: x["idx"])
    return out


def search(q, limit=8):
    r = api({"action": "query", "format": "json", "generator": "search",
             "gsrnamespace": 6, "gsrsearch": q, "gsrlimit": limit,
             "prop": "imageinfo", "iiprop": "url|extmetadata|size",
             "iiurlwidth": 900})
    out = []
    for pg in (r.get("query", {}).get("pages") or {}).values():
        ii = (pg.get("imageinfo") or [{}])[0]
        if not ii.get("url"):
            continue
        em = ii.get("extmetadata", {})
        lic = (em.get("LicenseShortName", {}).get("value") or "").lower()
        if not any(k in lic for k in OK_LIC):
            continue
        if ii.get("width", 0) < 700 or ii.get("height", 0) < 450:
            continue
        if re.search(r'\.(svg|gif|pdf|tif)$', pg["title"], re.I):
            continue
        out.append({
            "title": pg["title"],
            "thumb": ii.get("thumburl") or ii["url"],
            "page": ii.get("descriptionurl", ""),
            "lic": em.get("LicenseShortName", {}).get("value", "?"),
            "artist": re.sub(r"<[^>]+>", "",
                             em.get("Artist", {}).get("value", "")).strip()[:60] or "未署名",
            "w": ii.get("width"), "h": ii.get("height"),
            "idx": pg.get("index", 99),
        })
    out.sort(key=lambda x: x["idx"])
    return out


def main():
    d = json.load(open("data/places.json", encoding="utf-8"))
    todo = [x for x in d["places"] if not x.get("img")]
    if len(sys.argv) > 1:
        a, b = int(sys.argv[1]), int(sys.argv[2])
        todo = todo[a:b]
    res = {}
    for i, x in enumerate(todo, 1):
        # 先用座標找附近拍的照片（準），找不到再退回關鍵字（雜訊多）
        hits = []
        if x.get("lat"):
            for radius in (400, 1200, 3000):
                hits = geosearch(x["lat"], x["lng"], radius)
                if hits:
                    break
                time.sleep(0.3)
        how = "geo"
        if not hits:
            how = "kw"
            for q in [x["name"], f'{x["name"]} {x.get("town","")}']:
                hits = search(q)
                if hits:
                    break
                time.sleep(0.3)
        res[x["id"]] = {"name": x["name"], "town": x.get("town"), "cat": x["cat"],
                        "how": how, "hits": hits[:6]}
        print(f"  [{i:2}/{len(todo)}] {x['id']:32} {how:3} {len(hits):2} 個"
              f"  {hits[0]['title'][5:52] if hits else '—'}")
        sys.stdout.flush()
        time.sleep(0.35)
    json.dump(res, open("scratchpad/img/candidates.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    got = sum(1 for v in res.values() if v["hits"])
    print(f"\n✓ {got}/{len(todo)} 個地點找到候選圖")


main()
