# Supabase setup (Oil Shop)

This app is **offline-first**: all reads/writes use **localStorage** immediately. When the device is **online** and you are signed in to **Supabase Auth**, changes sync to Postgres automatically.

## Database status (project `jmeosuqxmahxpepkvyej`)

The following was applied to **Sarwar Oil Shop** via Supabase MCP:

- Migrations: `initial_schema`, `initial_schema_rls_and_triggers`
- Tables + RLS enabled (11 tables)
- Seed tenants: `tenant-1`, `tenant-2`
- Auth users: `admin@oilshop.com`, `demo@oilshop.com` (profiles created by trigger)

To re-apply from scratch locally (optional):

```bash
supabase login
supabase link --project-ref jmeosuqxmahxpepkvyej
supabase db push
```

**Note:** `supabase login` must use the same Supabase account that owns this project. If `supabase link` says “no privileges”, you are logged into a different account in the terminal than in Cursor.

## 1. Run the database migration (manual fallback)

If you use a new project, paste and run:

`supabase/migrations/20250318120000_initial_schema.sql`

in the SQL Editor, or use `supabase db push` after linking.

## 2. Environment variables (frontend only)

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://jmeosuqxmahxpepkvyej.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon public JWT>
```

Use only the **anon public** key in the app. Never commit **service_role** or **secret** keys to git or the browser.

Restart `npm run dev` after changing env vars.

## 3. Create Auth users (required for sync)

RLS uses `auth.uid()` → `profiles.tenant_id`. Sync only works after Supabase Auth sign-in.

In **Authentication → Users → Add user**, create:

| Email | Password | Tenant (metadata) |
|-------|------------|-------------------|
| admin@oilshop.com | admin123 | `tenant_id`: `tenant-1` |
| demo@oilshop.com | demo123 | `tenant_id`: `tenant-2` |

When creating users in the dashboard, you can skip metadata; then link profiles manually (step 4).

## 4. Link profiles to tenants (if users existed before migration)

After users exist in **Authentication**, run in SQL Editor (adjust names/phone as needed):

```sql
insert into public.profiles (id, tenant_id, email, first_name, last_name, phone)
select
  u.id,
  case
    when u.email = 'admin@oilshop.com' then 'tenant-1'
    when u.email = 'demo@oilshop.com' then 'tenant-2'
    else 'tenant-1'
  end,
  u.email,
  'Usman',
  'Ahmed',
  '+92 300 1234567'
from auth.users u
where u.email in ('admin@oilshop.com', 'demo@oilshop.com')
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  email = excluded.email;

insert into public.shop_settings (tenant_id)
select tenant_id from public.profiles
on conflict (tenant_id) do nothing;
```

## 5. How sync behaves

- **Offline**: app works normally; data stays in localStorage; banner shows “Offline”.
- **Online + local login**: app signs into Supabase when possible (same email/password).
- **Online + Supabase session**: pending local changes upload via upsert (categories → products → … → settings).
- **No Supabase session**: banner shows “Cloud sync paused” — fix Auth users / passwords, then sign in again.

Manual sync: **Settings → Sync to cloud** (when online).

## 6. Security note

If API keys were shared in chat or committed, rotate them in Supabase → **Settings → API**.

## Tables created

| Table | Purpose |
|-------|---------|
| `tenants` | Shop / store account |
| `profiles` | User ↔ tenant mapping |
| `categories` | Oil categories |
| `products` | Stock products |
| `customers` | Customers |
| `suppliers` | Dealers |
| `invoices` | Sales (items as JSONB) |
| `payments` | Customer ledger |
| `stock_purchases` | Stock in slips |
| `supplier_payments` | Supplier ledger |
| `shop_settings` | One row per tenant |

All data tables use composite primary key `(id, tenant_id)` so client-generated IDs sync cleanly.
