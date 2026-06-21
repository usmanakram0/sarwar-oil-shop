alter table public.invoices
  add column if not exists edited_at timestamptz;
