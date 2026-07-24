# 맛집신동진

네이버 지도 공유 리스트를 별점·지역·종류 태그로 필터링하는 정적 사이트입니다.

가게 카드에 **한 줄 평**(`admin_memos`)을 함께 보여 줍니다. 한 줄 평은 웹이 아니라 Supabase DB에서 입력합니다.

로그인/회원가입: **Google · 이메일(매직 링크)**. 닉네임은 가입 후 **회원 정보**에서 설정·수정.  
(카카오·네이버는 잠시 비활성 — 코드/Edge Function은 보관)

## 실행

```bash
npx --yes serve .
# 또는
python -m http.server 5500
```

브라우저에서 `http://localhost:3000` (또는 안내된 포트)로 엽니다. OAuth·매직 링크는 `file://`이 아니라 http 서버가 필요합니다.

## Supabase 셋업

### 1. 프로젝트 · 키

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **Project Settings → API**에서 Project URL / **anon public** key 복사
3. [`js/supabase-client.js`](js/supabase-client.js)에 입력

### 2. 스키마

**신규 프로젝트:** SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql) 한 번 실행, 또는 migration push.

**이후 변경:** `supabase/migrations/`에 파일 추가 후 프로젝트 루트에서:

```powershell
cd "C:\Users\user\Projects\맛집신동진"
npx supabase login   # 최초 1회
npx supabase link --project-ref ujfuyrsfuqhyydhasqfi   # 최초 1회
npx supabase db push
```

기준본: [`supabase/migrations/20260724000000_baseline.sql`](supabase/migrations/20260724000000_baseline.sql)  
과거 SQL Editor 패치: [`supabase/archive/`](supabase/archive/) (더 이상 사용하지 않음)

| 테이블 | 역할 |
|---|---|
| `profiles` | 닉네임(`display_name`), `is_admin` |
| `admin_memos` | 가게(`place_sid`)당 한 줄 평 1개 |
| `place_tags` | admin 커스텀 태그 (종류 필터에 합침) |
| `comments` | (예약) 댓글 테이블 — 현재 웹 UI 없음 |

### 3. Auth Providers

**Authentication → URL Configuration**

- Site URL / Redirect URLs: 로컬·배포 주소 (예: `http://localhost:3000`)

**Authentication → Providers**

| 방식 | 설정 |
|---|---|
| **Email** | 켜기 (매직 링크). 비밀번호 가입은 꺼도 됩니다. |
| **Google** | Google Cloud OAuth 클라이언트 등록 후 활성화 |
| **Kakao** | [Kakao Developers](https://developers.kakao.com) 앱 → REST API 키 / Client Secret → Supabase Kakao provider |
| **Naver** | 네이티브 미지원 → 아래 **커스텀 프로바이더** |

#### 네이버 (Custom OIDC)

1. [Naver Developers](https://developers.naver.com)에서 애플리케이션 등록, 콜백 URL은 Supabase가 안내하는 Callback URL 사용
2. Edge Function 배포 (Naver userinfo 형식 보정):

```bash
supabase functions deploy naver-userinfo --no-verify-jwt
```

소스: [`supabase/functions/naver-userinfo`](supabase/functions/naver-userinfo)

3. Dashboard → **Authentication → Sign In / Providers → Custom Providers**에서 추가:

| 항목 | 값 |
|---|---|
| Provider Identifier | `naver` |
| Authorization URL | `https://nid.naver.com/oauth2/authorize` |
| Token URL | `https://nid.naver.com/oauth2/token` |
| Userinfo URL | `https://<project-ref>.supabase.co/functions/v1/naver-userinfo` |
| Scopes | `profile` (openid 넣지 말 것) |
| Client ID / Secret | 네이버 앱 값 |

프론트는 `signInWithOAuth({ provider: 'custom:naver' })`를 호출합니다.

### 4. 닉네임

가입 직후에는 받지 않습니다. 로그인 후 헤더의 **이름(회원 정보)** 을 눌러 닉네임을 설정·수정합니다. 닉네임은 중복될 수 없습니다.

### 5. 관리자 지정

```sql
update public.profiles
set is_admin = true
where id = (
  select id from auth.users where email = 'you@example.com'
);
```

## 한 줄 평 입력 (DB)

웹에서는 편집하지 않습니다. Table Editor의 `admin_memos` 또는 SQL:

```sql
insert into public.admin_memos (place_sid, body)
values ('1234567890', '다른 곳에서 마시기 힘든 최신식 칵테일')
on conflict (place_sid) do update
set body = excluded.body,
    updated_at = now();
```

`place_sid`는 [`places.js`](places.js)의 `sid`(네이버 플레이스 ID)입니다. 저장 후 사이트를 새로고침하면 카드에 표시됩니다.

## 데이터 (공유 링크 API)

| 등급 | 리스트 | 개수 | 공유 링크 |
|---|---|---|---|
| ★★★ | (추가 예정) | 0 | — |
| ★★ | 맛보검 2보검 맛집 | 110 | https://naver.me/5YogVP5E |
| ★ | 맛보검 1보검 맛집 | 367 | https://naver.me/FbVjZohD |

합계 **477곳**

```bash
python scripts/import_shares.py
python scripts/enrich_categories.py
```

`enrich_categories.py`는 공유 API의 `음식점` 같은 뭉뚱그린 분류를 `raw/list1.txt`·가게 이름 힌트로 구체 음식 종류로 복구합니다.