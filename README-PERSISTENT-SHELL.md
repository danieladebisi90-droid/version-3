# Scoridium Persistent Shell — first migration

## What changed
- New `app.html`, `app-shell.css`, `app-shell.js` are the permanent header/router.
- Dashboard, Game Hub, Roster and Stats are displayed in the shell's same-origin frame; page scripts remain isolated and execute normally. The shell does not reload when switching tabs.
- My Teams now opens the shell, and the team onboarding Finish Setup links target the shell.
- Direct visits to the four core HTML pages redirect into the shell when a team is selected.
- A shared team name, colours and season selector remain visible while only content changes.
- Browser back/forward supports tabs via `?page=`.

## Important limitations
This is an incremental persistent-shell architecture, **not** a full single-page application. A destination's content HTML and JS still load on navigation in the embedded frame. It is more continuous visually, but a genuinely no-reload content router will require refactoring the independent page scripts into mount/unmount modules and ensuring Supabase subscriptions are properly cleaned up.

## Install / test
1. Back up your entire Scoridium folder. Extract this ZIP over your existing project, keeping file names and casing (notably `Dashboard.js`, `Login.html`).
2. Run through localhost (e.g. VS Code Live Server) or HTTPS, not from file://. Same-origin scripts/frames require this.
3. Start at `myTeams.html`, select a team, verify `app.html?page=dashboard.html` opens.
4. Navigate Dashboard → Game Hub → Roster → Stats; browser Back/Forward; change season; open another team; verify a direct visit to dashboard.html redirects into shell.
5. Carefully test calendar Subscribe/Manage, roster, stats, games and player profile links. These are unchanged but run inside a frame; third-party browser restrictions may differ.
6. Check mobile and iPad viewport/scrolling, browser printing and file export.

## Rollback
Restore the last `scoridium-navigation-v2.zip` files if any regression occurs; no Supabase schema or RLS changes were made.

## Security
Only a same-origin, fixed allowlist of local core pages may be loaded by the shell's router. No privileged keys or new authentication logic were added. Existing Supabase RLS is still required.
