-- Ապրանքներ գրել կարող է միայն 📦 «Ապրանքներ» իրավունք ունեցողը (ղեկավարը թույլատրում/արգելում է)
drop policy if exists products_write on products;
create policy products_write on products for all to authenticated
  using (has_perm('products', firm_id)) with check (has_perm('products', firm_id));
