# -*- coding: utf-8 -*-
"""Emit compact backfill chunks as JSON for MCP/SQL apply."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METRO = {"서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"}


def normalize_sido(raw: str) -> str | None:
    s = (raw or "").strip()
    mapping = [
        ("서울", "서울"), ("부산", "부산"), ("대구", "대구"), ("인천", "인천"),
        ("광주", "광주"), ("대전", "대전"), ("울산", "울산"), ("세종", "세종"),
        ("경기", "경기"), ("강원", "강원"),
        ("충북", "충북"), ("충청북", "충북"),
        ("충남", "충남"), ("충청남", "충남"),
        ("전북", "전북"), ("전라북", "전북"),
        ("전남", "전남"), ("전라남", "전남"),
        ("경북", "경북"), ("경상북", "경북"),
        ("경남", "경남"), ("경상남", "경남"),
        ("제주", "제주"),
    ]
    for a, b in mapping:
        if s.startswith(a):
            return b
    return None


def parse_path(address: str):
    parts = (address or "").split()
    if not parts:
        return None, None, None
    sido = normalize_sido(parts[0])
    if not sido:
        return None, None, None
    city = None
    district = None
    second = parts[1] if len(parts) > 1 else ""
    third = parts[2] if len(parts) > 2 else ""
    if sido in METRO:
        if second.endswith("구"):
            district = second
    elif re.search(r"(시|군)$", second):
        city = re.sub(r"(시|군)$", "", second)
        if third.endswith("구"):
            district = third
    elif second.endswith("구"):
        district = second
    return sido, city, district


def esc(s: str) -> str:
    return s.replace("'", "''")


def main() -> None:
    places = json.loads((ROOT / "data" / "places.json").read_text(encoding="utf-8"))
    pairs = []
    seen = set()
    for p in places:
        sid = str(p.get("sid") or "").strip()
        if not sid:
            continue
        sido, city, district = parse_path(p.get("address") or "")
        for label in (sido, city, district):
            if not label:
                continue
            key = (sid, label.lower())
            if key in seen:
                continue
            seen.add(key)
            pairs.append((sid, label))

    chunk_size = 400
    out_dir = ROOT / "raw" / "_backfill_chunks"
    out_dir.mkdir(parents=True, exist_ok=True)
    for i in range(0, len(pairs), chunk_size):
        chunk = pairs[i : i + chunk_size]
        values = ",\n".join(f"('{esc(sid)}', '{esc(label)}')" for sid, label in chunk)
        sql = f"""with wanted(place_sid, label) as (
  values
{values}
)
insert into public.place_tags (place_sid, kind, label)
select w.place_sid, 'region', w.label
from wanted w
where not exists (
  select 1 from public.place_tags t
  where t.place_sid = w.place_sid
    and t.kind = 'region'
    and lower(trim(t.label)) = lower(trim(w.label))
);"""
        path = out_dir / f"chunk_{i // chunk_size:03d}.sql"
        path.write_text(sql, encoding="utf-8")
    print(f"{len(pairs)} pairs -> {(len(pairs) + chunk_size - 1) // chunk_size} chunks in {out_dir}")


if __name__ == "__main__":
    main()
