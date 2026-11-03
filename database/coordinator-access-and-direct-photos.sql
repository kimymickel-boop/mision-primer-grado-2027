begin;
alter table public.mision_families drop constraint mision_account_kind_check;
alter table public.mision_families add constraint mision_account_kind_check check (((id between 1 and 12) and not is_teacher) or (id in (13,14) and is_teacher and not is_treasurer and child=''));
insert into public.mision_families(id,name,child,email,is_treasurer,username,is_teacher) values(14,'Coordinación','', 'coordinacion.'||gen_random_uuid()::text||'@accounts.mision.invalid',false,'coordinacion',true);
create table mision_private.coordinator_link(id boolean primary key default true check(id),token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,used_at timestamptz,updated_at timestamptz not null default now());
alter table mision_private.coordinator_link enable row level security;
revoke all on mision_private.coordinator_link from public,anon,authenticated;
create function public.mision_coordinator_issue(p_hash text,p_expires timestamptz) returns void language plpgsql security definer set search_path='' as $f$
declare who uuid;
begin
 if p_hash !~ '^[a-f0-9]{64}$' or p_expires>now()+interval '24 hours 1 minute' then raise exception 'Invalid coordinator link';end if;
 select user_id into who from mision_private.members where family_id=14;
 if who is not null then perform public.mision_access_revoke_sessions(who);end if;
 insert into mision_private.coordinator_link(id,token_hash,expires_at) values(true,p_hash,p_expires) on conflict(id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,updated_at=now(),used_at=null;
end;$f$;
create function public.mision_coordinator_consume(p_hash text) returns table(user_id uuid,email text) language sql security definer set search_path='' as $f$
 with consumed as (update mision_private.coordinator_link set used_at=now() where id and token_hash=p_hash and used_at is null and expires_at>now() returning id) select m.user_id,f.email from consumed cross join public.mision_families f left join mision_private.members m on m.family_id=f.id where f.id=14 and not f.is_treasurer;
$f$;
create function public.mision_coordinator_active(p_hash text) returns boolean language sql security definer set search_path='' as $f$
 select exists(select 1 from mision_private.coordinator_link where id and token_hash=p_hash and expires_at>now());
$f$;
create function public.mision_coordinator_account() returns table(user_id uuid,email text) language sql security definer set search_path='' as $f$
 select m.user_id,f.email from public.mision_families f left join mision_private.members m on m.family_id=f.id where f.id=14 and not f.is_treasurer;
$f$;
revoke all on function public.mision_coordinator_issue(text,timestamptz),public.mision_coordinator_consume(text),public.mision_coordinator_active(text),public.mision_coordinator_account() from public,anon,authenticated;
grant execute on function public.mision_coordinator_issue(text,timestamptz),public.mision_coordinator_consume(text),public.mision_coordinator_active(text),public.mision_coordinator_account() to service_role;
do $f$ declare tab text;begin
 foreach tab in array array['mision_payments','mision_expenses','mision_totals','mision_settings','mision_proposals','mision_polls','mision_votes'] loop
 execute format('create policy coordinator_scope on public.%I as restrictive for all to authenticated using ((select mision_private.family_id()) is distinct from 14) with check ((select mision_private.family_id()) is distinct from 14)',tab);
 end loop;
end;$f$;
alter table public.mision_photos alter column state set default 'approved';
alter policy photos_submit on public.mision_photos with check ((select mision_private.is_member()) and family=(select mision_private.family_id()) and created_by=(select auth.uid()) and state='approved' and path ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}[.](jpg|png|webp)$'));
alter policy mision_photo_add on storage.objects with check (bucket_id='mision-recuerdos' and (select mision_private.is_member()) and ((select mision_private.is_treasurer()) or ((storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.mision_photos p where p.path=objects.name and p.created_by=(select auth.uid()) and p.state in ('pending','approved')))));
commit;
