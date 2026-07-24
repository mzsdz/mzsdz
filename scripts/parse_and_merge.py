# -*- coding: utf-8 -*-
"""Parse Naver Map favorite paste + merge with existing 2-star places."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

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
    ],
    key=len,
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
            return name or line, cat
    # fallback: last hangul chunk heuristics
    return line, ""


def parse_raw(text: str, stars: int, list_name: str):
    lines = [ln.strip() for ln in text.splitlines()]
    places = []
    i = 0
    pending_name = None
    while i < len(lines):
        line = lines[i]
        if not line or line in {list_name, "공개", "공유"} or line.startswith("저장된 장소"):
            i += 1
            continue
        if ADDR_RE.match(line):
            # orphan address; skip
            i += 1
            continue

        # Name line (possibly without category if next line repeats with category)
        name, category = split_name_category(line)
        nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""

        # Duplicate title then "title+category"
        if nxt and not ADDR_RE.match(nxt):
            n2, c2 = split_name_category(nxt)
            if n2.startswith(name) or name.startswith(n2) or n2 == name:
                if c2:
                    name, category = n2, c2
                i += 1
                nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""

        if not ADDR_RE.match(nxt):
            # maybe next is another place name — treat current as incomplete skip? keep with empty addr
            i += 1
            continue

        address = nxt
        i += 2
        if not name:
            continue
        places.append(
            {
                "name": name,
                "category": category or "기타",
                "address": address,
                "list": list_name,
                "stars": stars,
            }
        )
    return places


def main():
    # existing 2-star from places.json if present, else from places.js pattern
    two_path = ROOT / "data" / "places.json"
    existing = json.loads(two_path.read_text(encoding="utf-8"))
    two = []
    for p in existing:
        if "2보검" in str(p.get("list", "")):
            p["stars"] = 2
            two.append(p)

    one_raw = (ROOT / "raw" / "list1.txt").read_text(encoding="utf-8")
    one = parse_raw(one_raw, stars=1, list_name="맛보검 1보검 맛집")

    # fix a few known ambiguous splits
    fixes = {
        "까페가일": ("까페가일", "카페,디저트"),
        "배시시홈": ("배시시홈", "브런치카페"),
        "이지피지레몬스퀴지": ("이지피지레몬스퀴지", "브런치카페"),
        "올라아보 이수본점": ("올라아보 이수본점", "멕시코,남미음식"),
        "올라이탈리아음식": ("올라", "이탈리아음식"),
        "장수옥설렁탕": ("장수옥설렁탕", "곰탕,설렁탕"),
        "이조성쑥돌밥설렁탕": ("이조성쑥돌밥설렁탕", "곰탕,설렁탕"),
        "그집보쌈 칼국수": ("그집보쌈 칼국수", "족발,보쌈"),
        "에버그린": ("에버그린", "돈가스"),
        "돈스라": ("돈스라", "돈가스"),
        "우면동소나무집": ("우면동소나무집", "닭볶음탕"),
        "안목": ("안목", "카페,디저트"),
        "슬랩": ("슬랩", "카페,디저트"),
        "희원": ("희원", "카페,디저트"),
        "카페 밍밍": ("카페 밍밍", "카페,디저트"),
        "카페 긷": ("카페 긷", "카페,디저트"),
        "그로토": ("그로토", "카페"),
        "지구커피": ("지구커피", "카페"),
        "바울프": ("바울프", "술집"),
        "향교집": ("향교집", "한식"),
        "산골": ("산골", "한식"),
        "난지당": ("난지당", "한식"),
        "대학촌": ("대학촌", "생선회"),
        "영일만": ("영일만", "생선회"),
        "문래양가": ("문래양가", "양꼬치"),
        "아리랑양꼬치": ("아리랑양꼬치", "양꼬치"),
        "양양집": ("양양집", "해장국"),
        "토봉추어탕": ("토봉추어탕", "추어탕"),
        "땀땀": ("땀땀", "베트남음식"),
        "오매김밥": ("오매김밥", "김밥"),
        "농부쌈밥": ("농부쌈밥", "쌈밥"),
        "양재순대": ("양재순대", "순대,순댓국"),
        "마포집": ("마포집", "순대,순댓국"),
        "시골순댓국": ("시골순댓국", "순대,순댓국"),
        "자매순대국": ("자매순대국", "순대,순댓국"),
        "혼돈": ("혼돈", "돈가스"),
        "니쿠젠": ("니쿠젠", "육류,고기요리"),
        "가보정": ("가보정", "육류,고기요리"),
        "본화로": ("본화로", "육류,고기요리"),
        "양인환대": ("양인환대", "육류,고기요리"),
        "일언주먹고기": ("일언주먹고기", "육류,고기요리"),
        "남영돈": ("남영돈", "돼지고기구이"),
        "두툼": ("두툼", "돼지고기구이"),
        "사당돈": ("사당돈", "돼지고기구이"),
        "호남마을": ("호남마을", "돼지고기구이"),
        "건강한우리": ("건강한우리", "소고기구이"),
        "덕순루": ("덕순루", "중식당"),
        "대관원": ("대관원", "중식당"),
        "올드상해": ("올드상해", "중식당"),
        "가보오토종닭": ("가보오토종닭", "중식당"),
        "교카이젠": ("교카이젠", "일식당"),
        "호수별": ("호수별", "이자카야"),
        "공덕램프": ("공덕램프", "이자카야"),
        "초이노미": ("초이노미", "이자카야"),
        "부산진오뎅": ("부산진오뎅", "이자카야"),
        "야키토리 안안": ("야키토리 안안", "이자카야"),
        "소공소공": ("소공소공", "요리주점"),
        "전원일기": ("전원일기", "요리주점"),
        "광명하이볼": ("광명하이볼", "요리주점"),
        "안다미로": ("안다미로", "요리주점"),
        "루브레드": ("루브레드", "베이커리"),
        "뜨레비앙": ("뜨레비앙", "베이커리"),
        "버터밀크팬트리": ("버터밀크팬트리", "브런치"),
        "한송양식당": ("한송양식당", "브런치"),
        "아르틴": ("아르틴", "브런치"),
        "탑해물칼국수": ("탑해물칼국수", "칼국수,만두"),
        "명가손칼국수": ("명가손칼국수", "칼국수,만두"),
        "중문수두리보말칼국수": ("중문수두리보말칼국수", "칼국수,만두"),
        "신짱과후쿠마루": ("신짱과후쿠마루", "일본식라면"),
        "후타가와라멘": ("후타가와라멘", "일본식라면"),
        "키와미": ("키와미", "일본식라면"),
        "텐진라멘": ("텐진라멘", "일본식라면"),
        "센자이료쿠": ("센자이료쿠", "일본식라면"),
        "고오루덴": ("고오루덴", "일본식라면"),
        "고멘": ("고멘", "일본식라면"),
        "류센소": ("류센소", "일본식라면"),
        "성원곱창": ("성원곱창", "곱창,막창,양"),
        "왕십리배들곱창": ("왕십리배들곱창", "곱창,막창,양"),
        "서동관": ("서동관", "곰탕,설렁탕"),
        "소백관": ("소백관", "곰탕,설렁탕"),
        "영동설렁탕": ("영동설렁탕", "곰탕,설렁탕"),
        "이사부족발": ("이사부족발", "족발,보쌈"),
        "도토리김밥": ("도토리김밥", "종합분식"),
        "양지수제샌드위치": ("양지수제샌드위치", "샌드위치"),
        "오피움": ("오피움", "바(BAR)"),
        "한신VIP일번지포차": ("한신VIP일번지포차", "포장마차"),
        "원당실내포차": ("원당실내포차", "포장마차"),
        "힐링포차": ("힐링포차", "포장마차"),
        "송아저씨빈대떡": ("송아저씨빈대떡", "전,빈대떡"),
        "광주육전": ("광주육전", "전,빈대떡"),
        "광주똑순이아구찜": ("광주똑순이아구찜", "아귀찜,해물찜"),
        "세계주류할인점 평촌점": ("세계주류할인점 평촌점", "주류"),
        "그면에 반하면": ("그면에 반하면", "국수"),
        "정통춘천닭갈비": ("정통춘천닭갈비", "닭갈비"),
        "전주콩나물국밥": ("전주콩나물국밥", "국밥"),
        "임진강민물장어": ("임진강민물장어", "장어,먹장어요리"),
        "창바위식당": ("창바위식당", "백숙,삼계탕"),
        "레스토랑 덱스터": ("레스토랑 덱스터", "프랑스음식"),
        "빈체로 과천점": ("빈체로 과천점", "스파게티,파스타전문"),
        "영진식당흑염소 본점": ("영진식당흑염소 본점", "사철,영양탕"),
        "케이오피피아이": ("케이오피피아이", "카페,디저트"),
        "라이프커피로스터스": ("라이프커피로스터스", "카페,디저트"),
        "소사이어티카페": ("소사이어티카페", "카페,디저트"),
        "헬무트커피로스터스": ("헬무트커피로스터스", "카페,디저트"),
        "비지엠커피": ("비지엠커피", "카페,디저트"),
        "네세서리 커피 로스터스": ("네세서리 커피 로스터스", "카페,디저트"),
    }

    for p in one:
        if p["name"] in fixes:
            p["name"], p["category"] = fixes[p["name"]]
        # also fix when category stuck wrong
        key = p["name"] + p["category"]
        for bad, (nm, cat) in fixes.items():
            if p["name"] == bad or (p["category"] == "기타" and p["name"].startswith(bad)):
                p["name"], p["category"] = nm, cat

    # second pass: lines that failed category get fixed by endswith after join
    for p in one:
        if p["category"] == "기타":
            n, c = split_name_category(p["name"])
            if c:
                p["name"], p["category"] = n, c

    # special: 올라이탈리아음식 already fixed; 에버그린돈가스
    for p in one:
        if p["name"] == "에버그린돈가스" or (p["name"] == "에버그린" and p["category"] == "기타"):
            p["name"], p["category"] = "에버그린", "돈가스"
        if p["name"] == "돈스라돈가스":
            p["name"], p["category"] = "돈스라", "돈가스"
        if p["name"].endswith("돈가스") and p["category"] == "기타":
            p["name"], p["category"] = p["name"][: -len("돈가스")], "돈가스"
        if p["name"].endswith("카페") and p["category"] == "기타":
            p["name"], p["category"] = p["name"][: -len("카페")].strip() or p["name"], "카페"

    merged = two + one
    out_json = ROOT / "data" / "places.json"
    out_json.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    js = "window.PLACES = " + json.dumps(merged, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "places.js").write_text(js, encoding="utf-8")

    print(f"★★: {len(two)}")
    print(f"★: {len(one)}")
    print(f"total: {len(merged)}")
    bad = [p for p in one if p["category"] == "기타"]
    print(f"★ uncategorized: {len(bad)}")
    for p in bad[:30]:
        print(" ?", p["name"], "|", p["address"][:40])


if __name__ == "__main__":
    main()
