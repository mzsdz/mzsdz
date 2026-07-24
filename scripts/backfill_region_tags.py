# -*- coding: utf-8 -*-
"""Build SQL to backfill missing region sido/city/district tags from addresses."""
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


def parse_path(address: str) -> tuple[str | None, str | None, str | None]:
    parts = (address or "").split()
    if not parts:
        return None, None, None
    # legal dong shortcut: 용산동2가
    m = re.match(r"^(.+?)동\d*가$", parts[0])
    if m:
        district = m.group(1) + "구"
        # only unambiguous from earlier map — skip here; address usually full
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


def main() -> None:
    places = json.loads((ROOT / "data" / "places.json").read_text(encoding="utf-8"))
    rows = []
    for p in places:
        sid = str(p.get("sid") or "").strip()
        if not sid:
            continue
        sido, city, district = parse_path(p.get("address") or "")
        for label in (sido, city, district):
            if label:
                rows.append((sid, label))

    # dedupe
    seen = set()
    uniq = []
    for sid, label in rows:
        key = (sid, label.lower())
        if key in seen:
            continue
        seen.add(key)
        uniq.append((sid, label))

    out = ROOT / "raw" / "_backfill_region_tags.sql"
    lines = [
        "-- Backfill missing region hierarchy tags from place addresses",
        "with wanted(place_sid, label) as (",
        "  values",
    ]
    value_lines = [f"    ('{sid}', '{label.replace(chr(39), chr(39)+chr(39))}')" for sid, label in uniq]
    # chunk values for readability — single statement
    lines.append(",\n".join(value_lines))
    lines.append(")")
    lines.append(
        """insert into public.place_tags (place_sid, kind, label)
select w.place_sid, 'region', w.label
from wanted w
where not exists (
  select 1 from public.place_tags t
  where t.place_sid = w.place_sid
    and t.kind = 'region'
    and lower(trim(t.label)) = lower(trim(w.label))
);
"""
    )
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out} ({len(uniq)} pairs)")


if __name__ == "__main__":
    main()
