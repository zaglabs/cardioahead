-- Personal Clalit test: private provenance, scoped grants and Claude consent.
-- Full fetched source text is held in request/collector memory, never stored in this schema.
-- On completion, persist only metadata and short exact supporting excerpts.
begin;
alter table public.appointments add column personal_import_source boolean not null default false;
alter table public.appointments add column medical_records_count integer not null default 0 check(medical_records_count>=0);
create table public.medical_record_imports(
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 owner_id uuid not null references public.clinic_staff(id),
 provider text not null default 'clalit' check(provider='clalit'),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 bundle jsonb not null,
 ai_consent boolean not null default false,
 consent_at timestamptz not null default now(),
 status text not null default 'received' check(status in('received','generating','ready','failed')),
 summary jsonb,model text,error_code text,
 attempts integer not null default 0 check(attempts between 0 and 3),
 lease_token uuid,lease_until timestamptz,
 visual jsonb,visual_created_by uuid,visual_created_at timestamptz,
 review_overrides jsonb not null default '{}'::jsonb,
 reviewed_by uuid,reviewed_at timestamptz,
 created_at timestamptz not null default now(),completed_at timestamptz,
 unique(appointment_id,source_hash)
);
create table public.medical_import_grants(
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 owner_id uuid not null references public.clinic_staff(id),
 ai_consent boolean not null default false,
 expires_at timestamptz not null,used_at timestamptz,
 import_id uuid references public.medical_record_imports(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.medical_record_imports enable row level security;
alter table public.medical_import_grants enable row level security;
revoke all on public.medical_record_imports,public.medical_import_grants from public,anon,authenticated;
grant all on public.medical_record_imports,public.medical_import_grants to service_role;
create function public.create_medical_import_grant(p_actor uuid,p_appointment uuid,p_hash text,p_ai_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype; g public.medical_import_grants%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and email='galadv73@gmail.com' and role='admin' and status='active') then raise exception 'owner required';end if;
 select * into a from public.appointments where id=p_appointment for update;
 if not found or a.deletion_requested_at is not null or a.intake_mode<>'clinic' or a.created_by is distinct from p_actor then raise exception 'personal clinic card required';end if;
 if exists(select 1 from public.documents where appointment_id=p_appointment) then raise exception 'separate personal card required';end if;
 insert into public.medical_import_grants(token_hash,appointment_id,owner_id,ai_consent,expires_at)
 values(p_hash,p_appointment,p_actor,p_ai_consent,now()+interval '45 minutes') returning * into g;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('personal_import_authorized',p_actor,p_appointment,jsonb_build_object('provider','clalit','ai_provider',case when p_ai_consent then 'anthropic' else null end));
 return to_jsonb(g);
end;$$;
create function public.accept_medical_import(p_hash text,p_source_hash text,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.medical_import_grants%rowtype; a public.appointments%rowtype; r public.medical_record_imports%rowtype;
begin
 select * into g from public.medical_import_grants where token_hash=p_hash for update;
 if not found or g.expires_at<=now() then raise exception 'grant expired';end if;
 if not exists(select 1 from public.clinic_staff where id=g.owner_id and email='galadv73@gmail.com' and role='admin' and status='active') then raise exception 'owner required';end if;
 select * into a from public.appointments where id=g.appointment_id for update;
 if not found or a.deletion_requested_at is not null or a.intake_mode<>'clinic' or a.created_by is distinct from g.owner_id then raise exception 'personal clinic card required';end if;
 if exists(select 1 from public.documents where appointment_id=a.id) then raise exception 'separate personal card required';end if;
 if g.used_at is not null then
  select * into r from public.medical_record_imports where id=g.import_id and source_hash=p_source_hash;
  if not found then raise exception 'grant already used';end if;
  return jsonb_build_object('id',r.id,'appointment_id',r.appointment_id,'owner_id',r.owner_id,'reused',true);
 end if;
 if coalesce(p_bundle->>'provider','')<>'clalit' or coalesce(p_bundle->>'subject_scope','')<>'self' or coalesce(p_bundle->>'schema_version','')<>'1' or coalesce(jsonb_typeof(p_bundle->'records'),'')<>'array' then raise exception 'invalid personal bundle';end if;
 if jsonb_array_length(p_bundle->'records') not between 1 and 200 then raise exception 'invalid personal bundle';end if;
 if exists(select 1 from jsonb_array_elements(p_bundle->'records') source where jsonb_array_length(coalesce(source->'entries','[]'::jsonb))<>0) then raise exception 'provenance only required';end if;
 insert into public.medical_record_imports(appointment_id,owner_id,source_hash,bundle,ai_consent)
 values(a.id,g.owner_id,p_source_hash,p_bundle,g.ai_consent) on conflict(appointment_id,source_hash) do nothing;
 select * into r from public.medical_record_imports where appointment_id=a.id and source_hash=p_source_hash;
 update public.medical_import_grants set used_at=now(),import_id=r.id where token_hash=p_hash;
 update public.appointments set personal_import_source=true,medical_records_count=jsonb_array_length(p_bundle->'records'),status=case when status='invited' then 'submitted' else status end,submitted_at=coalesce(submitted_at,now()) where id=a.id;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('personal_records_imported',g.owner_id,a.id,jsonb_build_object('provider','clalit','record_count',jsonb_array_length(p_bundle->'records'),'import_id',r.id));
 return jsonb_build_object('id',r.id,'appointment_id',r.appointment_id,'owner_id',r.owner_id,'reused',false);
end;$$;
create function public.claim_medical_summary(p_id uuid,p_actor uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.medical_record_imports%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and email='galadv73@gmail.com' and role='admin' and status='active') then raise exception 'owner required';end if;
 select * into r from public.medical_record_imports where id=p_id and owner_id=p_actor for update;
 if not found or not r.ai_consent or r.status='ready' or r.attempts>=3 or (r.lease_until>now() and r.status='generating') then return false;end if;
 if not exists(select 1 from public.appointments where id=r.appointment_id and deletion_requested_at is null) then return false;end if;
 update public.medical_record_imports set status='generating',attempts=attempts+1,lease_token=p_token,lease_until=now()+interval '5 minutes',error_code=null where id=p_id;
 return true;
end;$$;
create function public.finish_medical_summary(p_id uuid,p_token uuid,p_summary jsonb,p_model text,p_evidence jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_model !~ '^claude-[a-z0-9-]{1,100}$' then raise exception 'approved provider required';end if;
 update public.medical_record_imports r set status='ready',summary=p_summary,bundle=p_evidence,model=p_model,completed_at=now(),lease_token=null,lease_until=null,error_code=null
 where r.id=p_id and r.status='generating' and r.lease_token=p_token and r.lease_until>now() and exists(select 1 from public.appointments a where a.id=r.appointment_id and a.deletion_requested_at is null);
 return found;
end;$$;
create function public.fail_medical_summary(p_id uuid,p_token uuid,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_error !~ '^[A-Z_]{1,60}$' then raise exception 'invalid error code';end if;
 update public.medical_record_imports set status='failed',error_code=p_error,lease_token=null,lease_until=null where id=p_id and status='generating' and lease_token=p_token;
 return found;
end;$$;
create function public.review_medical_import(p_id uuid,p_actor uuid,p_source_id text,p_include boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.medical_record_imports%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active' and role in('admin','professor')) then raise exception 'clinician required';end if;
 select * into r from public.medical_record_imports where id=p_id for update;
 if not found or not exists(select 1 from public.appointments where id=r.appointment_id and deletion_requested_at is null) then return false;end if;
 if p_source_id is null then
  if r.status<>'ready' then return false;end if;
  update public.medical_record_imports set reviewed_by=p_actor,reviewed_at=now() where id=p_id;
 else
  if not exists(select 1 from jsonb_array_elements(r.bundle->'records') source where source->>'id'=p_source_id) then raise exception 'source not found';end if;
  update public.medical_record_imports set review_overrides=jsonb_set(review_overrides,array[p_source_id],to_jsonb(p_include)),reviewed_by=null,reviewed_at=null where id=p_id;
 end if;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('personal_import_reviewed',p_actor,r.appointment_id,jsonb_build_object('import_id',p_id,'source_id',p_source_id,'include',p_include));
 return true;
end;$$;
create function public.save_medical_visual(p_id uuid,p_actor uuid,p_visual jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.medical_record_imports%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active' and role in('admin','professor')) then raise exception 'clinician required';end if;
 select * into r from public.medical_record_imports where id=p_id for update;
 if not found or r.status<>'ready' or coalesce((r.summary->'visual_proposal'->>'eligible')::boolean,false) is not true or not exists(select 1 from public.appointments where id=r.appointment_id and deletion_requested_at is null) then raise exception 'no supported proposal';end if;
 if r.visual is not null then return jsonb_build_object('content',r.visual,'reused',true);end if;
 update public.medical_record_imports set visual=p_visual,visual_created_by=p_actor,visual_created_at=now() where id=p_id;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('personal_visual_created',p_actor,r.appointment_id,jsonb_build_object('import_id',p_id));
 return jsonb_build_object('content',p_visual,'reused',false);
end;$$;
revoke all on function public.create_medical_import_grant(uuid,uuid,text,boolean),public.accept_medical_import(text,text,jsonb),public.claim_medical_summary(uuid,uuid,uuid),public.finish_medical_summary(uuid,uuid,jsonb,text,jsonb),public.fail_medical_summary(uuid,uuid,text),public.review_medical_import(uuid,uuid,text,boolean),public.save_medical_visual(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_medical_import_grant(uuid,uuid,text,boolean),public.accept_medical_import(text,text,jsonb),public.claim_medical_summary(uuid,uuid,uuid),public.finish_medical_summary(uuid,uuid,jsonb,text,jsonb),public.fail_medical_summary(uuid,uuid,text),public.review_medical_import(uuid,uuid,text,boolean),public.save_medical_visual(uuid,uuid,jsonb) to service_role;
commit;