#!/usr/bin/env python3
"""下載候選圖並拼成接觸表，一次看一批確認內容對不對。

Commons 上「檔名對但內容不對」很常見（查過一張學名正確的奇異鳥，
實際是苔蘚上的幾根羽毛），所以每張都要人看過才用。
"""
import json, os, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

CELL_W, CELL_H, PAD, LABEL_H = 300, 200, 8, 34
COLS = 4


def font(sz):
    for f in ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
              "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def fetch(url, out):
    if os.path.exists(out) and os.path.getsize(out) > 4000:
        return True
    r = subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0 NZTripPlanner/1.0",
                        url, "-o", out], capture_output=True)
    return os.path.exists(out) and os.path.getsize(out) > 4000


def main():
    ids = sys.argv[2:]
    tag = sys.argv[1]
    sc = json.load(open("scratchpad/img/scored.json", encoding="utf-8"))
    os.makedirs("scratchpad/img/dl", exist_ok=True)
    items = []
    for pid in ids:
        v = sc.get(pid)
        if not v or not v.get("best"):
            print(f"  ✗ {pid} 沒有候選"); continue
        h = v["best"]
        out = f"scratchpad/img/dl/{pid}.jpg"
        if fetch(h["thumb"], out):
            items.append((pid, out, h["title"][5:]))
        else:
            print(f"  ✗ {pid} 下載失敗")

    rows = (len(items) + COLS - 1) // COLS
    W = COLS * (CELL_W + PAD) + PAD
    H = rows * (CELL_H + LABEL_H + PAD) + PAD
    sheet = Image.new("RGB", (W, H), (28, 32, 36))
    dr = ImageDraw.Draw(sheet)
    f1, f2 = font(13), font(10)
    for i, (pid, path, title) in enumerate(items):
        cx = PAD + (i % COLS) * (CELL_W + PAD)
        cy = PAD + (i // COLS) * (CELL_H + LABEL_H + PAD)
        try:
            im = Image.open(path).convert("RGB")
            im.thumbnail((CELL_W, CELL_H))
            sheet.paste(im, (cx + (CELL_W - im.width) // 2,
                             cy + (CELL_H - im.height) // 2))
        except Exception as e:
            dr.text((cx + 6, cy + 6), f"壞檔 {e}", fill=(255, 90, 90), font=f2)
        dr.text((cx, cy + CELL_H + 3), f"{i+1}. {pid}", fill=(255, 214, 120), font=f1)
        dr.text((cx, cy + CELL_H + 19), textwrap.shorten(title, 46, placeholder="…"),
                fill=(150, 168, 180), font=f2)
    out = f"scratchpad/img/sheet_{tag}.png"
    sheet.save(out)
    print(f"✓ {out}（{len(items)} 張）")


main()
