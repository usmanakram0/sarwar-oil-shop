-- Enforce tenant isolation (policies already exist; RLS was not enabled on remote).
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

-- App uses "returned" when a customer returns an order.
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('paid', 'pending', 'partial', 'cancelled', 'returned'));
