/**
 * Supabase 설정
 *
 * 1. https://supabase.com 에서 프로젝트 생성
 * 2. Project Settings → API 에서 Project URL / anon public key 복사
 * 3. 아래 두 값을 채워 넣기 (anon key는 공개용이며, RLS로 보호됩니다)
 */
window.SUPABASE_CONFIG = {
  url: "https://ujfuyrsfuqhyydhasqfi.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZnV5cnNmdXFoeXlkaGFzcWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3OTM4NTIsImV4cCI6MjEwMDM2OTg1Mn0.WT4GVAMsIZiZo4FfDQLwLHxKVtrF0JtHhqAchNGp100",
};

/**
 * @returns {import("@supabase/supabase-js").SupabaseClient | null}
 */
window.getSupabase = function getSupabase() {
  const cfg = window.SUPABASE_CONFIG || {};
  const url = (cfg.url || "").trim();
  const anonKey = (cfg.anonKey || "").trim();
  const placeholder =
    !url ||
    !anonKey ||
    url.includes("YOUR_SUPABASE") ||
    anonKey.includes("YOUR_SUPABASE");

  if (placeholder) {
    console.warn(
      "[맛집신동진] Supabase URL/anon key가 설정되지 않았습니다. js/supabase-client.js 를 확인하세요."
    );
    return null;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.warn("[맛집신동진] Supabase CDN 스크립트가 로드되지 않았습니다.");
    return null;
  }

  if (!window.__supabaseClient) {
    window.__supabaseClient = window.supabase.createClient(url, anonKey);
  }
  return window.__supabaseClient;
};
