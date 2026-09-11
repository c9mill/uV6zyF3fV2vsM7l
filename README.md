http://127.0.0.1:4173/.

## Розклад

`/розклад/` uses the public Vseosvita share page for semester 107911, school 11778.
`src/schedule-worker.js` is copied to `dist/_worker.js` by `python build.py`.
Cloudflare Pages runs it only on `/api/schedule` (`dist/_routes.json`); all other pages stay static.
No API keys, database, login, or third-party proxy is used. Source URLs are fixed, and selected IDs must belong to the published group/teacher list.

The worker reads the public HTML using HTMLRewriter, caches successful results for 5 minutes, and returns the actual check time.
The page refreshes every 5 minutes while visible. When the source fails or changes its structure, it shows an error with a retry button and source link instead of inventing or silently displaying stale lessons.
To switch to a future semester, update `BASE.id_schedule` in `src/schedule-worker.js` and the source links in `src/schedule.html`, rebuild, and deploy.

For local testing of live data use `npx wrangler pages dev dist --port 4174`; Python's static preview cannot run the schedule API.
