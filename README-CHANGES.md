# Scoridium — uploaded project fixes (Nov 2026)

This ZIP preserves the existing game tracker, stats calculations, games, and Supabase schema. It does not run SQL or modify your live database.

## Changes
- Shared team-theme.js applied by pageLayout.js from teams.primary_color and teams.secondary_color. Dashboard, Game Hub, Roster, Stats now reference the selected team's branding in shared and major page styles.
- Dashboard no longer force-sets body background from separate code. Existing team creation still saves final shades as normal hex values.
- My Teams redesigned, uses real mascot initials and saved colours, has Create Team and Sign Out buttons; fixes case-sensitive login redirect to Login.html.
- Login page redesigned. Added signup.html, forgot-password.html, reset-password.html, help.html and auth-pages.js using Supabase Auth.

## Important: Supabase Auth settings
- In Supabase -> Authentication -> URL Configuration: set **Site URL** to your actual deployed Scoridium origin and include exact allowed redirect URLs for `/reset-password.html` and `/myTeams.html` (and any dev origins you use).
- Confirm email/password signups are enabled under Authentication -> Providers -> Email.
- Local `file://` browser opening is not supported for reliable OAuth/email callback URLs; use a local HTTP server or deployed website.
- Supabase hosted emails may be rate limited or have delivery restrictions; test signup/forgot-password with a second account and confirm receipt.
- Password reset links can only be used once and must be opened on the correct origin.
- Do not use a Supabase secret/service_role key in browser code.

## Test checklist
1. Sign in; open My Teams; verify both teams have their own initials and colours.
2. Select a black/grey team; visit Dashboard -> Game Hub -> Roster -> Stats. Check main backgrounds, nav, logos, and controls.
3. Return to My Teams, select navy/gold team, and repeat. These should switch without leftover styles.
4. Create account using a different email; confirm by email if enabled; verify it can log in.
5. Send forgot password email and complete the reset flow.
6. Verify Help link and Create Team navigation.

## Known limits
- This update has been statically checked, not run in your deployed browser or against live Supabase.
- Very old one-off colours (e.g., specialized charts and SVGs) may still need selective refinements; verify contrast particularly for bright teams.
- Your ZIP does not include playbook.html, so no Playbook edits were possible.
