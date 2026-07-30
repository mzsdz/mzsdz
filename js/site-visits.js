/**
 * Site visitor counter (today / yesterday / total unique visitors, Asia/Seoul).
 * Uses Supabase RPC touch_site_visit(visitor_key).
 */
(function () {
  const STORAGE_KEY = "mzsdz_vid";

  function uuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getVisitorKey() {
    try {
      let key = localStorage.getItem(STORAGE_KEY);
      if (!key || key.length < 8) {
        key = uuid();
        localStorage.setItem(STORAGE_KEY, key);
      }
      return key;
    } catch {
      return uuid();
    }
  }

  function formatCount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("ko-KR");
  }

  function paint(stats) {
    const today = document.getElementById("visitToday");
    const yday = document.getElementById("visitYesterday");
    const total = document.getElementById("visitTotal");
    const wrap = document.getElementById("visitStats");
    if (today) today.textContent = formatCount(stats?.today);
    if (yday) yday.textContent = formatCount(stats?.yesterday);
    if (total) total.textContent = formatCount(stats?.total);
    if (wrap) wrap.hidden = false;
  }

  async function touchAndLoad() {
    const client =
      typeof window.getSupabase === "function" ? window.getSupabase() : null;
    if (!client) return;

    const { data, error } = await client.rpc("touch_site_visit", {
      p_visitor_key: getVisitorKey(),
    });
    if (error) {
      console.warn("[visits]", error.message || error);
      return;
    }
    paint(data || {});
  }

  window.SiteVisits = { touchAndLoad, paint };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      touchAndLoad();
    });
  } else {
    touchAndLoad();
  }
})();
