-- Oil vs Carton product types
alter table public.products
  add column if not exists product_type text not null default 'oil'
    check (product_type in ('oil', 'carton'));

alter table public.products
  add column if not exists carton_size text
    check (carton_size is null or carton_size in ('1 Liter', '0.75 Liter'));

create index if not exists products_tenant_product_type_idx
  on public.products (tenant_id, product_type);
