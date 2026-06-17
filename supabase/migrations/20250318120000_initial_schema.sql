-- Oil Shop — initial schema, RLS, and sync-friendly IDs (text client ids)
-- Run in Supabase SQL Editor or: supabase db push

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenants (one per shop / store account)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id text primary key,
  name text not null default 'Oil Shop',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (linked to auth.users after signup)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id text not null references public.tenants (id) on delete restrict,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

-- ---------------------------------------------------------------------------
-- Oil categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create unique index if not exists categories_tenant_name_unique
  on public.categories (tenant_id, lower(name));

-- ---------------------------------------------------------------------------
-- Products (containers / oils in stock)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  price_per_liter numeric(12, 2) not null default 0,
  stock numeric(12, 3) not null default 0,
  category text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists products_tenant_id_idx on public.products (tenant_id);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists customers_tenant_id_idx on public.customers (tenant_id);

-- ---------------------------------------------------------------------------
-- Suppliers / dealers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists suppliers_tenant_id_idx on public.suppliers (tenant_id);

-- ---------------------------------------------------------------------------
-- Invoices (items stored as JSONB for offline sync simplicity)
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  invoice_number text not null,
  customer_id text not null,
  customer_name text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(8, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  remaining_amount numeric(14, 2) not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'credit')),
  status text not null default 'pending'
    check (status in ('paid', 'pending', 'partial', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists invoices_tenant_id_idx on public.invoices (tenant_id);
create index if not exists invoices_tenant_customer_idx on public.invoices (tenant_id, customer_id);
create index if not exists invoices_tenant_created_idx on public.invoices (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Customer ledger payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  customer_id text not null,
  customer_name text not null default '',
  invoice_id text,
  invoice_number text,
  amount numeric(14, 2) not null default 0,
  type text not null check (type in ('credit', 'debit')),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists payments_tenant_customer_idx on public.payments (tenant_id, customer_id);
create index if not exists payments_tenant_created_idx on public.payments (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Stock purchases from suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.stock_purchases (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  slip_number text not null,
  supplier_id text not null,
  supplier_name text not null default '',
  vehicle_number text not null default '',
  vehicle_driver text not null default '',
  vehicle_type text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  remaining_amount numeric(14, 2) not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'credit')),
  status text not null default 'pending'
    check (status in ('paid', 'pending', 'partial')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists stock_purchases_tenant_id_idx on public.stock_purchases (tenant_id);

-- ---------------------------------------------------------------------------
-- Supplier payments
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  supplier_id text not null,
  supplier_name text not null default '',
  purchase_id text,
  slip_number text,
  amount numeric(14, 2) not null default 0,
  type text not null check (type in ('credit', 'debit')),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (id, tenant_id)
);

create index if not exists supplier_payments_tenant_idx on public.supplier_payments (tenant_id, supplier_id);

-- ---------------------------------------------------------------------------
-- Shop settings (one row per tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_settings (
  tenant_id text primary key references public.tenants (id) on delete cascade,
  shop_name text not null default 'Oil Shop',
  shop_address text not null default '',
  shop_phone text not null default '',
  tax_rate numeric(6, 2) not null default 0,
  currency text not null default 'Rs',
  thank_you_message text not null default 'Thank you for your business!',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Seed tenants (match app demo tenant ids)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, name) values
  ('tenant-1', 'Oil Shop'),
  ('tenant-2', 'Demo Oil Shop')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: current user's tenant_id (for RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_tenant_id() from public;
grant execute on function public.current_tenant_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create profile on auth signup (set tenant_id in user metadata at signup)
-- Example signUp metadata: { "tenant_id": "tenant-1", "first_name": "Usman", "last_name": "Ahmed" }
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  tid text;
begin
  meta := new.raw_user_meta_data;
  tid := coalesce(meta ->> 'tenant_id', 'tenant-1');
  insert into public.tenants (id, name)
  values (tid, coalesce(meta ->> 'shop_name', 'Oil Shop'))
  on conflict (id) do nothing;
  insert into public.profiles (id, tenant_id, email, first_name, last_name, phone)
  values (
    new.id,
    tid,
    new.email,
    coalesce(meta ->> 'first_name', ''),
    coalesce(meta ->> 'last_name', ''),
    coalesce(meta ->> 'phone', '')
  );
  insert into public.shop_settings (tenant_id) values (tid)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.stock_purchases enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.shop_settings enable row level security;

-- Profiles: own row only
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Tenants: read own tenant
create policy "tenants_select_own" on public.tenants
  for select to authenticated using (id = public.current_tenant_id());

-- Generic tenant isolation for data tables
create policy "categories_tenant_all" on public.categories
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "products_tenant_all" on public.products
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "customers_tenant_all" on public.customers
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "suppliers_tenant_all" on public.suppliers
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "invoices_tenant_all" on public.invoices
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "payments_tenant_all" on public.payments
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "stock_purchases_tenant_all" on public.stock_purchases
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "supplier_payments_tenant_all" on public.supplier_payments
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "shop_settings_tenant_all" on public.shop_settings
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- Updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger stock_purchases_set_updated_at before update on public.stock_purchases
  for each row execute function public.set_updated_at();
create trigger shop_settings_set_updated_at before update on public.shop_settings
  for each row execute function public.set_updated_at();
