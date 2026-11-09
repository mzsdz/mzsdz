# AGENTS.md

## Cursor Cloud specific instructions

This repo (`맛집신동진`) is a **static site** — vanilla HTML/CSS/JS with no build step. Data is bundled in `places.js`/`data/places.json`. The backend is a **hosted** Supabase project (URL + anon key committed in `js/supabase-client.js`), so no local database is needed to run the site.

### Run the site (dev)
Serve the repo root over HTTP (OAuth/magic-link do not work from `file://`):
```bash
npx --yes serve . -l 3000
# or: python3 -m http.server 3000
```
Then open `http://localhost:3000/`. Core browsing/filtering (star rating 별점, region 지역, cuisine 종류) works without any auth or DB because the place data is bundled.

### Lint / test / build
None are configured. `npm test` is a placeholder that intentionally fails (`exit 1`). There is no build step and no linter.

### Non-obvious notes
- `npm install` only pulls a single dependency (`@vercel/analytics`); the site loads Supabase from a CDN and degrades gracefully without npm deps.
- Expected harmless console noise when running locally: 404s for `script_ie11.js`/`.css` and Vercel analytics (`/_vercel/insights`), plus a Supabase RPC warning for `touch_site_visit`. None block core functionality.
- Supabase auth (Google / email magic link) requires provider config and redirect URLs on the hosted project; it cannot be fully exercised locally without those credentials.
- Python scripts in `scripts/` are offline ETL (stdlib only, no `requirements.txt`) used to regenerate `places.js`/`rss.xml`; not needed to run the site.
- Supabase schema changes go through CLI migrations in `supabase/migrations/` (see `.cursor/rules/supabase-migrations.mdc`), never the SQL Editor. The Windows path in that rule does not apply here — work from the repo root.
