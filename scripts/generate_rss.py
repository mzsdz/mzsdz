# -*- coding: utf-8 -*-
"""Generate rss.xml from places.json for Naver Search Advisor etc."""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACES_JSON = ROOT / "data" / "places.json"
OUT = ROOT / "rss.xml"
SITE = "https://mzsdz.com"
MAX_ITEMS = 100


def esc(s: str) -> str:
    return html.escape(str(s or ""), quote=True)


def main() -> None:
    places = json.loads(PLACES_JSON.read_text(encoding="utf-8"))
    ranked = sorted(
        (p for p in places if p.get("sid") and p.get("name")),
        key=lambda p: (-int(p.get("stars") or 0), str(p.get("name"))),
    )
    # Prefer visited (★★ / ★); skip bulk 맛집 후보 for a cleaner feed
    visited = [p for p in ranked if int(p.get("stars") or 0) >= 1]
    picks = (visited or ranked)[:MAX_ITEMS]

    now = format_datetime(datetime.now(timezone.utc))
    items = []
    for p in picks:
        sid = str(p["sid"])
        name = str(p["name"]).strip()
        address = str(p.get("address") or "").strip()
        category = str(p.get("category") or "").strip()
        stars = int(p.get("stars") or 0)
        star_label = {3: "★★★", 2: "★★", 1: "★"}.get(stars, "맛집 후보")
        link = f"{SITE}/?q={html.escape(name, quote=False)}"
        # Use + for query spaces in URL without full urllib for readability in RSS
        from urllib.parse import quote

        link = f"{SITE}/?q={quote(name)}"
        desc_parts = [star_label]
        if category:
            desc_parts.append(category)
        if address:
            desc_parts.append(address)
        description = " · ".join(desc_parts)
        guid = f"{SITE}/place/{sid}"
        items.append(
            f"""    <item>
      <title>{esc(name)}</title>
      <link>{esc(link)}</link>
      <guid isPermaLink="false">{esc(guid)}</guid>
      <description>{esc(description)}</description>
      <pubDate>{now}</pubDate>
    </item>"""
        )

    body = "\n".join(items)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>맛집신동진</title>
    <link>{SITE}/</link>
    <description>별점·지역·종류로 찾아보는 맛집 리스트</description>
    <language>ko</language>
    <lastBuildDate>{now}</lastBuildDate>
{body}
  </channel>
</rss>
"""
    OUT.write_text(xml, encoding="utf-8")
    print(f"wrote {OUT} ({len(picks)} items)")


if __name__ == "__main__":
    main()
