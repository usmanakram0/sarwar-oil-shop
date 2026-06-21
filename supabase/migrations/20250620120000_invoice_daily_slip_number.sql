alter table public.invoices
  add column if not exists daily_slip_number integer;
