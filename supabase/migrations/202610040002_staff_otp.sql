-- Application-owned email identities and direct Resend OTP; no Supabase Auth/SMTP/webhooks.
begin;
alter table public.clinic_staff drop constraint clinic_staff_id_fkey;
alter table public.clinic_staff add column status text not null default 'pending' check(status in ('pending','active','suspended','rejected'));
alter table public.clinic_staff add column created_at timestamptz not null default now();
-- Existing identities need the owner's approval after this authentication migration.
update public.clinic_staff set role='secretary' where role='admin' and email<>'galadv73@gmail.com';
insert into public.clinic_staff(id,email,role,status)
values(gen_random_uuid(),'galadv73@gmail.com','admin','active')
on conflict(email) do update set role='admin',status='active';
alter table public.clinic_staff add constraint sole_admin check(
 (email='galadv73@gmail.com' and role='admin' and status='active') or
 (email<>'galadv73@gmail.com' and role<>'admin')
);
delete from public.portal_sessions where kind='staff';
create function public.protect_clinic_owner() returns trigger language plpgsql set search_path='' as $$
begin
 if old.email='galadv73@gmail.com' then raise exception 'owner is protected'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger protect_owner before update or delete on public.clinic_staff for each row execute function public.protect_clinic_owner();
revoke all on function public.protect_clinic_owner() from public,anon,authenticated;

create table public.staff_otp_challenges(
 id text primary key, email text not null, code_digest text not null, ip_hash text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 attempts integer not null default 0 check(attempts between 0 and 5),
 delivered boolean not null default false, consumed boolean not null default false
);
create index staff_otp_email_time on public.staff_otp_challenges(email,created_at);
create index staff_otp_ip_time on public.staff_otp_challenges(ip_hash,created_at);
alter table public.staff_otp_challenges enable row level security;
revoke all on public.staff_otp_challenges from anon,authenticated;
grant all on public.staff_otp_challenges to service_role;

create function public.reserve_staff_otp(p_challenge jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare e text:=p_challenge->>'email'; ip text:=p_challenge->>'ip_hash';
begin
 -- A transaction advisory lock serializes all reservations, including first-time emails.
 -- This keeps email and IP limits atomic across parallel serverless instances.
 perform pg_catalog.pg_advisory_xact_lock(730041);
 delete from public.staff_otp_challenges where created_at<now()-interval '1 hour';
 if exists(select 1 from public.staff_otp_challenges where email=e and created_at>now()-interval '1 minute')
 or (select count(*) from public.staff_otp_challenges where email=e)>=5
 or (select count(*) from public.staff_otp_challenges where ip_hash=ip)>=30 then return false; end if;
 update public.staff_otp_challenges set consumed=true where email=e;
 insert into public.staff_otp_challenges(id,email,code_digest,ip_hash,expires_at)
 values(p_challenge->>'id',e,p_challenge->>'code_digest',ip,now()+interval '10 minutes');
 return true;
end; $$;
create function public.staff_otp_delivery(p_id text,p_delivered boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.staff_otp_challenges set delivered=p_delivered,consumed=consumed or not p_delivered where id=p_id;
end; $$;
create function public.verify_staff_otp(p_id text,p_email text,p_digest text,p_session_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.staff_otp_challenges%rowtype; s public.clinic_staff%rowtype;
begin
 select * into c from public.staff_otp_challenges where id=p_id and email=p_email for update;
 if not found or c.consumed or not c.delivered or c.attempts>=5 or c.expires_at<=now() then return null; end if;
 if c.code_digest<>p_digest then
   update public.staff_otp_challenges set attempts=attempts+1 where id=p_id;
   return null;
 end if;
 update public.staff_otp_challenges set consumed=true where id=p_id;
 insert into public.clinic_staff(id,email,role,status) select gen_random_uuid(),p_email,'secretary','pending' where not exists(select 1 from public.clinic_staff where email=p_email) on conflict(email) do nothing;
 select * into s from public.clinic_staff where email=p_email for update;
 if s.status in ('suspended','rejected') then return null; end if;
 insert into public.portal_sessions(session_hash,kind,staff_id,expires_at)
 values(p_session_hash,'staff',s.id,now()+interval '2 hours');
 insert into public.audit_events(event,actor_id) values('staff_signed_in',s.id);
 return to_jsonb(s);
end; $$;
create function public.manage_clinic_staff(p_actor uuid,p_id uuid,p_status text,p_role text)
returns boolean language plpgsql security definer set search_path='' as $$
declare target public.clinic_staff%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and email='galadv73@gmail.com' and role='admin' and status='active') then return false; end if;
 if p_status not in ('active','suspended','rejected') or p_role not in ('secretary','professor') then return false; end if;
 select * into target from public.clinic_staff where id=p_id for update;
 if not found or target.email='galadv73@gmail.com' then return false; end if;
 update public.clinic_staff set status=p_status,role=p_role where id=p_id;
 if p_status<>'active' then delete from public.portal_sessions where staff_id=p_id; end if;
 insert into public.audit_events(event,actor_id) values('staff_'||p_status,p_actor);
 return true;
end; $$;
revoke all on function public.reserve_staff_otp(jsonb),public.staff_otp_delivery(text,boolean),public.verify_staff_otp(text,text,text,text),public.manage_clinic_staff(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_staff_otp(jsonb),public.staff_otp_delivery(text,boolean),public.verify_staff_otp(text,text,text,text),public.manage_clinic_staff(uuid,uuid,text,text) to service_role;
commit;
