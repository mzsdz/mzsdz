# -*- coding: utf-8 -*-
"""Fix incomplete jibun-only addresses in places.json / places.js."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXES = {
    "1366939902": "서울특별시 용산구 용산동2가 1-206 해방타워 5층",
    "1792393738": "경기도 안양시 동안구 관양동 1490 1층",
    "1455566641": "경기도 안양시 동안구 관양동 1602-6 무지개상가 지하층 105호~106호",
}


def main() -> None:
    for rel in ("data/places.json", "places.js"):
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        if rel.endswith(".js"):
            data = json.loads(text.replace("window.PLACES = ", "", 1).rstrip().rstrip(";"))
        else:
            data = json.loads(text)

        changed = 0
        for p in data:
            sid = str(p.get("sid") or "")
            if sid in FIXES and p.get("address") != FIXES[sid]:
                p["address"] = FIXES[sid]
                changed += 1

        if rel.endswith(".js"):
            path.write_text(
                "window.PLACES = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
                encoding="utf-8",
            )
        else:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{rel}: updated {changed}")


if __name__ == "__main__":
    main()
