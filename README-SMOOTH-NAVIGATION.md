# Scoridium smoother navigation — version 2

## What changed
- Main pages now render the shared navbar and footer in the HTML itself (rather than fetching `pageLayout.html` and inserting them after load).
- A tiny inline snippet restores the selected team name and season label before painting the header.
- Existing `pageLayout.js` still refreshes team name/colours/seasons from Supabase concurrently, retaining `window.pageLayoutReady` for page code.
- `navigation-smooth.css` uses same-origin cross-document View Transitions when the browser supports them, with reduced-motion support. Unsupported browsers simply navigate normally.

## Install
Back up your project. Replace the matching files with this ZIP, including the new `navigation-smooth.css`.
Open through a local development server or HTTPS website, not `file://` (browser View Transitions require same-origin navigation support).
Hard refresh once after deployment. Test Dashboard → Game Hub → Roster → Stats and switching teams in My Teams.

## Notes
- This does not make Scoridium a single-page app: on each navigation, HTML and scripts still reload. For fully continuous transitions, a more invasive persistent-shell router could be developed later.
- Keep `pageLayout.html` in the project for any pages not updated here; main pages no longer fetch it.
- Supabase configuration and RLS were not changed.
- Browser runtime behavior has not been tested against a live Supabase project.
