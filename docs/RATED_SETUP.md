# Enable player accounts and rated matches

The app works for AI/local games without these settings. Online ratings require Supabase Auth and persistent PostgreSQL. Ratings start at 1200, use Elo K=32, and update once after a completed 10-minute account-versus-account game. These are community Chess Studio ratings; AI and local games do not change them. The first 20 games are labelled provisional. This does not provide tournament anti-cheat enforcement.

## 1. Create the free project

Open https://supabase.com/dashboard and create `raimal-chess-studio` in `Raimal-Raja's Org`, selecting the Free plan. Save the database password securely. Free projects have quotas and can pause after inactivity: https://supabase.com/pricing.

## 2. Configure Render

In your Render service, open Environment and add:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL from Supabase project settings |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key from Supabase API keys; do not use a service-role key |
| `DATABASE_URL` | PostgreSQL **Session pooler** connection string from Supabase Connect, port 5432, with your password substituted and URL encoded |
| `SITE_URL` | `https://raimal-chess-studio.onrender.com` |

The backend enforces database SSL. The session pooler supports IPv4. Passwords and keys belong only in Render Environment; never paste the database password into chat or commit it. On the first account request, the backend creates the private `chess` schema and tables with row-level security enabled. Browser clients have no database access. Supabase Auth stores passwords; the app uses HttpOnly session cookies.

## 3. Choose a public sign-in method

Supabase's default email delivery is restricted to project-team email addresses and is unsuitable for public email signup. Configure custom SMTP before offering public email registration: https://supabase.com/docs/guides/auth/auth-smtp. Keep email confirmation enabled. Confirm the email, then sign in on Chess Studio.

Alternatively, enable GitHub sign-in without email delivery:

1. Create a GitHub OAuth app. Use the Chess Studio URL as its homepage and `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as the authorization callback URL.
2. Enable GitHub under Supabase Authentication > Providers and enter that app's client ID and secret there.
3. Set the Supabase Authentication URL Configuration Site URL to the Chess Studio URL and allow `https://raimal-chess-studio.onrender.com/rated/auth/callback` in Redirect URLs.
4. Add `SUPABASE_GITHUB_AUTH=true` to Render Environment.

The app uses server-side PKCE to exchange the GitHub login code. Tokens never enter localStorage. Provider instructions: https://supabase.com/docs/guides/auth/social-login/auth-github.

## 4. Deploy and verify

Push the changes, then Render > Manual Deploy > Deploy latest commit (or wait for auto deploy). Sign in with two separate accounts in separate browsers. Create a rated match, copy its invitation, and join with the second account. Play through a result or resign. Both ratings, records, leaderboard and match PGN should update; reloading should preserve the result. An equal-rated decisive game changes ratings by +16/-16. Waiting invitations can be cancelled without changing ratings. Only one unfinished match per account is allowed.

Cloud account/connection testing is required after entering the real settings; local tests use a test-only authentication fixture and SQLite.

## Confirmation resend

The account card offers Resend confirmation email without requiring the password. Signup and resend share a persistent limit of five requests per normalized email address per rolling 300 seconds, with a 60-second minimum interval. Provider failures still consume an attempt to prevent retry floods. Set custom SMTP Minimum interval per user to 60 seconds. Supabase's email rate limit remains project-wide and hourly; size it for all users and your SMTP provider quota. This app does not alter the provider's quota or guarantee delivery. The private email_budgets table stores SHA-256 identifiers and request timestamps, not plaintext email addresses.
