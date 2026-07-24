/**
 * Resolve a Naver Map / Place URL to place metadata.
 *
 * Deploy:
 *   npx supabase functions deploy resolve-naver-place
 *
 * Auth: requires Authorization Bearer (logged-in admin).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractSid(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /place\/(\d{5,})/i,
    /restaurant\/(\d{5,})/i,
    /[?&](?:id|placeId|destination|pinId)=(\d{5,})/i,
    /\/db\/(\d{5,})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  // bare numeric sid
  const bare = text.trim();
  if (/^\d{5,}$/.test(bare)) return bare;
  return null;
}

async function resolveRedirectUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function parseApolloPlace(html: string, sid: string) {
  const m = html.match(
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;\s*window\./
  );
  if (!m) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const key = `PlaceDetailBase:${sid}`;
  const base = data[key] as Record<string, unknown> | undefined;
  if (!base || typeof base !== "object") return null;

  const coord = (base.coordinate || {}) as Record<string, unknown>;
  const name = String(base.name || "").trim();
  const address = String(base.roadAddress || base.address || "").trim();
  const category = String(base.category || "").trim();
  const px = coord.x != null ? Number(coord.x) : null;
  const py = coord.y != null ? Number(coord.y) : null;

  return {
    sid,
    name,
    address,
    category,
    px: Number.isFinite(px) ? px : null,
    py: Number.isFinite(py) ? py : null,
  };
}

function parseOgFallback(html: string, sid: string) {
  const title =
    html.match(/property="og:title"\s+content="([^"]*)"/)?.[1] ||
    html.match(/content="([^"]*)"\s+property="og:title"/)?.[1] ||
    "";
  const name = title.replace(/\s*:\s*네이버.*$/u, "").trim();
  return {
    sid,
    name: name || "",
    address: "",
    category: "",
    px: null as number | null,
    py: null as number | null,
  };
}

async function fetchPlaceMeta(sid: string) {
  const urls = [
    `https://m.place.naver.com/place/${sid}`,
    `https://m.place.naver.com/restaurant/${sid}/home`,
  ];
  let lastHtml = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      lastHtml = html;
      const parsed = parseApolloPlace(html, sid);
      if (parsed?.name) return { ...parsed, partial: false };
    } catch {
      // try next
    }
  }
  if (lastHtml) {
    const fb = parseOgFallback(lastHtml, sid);
    return { ...fb, partial: !fb.name };
  }
  return {
    sid,
    name: "",
    address: "",
    category: "",
    px: null,
    py: null,
    partial: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "로그인이 필요합니다." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseAnon) {
    return json({ error: "서버 설정 오류" }, 500);
  }

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "인증에 실패했습니다." }, 401);
  }

  const { data: profile, error: profileErr } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile?.is_admin) {
    return json({ error: "관리자만 사용할 수 있습니다." }, 403);
  }

  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "잘못된 요청입니다." }, 400);
  }

  const input = String(body.url || "").trim();
  if (!input) return json({ error: "네이버 지도 링크를 입력해 주세요." }, 400);

  let sid = extractSid(input);
  let finalUrl = input;
  if (!sid && /naver\.me|naver\.com/i.test(input)) {
    finalUrl = await resolveRedirectUrl(
      /^https?:\/\//i.test(input) ? input : `https://${input}`
    );
    sid = extractSid(finalUrl) || extractSid(input);
  }

  if (!sid) {
    return json(
      {
        error:
          "가게 id를 찾지 못했습니다. map.naver.com 장소 링크를 넣어 주세요.",
      },
      400
    );
  }

  const meta = await fetchPlaceMeta(sid);
  return json({
    ok: true,
    sid: meta.sid,
    name: meta.name,
    address: meta.address,
    category: meta.category,
    px: meta.px,
    py: meta.py,
    partial: !!meta.partial || !meta.name,
    source_url: finalUrl.startsWith("http") ? finalUrl : input,
  });
});
