#!/usr/bin/env python3
"""把 subagent 產出的深度知識合併進 places.json（可重複執行）。"""
import json, glob, os, sys
SP="/private/tmp/claude-501/-Users-huangkunyi-claude-research-newzealand/0f53e62d-748b-45f2-a255-a22fbbce0401/scratchpad/deep"
p="data/places.json"
d=json.load(open(p,encoding="utf-8"))
byid={x["id"]:x for x in d["places"]}

added=0; unknown=[]; files=[]
for f in sorted(glob.glob(f"{SP}/out_A*.json")):
    files.append(os.path.basename(f))
    for rec in json.load(open(f,encoding="utf-8")):
        pid=rec.get("id"); dp=rec.get("deep")
        if not pid or not dp: continue
        if pid not in byid:
            unknown.append((os.path.basename(f), pid)); continue
        # 清掉空 tips
        dp["tips"]=[t for t in (dp.get("tips") or []) if t and t.strip()]
        dp["paras"]=[t for t in (dp.get("paras") or []) if t and t.strip()]
        if not dp.get("lead") or not dp["paras"]: continue
        byid[pid]["deep"]=dp; added+=1

json.dump(d,open(p,"w",encoding="utf-8"),ensure_ascii=False,indent=1)
have=sum(1 for x in d["places"] if x.get("deep"))
print(f"讀入檔案：{', '.join(files)}")
print(f"本次寫入 {added} 則；places.json 目前共 {have}/{len(d['places'])} 個地點有深度知識")
if unknown:
    print("⚠️ 對不到的 id：")
    for f,i in unknown: print(f"   {f}: {i}")
# 品質快檢
short=[x["id"] for x in d["places"] if x.get("deep") and
       sum(len(t) for t in x["deep"]["paras"])<60]
if short: print("⚠️ 內容過短，需人工檢視：", short)
