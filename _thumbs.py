#!/usr/bin/env python3
"""把 images/*.jpg 產生一份 640px 寬的 WebP 縮圖到 images/t/。

卡片上的圖只顯示約 400px 寬，卻載 1500px 的原圖——這是整站最大的頻寬浪費。
原圖保留不動（授權與備份都靠它），網頁載的是這裡產生的縮圖。
需要 cwebp（brew install webp）。
"""
import os, glob, subprocess, sys

SRC, OUT, W, Q = "images", "images/t", 640, 68
os.makedirs(OUT, exist_ok=True)
if not subprocess.run(["which", "cwebp"], capture_output=True).stdout:
    sys.exit("找不到 cwebp，請先 brew install webp")

made = skipped = 0
before = after = 0
for jpg in sorted(glob.glob(f"{SRC}/*.jpg")):
    name = os.path.basename(jpg)[:-4]
    webp = f"{OUT}/{name}.webp"
    before += os.path.getsize(jpg)
    if os.path.exists(webp) and os.path.getmtime(webp) >= os.path.getmtime(jpg):
        after += os.path.getsize(webp); skipped += 1; continue
    subprocess.run(["cwebp", "-q", str(Q), "-resize", str(W), "0", "-quiet", jpg, "-o", webp],
                   check=True)
    after += os.path.getsize(webp); made += 1
    print(f"  ✓ {name:42} {os.path.getsize(jpg)/1024:5.0f} KB → {os.path.getsize(webp)/1024:4.0f} KB")

print(f"\n新產生 {made} 張、沿用 {skipped} 張")
print(f"原圖合計 {before/1024/1024:.1f} MB → 縮圖合計 {after/1024/1024:.1f} MB "
      f"（{(1-after/before)*100:.0f}% 省下）")
