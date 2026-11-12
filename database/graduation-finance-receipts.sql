
create or replace function mision_private.finance_reader() returns boolean language sql stable set search_path='' as $$ select coalesce(mision_private.is_treasurer() or mision_private.family_id()=2,false); $$;
revoke all on function mision_private.finance_reader() from public,anon;
grant execute on function mision_private.finance_reader() to authenticated;
create policy finance_observer_families on public.mision_families for select to authenticated using ((select mision_private.finance_reader()));
create policy finance_observer_payments on public.mision_payments for select to authenticated using ((select mision_private.finance_reader()));
alter table public.mision_payments add column receipt_path text, add column currency text not null default 'USD' check(currency in ('USD','VES')), add column original_amount numeric check(original_amount>0), add column exchange_rate numeric check(exchange_rate>0), add column quota_number smallint check(quota_number between 1 and 6), add column supplier_confirmed boolean not null default false, add column supplier_reference text;
alter table public.mision_payments add constraint payment_currency_consistent check(currency='USD' or (original_amount is not null and exchange_rate is not null and abs(amount-round(original_amount/exchange_rate,2))<=0.01));
drop policy payment_add on public.mision_payments;
create policy payment_add on public.mision_payments for insert to authenticated with check((select mision_private.is_treasurer()) and state='pending' and created_by=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('mision-comprobantes','mision-comprobantes',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy finance_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='mision-comprobantes' and (select mision_private.is_treasurer()));
create policy finance_receipt_read on storage.objects for select to authenticated using(bucket_id='mision-comprobantes' and (select mision_private.finance_reader()));
create policy finance_receipt_cleanup on storage.objects for delete to authenticated using(bucket_id='mision-comprobantes' and (select mision_private.is_treasurer()) and not exists(select 1 from public.mision_payments p where p.receipt_path=name));
update public.mision_settings set quota=209.99 where id=true;
