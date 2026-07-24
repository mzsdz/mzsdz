-- Naver Login userinfo proxy for Supabase Custom OIDC Provider
-- Deploy:
--   supabase functions deploy naver-userinfo --no-verify-jwt
--
-- Then set Custom Provider Userinfo URL to:
--   https://<project-ref>.supabase.co/functions/v1/naver-userinfo

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth) {
    return new Response(JSON.stringify({ error: "missing Authorization" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const naverRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: auth },
  });
  const payload = await naverRes.json();

  if (!naverRes.ok || payload.resultcode !== "00") {
    return new Response(JSON.stringify(payload), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const r = payload.response || {};
  const flat = {
    sub: String(r.id ?? ""),
    email: r.email ?? null,
    name: r.name ?? r.nickname ?? null,
    preferred_username: r.nickname ?? null,
    picture: r.profile_image ?? null,
  };

  return new Response(JSON.stringify(flat), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
