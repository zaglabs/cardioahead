-- Private synthetic-data pilot. Run in a dedicated Supabase project.
begin;
create table public.clinic_staff (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique check(email=lower(email)),
 role text not null check(role in ('admin','secretary','professor'))
);
create table public.appointments (
 id uuid primary key, patient_label text not null check(length(patient_label) between 1 and 100),
 appointment_at timestamptz, status text not null default 'invited' check(status in ('invited','submitted','reviewed')),
 token_hash text not null unique, pin_digest text not null,
 expires_at timestamptz not null, revoked_at timestamptz,
 failed_attempts integer not null default 0 check(failed_attempts>=0),
 created_by uuid not null references public.clinic_staff(id), created_at timestamptz not null default now(),
 submitted_at timestamptz
);
create table public.portal_sessions (
 session_hash text primary key, kind text not null check(kind in ('staff','patient')),
 staff_id uuid references public.clinic_staff(id) on delete cascade,
 appointment_id uuid references public.appointments(id) on delete cascade,
 expires_at timestamptz not null,
 check((kind='staff' and staff_id is not null and appointment_id is null) or (kind='patient' and staff_id is null and appointment_id is not null))
);
create table public.documents (
 id uuid primary key, appointment_id uuid not null references public.appointments(id) on delete cascade,
 filename text not null, storage_path text not null unique, sha256 text not null,
 bytes integer not null check(bytes>0 and bytes<=4194304), created_at timestamptz not null default now(),
 unique(appointment_id,sha256)
);
create table public.audit_events (
 id bigint generated always as identity primary key, event text not null,
 actor_id uuid, appointment_id uuid, document_id uuid, created_at timestamptz not null default now()
);
create function public.audit_appointment_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(event,actor_id,appointment_id) values('invitation_created',new.created_by,new.id);
 return new;
end; $$;
revoke all on function public.audit_appointment_created() from public,anon,authenticated;
create trigger appointment_created after insert on public.appointments for each row execute function public.audit_appointment_created();
create index documents_appointment on public.documents(appointment_id);
create index sessions_expiry on public.portal_sessions(expires_at);
alter table public.clinic_staff enable row level security;
alter table public.appointments enable row level security;
alter table public.portal_sessions enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;
-- No browser access, even after Supabase authentication. All access is authorized by server routes.
revoke all on public.clinic_staff, public.appointments, public.portal_sessions, public.documents, public.audit_events from anon, authenticated;
grant all on public.clinic_staff, public.appointments, public.portal_sessions, public.documents, public.audit_events to service_role;
grant usage, select on sequence public.audit_events_id_seq to service_role;

create function public.verify_patient_pin(p_token_hash text,p_pin_digest text,p_session_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype;
begin
 select * into a from public.appointments where token_hash=p_token_hash for update;
 if not found or a.revoked_at is not null or a.expires_at<=now() or a.failed_attempts>=5 then return false; end if;
 if a.pin_digest<>p_pin_digest then
   update public.appointments set failed_attempts=failed_attempts+1 where id=a.id;
   return false;
 end if;
 update public.appointments set failed_attempts=0 where id=a.id;
 insert into public.portal_sessions(session_hash,kind,appointment_id,expires_at)
 values(p_session_hash,'patient',a.id,least(a.expires_at,now()+interval '2 hours'));
 insert into public.audit_events(event,appointment_id) values('patient_verified',a.id);
 return true;
end; $$;

create function public.attach_document(p_record jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype; n integer;
begin
 select * into a from public.appointments where id=(p_record->>'appointment_id')::uuid for update;
 if not found or a.revoked_at is not null or a.expires_at<=now() or a.status<>'invited' then raise exception 'upload closed'; end if;
 select count(*) into n from public.documents where appointment_id=a.id;
 if n>=10 then raise exception 'document limit'; end if;
 insert into public.documents(id,appointment_id,filename,storage_path,sha256,bytes,created_at)
 values((p_record->>'id')::uuid,a.id,p_record->>'filename',p_record->>'storage_path',p_record->>'sha256',(p_record->>'bytes')::integer,(p_record->>'created_at')::timestamptz);
 insert into public.audit_events(event,appointment_id,document_id) values('document_uploaded',a.id,(p_record->>'id')::uuid);
end; $$;

create function public.submit_appointment(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype;
begin
 select * into a from public.appointments where id=p_id for update;
 if not found or a.revoked_at is not null or a.expires_at<=now() or a.status<>'invited' then return false; end if;
 if not exists(select 1 from public.documents where appointment_id=p_id) then return false; end if;
 update public.appointments set status='submitted',submitted_at=now() where id=p_id;
 insert into public.audit_events(event,appointment_id) values('documents_submitted',p_id);
 return true;
end; $$;

create function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.appointments set revoked_at=now() where id=p_id;
 delete from public.portal_sessions where appointment_id=p_id;
 insert into public.audit_events(event,appointment_id) values('invitation_revoked',p_id);
end; $$;
revoke all on function public.verify_patient_pin(text,text,text), public.attach_document(jsonb),public.submit_appointment(uuid),public.revoke_invitation(uuid) from public,anon,authenticated;
grant execute on function public.verify_patient_pin(text,text,text),public.attach_document(jsonb),public.submit_appointment(uuid),public.revoke_invitation(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cardioahead-private','cardioahead-private',false,4194304,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=4194304,allowed_mime_types=array['application/pdf'];
-- Deliberately no storage.objects policies for anon/authenticated.
commit;
