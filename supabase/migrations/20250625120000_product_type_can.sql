-- Can product type (unit-counted like cartons; size stored in carton_size)
alter table public.products drop constraint if exists products_product_type_check;
alter table public.products add constraint products_product_type_check
  check (product_type in ('oil', 'carton', 'can'));

alter table public.products drop constraint if exists products_carton_size_check;
alter table public.products add constraint products_carton_size_check
  check (
    carton_size is null
    or carton_size in (
      '1 Liter',
      '0.75 Liter',
      '10 Liters',
      '20 Liters',
      '30 Liters'
    )
  );
