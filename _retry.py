#!/usr/bin/env python3
"""針對特定地點用精準關鍵字重找候選，並拼成接觸表。"""
import json, sys, os, subprocess, textwrap, urllib.request, urllib.parse, re, time
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, ".")

UA = {"User-Agent": "NZTripPlanner/1.0 (neil01428@gmail.com)"}
OK = ("cc0", "public domain", "cc by", "cc by-sa", "cc-by")

JOBS = {
 "queenstown-gardens":        "Queenstown Gardens New Zealand",
 "waipapa-point-lighthouse":  "Waipapa Point Lighthouse",
 "bannockburn-sluicings":     "Bannockburn Sluicings",
 "doc-mtcook-visitor":        "Aoraki Mount Cook Visitor Centre",
 "cardrona-distillery":       "Cardrona Distillery",
 "glenorchy-lagoon-walkway":  "Glenorchy lagoon",
 "lakes-district-museum":     "Lakes District Museum Arrowtown",
 "highlands-motorsport-park": "Highlands Motorsport Park Cromwell",
 "kiwi-park-queenstown":      "Kiwi Birdlife Park Queenstown",
 "queenstown-hill-walk":      "Queenstown Hill",
 "auckland-domain":           "Auckland Domain",
 "mount-eden":                "Maungawhau Mount Eden crater",
 "chch-art-gallery":          "Christchurch Art Gallery",
 "canterbury-museum-popup":   "Canterbury Museum Christchurch",
 "giants-house":              "Giants House Akaroa",
 "akaroa-dolphins":           "Hector's dolphin Akaroa",
 "te-unua-museum":            "Southland Museum Invercargill pyramid",
 "eastern-southland-gallery":  "Eastern Southland Gallery Gore",
 "croydon-aviation":          "Croydon Aviation Heritage Centre Mandeville",
 "lake-gunn-nature-walk":     "Lake Gunn Fiordland",
 "cinema-paradiso-wanaka":    "Cinema Paradiso Wanaka",
 "fiordland-cinema":          "Fiordland Cinema Te Anau",
 "nz-alpine-lavender":        "lavender field New Zealand",
 "star-and-garter":           "Oamaru Victorian Precinct Harbour Street",
 "moeraki-tavern":            "Moeraki village Otago",
 "takapo-regional-park":      "Lake Tekapo lupins shoreline",
 "chch-cathedral-square":     "Christ Church Cathedral Christchurch earthquake ruins",
 "oi-manawa":                 "Canterbury Earthquake National Memorial",
 "geraldine-vintage-museum":  "Geraldine Vintage Car Machinery Museum",
 "te-unua-museum":            "Southland Museum Art Gallery pyramid Invercargill",
 "tumu-toka-curioscape":      "Curio Bay petrified forest",
 "lost-gypsy-gallery":        "Papatowai Catlins",
 "cardrona-distillery":       "Cardrona valley Otago",
 "dorothy-browns-cinema":     "Arrowtown Buckingham Street",
 "cinema-paradiso-wanaka":    "Wanaka town centre",
}


def api(p):
    u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(p)
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
    except Exception:
        return {}


def find(q):
    r = api({"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
             "gsrsearch": q, "gsrlimit": 10, "prop": "imageinfo",
             "iiprop": "url|extmetadata|size", "iiurlwidth": 900})
    out = []
    for pg in (r.get("query", {}).get("pages") or {}).values():
        ii = (pg.get("imageinfo") or [{}])[0]
        if not ii.get("url"):
            continue
        em = ii.get("extmetadata", {})
        lic = (em.get("LicenseShortName", {}).get("value") or "").lower()
        if not any(k in lic for k in OK) or ii.get("width", 0) < 700:
            continue
        if re.search(r'\.(svg|gif|pdf|tif|djvu|webm|ogv)$', pg["title"], re.I):
            continue
        out.append({"title": pg["title"], "thumb": ii.get("thumburl") or ii["url"],
                    "page": ii.get("descriptionurl", ""),
                    "lic": em.get("LicenseShortName", {}).get("value", "?"),
                    "artist": re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "")).strip()[:60] or "未署名",
                    "idx": pg.get("index", 99)})
    out.sort(key=lambda x: x["idx"])
    return out[:3]


def main():
    tag, ids = sys.argv[1], sys.argv[2:]
    store = {}
    if os.path.exists("scratchpad/img/retry.json"):
        store = json.load(open("scratchpad/img/retry.json", encoding="utf-8"))
    items = []
    os.makedirs("scratchpad/img/dl", exist_ok=True)
    for pid in ids:
        hits = find(JOBS[pid]); time.sleep(0.3)
        store[pid] = hits
        for k, h in enumerate(hits):
            out = f"scratchpad/img/dl/{pid}_{k}.jpg"
            subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0 NZ/1.0", h["thumb"], "-o", out],
                           capture_output=True)
            if os.path.exists(out) and os.path.getsize(out) > 4000:
                items.append((f"{pid}_{k}", out, h["title"][5:]))
    json.dump(store, open("scratchpad/img/retry.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    CW, CH, PAD, LH, COLS = 280, 190, 8, 34, 4
    rows = (len(items) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * (CW + PAD) + PAD, rows * (CH + LH + PAD) + PAD), (28, 32, 36))
    dr = ImageDraw.Draw(sheet)
    fp = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
    f1 = ImageFont.truetype(fp, 12) if os.path.exists(fp) else ImageFont.load_default()
    f2 = ImageFont.truetype(fp, 10) if os.path.exists(fp) else ImageFont.load_default()
    for i, (lab, path, title) in enumerate(items):
        cx = PAD + (i % COLS) * (CW + PAD); cy = PAD + (i // COLS) * (CH + LH + PAD)
        try:
            im = Image.open(path).convert("RGB"); im.thumbnail((CW, CH))
            sheet.paste(im, (cx + (CW - im.width) // 2, cy + (CH - im.height) // 2))
        except Exception:
            dr.text((cx + 6, cy + 6), "壞檔", fill=(255, 90, 90), font=f2)
        dr.text((cx, cy + CH + 3), lab, fill=(255, 214, 120), font=f1)
        dr.text((cx, cy + CH + 19), textwrap.shorten(title, 44, placeholder="…"),
                fill=(150, 168, 180), font=f2)
    out = f"scratchpad/img/retry_{tag}.png"
    sheet.save(out); print(f"✓ {out}（{len(items)} 張）")


main()
