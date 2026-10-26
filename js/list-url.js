// Preserve restaurant URLs shared through the original RSS feed.
(() => {
  const query = new URLSearchParams(location.search).get('q');
  const field = document.getElementById('q');
  if (query && field) {
    field.value = query;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
})();
