# -*- coding: utf-8 -*-
"""Import Naver Map shared bookmark JSON into places.json / places.js."""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
RAW = BASE / "raw"
DATA = BASE / "data"

SHARES = [
    {
        "path": RAW / "share_1star.json",
        "stars": 1,
        "fallback_list": "1보검",
    },
    {
        "path": RAW / "share_2star.json",
        "stars": 2,
        "fallback_list": "2보검",
    },
    {
        "path": RAW / "share_unvisited.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
    {
        "path": RAW / "share_unvisited_1.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
    {
        "path": RAW / "share_unvisited_2.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
    {
        "path": RAW / "share_unvisited_3.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
    {
        "path": RAW / "share_unvisited_4.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
    {
        "path": RAW / "share_unvisited_5.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
    {
        "path": RAW / "share_unvisited_6.json",
        "stars": 0,
        "fallback_list": "미방문",
    },
]


def folder_name(payload: dict, fallback: str) -> str:
    folder = payload.get("folder") or {}
    name = folder.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return fallback


def pick_address(bm: dict) -> str:
    for key in (
        "address",
        "roadAddress",
        "jibunAddress",
        "addr",
        "fullAddress",
        "shortAddress",
    ):
        val = bm.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    place = bm.get("placeInfo")
    if isinstance(place, dict):
        for key in ("address", "roadAddress", "jibunAddress", "addr"):
            val = place.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return ""


def pick_category(bm: dict) -> str:
    for key in ("mcidName", "category", "cat", "categoryName", "mcid"):
        val = bm.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    place = bm.get("placeInfo")
    if isinstance(place, dict):
        for key in ("category", "cat", "categoryName", "mcidName"):
            val = place.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return "기타"


def map_bookmark(bm: dict, stars: int, list_name: str) -> dict:
    place = {
        "name": (bm.get("name") or bm.get("displayName") or "").strip() or "(이름없음)",
        "category": pick_category(bm),
        "address": pick_address(bm),
        "list": list_name,
        "stars": stars,
    }
    # optional coords when present
    if bm.get("px") is not None:
        try:
            place["px"] = float(bm["px"])
        except (TypeError, ValueError):
            pass
    if bm.get("py") is not None:
        try:
            place["py"] = float(bm["py"])
        except (TypeError, ValueError):
            pass
    sid = bm.get("sid")
    if sid is not None and str(sid).strip():
        place["sid"] = str(sid).strip()
    return place


def load_share(cfg: dict) -> list[dict]:
    path = cfg["path"]
    payload = json.loads(path.read_text(encoding="utf-8"))
    list_name = folder_name(payload, cfg["fallback_list"])
    stars = cfg["stars"]
    bookmarks = payload.get("bookmarkList") or []
    return [map_bookmark(bm, stars, list_name) for bm in bookmarks if isinstance(bm, dict)]


def main() -> None:
    places: list[dict] = []
    for cfg in SHARES:
        if not cfg["path"].is_file():
            raise SystemExit(f"Missing: {cfg['path']}")
        batch = load_share(cfg)
        print(f"Loaded {cfg['path'].name}: {len(batch)} places (stars={cfg['stars']})")
        places.extend(batch)

    # Prefer higher stars when the same place appears in multiple lists.
    # Among equal stars, keep the first occurrence.
    merged: list[dict] = []
    by_sid: dict[str, int] = {}
    no_sid: list[dict] = []
    skipped = 0
    for place in places:
        sid = str(place.get("sid") or "").strip()
        if not sid:
            no_sid.append(place)
            continue
        if sid in by_sid:
            idx = by_sid[sid]
            if int(place.get("stars") or 0) > int(merged[idx].get("stars") or 0):
                merged[idx] = place
            skipped += 1
            continue
        by_sid[sid] = len(merged)
        merged.append(place)
    places = merged + no_sid
    if skipped:
        print(f"Deduped by sid: skipped {skipped} duplicate rows")

    DATA.mkdir(parents=True, exist_ok=True)
    out_json = DATA / "places.json"
    out_js = BASE / "places.js"

    out_json.write_text(
        json.dumps(places, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    out_js.write_text(
        "window.PLACES = "
        + json.dumps(places, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    missing_addr = sum(1 for p in places if not p.get("address"))
    # "기타" means we fell back — also count empty category if any
    missing_cat = sum(
        1
        for p in places
        if not p.get("category") or p.get("category") == "기타"
    )
    # distinguish true missing vs default 기타 that came from empty fields
    default_기타 = sum(1 for p in places if p.get("category") == "기타")
    with_coords = sum(1 for p in places if "px" in p and "py" in p)

    print("---")
    print(f"Total places: {len(places)}")
    print(f"  unvisited: {sum(1 for p in places if p['stars'] == 0)}")
    print(f"  1-star: {sum(1 for p in places if p['stars'] == 1)}")
    print(f"  2-star: {sum(1 for p in places if p['stars'] == 2)}")
    print(f"  3-star: {sum(1 for p in places if p['stars'] == 3)}")
    print(f"Missing address: {missing_addr}")
    print(f"Category fallback '기타': {default_기타}")
    print(f"With px/py coords: {with_coords}")
    print(f"Wrote {out_json}")
    print(f"Wrote {out_js}")

    # Field note for operators
    print("---")
    print(
        "Note: bookmark payload has 'address' and category via 'mcidName' "
        "(also 'mcid'); no separate roadAddress/jibunAddress in sample."
    )


if __name__ == "__main__":
    main()
