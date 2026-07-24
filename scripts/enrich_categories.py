# -*- coding: utf-8 -*-
"""Restore specific food categories onto places.js / places.json.

1) Parse raw/list1.txt (name+category pasted lines)
2) Infer from place name keywords when still generic (음식점/기타/…)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIST1 = ROOT / "raw" / "list1.txt"
PLACES_JSON = ROOT / "data" / "places.json"
PLACES_JS = ROOT / "places.js"

# Longest-first for endswith matching on paste lines
CATEGORIES = sorted(
    [
        "다이어트,샐러드",
        "카페,디저트",
        "백숙,삼계탕",
        "순대,순댓국",
        "족발,보쌈",
        "곱창,막창,양",
        "곰탕,설렁탕",
        "칼국수,만두",
        "장어,먹장어요리",
        "육류,고기요리",
        "맥주,호프",
        "백반,가정식",
        "아귀찜,해물찜",
        "멕시코,남미음식",
        "스파게티,파스타전문",
        "사철,영양탕",
        "전,빈대떡",
        "치킨,닭강정",
        "일본식라면",
        "돼지고기구이",
        "소고기구이",
        "브런치카페",
        "베트남음식",
        "인도음식",
        "아시아음식",
        "프랑스음식",
        "이탈리아음식",
        "멕시코음식",
        "일식당",
        "중식당",
        "한식당",
        "요리주점",
        "포장마차",
        "종합분식",
        "노래방",
        "정육점",
        "베이커리",
        "호두과자",
        "샌드위치",
        "마라탕",
        "한정식",
        "닭볶음탕",
        "조개요리",
        "술집",
        "주류",
        "카레",
        "베이글",
        "브런치",
        "김밥",
        "국수",
        "냉면",
        "돈가스",
        "치킨",
        "카페",
        "한식",
        "양꼬치",
        "닭갈비",
        "국밥",
        "생선회",
        "추어탕",
        "감자탕",
        "해장국",
        "이자카야",
        "바(BAR)",
        "덮밥",
        "만두",
        "떡류제조",
        "수산물",
        "보리밥",
        "이용원",
        "햄버거",
        "닭요리",
        "쌈밥",
        "피자",
        "스테이크",
        "샤브샤브",
        "뷔페",
        "디저트",
        "아이스크림",
        "와인",
        "칵테일",
        "바",
        "BAR",
        "양식",
        "중식",
        "일식",
        "분식",
        "횟집",
        "초밥",
        "스시",
        "라멘",
        "우동",
        "소바",
        "떡볶이",
        "족발",
        "보쌈",
        "곱창",
        "막창",
        "삼겹살",
        "갈비",
        "갈비탕",
        "설렁탕",
        "곰탕",
        "삼계탕",
        "족발보쌈",
        "해물",
        "조개",
        "게장",
        "간장게장",
        "양념게장",
        "족발·보쌈",
    ],
    key=len,
    reverse=True,
)

GENERIC = {"음식점", "기타", "일반", "여가", "생활/문화", ""}

# name substring → category (longest first)
NAME_HINTS = sorted(
    [
        ("일본식라면", "일본식라면"),
        ("라멘", "일본식라면"),
        ("라면", "일본식라면"),
        ("우동", "우동"),
        ("소바", "소바"),
        ("스시", "초밥"),
        ("초밥", "초밥"),
        ("횟집", "생선회"),
        ("회집", "생선회"),
        ("모듬회", "생선회"),
        ("생선회", "생선회"),
        ("돈가스", "돈가스"),
        ("돈까스", "돈가스"),
        ("카레", "카레"),
        ("국수", "국수"),
        ("칼국수", "칼국수,만두"),
        ("냉면", "냉면"),
        ("김밥", "김밥"),
        ("떡볶이", "떡볶이"),
        ("분식", "종합분식"),
        ("치킨", "치킨,닭강정"),
        ("닭강정", "치킨,닭강정"),
        ("닭갈비", "닭갈비"),
        ("삼계탕", "백숙,삼계탕"),
        ("백숙", "백숙,삼계탕"),
        ("감자탕", "감자탕"),
        ("해장국", "해장국"),
        ("국밥", "국밥"),
        ("설렁탕", "곰탕,설렁탕"),
        ("곰탕", "곰탕,설렁탕"),
        ("순대", "순대,순댓국"),
        ("족발", "족발,보쌈"),
        ("보쌈", "족발,보쌈"),
        ("곱창", "곱창,막창,양"),
        ("막창", "곱창,막창,양"),
        ("양꼬치", "양꼬치"),
        ("삼겹", "돼지고기구이"),
        ("갈비", "육류,고기요리"),
        ("스테이크", "스테이크"),
        ("파스타", "스파게티,파스타전문"),
        ("스파게티", "스파게티,파스타전문"),
        ("피자", "피자"),
        ("햄버거", "햄버거"),
        ("버거", "햄버거"),
        ("브런치", "브런치"),
        ("베이글", "베이글"),
        ("베이커리", "베이커리"),
        ("카페", "카페,디저트"),
        ("커피", "카페,디저트"),
        ("디저트", "디저트"),
        ("아이스크림", "아이스크림"),
        ("칵테일", "바(BAR)"),
        ("와인바", "와인"),
        ("이자카야", "이자카야"),
        ("중식", "중식당"),
        ("중국집", "중식당"),
        ("마라탕", "마라탕"),
        ("마라샹궈", "마라탕"),
        ("일식", "일식당"),
        ("이탈리", "이탈리아음식"),
        ("베트남", "베트남음식"),
        ("쌀국수", "베트남음식"),
        ("인도", "인도음식"),
        ("샤브", "샤브샤브"),
        ("게장", "게장"),
        ("해물찜", "아귀찜,해물찜"),
        ("아귀찜", "아귀찜,해물찜"),
        ("조개", "조개요리"),
        ("장어", "장어,먹장어요리"),
        ("막걸리", "요리주점"),
        ("포차", "포장마차"),
        ("호프", "맥주,호프"),
        ("샐러드", "다이어트,샐러드"),
        ("덮밥", "덮밥"),
        ("만두", "만두"),
        ("쌈밥", "쌈밥"),
        ("한정식", "한정식"),
        ("백반", "백반,가정식"),
        ("오마카세", "일식당"),
        ("야키토리", "일식당"),
        ("텐동", "일식당"),
        ("규카츠", "돈가스"),
        ("카츠", "돈가스"),
        ("까스", "돈가스"),
        ("쉐이크쉑", "햄버거"),
        ("쉑쉑", "햄버거"),
        ("면옥", "냉면"),
        ("아구찜", "아귀찜,해물찜"),
        ("아귀찜", "아귀찜,해물찜"),
        ("소금구이", "돼지고기구이"),
        ("돼지", "돼지고기구이"),
        ("한우", "소고기구이"),
        ("소고기", "소고기구이"),
        ("정육", "육류,고기요리"),
        ("오리", "육류,고기요리"),
        ("구이", "육류,고기요리"),
        ("샤브", "샤브샤브"),
        ("두부", "한식"),
        ("중식", "중식당"),
        ("중국집", "중식당"),
        ("딤섬", "중식당"),
        ("꼬치", "양꼬치"),
        ("야키토리", "일식당"),
        ("이자카야", "이자카야"),
        ("니혼", "일식당"),
        ("스시", "초밥"),
        ("오마카세", "일식당"),
        ("우나기", "장어,먹장어요리"),
        ("장어", "장어,먹장어요리"),
        ("파스타", "스파게티,파스타전문"),
        ("피자", "피자"),
        ("와인", "와인"),
        ("칵테일", "바(BAR)"),
        ("펍", "맥주,호프"),
        ("호프", "맥주,호프"),
    ],
    key=lambda x: len(x[0]),
    reverse=True,
)

ADDR_RE = re.compile(
    r"^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)"
)


def split_name_category(line: str):
    line = line.strip()
    if not line:
        return None, None
    for cat in CATEGORIES:
        if line.endswith(cat):
            name = line[: -len(cat)].strip()
            if name:
                return name, cat
    return line, None


def parse_list1(path: Path) -> dict[str, str]:
    """name -> specific category from paste file."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    # skip title
    if lines and "맛집" in lines[0] and not ADDR_RE.match(lines[0]):
        i = 1
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line:
            continue
        if ADDR_RE.match(line):
            continue
        name, cat = split_name_category(line)
        if name and cat:
            out[normalize(name)] = cat
            # also store without spaces
            out[normalize(name.replace(" ", ""))] = cat
    return out


def normalize(s: str) -> str:
    return re.sub(r"\s+", "", s or "").lower()


def infer_from_name(name: str) -> str | None:
    n = name or ""
    for hint, cat in NAME_HINTS:
        if hint in n:
            return cat
    return None


def is_generic(cat: str | None) -> bool:
    return not cat or cat.strip() in GENERIC


def load_places() -> list[dict]:
    if PLACES_JSON.exists():
        return json.loads(PLACES_JSON.read_text(encoding="utf-8"))
    text = PLACES_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.PLACES\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
    if not m:
        raise SystemExit("cannot parse places.js")
    return json.loads(m.group(1))


def save_places(places: list[dict]) -> None:
    PLACES_JSON.parent.mkdir(parents=True, exist_ok=True)
    PLACES_JSON.write_text(
        json.dumps(places, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    PLACES_JS.write_text(
        "window.PLACES = "
        + json.dumps(places, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def main() -> None:
    from_list = parse_list1(LIST1)
    places = load_places()
    updated = 0
    from_list_n = 0
    from_name_n = 0

    for p in places:
        name = p.get("name") or ""
        cat = p.get("category") or ""
        if cat in ("BAR", "바"):
            p["category"] = "바(BAR)"
            updated += 1
            continue

        if not is_generic(cat):
            continue

        key = normalize(name)
        new_cat = from_list.get(key) or from_list.get(normalize(name.replace(" ", "")))
        if new_cat:
            p["category"] = new_cat
            updated += 1
            from_list_n += 1
            continue

        inferred = infer_from_name(name)
        if inferred:
            p["category"] = inferred
            updated += 1
            from_name_n += 1

    save_places(places)

    from collections import Counter

    ctr = Counter(p.get("category") for p in places)
    still = sum(1 for p in places if is_generic(p.get("category")))
    report = []
    report.append(f"places: {len(places)}")
    report.append(f"list1 mappings: {len(from_list)}")
    report.append(f"updated: {updated} (list1={from_list_n}, name={from_name_n})")
    report.append(f"still generic: {still}")
    report.append("top categories:")
    for k, v in ctr.most_common(40):
        report.append(f"  {v:4d}  {k}")
    text = "\n".join(report) + "\n"
    (ROOT / "scripts" / "_enrich_out.txt").write_text(text, encoding="utf-8")
    print("wrote scripts/_enrich_out.txt")


if __name__ == "__main__":
    main()
