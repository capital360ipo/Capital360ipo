# Capital360IPO starter (Next.js + Supabase)

## Included
- Next.js App Router frontend: Home, IPOs, Stocks, News, About.
- Supabase schema for IPOs, GMP observations, news, stock/index snapshots, team profiles and automation logs.
- Public APIs for verified IPOs and published news.
- RSS collector endpoint protected by a server-side CRON_SECRET.
- GitHub Actions scheduled RSS import every 30 minutes.
- RSS stories enter as `pending`, never auto-publish unreviewed material.

## Local setup
Requires Node.js 20+.
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill Supabase URL + anon key.
3. Create a Supabase project and run `supabase/schema.sql` in SQL Editor.
4. `npm run dev`

## Automation setup
Set server environment variables: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEWS_RSS_URLS`. The service-role key must never use a NEXT_PUBLIC_ prefix and must never be committed. RSS feeds must be sources whose terms permit your intended use. GitHub repository secrets: `SITE_URL` and `CRON_SECRET`. Enable Actions.

## Team roles
Supabase Auth users should be invited/created by a trusted owner. Add a `profiles` row for each auth user with role `owner`, `admin`, `editor`, or `viewer`. Never let users self-assign roles. The schema has role-based RLS policies, but a finished invitation/role-management dashboard still needs to be built and security-tested.

## Important limitations
This is a working project foundation, not a fully automated financial data terminal. Live NSE/BSE quotes, IPO allotment integrations, GMP feeds, automatic Hindi translation and a finished admin dashboard are not connected yet. Use data providers whose licenses explicitly permit display/redistribution. GMP is unofficial; label it with source and timestamp. Do not scrape or republish content without permission. Add domain, backups, MFA, rate limiting, monitoring and a legal/compliance review before commercial launch.
