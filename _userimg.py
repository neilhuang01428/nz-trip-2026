#!/usr/bin/env python3
"""
把「使用者自己提供的照片」接進 places.json。

跟 _findimg.py／_applyimg.py 不同：那兩支是去 Wikimedia Commons 抓 CC 授權圖，
這一支處理的是**使用者手上本來就有的圖**（截圖、業者官網圖、自己拍的），
所以授權欄位不會假裝是 CC，一律標成「使用者提供」。

用法：
  python3 _userimg.py <來源資料夾>            # 只列出對照表，不寫入（預設）
  python3 _userimg.py <來源資料夾> --write     # 確認無誤後才真的寫

檔名有兩種對法：
  1. 檔名就是 place id（例如 barkers-geraldine.png）→ 直接對，最保險
  2. 檔名對不上 → 依「檔名排序」的順序對到下面的 ORDER
     （螢幕截圖檔名帶時間戳，排序後就是你當初貼上的順序）
"""
import glob, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

MAXW = 1500          # 跟站上既有圖同一個級距
QUALITY = "70"

# 依照使用者貼上的順序（截圖時間戳由早到晚）
ORDER = [
    "barkers-geraldine",
    "tlv-tekapo",
    "greedy-cow-tekapo",
    "mtcook-alpine-salmon",
    "nz-alpine-lavender",
    "glentanner-cafe",
    "hillary-cafe",
    "white-horse-hill",
    "red-tarns",
    "governors-bush",
    "hermitage-guided-hikes",
    "hot-tubs-omarama",
    "high-country-salmon",
    "poppies-cafe-twizel",
    "wrinkly-rams",
    "cinema-paradiso-wanaka",
    "cardrona-distillery",
    "mrs-jones-fruit-stall",
    "provisions-arrowtown",
    "dorothy-browns-cinema",
    "onsen-hot-pools",
    "public-italian-kitchen",
    "mrs-woollys-general-store",
    "glenorchy-lagoon-walkway",
    "fiordland-cinema",
    "the-fat-duck",
    "pio-pio-restaurant",
    "te-unua-museum",
    "lost-gypsy-gallery",
    "tumu-toka-curioscape",
    "moeraki-tavern",
    "star-and-garter",
]

EXTS = (".png", ".jpg", ".jpeg", ".heic", ".webp")


def load_places():
    return json.load(open("data/places.json", encoding="utf-8"))


def to_jpg(src, dst):
    """用 macOS 內建 sips 轉檔＋限制寬度，不需要額外套件。"""
    shutil.copyfile(src, dst + ".tmp")
    subprocess.run(["sips", "-s", "format", "jpeg",
                    "-s", "formatOptions", QUALITY,
                    "--resampleWidth", str(MAXW),
                    dst + ".tmp", "--out", dst],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(dst + ".tmp")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    srcdir = sys.argv[1]
    write = "--write" in sys.argv

    files = sorted(p for p in glob.glob(os.path.join(srcdir, "*"))
                   if p.lower().endswith(EXTS))
    if not files:
        print(f"❌ {srcdir} 裡沒有找到圖檔（{', '.join(EXTS)}）")
        sys.exit(1)

    db = load_places()
    by = {p["id"]: p for p in db["places"]}

    # 先試「檔名＝place id」
    pairs, unmatched = [], []
    for f in files:
        stem = re.sub(r"\.[^.]+$", "", os.path.basename(f))
        if stem in by:
            pairs.append((stem, f))
        else:
            unmatched.append(f)

    mode = "檔名對 id"
    if unmatched:
        # 退回「順序對 ORDER」
        if len(files) != len(ORDER):
            print(f"⚠️  檔案 {len(files)} 個，但 ORDER 有 {len(ORDER)} 個，數量對不上。")
            print("   請確認資料夾裡剛好是那 32 張，或把檔名改成 <place-id>.png 再跑一次。")
            sys.exit(1)
        pairs = list(zip(ORDER, files))
        mode = "順序對 ORDER"

    print(f"對照方式：{mode}　共 {len(pairs)} 組\n")
    bad = False
    for pid, f in pairs:
        p = by.get(pid)
        if not p:
            print(f"❌ 找不到地點 id：{pid}")
            bad = True
            continue
        has = f"（⚠️ 已經有圖 {p['img']}，會被覆蓋）" if p.get("img") else ""
        print(f"  {os.path.basename(f)[:42]:44} → {pid:28} {p['name'][:34]} {has}")
    if bad:
        sys.exit(1)

    if not write:
        print("\n這只是預覽。確認上面的對照沒錯之後，加上 --write 再跑一次。")
        return

    cred = json.load(open("images/credits.json", encoding="utf-8"))
    md_rows = []
    for pid, f in pairs:
        out = f"images/{pid}.jpg"
        to_jpg(f, out)
        by[pid]["img"] = out
        cred[pid] = {
            "file": out,
            "title": by[pid]["name"],
            "lic": "使用者提供",
            "artist": "使用者提供（未確認原始作者）",
            "page": "",
        }
        md_rows.append(f"| `{out}` | {by[pid]['name']} | 使用者提供 | 未確認 | — |")
        print(f"✓ {out}")

    json.dump(db, open("data/places.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump(cred, open("images/credits.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    with open("images/CREDITS.md", "a", encoding="utf-8") as fh:
        fh.write("\n" + "\n".join(md_rows) + "\n")

    print(f"\n寫入完成：{len(pairs)} 張。接著跑 python3 _build.py && python3 _check.py")


if __name__ == "__main__":
    main()
