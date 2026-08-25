# 給 Gemini 的照片蒐集委託（購物頁）

把下面這段整個貼給 Gemini，然後把它吐出來的 JSON 原封不動貼回來給我。

---

你是一個幫旅遊網站找圖的助手。下面的 JSON 列出 16 家紐西蘭南島的商店，
每一家都缺一張照片。請幫我逐一找出**可以合法重製的圖片**。

## 硬性規定（違反的話那一筆就作廢）

1. **只接受這幾種授權**：CC0、公有領域（Public Domain）、CC BY、CC BY-SA。
   Instagram、Facebook、Google 商家、TripAdvisor、部落格上的照片**一律不要**，
   除非該頁明確標示是上述授權之一。
2. **必須給我可以直接下載的圖片網址**（結尾是 .jpg / .jpeg / .png），
   不是網頁網址。另外再給我那張圖的來源頁網址。
3. **一定要附上作者姓名與授權名稱**。查不到作者就寫 `"artist": null`，不要編。
4. **照片內容必須真的是那家店或那個地點。** 如果只找得到「同一條街的街景」
   或「同品牌別家分店」，可以給，但 `is_exact` 要填 `false`，並在 `caption_note`
   說明實際拍的是什麼。**寧可誠實標示，也不要讓人以為那就是店面。**
5. **找不到就找不到。** 該筆填 `"found": false` 並在 `why` 說明你查了哪些地方。
   **不要生成、不要用 AI 畫、不要拿無關的圖湊數。**
6. 圖片長邊至少 900 像素。

## 建議的找法

Wikimedia Commons、Wikipedia、Flickr（篩選 CC 授權）、
紐西蘭各地區觀光局的媒體素材庫（例如 newzealand.com 的 media library、
Christchurch NZ、Dunedin NZ、Destination Queenstown 的 media centre）、
紐西蘭國家圖書館與 Te Papa 的開放授權館藏、
以及店家官網上明確標示可自由使用的新聞稿圖片。

## 輸出格式（只輸出這個 JSON，前後不要有其他文字）

```json
{
  "results": [
    {
      "id": "ocho-dunedin",
      "found": true,
      "image_url": "https://.../xxx.jpg",
      "source_page": "https://...",
      "license": "CC BY-SA 4.0",
      "artist": "作者姓名",
      "width": 1600,
      "height": 1067,
      "is_exact": true,
      "caption_note": "OCHO 位於 Roberts Street 的工廠門市外觀",
      "why": ""
    },
    {
      "id": "woolpress-arrowtown",
      "found": false,
      "why": "查了 Commons、Flickr CC、Destination Queenstown 媒體庫，都沒有這家店的可授權照片"
    }
  ]
}
```

---

## 要找的清單

（下面這段 JSON 也一起貼給 Gemini）
```json
{
 "task": "find-images",
 "site": "neilhuang01428.github.io/nz-trip-2026",
 "count": 16,
 "items": [
  {
   "id": "paknsave-queenstown",
   "name": "PAK'nSAVE Queenstown",
   "zh": "伴手禮買最便宜的地方",
   "town": "Queenstown",
   "addr": "302 Hawthorne Drive, Frankton, Queenstown 9300",
   "day": "D08 10/01（四）",
   "url": "https://www.paknsave.co.nz/south-island/otago-and-southland/queenstown",
   "want": "PAK'nSAVE Queenstown（Frankton 店）的店面外觀或招牌；若沒有這一家，紐西蘭任一家 PAK'nSAVE 的外觀也可以，但要註明是哪一家"
  },
  {
   "id": "te-huia-arrowtown",
   "name": "Te Huia Arrowtown",
   "zh": "箭鎮老街上的羊毛衣店",
   "town": "Arrowtown",
   "addr": "38 Buckingham Street, Arrowtown 9302",
   "day": "D07 09/30（三）",
   "url": "https://tehuianz.com/pages/store-locations",
   "want": "Te Huia Arrowtown 店面外觀（38 Buckingham Street）。找不到就用箭鎮 Buckingham Street 老街店屋的街景，並註明那是街景不是店面"
  },
  {
   "id": "woolpress-arrowtown",
   "name": "WoolPress Arrowtown",
   "zh": "一次比較好幾個羊毛品牌",
   "town": "Arrowtown",
   "addr": "Buckingham Street, Arrowtown（門牌查不到）",
   "day": "D07 09/30（三）",
   "url": "",
   "want": "WoolPress Arrowtown 店面外觀或招牌"
  },
  {
   "id": "arrowtown-stonework",
   "name": "Arrowtown Stonework",
   "zh": "看得到師傅在雕的綠玉店",
   "town": "Arrowtown",
   "addr": "32 Buckingham Street, Arrowtown",
   "day": "D07 09/30（三）",
   "url": "https://www.arrowtownstonework.co.nz/",
   "want": "Arrowtown Stonework 店面或工作室櫥窗（32 Buckingham Street），最好看得到師傅在雕的畫面"
  },
  {
   "id": "qt-craft-market",
   "name": "Creative Queenstown Arts & Crafts Market",
   "zh": "湖邊的手作市集，只有週六",
   "town": "Queenstown",
   "addr": "Earnslaw Park, 皇后鎮湖濱",
   "day": "D10 10/03（六）",
   "url": "https://www.queenstownmarket.nz/",
   "want": "皇后鎮湖濱 Earnslaw Park 的週六手作市集攤位實景"
  },
  {
   "id": "macpac-queenstown",
   "name": "Macpac Queenstown",
   "zh": "紐西蘭本土的戶外用品牌",
   "town": "Queenstown",
   "addr": "44 Beach Street, Queenstown 9300",
   "day": "D08 10/01（四）",
   "url": "https://www.macpac.co.nz/store?id=4808",
   "want": "Macpac Queenstown 店面外觀（44 Beach Street）。找不到就用 Beach Street 街景並註明"
  },
  {
   "id": "kathmandu-queenstown",
   "name": "Kathmandu Queenstown",
   "zh": "紐澳到處都有的戶外連鎖",
   "town": "Queenstown",
   "addr": "Mountaineer Retail Building, Beach St 與 Rees St 路口, Queenstown 9300",
   "day": "D08 10/01（四）",
   "url": "https://www.kathmandu.co.nz/pages/store-location/kathmandu-queenstown",
   "want": "Kathmandu Queenstown 店面外觀（Beach St 與 Rees St 路口的 Mountaineer 大樓）"
  },
  {
   "id": "chemist-warehouse-qt",
   "name": "Chemist Warehouse Queenstown",
   "zh": "保健品與藥妝的大賣場",
   "town": "Queenstown",
   "addr": "32 Rees Street, Queenstown 9300",
   "day": "D08 10/01（四）",
   "url": "",
   "want": "Chemist Warehouse Queenstown 店面外觀或招牌（32 Rees Street）。⚠️ 不要拿澳洲分店的照片充數"
  },
  {
   "id": "ocho-dunedin",
   "name": "OCHO",
   "zh": "但尼丁自己救回來的巧克力廠",
   "town": "Dunedin",
   "addr": "10 Roberts Street, Dunedin Central 9016",
   "day": "D13 10/06（二）",
   "url": "https://ocho.co.nz/",
   "want": "OCHO 巧克力工廠門市（10 Roberts Street, Dunedin）的外觀、店內、或 bean to bar 製程"
  },
  {
   "id": "uw-outlet-dunedin",
   "name": "Untouched World Outlet Dunedin",
   "zh": "紐西蘭製羊毛衣的過季店",
   "town": "Dunedin",
   "addr": "Shop 26-28/251 George Street, Dunedin",
   "day": "D13 10/06（二）",
   "url": "https://www.untouchedworld.com/en-us/pages/stores",
   "want": "Untouched World 但尼丁 George Street outlet 的店面；找不到就用該品牌任一門市外觀並註明"
  },
  {
   "id": "uw-outlet-chch",
   "name": "Untouched World Outlet Christchurch",
   "zh": "離機場很近的過季店",
   "town": "Christchurch",
   "addr": "8A Homersham Place, Burnside, Christchurch",
   "day": "D16 10/09（五）",
   "url": "https://www.untouchedworld.com/en-us/pages/stores",
   "want": "Untouched World 基督城 Homersham Place outlet 的店面；找不到就用 155 Roydvale Avenue 旗艦店外觀並註明"
  },
  {
   "id": "geraldine-cheese",
   "name": "The Geraldine Cheese Company",
   "zh": "原本叫 Talbot Forest Cheese",
   "town": "Geraldine",
   "addr": "76 Talbot Street, Geraldine 7930（Four Peaks Plaza 內）",
   "day": "D03 09/26（六）",
   "url": "",
   "want": "The Geraldine Cheese Company（76 Talbot Street, Four Peaks Plaza）店面。⚠️ 舊名是 Talbot Forest Cheese，找的時候兩個名字都試"
  },
  {
   "id": "whitestone-factory-shop",
   "name": "Whitestone Cheese Factory Shop",
   "zh": "工廠直營門市（不是那家餐廳）",
   "town": "Oamaru",
   "addr": "3 Torridge Street, Oamaru 9400",
   "day": "D14 10/07（三）",
   "url": "https://www.whitestonecheese.com/pages/cheese-shop",
   "want": "Whitestone Cheese 工廠直營門市（3 Torridge Street, Oamaru）。⚠️ 不要拿 469 Thames Highway 的 Diner & Deli 餐廳照片，那是另一個地點"
  },
  {
   "id": "slightly-foxed-oamaru",
   "name": "Slightly Foxed Secondhand Books",
   "zh": "白石老街上的舊書店",
   "town": "Oamaru",
   "addr": "11 Tyne Street, Oamaru（維多利亞老街區）",
   "day": "D14 10/07（三）",
   "url": "",
   "want": "Slightly Foxed 舊書店（11 Tyne Street, Oamaru）的店面或店內書架"
  },
  {
   "id": "simply-nz-teanau",
   "name": "Simply New Zealand Te Anau",
   "zh": "蒂阿瑙的紐西蘭禮品店",
   "town": "Te Anau",
   "addr": "Town Centre 與 Te Anau Terrace 路口, Te Anau",
   "day": "D10 10/03（六）",
   "url": "",
   "want": "Simply New Zealand Te Anau 店面；找不到就用蒂阿瑙鎮中心街景並註明"
  },
  {
   "id": "hermitage-retail",
   "name": "Hermitage Retail Centre",
   "zh": "庫克山村唯一的店",
   "town": "Mt Cook",
   "addr": "The Hermitage Hotel, Aoraki／Mount Cook Village",
   "day": "D05 09/28（一）",
   "url": "https://www.hermitage.co.nz/experience/hermitage-retail-centre",
   "want": "The Hermitage 飯店裡的 Hermitage Retail Centre 賣店；找不到就用 The Hermitage 飯店外觀並註明"
  }
 ]
}```
