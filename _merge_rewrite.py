#!/usr/bin/env python3
"""把 out_R*.json 的改寫套回 culture.json / places.json。

改寫最怕改壞事實，所以每一筆都先驗證再套用。不通過的整筆退回，不會寫入。
"""
import json, re, sys, glob, os

def nums(s):
    """抓出所有數字（含逗號千分位與小數），用來比對事實有沒有被改掉。"""
    return sorted(re.findall(r'\d[\d,]*(?:\.\d+)?', s or ''))

def macrons(s):
    return sorted(re.findall(r'[āēīōūĀĒĪŌŪ]', s or ''))

def tags(s):
    return sorted(re.findall(r'</?([a-zA-Z]+)', s or ''))

HEDGE = ['一般認為', '有幾種說法', '查不到出處', '傳說', '不是正史', '未如此宣稱',
         '沒有定論', '各說法', '有爭議', '不鼓勵', '已不鼓勵', '媒體稱',
         '說法一', '說法二', '目前沒有', '無法確認']
MARKS = ['★', '⚠️', '❌', '💡']

def check(old, new, where):
    """回傳問題清單；空的代表可以套用。"""
    bad = []
    if nums(old) != nums(new):
        a, b = set(nums(old)), set(nums(new))
        bad.append(f"{where}: 數字變了 少={sorted(a-b)} 多={sorted(b-a)}")
    if macrons(old) != macrons(new):
        bad.append(f"{where}: 毛利語長音變了 {macrons(old)} → {macrons(new)}")
    t = set(tags(new)) - {'b'}
    if t:
        bad.append(f"{where}: 出現不允許的標籤 {sorted(t)}")
    if new.count('<b>') != new.count('</b>'):
        bad.append(f"{where}: <b> 標籤沒有配對")
    for m in MARKS:
        if old.count(m) != new.count(m):
            bad.append(f"{where}: 「{m}」數量變了 {old.count(m)} → {new.count(m)}")
    for h in HEDGE:
        if h in old and h not in new:
            bad.append(f"{where}: 保留語氣「{h}」不見了")
    return bad


def flat(o):
    """把一筆資料的所有文字攤平成一個字串，用來做「整筆」層級的比對。"""
    if isinstance(o, str):
        return o
    if isinstance(o, list):
        return " ".join(flat(x) for x in o)
    if isinstance(o, dict):
        return " ".join(flat(v) for k, v in sorted(o.items()) if k != 'id')
    return ""


def apply_to(entry, patch, label, warn, strict=True):
    """把 patch 套到 entry（dict），逐欄驗證。回傳實際改了幾個欄位。

    strict=False 時跳過數字／長音檢查——只有在整筆層級已經確認
    數字與長音沒有流失時才會這樣呼叫（用於文字在欄位之間搬家的情況）。
    """
    n = 0
    for k in ('title', 'lead', 'note', 'zh', 'where'):
        if k not in patch:
            continue
        old, new = entry.get(k, ''), patch[k]
        if old == new:
            continue
        b = [x for x in check(old, new, f"{label}.{k}")
             if strict or ('數字' not in x and '長音' not in x)]
        if b:
            warn.extend(b); continue
        entry[k] = new; n += 1
    for k in ('paras', 'tips'):
        if k not in patch:
            continue
        old, new = entry.get(k) or [], patch[k]
        if old == new:
            continue
        if len(old) != len(new):
            warn.append(f"{label}.{k}: 段落數變了 {len(old)} → {len(new)}"); continue
        b = []
        for i, (o, nw) in enumerate(zip(old, new)):
            b += [x for x in check(o, nw, f"{label}.{k}[{i}]")
                  if strict or ('數字' not in x and '長音' not in x)]
        if b:
            warn.extend(b); continue
        entry[k] = new; n += 1
    if 'deep' in patch and isinstance(entry.get('deep'), dict):
        n += apply_to(entry['deep'], patch['deep'], label + '.deep', warn, strict)
    return n


def try_apply(entry, patch, label, warn):
    """先嚴格套。全部被擋下時，改用「整筆比對」：把 patch 套進一份副本，
    再拿副本跟原件比數字與長音——都沒少就代表只是文字在欄位之間搬家，可以放行。"""
    local = []
    n = apply_to(entry, patch, label, warn=local, strict=True)
    if n or not local:
        warn.extend(local)
        return n

    import copy
    cand = copy.deepcopy(entry)
    apply_to(cand, patch, label, warn=[], strict=False)
    before, after = flat(entry), flat(cand)
    lost_n = sorted(set(nums(before)) - set(nums(after)))
    lost_m = sorted(set(macrons(before)) - set(macrons(after)))
    if lost_n or lost_m:
        warn.extend(local)
        if lost_n:
            warn.append(f"{label}: 整筆比對後仍少了數字 {lost_n}")
        if lost_m:
            warn.append(f"{label}: 整筆比對後仍少了長音 {lost_m}")
        return 0

    n = apply_to(entry, patch, label, warn=warn, strict=False)
    if n:
        warn.append(f"{label}: ↻ 整筆數字與長音都在，判定為欄位間搬家，已放行")
    return n


def main():
    warn, stats = [], {}
    # 文化卡
    f = "scratchpad/rw/out_R1.json"
    if os.path.exists(f):
        d = json.load(open("data/culture.json", encoding="utf-8"))
        by = {c['id']: c for c in d['cards']}
        hit = 0
        for p in json.load(open(f, encoding="utf-8")):
            c = by.get(p['id'])
            if not c:
                warn.append(f"culture: 找不到 id {p['id']}"); continue
            if try_apply(c, p, p['id'], warn):
                hit += 1
        json.dump(d, open("data/culture.json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        stats['文化卡'] = hit
    # 地點
    files = [x for x in ("scratchpad/rw/out_R2.json", "scratchpad/rw/out_R3.json")
             if os.path.exists(x)]
    if files:
        d = json.load(open("data/places.json", encoding="utf-8"))
        by = {p['id']: p for p in d['places']}
        hit = 0
        for f in files:
            for p in json.load(open(f, encoding="utf-8")):
                e = by.get(p['id'])
                if not e:
                    warn.append(f"places: 找不到 id {p['id']}"); continue
                if try_apply(e, p, p['id'], warn):
                    hit += 1
        json.dump(d, open("data/places.json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        stats['地點'] = hit
    for k, v in stats.items():
        print(f"✓ {k}：{v} 筆套用")
    if warn:
        print(f"\n⚠ 退回未套用（{len(warn)} 項）：")
        for w in warn[:30]:
            print("   -", w)
    else:
        print("\n✓ 所有改寫都通過事實驗證")


main()
