#!/usr/bin/env python3
"""用 OpenStreetMap Nominatim 補 places.json 的經緯度。遵守 1 req/sec 與 User-Agent 規範。"""
import json, time, urllib.parse, urllib.request, sys

UA = "NZTripPlanner/1.0 (neil01428@gmail.com)"
NZ_BOX = "166.3,-34.0,178.6,-47.5"   # 紐西蘭 viewbox（左,上,右,下）

def geocode(q):
    url = ("https://nominatim.openstreetmap.org/search?"
           + urllib.parse.urlencode({
               "q": q, "format": "json", "limit": 1,
               "countrycodes": "nz", "viewbox": NZ_BOX, "bounded": 1}))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=25))
    except Exception as e:
        return None, f"ERR {e}"
    if not d:
        return None, "查無結果"
    r = d[0]
    return (round(float(r["lat"]), 6), round(float(r["lon"]), 6)), r.get("display_name", "")[:70]

data = json.load(open("data/places.json", encoding="utf-8"))
todo = [p for p in data["places"] if not p.get("lat")]
print(f"需要定位：{len(todo)} / {len(data['places'])}\n")
fails = []
for i, p in enumerate(todo, 1):
    q = p.get("q") or f"{p['name']} New Zealand"
    coords, info = geocode(q)
    if coords:
        p["lat"], p["lng"] = coords
        print(f"  {i:3}/{len(todo)} ✓ {p['id']:24} {coords[0]:>10.5f},{coords[1]:>10.5f}  {info[:48]}")
    else:
        fails.append((p["id"], q, info))
        print(f"  {i:3}/{len(todo)} ✗ {p['id']:24} {info}  ← {q}")
    json.dump(data, open("data/places.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    time.sleep(1.1)

print(f"\n成功 {len(todo)-len(fails)} / {len(todo)}")
if fails:
    print("\n=== 需要手動處理 ===")
    for i, q, why in fails:
        print(f"  {i:24} ({why})  查詢字串：{q}")
