// Keep existing root OAuth/magic-link allowlists and old emails working after migration.
(() => {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  if (query.has('code') || hash.has('access_token') || hash.has('error') || query.has('error') || query.has('error_description')) {
    location.replace('/auth/callback' + location.search + location.hash);
  } else if (query.has('q')) {
    location.replace('/list' + location.search + location.hash);
  }
})();
