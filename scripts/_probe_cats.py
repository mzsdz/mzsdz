import json, re, urllib.request
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parents[1]

# ===== 1) places.js category top 30 =====
text = (root / "places.js").read_text(encoding="utf-8")
m = re.search(r"window\.PLACES\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
places = json.loads(m.group(1))
cats = [p.get("category") for p in places]
ctr = Counter(cats)
print("=== 1) Category Counter from places.js (top 30) ===")
print(f"total places: {len(places)}  unique categories: {len(ctr)}")
for k, v in ctr.most_common(30):
    print(f"{v:6d}  {k}")

# ===== 2) share_1star mcidName =====
data = json.loads((root / "raw" / "share_1star.json").read_text(encoding="utf-8"))
bookmarks = data.get("bookmarkList") or []
print("\n=== 2) unique mcidName from raw/share_1star.json ===")
print(f"bookmarkList len: {len(bookmarks)}")
mcids = [b.get("mcidName") for b in bookmarks if isinstance(b, dict)]
ctr2 = Counter(mcids)
print(f"total: {len(mcids)}  unique: {len(ctr2)}")
for k, v in ctr2.most_common():
    print(f"{v:6d}  {k!r}")

# ===== 3) nested richer category / placeInfo =====
print("\n=== 3) nested fields / placeInfo / mismatch / folderMappings ===")
if bookmarks:
    b0 = bookmarks[0]
    print("sample bookmark keys:", sorted(b0.keys()))
    for k in sorted(b0.keys()):
        v = b0[k]
        if isinstance(v, dict):
            print(f"  nested dict {k}: keys={list(v.keys())}")
        elif isinstance(v, list):
            print(f"  nested list {k}: len={len(v)}")

found = None
for b in bookmarks:
    if isinstance(b, dict) and b.get("placeInfo") is not None:
        found = b
        break
if found is None:
    def find_pi(o):
        if isinstance(o, dict):
            if "placeInfo" in o and o.get("placeInfo") is not None:
                return o
            for vv in o.values():
                r = find_pi(vv)
                if r is not None:
                    return r
        elif isinstance(o, list):
            for vv in o:
                r = find_pi(vv)
                if r is not None:
                    return r
        return None
    found = find_pi(data)

if found is None:
    print("No bookmark with non-null placeInfo found")
else:
    print("One bookmark with non-null placeInfo:")
    s = json.dumps(found, ensure_ascii=False, indent=2)
    print(s[:4000])
    if len(s) > 4000:
        print(f"... [truncated, total chars {len(s)}]")

def deep_get_key(o, key, depth=0):
    if depth > 20:
        return None
    if isinstance(o, dict):
        if key in o:
            return o[key]
        for vv in o.values():
            r = deep_get_key(vv, key, depth + 1)
            if r is not None:
                return r
    elif isinstance(o, list):
        for vv in o[:50]:
            r = deep_get_key(vv, key, depth + 1)
            if r is not None:
                return r
    return None

bmi = deep_get_key(data, "bookmarkMismatchInfo")
fm = deep_get_key(data, "folderMappings")
folder = data.get("folder")
print("top-level keys:", list(data.keys()))
if isinstance(folder, dict):
    print("folder keys:", list(folder.keys()))
print("bookmarkMismatchInfo:", type(bmi).__name__, end=" ")
if isinstance(bmi, dict):
    print("keys:", list(bmi.keys()))
elif bmi is None:
    print("(not found)")
else:
    print(repr(bmi)[:200])
print("folderMappings:", type(fm).__name__, end=" ")
if isinstance(fm, dict):
    print("keys:", list(fm.keys())[:40], f"(count={len(fm)})")
elif isinstance(fm, list):
    print(f"len={len(fm)} first_keys={list(fm[0].keys()) if fm and isinstance(fm[0], dict) else None}")
elif fm is None:
    print("(not found)")
else:
    print(repr(fm)[:200])

richer = []
for b in bookmarks:
    if not isinstance(b, dict):
        continue
    extras = {}
    for k, v in b.items():
        if ("cate" in k.lower()) or ("mcid" in k.lower()) or k in ("placeInfo", "bizCategory", "category"):
            extras[k] = v
        if isinstance(v, dict):
            for kk, vv in v.items():
                if ("cate" in kk.lower()) or ("mcid" in kk.lower()) or kk in ("category", "categoryName"):
                    extras[f"{k}.{kk}"] = vv
    if any(k not in ("mcidName", "mcid") for k in extras):
        richer.append(extras)
print(f"bookmarks with category-ish fields beyond mcidName: {len(richer)}")
if richer:
    print("example richer fields:", json.dumps(richer[0], ensure_ascii=False)[:500])

# ===== 4) fetch APIs =====
print("\n=== 4) Fetch place detail sid=1699639908 ===")
sid = "1699639908"
urls = [
    f"https://map.naver.com/v5/api/sites/summary/{sid}?lang=ko",
    f"https://pcmap.place.naver.com/restaurant/{sid}/home",
    f"https://map.naver.com/v5/api/panels/place/{sid}",
]
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://map.naver.com/",
}
for url in urls:
    print("\n---", url)
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=25) as resp:
            status = resp.status
            body = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            print(f"status: {status}  content-type: {ctype}  bytes: {len(body)}")
            text = body.decode("utf-8", errors="replace")
            try:
                j = json.loads(text)
                s = json.dumps(j, ensure_ascii=False)
                print("JSON first 400 chars:")
                print(s[:400])
            except Exception:
                print("Not JSON; first 400 chars:")
                print(text[:400])
    except Exception as e:
        code = getattr(e, "code", None)
        print(f"ERROR: {type(e).__name__} code={code} {e}")
        if hasattr(e, "read"):
            try:
                t = e.read().decode("utf-8", errors="replace")
                print("error body first 400:")
                print(t[:400])
            except Exception:
                pass
