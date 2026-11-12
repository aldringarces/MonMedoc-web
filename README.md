# MonMédoc — web

Website for MonMédoc, served by GitHub Pages at **https://monmedoc.kalatas.com** (CNAME file; Cloudflare DNS: CNAME `monmedoc` → `aldringarces.github.io`, DNS only).

- `app/` — the web version of the app (same Supabase database as the iPhone app). No build step: `index.html`, `style.css`, `app.js` and `js/` (lib, components, today, meds, followup, settings); Preact + htm + supabase-js loaded from esm.sh (pinned versions). Sign-in by email link.
- `rejoindre/` — invitation page (`?code=ABC123`): opens the iPhone app (`monmedoc://`) or the web version (`/app/?join=…`).
- `.well-known/apple-app-site-association` — ready for universal links if a paid Apple Developer account is used (would need the domain updated to monmedoc.kalatas.com in the app's Associated Domains).
- `index.html` — redirects to `/app/`.

The iPhone app's code is in the private repository `aldringarces/MonMedoc`.
