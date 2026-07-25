/**
 * Auth (Google / Email) + profile nickname + admin memos/tags
 */
(function () {
  const sb = () => (typeof window.getSupabase === "function" ? window.getSupabase() : null);

  let session = null;
  let profile = null;
  /** @type {Record<string, string>} */
  let memosBySid = {};
  /** @type {Record<string, Array<{ id: string, label: string, kind: string }>>} */
  let tagsBySid = {};
  /** @type {Set<string>} */
  let hiddenSids = new Set();
  /** @type {Record<string, number>} */
  let starsBySid = {};
  /** @type {Array<Record<string, unknown>>} */
  let addedPlaces = [];
  let onMemosChange = null;
  let onTagsChange = null;
  let onHiddenChange = null;
  let onStarsChange = null;
  let onAddedPlacesChange = null;
  let onAuthChangeCb = null;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function redirectTo() {
    return window.location.href.split("#")[0];
  }

  function displayName() {
    return (
      profile?.display_name ||
      session?.user?.user_metadata?.display_name ||
      session?.user?.user_metadata?.full_name ||
      session?.user?.email?.split("@")[0] ||
      "회원"
    );
  }

  function escapeIlike(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  async function isNicknameTaken(nickname, exceptUserId) {
    const client = sb();
    if (!client) return false;
    let q = client
      .from("profiles")
      .select("id")
      .ilike("display_name", escapeIlike(nickname))
      .limit(1);
    if (exceptUserId) q = q.neq("id", exceptUserId);
    const { data, error } = await q;
    if (error) {
      console.warn("[auth] nickname check failed", error);
      return false;
    }
    return (data || []).length > 0;
  }

  function nicknameErrorMessage(error) {
    if (!error) return "닉네임 저장 실패";
    if (
      error.code === "23505" ||
      /duplicate|unique|profiles_display_name/i.test(error.message || "")
    ) {
      return "이미 사용 중인 닉네임입니다.";
    }
    return error.message || "닉네임 저장 실패";
  }

  async function loadProfile(userId) {
    const client = sb();
    if (!client || !userId) {
      profile = null;
      return;
    }
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[auth] profile load failed", error);
      profile = null;
      return;
    }
    profile = data;
  }

  function renderAuthBar() {
    const el = $("authBar");
    if (!el) return;

    const client = sb();
    if (!client) {
      el.innerHTML = `<span class="auth-hint">로그인 미설정</span>`;
      return;
    }

    if (!session?.user) {
      el.innerHTML = `<button type="button" class="auth-btn" id="loginBtn">로그인</button>`;
      $("loginBtn")?.addEventListener("click", openLoginModal);
      return;
    }

    const adminBadge = profile?.is_admin
      ? `<span class="auth-badge">admin</span>`
      : "";

    el.innerHTML = `
      <button type="button" class="auth-btn ghost" id="profileBtn">${escapeHtml(displayName())}</button>
      ${adminBadge}
      <button type="button" class="auth-btn ghost" id="logoutBtn">로그아웃</button>
    `;
    $("profileBtn")?.addEventListener("click", openProfileModal);
    $("logoutBtn")?.addEventListener("click", async () => {
      await client.auth.signOut();
    });
  }

  function openLoginModal() {
    const modal = $("authModal");
    const status = $("authStatus");
    if (status) status.textContent = "";
    if ($("authEmail")) $("authEmail").value = "";
    modal?.showModal();
  }

  function closeLoginModal() {
    $("authModal")?.close();
  }

  function openProfileModal() {
    if (!session?.user) return;
    const status = $("profileStatus");
    if (status) status.textContent = "";
    if ($("profileEmail")) $("profileEmail").value = session.user.email || "";
    if ($("profileNickname")) $("profileNickname").value = profile?.display_name || "";
    $("profileModal")?.showModal();
  }

  function closeProfileModal() {
    $("profileModal")?.close();
  }

  async function sendMagicLink() {
    const client = sb();
    const status = $("authStatus");
    if (!client || !status) return;

    const email = ($("authEmail")?.value || "").trim();
    if (!email) {
      status.textContent = "이메일을 입력해 주세요.";
      return;
    }

    status.textContent = "메일 보내는 중…";
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      status.textContent = error.message || "로그인 메일 전송에 실패했습니다.";
      return;
    }
    status.textContent = "이메일의 매직 링크를 확인해 주세요.";
  }

  async function signInWithProvider(provider) {
    const client = sb();
    const status = $("authStatus");
    if (!client) return;
    if (status) status.textContent = "이동 중…";
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      if (status) {
        status.textContent =
          error.message ||
          `${provider} 로그인을 사용할 수 없습니다. Supabase Providers 설정을 확인하세요.`;
      }
    }
  }

  async function saveProfile(e) {
    e?.preventDefault?.();
    const client = sb();
    const status = $("profileStatus");
    if (!client || !session?.user) return;

    const nickname = ($("profileNickname")?.value || "").trim();
    if (!nickname || nickname.length < 2) {
      if (status) status.textContent = "닉네임은 2자 이상이어야 합니다.";
      return;
    }

    if (status) status.textContent = "확인 중…";
    if (await isNicknameTaken(nickname, session.user.id)) {
      if (status) status.textContent = "이미 사용 중인 닉네임입니다.";
      return;
    }

    if (status) status.textContent = "저장 중…";
    const { error: profileError } = await client
      .from("profiles")
      .update({ display_name: nickname })
      .eq("id", session.user.id);
    if (profileError) {
      if (status) status.textContent = nicknameErrorMessage(profileError);
      return;
    }

    const { error: metaError } = await client.auth.updateUser({
      data: { display_name: nickname, nickname_set: true },
    });
    if (metaError) {
      if (status) status.textContent = metaError.message || "닉네임 저장 실패";
      return;
    }

    await loadProfile(session.user.id);
    const { data } = await client.auth.getSession();
    session = data.session;
    renderAuthBar();
    if (status) status.textContent = "저장되었습니다.";
    setTimeout(() => closeProfileModal(), 600);
  }

  async function loadMemos() {
    const client = sb();
    memosBySid = {};
    if (!client) {
      onMemosChange?.(memosBySid);
      return;
    }
    const { data, error } = await client.from("admin_memos").select("place_sid, body");
    if (error) {
      console.warn("[memos] load failed", error);
      onMemosChange?.(memosBySid);
      return;
    }
    for (const row of data || []) {
      if (row.place_sid && row.body) memosBySid[String(row.place_sid)] = row.body;
    }
    onMemosChange?.(memosBySid);
  }

  const EMPTY_TAG = "__empty__";

  function notifyTagsChange() {
    onTagsChange?.(getTagsSnapshot());
  }

  function getTagsSnapshot() {
    /** @type {Record<string, Array<{ id: string, label: string, kind: string }>>} */
    const out = {};
    for (const [sid, rows] of Object.entries(tagsBySid)) {
      out[sid] = rows.map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind === "region" ? "region" : "cuisine",
      }));
    }
    return out;
  }

  function realTags(sid, kind) {
    return (tagsBySid[sid] || []).filter(
      (t) => t.kind === kind && t.label !== EMPTY_TAG
    );
  }

  async function clearEmptyMarker(sid, kind) {
    const client = sb();
    if (!client) return;
    const markers = (tagsBySid[sid] || []).filter(
      (t) => t.kind === kind && t.label === EMPTY_TAG
    );
    for (const m of markers) {
      await client.from("place_tags").delete().eq("id", m.id);
    }
    if (tagsBySid[sid]) {
      tagsBySid[sid] = tagsBySid[sid].filter(
        (t) => !(t.kind === kind && t.label === EMPTY_TAG)
      );
    }
  }

  async function ensureEmptyMarker(sid, kind) {
    const client = sb();
    if (!client) return;
    if (realTags(sid, kind).length) return;
    if ((tagsBySid[sid] || []).some((t) => t.kind === kind && t.label === EMPTY_TAG)) {
      return;
    }
    const { data, error } = await client
      .from("place_tags")
      .insert({
        place_sid: sid,
        label: EMPTY_TAG,
        kind,
        created_by: session?.user?.id || null,
      })
      .select("id, place_sid, label, kind")
      .single();
    if (error) {
      if (!(error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) {
        console.warn("[tags] empty marker failed", error);
      }
      return;
    }
    if (!tagsBySid[sid]) tagsBySid[sid] = [];
    tagsBySid[sid].push({
      id: String(data.id),
      label: EMPTY_TAG,
      kind: data.kind === "region" ? "region" : "cuisine",
    });
  }

  async function loadTags() {
    const client = sb();
    tagsBySid = {};
    if (!client) {
      notifyTagsChange();
      return;
    }

    // PostgREST max_rows is 1000 — paginate or tags silently drop.
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("place_tags")
        .select("id, place_sid, label, kind")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("[tags] load failed", error);
        notifyTagsChange();
        return;
      }
      const rows = data || [];
      for (const row of rows) {
        if (!row.place_sid || !row.label || !row.id) continue;
        const sid = String(row.place_sid);
        if (!tagsBySid[sid]) tagsBySid[sid] = [];
        const kind = row.kind === "region" ? "region" : "cuisine";
        const label = String(row.label).trim();
        const id = String(row.id);
        // Dedupe by id and by kind+label (guards against overlapping page loads).
        if (tagsBySid[sid].some((t) => t.id === id)) continue;
        if (
          label !== EMPTY_TAG &&
          tagsBySid[sid].some(
            (t) =>
              t.kind === kind &&
              t.label !== EMPTY_TAG &&
              t.label.toLowerCase() === label.toLowerCase()
          )
        ) {
          continue;
        }
        tagsBySid[sid].push({ id, label, kind });
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    notifyTagsChange();
  }

  async function addTag(placeSid, label, kind = "cuisine") {
    const client = sb();
    const trimmed = String(label || "").trim();
    const tagKind = kind === "region" ? "region" : "cuisine";
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 태그를 추가할 수 있습니다." };
    if (!placeSid) return { error: "가게 정보가 없습니다." };
    if (!trimmed || trimmed === EMPTY_TAG) return { error: "태그 이름을 입력해 주세요." };

    const sid = String(placeSid);
    const existing = realTags(sid, tagKind);
    if (existing.some((t) => t.label.toLowerCase() === trimmed.toLowerCase())) {
      return { error: "이미 있는 태그입니다." };
    }

    await clearEmptyMarker(sid, tagKind);

    const { data, error } = await client
      .from("place_tags")
      .insert({
        place_sid: sid,
        label: trimmed,
        kind: tagKind,
        created_by: session?.user?.id || null,
      })
      .select("id, place_sid, label, kind")
      .single();

    if (error) {
      console.warn("[tags] add failed", error);
      if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
        // Local cache was incomplete — reload so the existing tag shows up.
        await loadTags();
        return { error: "이미 있는 태그입니다. 목록을 새로고침했습니다." };
      }
      return { error: error.message || "태그 추가 실패" };
    }

    const saved = {
      id: String(data.id),
      label: String(data.label).trim(),
      kind: data.kind === "region" ? "region" : "cuisine",
    };
    if (!tagsBySid[sid]) tagsBySid[sid] = [];
    tagsBySid[sid].push(saved);
    notifyTagsChange();
    return { data: saved };
  }

  async function addTagsBulk(placeSids, label, kind = "cuisine") {
    const client = sb();
    const trimmed = String(label || "").trim();
    const tagKind = kind === "region" ? "region" : "cuisine";
    if (!client) return { error: "Supabase 미설정", added: 0, skipped: 0 };
    if (!profile?.is_admin) return { error: "관리자만 태그를 추가할 수 있습니다.", added: 0, skipped: 0 };
    if (!trimmed || trimmed === EMPTY_TAG) {
      return { error: "태그 이름을 입력해 주세요.", added: 0, skipped: 0 };
    }

    const sids = [...new Set((placeSids || []).map((s) => String(s || "").trim()).filter(Boolean))];
    if (!sids.length) return { error: "선택된 가게가 없습니다.", added: 0, skipped: 0 };

    const toInsert = [];
    let skipped = 0;
    for (const sid of sids) {
      const existing = realTags(sid, tagKind);
      if (existing.some((t) => t.label.toLowerCase() === trimmed.toLowerCase())) {
        skipped += 1;
        continue;
      }
      await clearEmptyMarker(sid, tagKind);
      toInsert.push({
        place_sid: sid,
        label: trimmed,
        kind: tagKind,
        created_by: session?.user?.id || null,
      });
    }

    if (!toInsert.length) {
      return { added: 0, skipped, ok: true };
    }

    let added = 0;
    const chunkSize = 80;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { data, error } = await client.from("place_tags").insert(chunk).select("id, place_sid, label, kind");
      if (error) {
        for (const row of chunk) {
          const { data: one, error: oneErr } = await client
            .from("place_tags")
            .insert(row)
            .select("id, place_sid, label, kind")
            .single();
          if (oneErr) {
            if (oneErr.code === "23505" || /duplicate|unique/i.test(oneErr.message || "")) {
              skipped += 1;
            } else {
              console.warn("[tags] bulk add failed", oneErr);
            }
            continue;
          }
          const sid = String(one.place_sid);
          if (!tagsBySid[sid]) tagsBySid[sid] = [];
          tagsBySid[sid].push({
            id: String(one.id),
            label: String(one.label).trim(),
            kind: one.kind === "region" ? "region" : "cuisine",
          });
          added += 1;
        }
      } else {
        for (const one of data || []) {
          const sid = String(one.place_sid);
          if (!tagsBySid[sid]) tagsBySid[sid] = [];
          tagsBySid[sid].push({
            id: String(one.id),
            label: String(one.label).trim(),
            kind: one.kind === "region" ? "region" : "cuisine",
          });
          added += 1;
        }
      }
    }

    notifyTagsChange();
    return { added, skipped, ok: true };
  }

  async function removeTag(tagId) {
    const client = sb();
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 태그를 삭제할 수 있습니다." };
    if (!tagId) return { error: "태그 정보가 없습니다." };

    const id = String(tagId);
    let sid = null;
    let kind = "cuisine";
    for (const [s, rows] of Object.entries(tagsBySid)) {
      const hit = rows.find((t) => t.id === id);
      if (hit) {
        sid = s;
        kind = hit.kind === "region" ? "region" : "cuisine";
        break;
      }
    }

    const { error } = await client.from("place_tags").delete().eq("id", id);
    if (error) {
      console.warn("[tags] remove failed", error);
      return { error: error.message || "태그 삭제 실패" };
    }

    for (const s of Object.keys(tagsBySid)) {
      tagsBySid[s] = tagsBySid[s].filter((t) => t.id !== id);
      if (!tagsBySid[s].length) delete tagsBySid[s];
    }
    if (sid) await ensureEmptyMarker(sid, kind);
    notifyTagsChange();
    return { ok: true };
  }

  async function removeTagByLabel(placeSid, label, kind = "cuisine", opts = {}) {
    const client = sb();
    const trimmed = String(label || "").trim();
    const tagKind = kind === "region" ? "region" : "cuisine";
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 태그를 삭제할 수 있습니다." };
    if (!placeSid || !trimmed) return { error: "태그 정보가 없습니다." };

    const sid = String(placeSid);
    const local = realTags(sid, tagKind).find(
      (t) => t.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (local?.id) return removeTag(local.id);

    // Not in DB yet (still base-only): keep sibling labels, drop this one.
    if (Array.isArray(opts.seedLabels)) {
      const keep = [...new Set(
        opts.seedLabels
          .map((l) => String(l || "").trim())
          .filter((l) => l && l.toLowerCase() !== trimmed.toLowerCase() && l !== EMPTY_TAG)
      )];
      const seedResult = await seedTags([{ sid, labels: keep }], tagKind);
      if (seedResult?.error) return seedResult;
      if (!keep.length) {
        await ensureEmptyMarker(sid, tagKind);
        notifyTagsChange();
      }
      return { ok: true };
    }

    const { data, error } = await client
      .from("place_tags")
      .select("id")
      .eq("place_sid", sid)
      .eq("kind", tagKind)
      .ilike("label", trimmed)
      .limit(1);
    if (error) return { error: error.message || "태그 조회 실패" };
    const id = data?.[0]?.id;
    if (!id) return { error: "DB에 없는 태그입니다. 관리자로 다시 로그인해 시드를 완료해 주세요." };
    return removeTag(String(id));
  }

  /** 선택한 가게들에서 특정 라벨 태그 삭제 */
  async function removeTagsBulk(placeSids, label, kind = "cuisine") {
    const trimmed = String(label || "").trim();
    const tagKind = kind === "region" ? "region" : "cuisine";
    if (!profile?.is_admin) return { error: "관리자만 태그를 삭제할 수 있습니다.", removed: 0 };
    if (!trimmed) return { error: "삭제할 태그 이름을 입력해 주세요.", removed: 0 };
    const sids = [...new Set((placeSids || []).map((s) => String(s || "")).filter(Boolean))];
    if (!sids.length) return { error: "가게를 먼저 선택해 주세요.", removed: 0 };

    let removed = 0;
    let lastError = null;
    for (const sid of sids) {
      const hit = realTags(sid, tagKind).find(
        (t) => t.label.toLowerCase() === trimmed.toLowerCase()
      );
      if (!hit) continue;
      const result = await removeTag(hit.id);
      if (result?.error) {
        lastError = result.error;
        continue;
      }
      removed += 1;
    }
    if (!removed && lastError) return { error: lastError, removed: 0 };
    return { ok: true, removed };
  }

  /** 선택한 가게들의 종류/지역 태그를 모두 비움 (__empty__ 마커) */
  async function clearKindTagsBulk(placeSids, kind = "cuisine") {
    const client = sb();
    const tagKind = kind === "region" ? "region" : "cuisine";
    if (!client) return { error: "Supabase 미설정", cleared: 0 };
    if (!profile?.is_admin) return { error: "관리자만 태그를 삭제할 수 있습니다.", cleared: 0 };
    const sids = [...new Set((placeSids || []).map((s) => String(s || "")).filter(Boolean))];
    if (!sids.length) return { error: "가게를 먼저 선택해 주세요.", cleared: 0 };

    let cleared = 0;
    for (const sid of sids) {
      const rows = realTags(sid, tagKind);
      if (!rows.length) {
        await ensureEmptyMarker(sid, tagKind);
        continue;
      }
      const ids = rows.map((r) => r.id).filter(Boolean);
      if (ids.length) {
        const { error } = await client.from("place_tags").delete().in("id", ids);
        if (error) {
          console.warn("[tags] clear bulk failed", error);
          return { error: error.message || "태그 삭제 실패", cleared };
        }
        tagsBySid[sid] = (tagsBySid[sid] || []).filter(
          (t) => !(t.kind === tagKind && t.label !== EMPTY_TAG)
        );
        if (!tagsBySid[sid].length) delete tagsBySid[sid];
      }
      await ensureEmptyMarker(sid, tagKind);
      cleared += 1;
    }
    notifyTagsChange();
    return { ok: true, cleared };
  }

  async function seedTags(placeEntries, kind = "region") {
    const tagKind = kind === "region" ? "region" : "cuisine";
    const client = sb();
    if (!client) return { error: "Supabase 미설정", seeded: 0 };
    if (!profile?.is_admin) return { error: "관리자만 가능합니다.", seeded: 0 };
    if (!Array.isArray(placeEntries) || !placeEntries.length) return { seeded: 0 };

    const toInsert = [];
    for (const entry of placeEntries) {
      const sid = String(entry?.sid || "");
      if (!sid) continue;
      // Intentional clear → do not re-seed from base.
      if ((tagsBySid[sid] || []).some((t) => t.kind === tagKind && t.label === EMPTY_TAG)) {
        continue;
      }
      // Already has DB tags → treat as source of truth (don't re-add deleted labels).
      if (realTags(sid, tagKind).length) continue;
      const labels = [
        ...new Set(
          (entry.labels || [])
            .map((l) => String(l || "").trim())
            .filter((l) => l && l !== EMPTY_TAG)
        ),
      ];
      if (!labels.length) continue;
      for (const label of labels) {
        toInsert.push({
          place_sid: sid,
          label,
          kind: tagKind,
          created_by: session?.user?.id || null,
        });
      }
    }

    if (!toInsert.length) return { seeded: 0 };

    let seeded = 0;
    const chunkSize = 80;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { data, error } = await client.from("place_tags").insert(chunk).select("id");
      if (error) {
        for (const row of chunk) {
          const { error: oneErr } = await client.from("place_tags").insert(row);
          if (!oneErr) seeded += 1;
          else if (!(oneErr.code === "23505" || /duplicate|unique/i.test(oneErr.message || ""))) {
            console.warn("[tags] seed insert failed", oneErr);
          }
        }
      } else {
        seeded += (data || []).length;
      }
    }

    await loadTags();
    return { seeded };
  }

  async function seedRegionTags(placeEntries) {
    return seedTags(placeEntries, "region");
  }

  async function seedCuisineTags(placeEntries) {
    return seedTags(placeEntries, "cuisine");
  }

  /**
   * Replace cuisine tags from base classification.
   * Keeps places marked with __empty__. Deletes other cuisine labels, then inserts new ones.
   */
  async function replaceCuisineTags(placeEntries) {
    const client = sb();
    if (!client) return { error: "Supabase 미설정", seeded: 0, removed: 0 };
    if (!profile?.is_admin) return { error: "관리자만 가능합니다.", seeded: 0, removed: 0 };
    if (!Array.isArray(placeEntries) || !placeEntries.length) return { seeded: 0, removed: 0 };

    const protectedSids = new Set();
    for (const [sid, rows] of Object.entries(tagsBySid)) {
      if ((rows || []).some((t) => t.kind === "cuisine" && t.label === EMPTY_TAG)) {
        protectedSids.add(sid);
      }
    }

    let removed = 0;
    const pageSize = 500;
    for (;;) {
      const { data, error } = await client
        .from("place_tags")
        .select("id, place_sid, label")
        .eq("kind", "cuisine")
        .neq("label", EMPTY_TAG)
        .limit(pageSize);
      if (error) return { error: error.message || "종류 태그 조회 실패", seeded: 0, removed };
      const rows = (data || []).filter((r) => !protectedSids.has(String(r.place_sid)));
      if (!rows.length) break;
      const ids = rows.map((r) => r.id);
      const { error: delErr } = await client.from("place_tags").delete().in("id", ids);
      if (delErr) return { error: delErr.message || "종류 태그 삭제 실패", seeded: 0, removed };
      removed += ids.length;
      if (rows.length < pageSize) break;
    }

    await loadTags();
    const seeded = await seedTags(placeEntries, "cuisine");
    if (seeded?.error) return { ...seeded, removed };
    return { seeded: seeded?.seeded || 0, removed };
  }

  async function repairTagKinds({ cuisineLabels = [], regionLabels = [] } = {}) {
    const client = sb();
    if (!client) return { error: "Supabase 미설정", fixed: 0 };
    if (!profile?.is_admin) return { error: "관리자만 가능합니다.", fixed: 0 };

    const cuisineSet = new Set(
      (cuisineLabels || []).map((l) => String(l || "").trim().toLowerCase()).filter(Boolean)
    );
    const regionSet = new Set(
      (regionLabels || []).map((l) => String(l || "").trim().toLowerCase()).filter(Boolean)
    );

    const rows = [];
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("place_tags")
        .select("id, label, kind")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return { error: error.message || "태그 조회 실패", fixed: 0 };
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    let fixed = 0;
    for (const row of rows) {
      const label = String(row.label || "").trim();
      const key = label.toLowerCase();
      if (!label || !row.id || label === EMPTY_TAG) continue;
      const kind = row.kind === "region" ? "region" : "cuisine";
      let next = kind;

      const looksDistrict = /구$/.test(label);
      const looksSido = regionSet.has(key);
      const looksCuisine = cuisineSet.has(key);

      if (kind === "region" && looksCuisine && !looksSido && !looksDistrict) {
        next = "cuisine";
      } else if (kind === "cuisine" && (looksSido || looksDistrict)) {
        next = "region";
      }

      if (next === kind) continue;

      // If flipping to a kind that already has same label on another row, drop this duplicate.
      const conflict = rows.some(
        (other) =>
          other.id !== row.id &&
          other.kind === next &&
          String(other.label || "").trim().toLowerCase() === key
      );
      if (conflict) {
        const { error: delErr } = await client.from("place_tags").delete().eq("id", row.id);
        if (delErr) {
          console.warn("[tags] repair delete duplicate failed", delErr);
          continue;
        }
        fixed += 1;
        continue;
      }

      const { error: updErr } = await client
        .from("place_tags")
        .update({ kind: next })
        .eq("id", row.id);
      if (updErr) {
        console.warn("[tags] repair failed", updErr);
        continue;
      }
      fixed += 1;
    }

    if (fixed) await loadTags();
    return { fixed };
  }

  async function onAuthChange(nextSession) {
    session = nextSession;
    if (session?.user) await loadProfile(session.user.id);
    else {
      profile = null;
      closeProfileModal();
    }
    renderAuthBar();
    onAuthChangeCb?.({
      session,
      profile,
      isAdmin: !!profile?.is_admin,
    });
  }

  function wireUi() {
    $("authModalClose")?.addEventListener("click", (e) => {
      e.preventDefault();
      closeLoginModal();
    });
    $("authMagicBtn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await sendMagicLink();
    });
    $("authGoogleBtn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await signInWithProvider("google");
    });

    $("profileForm")?.addEventListener("submit", saveProfile);
    $("profileModalClose")?.addEventListener("click", (e) => {
      e.preventDefault();
      closeProfileModal();
    });
  }

  function notifyHiddenChange() {
    onHiddenChange?.(getHiddenSnapshot());
  }

  function getHiddenSnapshot() {
    return [...hiddenSids];
  }

  async function loadHiddenPlaces() {
    const client = sb();
    hiddenSids = new Set();
    if (!client) {
      notifyHiddenChange();
      return;
    }
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("hidden_places")
        .select("place_sid")
        .order("place_sid", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("[hidden] load failed", error);
        notifyHiddenChange();
        return;
      }
      const rows = data || [];
      for (const row of rows) {
        if (row.place_sid) hiddenSids.add(String(row.place_sid));
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    notifyHiddenChange();
  }

  function notifyStarsChange() {
    onStarsChange?.({ ...starsBySid });
  }

  async function loadStars() {
    const client = sb();
    starsBySid = {};
    if (!client) {
      notifyStarsChange();
      return;
    }
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("place_stars")
        .select("place_sid, stars")
        .order("place_sid", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("[stars] load failed", error);
        notifyStarsChange();
        return;
      }
      const rows = data || [];
      for (const row of rows) {
        if (!row.place_sid) continue;
        const n = Number(row.stars);
        if (!Number.isFinite(n) || n < 0 || n > 3) continue;
        starsBySid[String(row.place_sid)] = n;
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    notifyStarsChange();
  }

  async function setPlaceStars(placeSid, stars) {
    const client = sb();
    const sid = String(placeSid || "").trim();
    const n = Number(stars);
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 평점을 수정할 수 있습니다." };
    if (!sid) return { error: "가게 정보가 없습니다." };
    if (!Number.isFinite(n) || n < 0 || n > 3 || !Number.isInteger(n)) {
      return { error: "평점은 0~3만 가능합니다." };
    }

    const { error } = await client.from("place_stars").upsert(
      {
        place_sid: sid,
        stars: n,
        updated_by: session?.user?.id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "place_sid" }
    );
    if (error) {
      console.warn("[stars] set failed", error);
      return { error: error.message || "평점 저장 실패" };
    }

    starsBySid[sid] = n;
    notifyStarsChange();
    return { ok: true, stars: n };
  }

  async function hidePlace(placeSid) {
    const client = sb();
    const sid = String(placeSid || "").trim();
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 삭제할 수 있습니다." };
    if (!sid) return { error: "가게 정보가 없습니다." };

    if (hiddenSids.has(sid)) {
      notifyHiddenChange();
      return { ok: true };
    }

    const { error } = await client.from("hidden_places").insert({
      place_sid: sid,
      created_by: session?.user?.id || null,
    });
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
        hiddenSids.add(sid);
        notifyHiddenChange();
        return { ok: true };
      }
      console.warn("[hidden] hide failed", error);
      return { error: error.message || "삭제 실패" };
    }

    hiddenSids.add(sid);
    notifyHiddenChange();
    return { ok: true };
  }

  function notifyAddedPlacesChange() {
    onAddedPlacesChange?.(addedPlaces.map((r) => ({ ...r })));
  }

  function getAddedPlacesSnapshot() {
    return addedPlaces.map((r) => ({ ...r }));
  }

  async function loadAddedPlaces() {
    const client = sb();
    addedPlaces = [];
    if (!client) {
      notifyAddedPlacesChange();
      return;
    }
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await client
        .from("added_places")
        .select("place_sid, name, address, category, stars, px, py, source_url, created_at")
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("[added_places] load failed", error);
        notifyAddedPlacesChange();
        return;
      }
      const rows = data || [];
      for (const row of rows) {
        if (!row.place_sid) continue;
        addedPlaces.push({
          sid: String(row.place_sid),
          place_sid: String(row.place_sid),
          name: String(row.name || "").trim(),
          address: String(row.address || "").trim(),
          category: String(row.category || "").trim(),
          stars: Number(row.stars) || 0,
          px: row.px == null ? null : Number(row.px),
          py: row.py == null ? null : Number(row.py),
          source_url: row.source_url || null,
          list: "직접추가",
        });
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    notifyAddedPlacesChange();
  }

  async function resolveNaverPlace(url) {
    const client = sb();
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 사용할 수 있습니다." };
    const input = String(url || "").trim();
    if (!input) return { error: "네이버 지도 링크를 입력해 주세요." };

    const { data, error } = await client.functions.invoke("resolve-naver-place", {
      body: { url: input },
    });
    if (error) {
      console.warn("[resolve-naver-place]", error, data);
      let msg = error.message || "가게 정보를 가져오지 못했습니다.";
      try {
        if (data?.error) msg = data.error;
        else if (typeof error.context?.json === "function") {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        }
      } catch (_) {
        /* ignore */
      }
      return { error: msg };
    }
    if (data?.error) return { error: data.error };
    return {
      ok: true,
      sid: String(data.sid || ""),
      name: String(data.name || ""),
      address: String(data.address || ""),
      category: String(data.category || ""),
      px: data.px == null ? null : Number(data.px),
      py: data.py == null ? null : Number(data.py),
      partial: !!data.partial,
      source_url: data.source_url || input,
    };
  }

  async function addPlace(place) {
    const client = sb();
    if (!client) return { error: "Supabase 미설정" };
    if (!profile?.is_admin) return { error: "관리자만 추가할 수 있습니다." };

    const sid = String(place?.sid || place?.place_sid || "").trim();
    const name = String(place?.name || "").trim();
    const address = String(place?.address || "").trim();
    const category = String(place?.category || "").trim();
    const stars = Number(place?.stars);
    const n = Number.isInteger(stars) && stars >= 0 && stars <= 3 ? stars : 0;
    if (!sid) return { error: "가게 id가 없습니다." };
    if (!name) return { error: "가게 이름을 입력해 주세요." };

    if (hiddenSids.has(sid)) {
      return { error: "숨긴 가게입니다. 목록에 다시 넣으려면 숨김을 해제해 주세요." };
    }

    const { error } = await client.from("added_places").upsert(
      {
        place_sid: sid,
        name,
        address,
        category,
        stars: n,
        px: place?.px == null || place.px === "" ? null : Number(place.px),
        py: place?.py == null || place.py === "" ? null : Number(place.py),
        source_url: place?.source_url || null,
        created_by: session?.user?.id || null,
      },
      { onConflict: "place_sid" }
    );
    if (error) {
      console.warn("[added_places] insert failed", error);
      return { error: error.message || "가게 추가 실패" };
    }

    await loadAddedPlaces();
    return {
      ok: true,
      place: {
        sid,
        name,
        address,
        category,
        stars: n,
        px: place?.px ?? null,
        py: place?.py ?? null,
        list: "직접추가",
      },
    };
  }

  async function init(options = {}) {
    onMemosChange = typeof options.onMemosChange === "function" ? options.onMemosChange : null;
    onTagsChange = typeof options.onTagsChange === "function" ? options.onTagsChange : null;
    onHiddenChange = typeof options.onHiddenChange === "function" ? options.onHiddenChange : null;
    onStarsChange = typeof options.onStarsChange === "function" ? options.onStarsChange : null;
    onAddedPlacesChange =
      typeof options.onAddedPlacesChange === "function" ? options.onAddedPlacesChange : null;
    onAuthChangeCb = typeof options.onAuthChange === "function" ? options.onAuthChange : null;
    wireUi();
    renderAuthBar();
    await Promise.all([
      loadMemos(),
      loadTags(),
      loadHiddenPlaces(),
      loadStars(),
      loadAddedPlaces(),
    ]);

    const client = sb();
    if (!client) return;

    const { data } = await client.auth.getSession();
    await onAuthChange(data.session);

    client.auth.onAuthStateChange(async (_event, next) => {
      await onAuthChange(next);
    });
  }

  window.PlaceSocial = {
    init,
    getMemo(sid) {
      return memosBySid[String(sid)] || "";
    },
    getMemos() {
      return { ...memosBySid };
    },
    getTags(sid) {
      if (sid == null) return getTagsSnapshot();
      return (tagsBySid[String(sid)] || []).map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind === "region" ? "region" : "cuisine",
      }));
    },
    addTag,
    addTagsBulk,
    removeTag,
    removeTagByLabel,
    removeTagsBulk,
    clearKindTagsBulk,
    seedRegionTags,
    seedCuisineTags,
    replaceCuisineTags,
    repairTagKinds,
    reloadTags: loadTags,
    hidePlace,
    getHiddenPlaces: getHiddenSnapshot,
    setPlaceStars,
    getStars() {
      return { ...starsBySid };
    },
    resolveNaverPlace,
    addPlace,
    getAddedPlaces: getAddedPlacesSnapshot,
    reloadAddedPlaces: loadAddedPlaces,
    isAdmin() {
      return !!profile?.is_admin;
    },
    openLogin: openLoginModal,
    openProfile: openProfileModal,
    reloadMemos: loadMemos,
  };
})();
