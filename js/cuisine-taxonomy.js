/**
 * 종류 대분류 → 소분류 taxonomy.
 * 카드/필터/시드가 이 파일을 단일 기준으로 사용합니다.
 */
(function () {
  const MAJORS = [
    "한식",
    "중식",
    "일식",
    "양식",
    "인도음식",
    "베트남음식",
    "태국음식",
    "카페·디저트",
    "술집",
    "기타",
  ];

  /** @type {Record<string, string[]>} */
  const TREE = {
    한식: [
      "한식",
      "백반",
      "한정식",
      "국밥",
      "곰탕·설렁탕",
      "해장국",
      "감자탕",
      "삼계탕",
      "냉면",
      "칼국수",
      "국수",
      "분식",
      "김밥",
      "떡볶이",
      "만두",
      "족발·보쌈",
      "곱창·막창",
      "돼지고기",
      "소고기",
      "고기",
      "치킨",
      "닭갈비",
      "회",
      "해물",
      "게장",
      "장어",
      "전·빈대떡",
      "샤브샤브",
      "덮밥",
      "쌈밥",
    ],
    중식: ["중식", "마라탕", "양꼬치"],
    일식: ["일식", "라멘", "초밥", "우동", "소바", "돈가스", "이자카야"],
    양식: [
      "양식",
      "파스타",
      "피자",
      "햄버거",
      "스테이크",
      "브런치",
      "이탈리아",
      "프랑스",
      "멕시코",
      "샐러드",
    ],
    인도음식: ["인도음식"],
    베트남음식: ["베트남음식"],
    태국음식: ["태국음식"],
    "카페·디저트": ["카페", "베이커리", "디저트", "아이스크림", "베이글"],
    술집: ["술집", "바", "맥주·호프", "와인", "포차"],
    기타: ["아시아"],
  };

  /** Naver category / 별칭 → 소분류(leaf) */
  const ALIAS_TO_LEAF = {
    "바(BAR)": "바",
    BAR: "바",
    바: "바",
    "백숙,삼계탕": "삼계탕",
    백숙: "삼계탕",
    삼계탕: "삼계탕",
    "순대,순댓국": "국밥",
    순대: "국밥",
    순댓국: "국밥",
    "족발,보쌈": "족발·보쌈",
    족발: "족발·보쌈",
    보쌈: "족발·보쌈",
    "족발·보쌈": "족발·보쌈",
    "곱창,막창,양": "곱창·막창",
    곱창: "곱창·막창",
    막창: "곱창·막창",
    "곱창·막창": "곱창·막창",
    "곰탕,설렁탕": "곰탕·설렁탕",
    곰탕: "곰탕·설렁탕",
    설렁탕: "곰탕·설렁탕",
    "곰탕·설렁탕": "곰탕·설렁탕",
    "칼국수,만두": "칼국수",
    칼국수: "칼국수",
    만두: "만두",
    "장어,먹장어요리": "장어",
    장어: "장어",
    "육류,고기요리": "고기",
    고기: "고기",
    "맥주,호프": "맥주·호프",
    "맥주·호프": "맥주·호프",
    맥주: "맥주·호프",
    호프: "맥주·호프",
    "다이어트,샐러드": "샐러드",
    샐러드: "샐러드",
    "카페,디저트": "카페",
    카페: "카페",
    "백반,가정식": "백반",
    백반: "백반",
    떡류제조: "분식",
    일본식라면: "라멘",
    라멘: "라멘",
    라면: "라멘",
    돼지고기구이: "돼지고기",
    돼지고기: "돼지고기",
    삼겹살: "돼지고기",
    소고기구이: "소고기",
    소고기: "소고기",
    한우: "소고기",
    브런치카페: "브런치",
    브런치: "브런치",
    베트남음식: "베트남음식",
    베트남요리: "베트남음식",
    베트남: "베트남음식",
    인도음식: "인도음식",
    인도: "인도음식",
    태국음식: "태국음식",
    태국: "태국음식",
    아시아음식: "아시아",
    아시아: "아시아",
    아시안: "아시아",
    프랑스음식: "프랑스",
    프랑스: "프랑스",
    이탈리아음식: "이탈리아",
    이탈리아: "이탈리아",
    "멕시코,남미음식": "멕시코",
    멕시코음식: "멕시코",
    멕시코: "멕시코",
    "아귀찜,해물찜": "해물",
    해물찜: "해물",
    아귀찜: "해물",
    해물: "해물",
    "스파게티,파스타전문": "파스타",
    파스타: "파스타",
    스파게티: "파스타",
    "전,빈대떡": "전·빈대떡",
    "전·빈대떡": "전·빈대떡",
    "치킨,닭강정": "치킨",
    치킨: "치킨",
    닭강정: "치킨",
    "사철,영양탕": "한식",
    일식당: "일식",
    일식: "일식",
    중식당: "중식",
    중식: "중식",
    한식당: "한식",
    한식: "한식",
    요리주점: "술집",
    술집: "술집",
    포장마차: "포차",
    포차: "포차",
    종합분식: "분식",
    분식: "분식",
    돈가스: "돈가스",
    돈까스: "돈가스",
    국수: "국수",
    냉면: "냉면",
    김밥: "김밥",
    카레: "일식",
    베이글: "베이글",
    국밥: "국밥",
    감자탕: "감자탕",
    해장국: "해장국",
    추어탕: "한식",
    양꼬치: "양꼬치",
    닭갈비: "닭갈비",
    생선회: "회",
    횟집: "회",
    회: "회",
    초밥: "초밥",
    스시: "초밥",
    우동: "우동",
    소바: "소바",
    떡볶이: "떡볶이",
    마라탕: "마라탕",
    한정식: "한정식",
    햄버거: "햄버거",
    피자: "피자",
    스테이크: "스테이크",
    샤브샤브: "샤브샤브",
    이자카야: "이자카야",
    덮밥: "덮밥",
    쌈밥: "쌈밥",
    게장: "게장",
    조개요리: "해물",
    조개: "해물",
    베이커리: "베이커리",
    디저트: "디저트",
    아이스크림: "아이스크림",
    와인: "와인",
    주류: "술집",
    양식: "양식",
    칵테일: "바",
    위스키: "바",
  };

  /** 가게 이름 힌트 (긴 것 우선) → leaf */
  const NAME_HINTS = [
    ["일본식라면", "라멘"],
    ["라멘", "라멘"],
    ["라면", "라멘"],
    ["우동", "우동"],
    ["소바", "소바"],
    ["스시", "초밥"],
    ["초밥", "초밥"],
    ["오마카세", "일식"],
    ["야키토리", "일식"],
    ["이자카야", "이자카야"],
    ["횟집", "회"],
    ["회집", "회"],
    ["모듬회", "회"],
    ["생선회", "회"],
    ["돈가스", "돈가스"],
    ["돈까스", "돈가스"],
    ["규카츠", "돈가스"],
    ["카츠", "돈가스"],
    ["카레", "일식"],
    ["칼국수", "칼국수"],
    ["냉면", "냉면"],
    ["면옥", "냉면"],
    ["국수", "국수"],
    ["김밥", "김밥"],
    ["떡볶이", "떡볶이"],
    ["분식", "분식"],
    ["치킨", "치킨"],
    ["닭강정", "치킨"],
    ["닭갈비", "닭갈비"],
    ["삼계탕", "삼계탕"],
    ["백숙", "삼계탕"],
    ["감자탕", "감자탕"],
    ["해장국", "해장국"],
    ["국밥", "국밥"],
    ["설렁탕", "곰탕·설렁탕"],
    ["곰탕", "곰탕·설렁탕"],
    ["순대", "국밥"],
    ["족발", "족발·보쌈"],
    ["보쌈", "족발·보쌈"],
    ["곱창", "곱창·막창"],
    ["막창", "곱창·막창"],
    ["양꼬치", "양꼬치"],
    ["삼겹", "돼지고기"],
    ["돼지", "돼지고기"],
    ["소금구이", "돼지고기"],
    ["한우", "소고기"],
    ["소고기", "소고기"],
    ["스테이크", "스테이크"],
    ["파스타", "파스타"],
    ["스파게티", "파스타"],
    ["피자", "피자"],
    ["햄버거", "햄버거"],
    ["버거", "햄버거"],
    ["쉐이크쉑", "햄버거"],
    ["쉑쉑", "햄버거"],
    ["브런치", "브런치"],
    ["베이글", "베이글"],
    ["베이커리", "베이커리"],
    ["카페", "카페"],
    ["커피", "카페"],
    ["디저트", "디저트"],
    ["아이스크림", "아이스크림"],
    ["칵테일", "바"],
    ["와인바", "와인"],
    ["와인", "와인"],
    ["중식", "중식"],
    ["중국집", "중식"],
    ["딤섬", "중식"],
    ["마라탕", "마라탕"],
    ["마라샹궈", "마라탕"],
    ["일식", "일식"],
    ["이탈리", "이탈리아"],
    ["베트남", "베트남음식"],
    ["쌀국수", "베트남음식"],
    ["분짜", "베트남음식"],
    ["반미", "베트남음식"],
    ["월남쌈", "베트남음식"],
    ["월남", "베트남음식"],
    ["사이공", "베트남음식"],
    ["하노이", "베트남음식"],
    ["퍼상", "베트남음식"],
    ["인도", "인도음식"],
    ["커리하우스", "인도음식"],
    ["인도커리", "인도음식"],
    ["남인도", "인도음식"],
    ["태국", "태국음식"],
    ["팟타이", "태국음식"],
    ["똠양", "태국음식"],
    ["톰얌", "태국음식"],
    ["쏨땀", "태국음식"],
    ["샤브", "샤브샤브"],
    ["게장", "게장"],
    ["해물찜", "해물"],
    ["아귀찜", "해물"],
    ["아구찜", "해물"],
    ["조개", "해물"],
    ["장어", "장어"],
    ["우나기", "장어"],
    ["막걸리", "술집"],
    ["포차", "포차"],
    ["호프", "맥주·호프"],
    ["펍", "맥주·호프"],
    ["샐러드", "샐러드"],
    ["덮밥", "덮밥"],
    ["만두", "만두"],
    ["쌈밥", "쌈밥"],
    ["한정식", "한정식"],
    ["백반", "백반"],
    ["갈비", "고기"],
    ["정육", "고기"],
    ["오리", "고기"],
    ["꼬치", "양꼬치"],
  ].sort((a, b) => b[0].length - a[0].length);

  const GENERIC = new Set([
    "음식점",
    "일반",
    "기타",
    "여가",
    "생활/문화",
    "쇼핑",
    "숙박",
    "마트/편의점",
    "",
  ]);

  /** @type {Map<string, string>} */
  const leafToMajor = new Map();
  for (const [major, leaves] of Object.entries(TREE)) {
    for (const leaf of leaves) leafToMajor.set(leaf, major);
  }

  function normKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function majorOfLeaf(leaf) {
    return leafToMajor.get(leaf) || null;
  }

  function isMajor(label) {
    return MAJORS.includes(label);
  }

  function isLeaf(label) {
    return leafToMajor.has(label);
  }

  /**
   * 커스텀 소분류를 대분류 아래에 등록 (런타임).
   * @returns {boolean}
   */
  function registerLeaf(leaf, major) {
    const l = String(leaf || "").trim();
    const m = String(major || "").trim();
    if (!l || !m || !isMajor(m) || isMajor(l)) return false;
    const prev = leafToMajor.get(l);
    if (prev === m) return true;
    leafToMajor.set(l, m);
    if (!Array.isArray(TREE[m])) TREE[m] = [];
    if (!TREE[m].includes(l)) TREE[m].push(l);
    return true;
  }

  function resolveAlias(raw) {
    const t = String(raw || "").trim();
    if (!t || GENERIC.has(t)) return null;
    if (ALIAS_TO_LEAF[t]) return ALIAS_TO_LEAF[t];
    if (isLeaf(t)) return t;
    if (isMajor(t)) return t;
    for (const piece of t.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (ALIAS_TO_LEAF[piece]) return ALIAS_TO_LEAF[piece];
      if (isLeaf(piece)) return piece;
    }
    const cleaned = t
      .replace(/\(BAR\)/gi, "")
      .replace(/전문$/, "")
      .replace(/요리$/, "")
      .trim();
    if (ALIAS_TO_LEAF[cleaned]) return ALIAS_TO_LEAF[cleaned];
    if (isLeaf(cleaned)) return cleaned;
    if (/카페/.test(t)) return "카페";
    if (/디저트/.test(t)) return "디저트";
    if (/BAR|바\(/.test(t)) return "바";
    return null;
  }

  function inferFromName(name) {
    const n = String(name || "");
    for (const [hint, leaf] of NAME_HINTS) {
      if (hint && n.includes(hint)) return leaf;
    }
    return null;
  }

  /**
   * @returns {{ major: string|null, minor: string|null, labels: string[] }}
   */
  function classify(category, name) {
    let leaf = resolveAlias(category) || inferFromName(name);
    if (!leaf) {
      return { major: null, minor: null, labels: [] };
    }
    let major = majorOfLeaf(leaf);
    if (!major && isMajor(leaf)) {
      major = leaf;
      leaf = null;
    }
    if (!major) major = "기타";
    const labels = [];
    if (major) labels.push(major);
    if (leaf && leaf !== major) labels.push(leaf);
    return { major, minor: leaf && leaf !== major ? leaf : null, labels };
  }

  /**
   * DB/커스텀 라벨 배열 → path
   * @param {string[]} labels
   */
  function pathFromLabels(labels) {
    const list = (labels || [])
      .map((l) => String(l || "").trim())
      .filter(Boolean)
      .map((l) => ALIAS_TO_LEAF[l] || l);

    const majors = list.filter((l) => isMajor(l));
    const leaves = list.filter((l) => isLeaf(l) && !isMajor(l));
    const unknown = list.filter((l) => !isLeaf(l) && !isMajor(l));

    // 대분류 + 미등록 소분류 → 해당 대분류 아래로 등록
    if (majors.length && unknown.length) {
      const major = majors[0];
      for (const u of unknown) registerLeaf(u, major);
    }

    // major-only leaves (인도음식 등): treat as major path
    const majorLeaves = list.filter((l) => isMajor(l) && isLeaf(l));
    const leaves2 = list.filter((l) => isLeaf(l) && !isMajor(l));
    if (leaves2.length) {
      const minor =
        leaves2.find((l) => majorOfLeaf(l) && l !== majorOfLeaf(l)) || leaves2[0];
      const major = majorOfLeaf(minor) || majors[0] || "기타";
      if (major && minor) registerLeaf(minor, major);
      return {
        major,
        minor: minor === major ? null : minor,
        extras: list.filter(
          (l) => l !== major && l !== minor && !isMajor(l) && majorOfLeaf(l) !== major
        ),
      };
    }
    if (majors.length || majorLeaves.length) {
      return {
        major: majors[0] || majorLeaves[0],
        minor: null,
        extras: unknown,
      };
    }
    if (unknown.length) {
      registerLeaf(unknown[0], "기타");
      return { major: "기타", minor: unknown[0], extras: unknown.slice(1) };
    }
    return { major: null, minor: null, extras: [] };
  }

  function emptyCuisinePath() {
    return { major: null, minor: null };
  }

  function allCuisineLabels() {
    const out = new Set(MAJORS);
    for (const leaves of Object.values(TREE)) {
      for (const l of leaves) out.add(l);
    }
    for (const v of Object.values(ALIAS_TO_LEAF)) out.add(v);
    for (const l of leafToMajor.keys()) out.add(l);
    return [...out];
  }

  function majorOptionsHtml(selected) {
    const sel = String(selected || "").trim();
    return MAJORS.map(
      (m) =>
        `<option value="${m}"${m === sel ? " selected" : ""}>${m}</option>`
    ).join("");
  }

  window.CuisineTaxonomy = {
    MAJORS,
    TREE,
    ALIAS_TO_LEAF,
    NAME_HINTS,
    GENERIC,
    majorOfLeaf,
    isMajor,
    isLeaf,
    registerLeaf,
    resolveAlias,
    inferFromName,
    classify,
    pathFromLabels,
    emptyCuisinePath,
    allCuisineLabels,
    majorOptionsHtml,
    normKey,
  };
})();
