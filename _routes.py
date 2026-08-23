#!/usr/bin/env python3
"""
用 OSRM 取真實道路幾何，存成 data/routes-geo.json。
建置時跑一次即可，網頁執行時不依賴任何外部 API。
幾何用 encoded polyline（精度 5）壓縮，前端再解碼。
"""
import json, time, urllib.parse, urllib.request, sys

UA = "NZTripPlanner/1.0 (neil01428@gmail.com)"
OSRM = "https://router.project-osrm.org/route/v1/driving/"

places = {p["id"]: p for p in json.load(open("data/places.json", encoding="utf-8"))["places"]}

# 不在 places.json 裡的中途城鎮
TOWN = {
 "fairlie":   (-44.0997, 170.8283), "twizel":  (-44.2586, 170.1006),
 "omarama":   (-44.4886, 169.9722), "geraldine": (-44.0894, 171.2417),
 "kurow":     (-44.7269, 170.4703), "timaru":  (-44.3968, 171.2551),
 "dunsandel": (-43.6667, 172.1833), "gore":    (-46.0989, 168.9442),
 "queenstown":(-45.0312, 168.6626), "wanaka":  (-44.6942, 169.1421),
 "teanau":    (-45.4144, 167.7186), "invercargill": (-46.4132, 168.3538),
 "dunedin":   (-45.8742, 170.5036), "oamaru":  (-45.0975, 170.9714),
 "christchurch": (-43.5320, 172.6362), "mtcookvillage": (-43.7340, 170.0980),
 "duntroon":  (-44.8514, 170.6740), "moeraki": (-45.3600, 170.8547),
}

def pt(ref):
    if ref in places:
        p = places[ref]; return (p["lat"], p["lng"])
    if ref in TOWN: return TOWN[ref]
    raise KeyError(ref)

def route(refs):
    coords = ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in (pt(r) for r in refs))
    url = OSRM + coords + "?overview=simplified&geometries=polyline"
    try:
        d = json.load(urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": UA}), timeout=45))
    except Exception as e:
        return None, str(e)
    if d.get("code") != "Ok" or not d.get("routes"):
        return None, d.get("code", "?")
    r = d["routes"][0]
    return {"poly": r["geometry"],
            "km": round(r["distance"] / 1000),
            "min": round(r["duration"] / 60)}, None

# ── 每日主要路段（過夜點到過夜點）──
LEGS = [
 (3,  "基督城 → Fairlie → 蒂卡波湖",           ["chc-airport","fairlie","lake-tekapo"]),
 (4,  "Tekapo → 普卡基湖 → Mt Cook",            ["lake-tekapo","skydive-mtcook","peters-lookout","mtcookvillage"]),
 (6,  "Mt Cook → Lindis Pass → Wanaka",         ["mtcookvillage","twizel","omarama","lindis-pass","wanaka"]),
 (7,  "Wanaka → Cromwell → Arrowtown → 皇后鎮", ["wanaka","cromwell-heritage","arrowtown-main","queenstown"]),
 (10, "皇后鎮 → 蒂阿瑙",                        ["queenstown","teanau"]),
 (11, "蒂阿瑙 → 米爾福德峽灣",                  ["teanau","mirror-lakes","homer-tunnel","milford-sound"]),
 (12, "蒂阿瑙 → Invercargill → Bluff",          ["teanau","invercargill","stirling-point"]),
 (13, "Invercargill → Gore → 但尼丁",           ["invercargill","gore","dunedin"]),
 (14, "但尼丁 → 摩拉基 → Oamaru",               ["dunedin","shag-point","moeraki","oamaru"]),
 (15, "Oamaru → Waitaki 內陸 → 基督城",         ["oamaru","duntroon","waitaki-dam","timaru","christchurch"]),
]

# ── 有方案的日子：每個方案的實際行車路線 ──
OPTS = {
 "d9a":  ["queenstown","glenorchy","queenstown"],
 "d9b":  ["queenstown","kawarau-bungy","queenstown"],
 "d13a": ["invercargill","gore","dunedin"],
 "d13b": ["invercargill","curio-bay","nugget-point","dunedin"],
 "d15a": ["oamaru","duntroon","waitaki-dam","timaru","christchurch"],
 "d15b": ["oamaru","timaru","dunsandel","akaroa","christchurch"],
 "d15c": ["oamaru","duntroon","kurow","omarama","lake-pukaki","lake-tekapo","geraldine","christchurch"],
}

out = {"legs": [], "options": {}}
fail = []

for day, label, refs in LEGS:
    r, err = route(refs)
    if r:
        r.update({"day": day, "label": label})
        out["legs"].append(r)
        print(f"  ✓ D{day:02} {label:34} {r['km']:4} km · {r['min']:3} 分", flush=True)
    else:
        fail.append(f"D{day} {label} ({err})"); print(f"  ✗ D{day:02} {label}  {err}", flush=True)
    time.sleep(1.2)

for oid, refs in OPTS.items():
    r, err = route(refs)
    if r:
        out["options"][oid] = r
        print(f"  ✓ {oid:6} {r['km']:4} km · {r['min']:3} 分", flush=True)
    else:
        fail.append(f"{oid} ({err})"); print(f"  ✗ {oid:6} {err}", flush=True)
    time.sleep(1.2)

json.dump(out, open("data/routes-geo.json", "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
import os
print(f"\n寫入 data/routes-geo.json（{os.path.getsize('data/routes-geo.json')//1024} KB）")
print("失敗：", fail or "無")
