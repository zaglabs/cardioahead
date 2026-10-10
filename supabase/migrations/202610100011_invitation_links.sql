-- Private invitation lifecycle and consented, patient-scoped desktop imports.
begin;
create table public.invitation_links(
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 token_hash text not null unique,
 secret_ciphertext text,
 language text not null default 'he' check(language in('he','en')),
 issued_by uuid references public.clinic_staff(id) on delete set null,
 issuer_label text,
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz, deleted_at timestamptz,
 first_viewed_at timestamptz,last_viewed_at timestamptz,
 first_verified_at timestamptz,last_verified_at timestamptz,
 clalit_connected_at timestamptz,latest_import_at timestamptz,
 last_sent_at timestamptz,last_recipient text,
 legacy boolean not null default false
);
create table public.invitation_sends(
 id uuid primary key,
 invitation_id uuid not null references public.invitation_links(id) on delete cascade,
 actor_id uuid references public.clinic_staff(id) on delete set null,
 recipient text not null,
 status text not null default 'sending' check(status in('sending','accepted','failed','unknown')),
 provider_id text,created_at timestamptz not null default now(),accepted_at timestamptz
);
alter table public.invitation_links enable row level security;
alter table public.invitation_sends enable row level security;
revoke all on public.invitation_links,public.invitation_sends from public,anon,authenticated;
grant all on public.invitation_links,public.invitation_sends to service_role;
create index invitation_links_issued on public.invitation_links(issued_at desc);
create index invitation_links_appointment on public.invitation_links(appointment_id);
insert into public.invitation_links(appointment_id,token_hash,issued_by,issuer_label,issued_at,expires_at,revoked_at,legacy,first_verified_at,last_verified_at)
select a.id,a.token_hash,a.created_by,s.email,a.created_at,a.expires_at,a.revoked_at,true,
 (select min(e.created_at) from public.audit_events e where e.appointment_id=a.id and e.event='patient_verified'),
 (select max(e.created_at) from public.audit_events e where e.appointment_id=a.id and e.event='patient_verified')
from public.appointments a left join public.clinic_staff s on s.id=a.created_by where a.intake_mode='invitation';
alter table public.documents add column invitation_id uuid references public.invitation_links(id) on delete set null;
alter table public.documents add column upload_origin text not null default 'unknown' check(upload_origin in('patient','staff','unknown'));
update public.documents d set upload_origin='patient',invitation_id=i.id
from public.invitation_links i where i.appointment_id=d.appointment_id
and exists(select 1 from public.audit_events e where e.document_id=d.id and e.event='document_uploaded');
update public.documents d set upload_origin='staff' where exists(select 1 from public.audit_events e where e.document_id=d.id and e.event='staff_document_uploaded');
create function public.invitation_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event='patient_verified' then
  update public.invitation_links i set first_verified_at=coalesce(first_verified_at,new.created_at),last_verified_at=new.created_at
  from public.appointments a where a.id=new.appointment_id and i.appointment_id=a.id and i.token_hash=a.token_hash;
 elsif new.event='document_uploaded' then
  update public.documents d set upload_origin='patient',invitation_id=i.id from public.invitation_links i,public.appointments a
  where d.id=new.document_id and a.id=d.appointment_id and i.appointment_id=a.id and i.token_hash=a.token_hash;
 elsif new.event='staff_document_uploaded' then
  update public.documents set upload_origin='staff' where id=new.document_id;
 end if;
 return new;
end;$$;
create trigger invitation_activity after insert on public.audit_events for each row execute function public.invitation_activity();
create function public.issue_invitation(p_actor uuid,p_appointment jsonb,p_link jsonb,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype;s public.clinic_staff%rowtype;r public.invitation_links%rowtype;
begin
 select * into s from public.clinic_staff where id=p_actor and status='active' for share;
 if not found then raise exception 'staff required';end if;
 if coalesce(p_link->>'language','') not in('he','en') or length(coalesce(p_link->>'secret_ciphertext','')) not between 30 and 2048
 or coalesce(p_link->>'token_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid invitation';end if;
 if p_replace then
  select * into a from public.appointments where id=(p_appointment->>'id')::uuid for update;
  if not found or a.deletion_requested_at is not null or a.intake_mode<>'invitation' then raise exception 'invitation card required';end if;
  update public.invitation_links set revoked_at=coalesce(revoked_at,now()),secret_ciphertext=null where appointment_id=a.id and revoked_at is null;
  delete from public.portal_sessions where appointment_id=a.id;
  update public.appointments set token_hash=p_link->>'token_hash',pin_digest=p_appointment->>'pin_digest',
   expires_at=(p_appointment->>'expires_at')::timestamptz,revoked_at=null,failed_attempts=0 where id=a.id returning * into a;
 else
  insert into public.appointments(id,patient_label,appointment_at,token_hash,pin_digest,expires_at,created_by,intake_mode)
  values((p_appointment->>'id')::uuid,p_appointment->>'patient_label',nullif(p_appointment->>'appointment_at','')::timestamptz,
   p_link->>'token_hash',p_appointment->>'pin_digest',(p_appointment->>'expires_at')::timestamptz,p_actor,'invitation') returning * into a;
 end if;
 if a.expires_at<=now() or a.expires_at>now()+interval '31 days' then raise exception 'invalid expiry';end if;
 insert into public.invitation_links(id,appointment_id,token_hash,secret_ciphertext,language,issued_by,issuer_label,expires_at)
 values((p_link->>'id')::uuid,a.id,a.token_hash,p_link->>'secret_ciphertext',p_link->>'language',p_actor,s.email,a.expires_at) returning * into r;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('invitation_issued',p_actor,a.id,jsonb_build_object('invitation_id',r.id,'replaced',p_replace));
 return jsonb_build_object('appointment',to_jsonb(a),'invitation',to_jsonb(r));
end;$$;
create function public.manage_invitation(p_actor uuid,p_id uuid,p_action text,p_expiry timestamptz default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.invitation_links%rowtype;a public.appointments%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active') then raise exception 'staff required';end if;
 select * into i from public.invitation_links where id=p_id for update;
 if not found or i.deleted_at is not null then return false;end if;
 select * into a from public.appointments where id=i.appointment_id for update;
 if not found or a.deletion_requested_at is not null then return false;end if;
 if p_action='extend' then
  if i.revoked_at is not null or i.token_hash<>a.token_hash or a.revoked_at is not null or p_expiry<=greatest(now(),i.expires_at) or p_expiry>now()+interval '31 days' then return false;end if;
  update public.invitation_links set expires_at=p_expiry where id=i.id;
  update public.appointments set expires_at=p_expiry where id=a.id;
 elsif p_action in('revoke','delete') then
  update public.invitation_links set revoked_at=coalesce(revoked_at,now()),deleted_at=case when p_action='delete' then now() else null end,secret_ciphertext=null where id=i.id;
  if i.token_hash=a.token_hash then perform public.revoke_invitation(a.id);end if;
 else raise exception 'invalid action';end if;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('invitation_'||p_action,p_actor,a.id,jsonb_build_object('invitation_id',i.id));
 return true;
end;$$;
create function public.record_invitation_view(p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.invitation_links i set first_viewed_at=coalesce(i.first_viewed_at,now()),last_viewed_at=now()
 from public.appointments a where a.id=i.appointment_id and i.token_hash=p_hash and a.token_hash=p_hash
 and i.revoked_at is null and i.deleted_at is null and a.revoked_at is null and a.deletion_requested_at is null and a.expires_at>now()
 and (i.last_viewed_at is null or i.last_viewed_at<now()-interval '15 seconds');
 return found;
end;$$;
alter table public.medical_import_grants add column origin_kind text not null default 'personal' check(origin_kind in('personal','patient'));
alter table public.medical_import_grants add column invitation_id uuid references public.invitation_links(id) on delete cascade;
alter table public.medical_import_grants add column patient_session_hash text;
alter table public.medical_record_imports add column origin_kind text not null default 'personal' check(origin_kind in('personal','patient'));
alter table public.medical_record_imports add column invitation_id uuid references public.invitation_links(id) on delete set null;
alter table public.medical_record_imports add column patient_consent_version text;
create function public.create_patient_import_grant(p_session text,p_hash text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype;i public.invitation_links%rowtype;owner uuid;g public.medical_import_grants%rowtype;
begin
 if p_consent is distinct from true then raise exception 'patient Claude consent required';end if;
 select a1.* into a from public.appointments a1 join public.portal_sessions s on s.appointment_id=a1.id
 where s.session_hash=p_session and s.kind='patient' and s.expires_at>now() for update of a1;
 if not found or a.revoked_at is not null or a.expires_at<=now() or a.deletion_requested_at is not null or a.intake_mode<>'invitation' then raise exception 'patient access required';end if;
 if exists(select 1 from public.documents where appointment_id=a.id) then raise exception 'separate source method required';end if;
 select * into i from public.invitation_links where appointment_id=a.id and token_hash=a.token_hash and revoked_at is null and deleted_at is null;
 if not found then raise exception 'invitation required';end if;
 select id into owner from public.clinic_staff where email='galadv73@gmail.com' and role='admin' and status='active';
 if owner is null then raise exception 'clinic administrator required';end if;
 insert into public.medical_import_grants(token_hash,appointment_id,owner_id,ai_consent,expires_at,origin_kind,invitation_id,patient_session_hash)
 values(p_hash,a.id,owner,true,least(a.expires_at,now()+interval '45 minutes'),'patient',i.id,p_session) returning * into g;
 insert into public.audit_events(event,appointment_id,details) values('patient_clalit_consent',a.id,jsonb_build_object('invitation_id',i.id,'ai_provider','anthropic','consent_version','clalit-patient-v1'));
 return to_jsonb(g);
end;$$;
alter function public.accept_medical_import(text,text,jsonb) rename to accept_personal_medical_import;
create function public.accept_medical_import(p_hash text,p_source_hash text,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.medical_import_grants%rowtype;a public.appointments%rowtype;r public.medical_record_imports%rowtype;i public.invitation_links%rowtype;
begin
 select * into g from public.medical_import_grants where token_hash=p_hash for update;
 if not found or g.expires_at<=now() then raise exception 'grant expired';end if;
 if g.origin_kind='personal' then return public.accept_personal_medical_import(p_hash,p_source_hash,p_bundle);end if;
 select * into a from public.appointments where id=g.appointment_id for update;
 select * into i from public.invitation_links where id=g.invitation_id;
 if a.id is null or i.id is null or a.deletion_requested_at is not null or a.revoked_at is not null or a.expires_at<=now()
 or a.token_hash<>i.token_hash or i.revoked_at is not null or i.deleted_at is not null or not g.ai_consent
 or not exists(select 1 from public.portal_sessions where session_hash=g.patient_session_hash and appointment_id=a.id and kind='patient' and expires_at>now()) then raise exception 'patient access required';end if;
 if exists(select 1 from public.documents where appointment_id=a.id) then raise exception 'separate source method required';end if;
 if g.used_at is not null then
  select * into r from public.medical_record_imports where id=g.import_id and source_hash=p_source_hash;
  if not found then raise exception 'grant already used';end if;
  return jsonb_build_object('id',r.id,'appointment_id',r.appointment_id,'owner_id',r.owner_id,'reused',true);
 end if;
 if coalesce(p_bundle->>'provider','')<>'clalit' or coalesce(p_bundle->>'subject_scope','')<>'self' or coalesce(p_bundle->>'schema_version','')<>'1'
 or coalesce(jsonb_typeof(p_bundle->'records'),'')<>'array' or jsonb_array_length(p_bundle->'records') not between 1 and 200
 or exists(select 1 from jsonb_array_elements(p_bundle->'records') s where jsonb_array_length(coalesce(s->'entries','[]'::jsonb))<>0) then raise exception 'provenance only required';end if;
 insert into public.medical_record_imports(appointment_id,owner_id,source_hash,bundle,ai_consent,origin_kind,invitation_id,patient_consent_version)
 values(a.id,g.owner_id,p_source_hash,p_bundle,true,'patient',i.id,'clalit-patient-v1') on conflict(appointment_id,source_hash) do nothing;
 select * into r from public.medical_record_imports where appointment_id=a.id and source_hash=p_source_hash;
 update public.medical_import_grants set used_at=now(),import_id=r.id where token_hash=p_hash;
 update public.invitation_links set clalit_connected_at=coalesce(clalit_connected_at,now()) where id=i.id;
 update public.appointments set personal_import_source=true,medical_records_count=jsonb_array_length(p_bundle->'records'),status=case when status='invited' then 'submitted' else status end,submitted_at=coalesce(submitted_at,now()) where id=a.id;
 insert into public.audit_events(event,appointment_id,details) values('patient_clalit_records_received',a.id,jsonb_build_object('invitation_id',i.id,'record_count',jsonb_array_length(p_bundle->'records')));
 return jsonb_build_object('id',r.id,'appointment_id',r.appointment_id,'owner_id',r.owner_id,'reused',false);
end;$$;
create or replace function public.finish_medical_summary(p_id uuid,p_token uuid,p_summary jsonb,p_model text,p_evidence jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_model !~ '^claude-[a-z0-9-]{1,100}$' then raise exception 'approved provider required';end if;
 update public.medical_record_imports r set status='ready',summary=p_summary,bundle=p_evidence,model=p_model,completed_at=now(),lease_token=null,lease_until=null,error_code=null
 where r.id=p_id and r.status='generating' and r.lease_token=p_token and r.lease_until>now()
 and exists(select 1 from public.appointments a where a.id=r.appointment_id and a.deletion_requested_at is null
 and (r.origin_kind='personal' or (a.revoked_at is null and a.expires_at>now() and exists(select 1 from public.invitation_links i where i.id=r.invitation_id and i.token_hash=a.token_hash and i.revoked_at is null and i.deleted_at is null))));
 if not found then return false;end if;
 update public.invitation_links i set latest_import_at=r.completed_at from public.medical_record_imports r where r.id=p_id and r.invitation_id=i.id;
 return true;
end;$$;
create function public.sync_invitation_revocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.revoked_at is not null or new.deletion_requested_at is not null then
  update public.invitation_links set revoked_at=coalesce(revoked_at,new.revoked_at,now()),secret_ciphertext=null where appointment_id=new.id and token_hash=new.token_hash;
  update public.medical_record_imports set status='failed',error_code='ACCESS_REVOKED',lease_token=null,lease_until=null
  where appointment_id=new.id and origin_kind='patient' and status in('received','generating');
 end if;
 return new;
end;$$;
create trigger sync_invitation_revocation after update of revoked_at,deletion_requested_at on public.appointments for each row execute function public.sync_invitation_revocation();
revoke all on function public.invitation_activity(),public.issue_invitation(uuid,jsonb,jsonb,boolean),public.manage_invitation(uuid,uuid,text,timestamptz),
public.record_invitation_view(text),public.create_patient_import_grant(text,text,boolean),public.accept_medical_import(text,text,jsonb),public.sync_invitation_revocation() from public,anon,authenticated;
grant execute on function public.issue_invitation(uuid,jsonb,jsonb,boolean),public.manage_invitation(uuid,uuid,text,timestamptz),
public.record_invitation_view(text),public.create_patient_import_grant(text,text,boolean),public.accept_medical_import(text,text,jsonb) to service_role;
create function public.reserve_invitation_send(p_actor uuid,p_id uuid,p_request uuid,p_recipient text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitation_links%rowtype;r public.invitation_sends%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active') then raise exception 'staff required';end if;
 select * into i from public.invitation_links where id=p_id for update;
 if not found or i.revoked_at is not null or i.deleted_at is not null or i.expires_at<=now() or i.secret_ciphertext is null
 or not exists(select 1 from public.appointments where id=i.appointment_id and token_hash=i.token_hash and revoked_at is null and deletion_requested_at is null) then raise exception 'active invitation required';end if;
 select * into r from public.invitation_sends where id=p_request;
 if found then
  if r.invitation_id<>p_id or r.recipient<>p_recipient or r.actor_id is distinct from p_actor then raise exception 'send conflict';end if;
  return to_jsonb(r);
 end if;
 if exists(select 1 from public.invitation_sends where invitation_id=p_id and created_at>now()-interval '60 seconds') then raise exception 'send rate limit';end if;
 if length(p_recipient)>254 or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid recipient';end if;
 insert into public.invitation_sends(id,invitation_id,actor_id,recipient) values(p_request,p_id,p_actor,p_recipient) returning * into r;
 return to_jsonb(r);
end;$$;
create function public.finish_invitation_send(p_actor uuid,p_request uuid,p_status text,p_provider text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.invitation_sends%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active') then raise exception 'staff required';end if;
 if p_status not in('accepted','failed','unknown') or (p_status='accepted' and coalesce(p_provider,'') !~ '^[a-zA-Z0-9-]{1,100}$') then raise exception 'invalid status';end if;
 update public.invitation_sends set status=p_status,provider_id=p_provider,accepted_at=case when p_status='accepted' then now() else null end
 where id=p_request and actor_id=p_actor and status<>'accepted' returning * into r;
 if not found then return false;end if;
 if p_status='accepted' then update public.invitation_links set last_sent_at=r.accepted_at,last_recipient=r.recipient where id=r.invitation_id;end if;
 return true;
end;$$;
revoke all on function public.reserve_invitation_send(uuid,uuid,uuid,text),public.finish_invitation_send(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_invitation_send(uuid,uuid,uuid,text),public.finish_invitation_send(uuid,uuid,text,text) to service_role;
create function public.list_invitation_links(p_actor uuid,p_search text default '',p_status text default 'all',p_followup text default 'all',p_deleted boolean default false,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active') then raise exception 'staff required';end if;
 if p_limit not between 1 and 100 or p_offset not between 0 and 500000 or length(p_search)>200
 or p_status not in('all','active','expired','revoked','deleted') or p_followup not in('all','not_opened','no_documents','import_failed','import_pending') then raise exception 'invalid filters';end if;
 with rows as(
 select i.id,i.appointment_id,a.patient_label,i.issuer_label,i.issued_at,i.expires_at,i.revoked_at,i.deleted_at,i.language,i.legacy,
 i.first_viewed_at,i.last_viewed_at,i.first_verified_at,i.last_verified_at,i.clalit_connected_at,i.latest_import_at,i.last_sent_at,i.last_recipient,
 (i.secret_ciphertext is not null) as recoverable,(a.deletion_requested_at is not null) as card_deleting,
 case when i.deleted_at is not null or a.deletion_requested_at is not null then 'deleted'
 when i.revoked_at is not null or i.token_hash<>a.token_hash or a.revoked_at is not null then 'revoked'
 when i.expires_at<=now() then 'expired' else 'active' end as status,
 (select count(*)::int from public.documents d where d.invitation_id=i.id and d.upload_origin='patient') as patient_upload_count,
 (select max(d.created_at) from public.documents d where d.invitation_id=i.id and d.upload_origin='patient') as latest_upload_at,
 (select count(*)::int from public.documents d where d.appointment_id=a.id) as card_document_count,
 coalesce((select r.status from public.medical_record_imports r where r.invitation_id=i.id order by r.created_at desc limit 1),'not_started') as import_status,
 (select jsonb_array_length(r.bundle->'records') from public.medical_record_imports r where r.invitation_id=i.id order by r.created_at desc limit 1) as import_record_count
 from public.invitation_links i join public.appointments a on a.id=i.appointment_id),
 filtered as(select * from rows r where (p_deleted or r.status<>'deleted') and (p_status='all' or r.status=p_status)
 and (p_search='' or r.patient_label ilike '%'||p_search||'%' or coalesce(r.issuer_label,'') ilike '%'||p_search||'%')
 and (p_followup='all' or (p_followup='not_opened' and r.first_verified_at is null)
 or (p_followup='no_documents' and r.patient_upload_count=0 and r.latest_import_at is null)
 or (p_followup='import_failed' and r.import_status='failed') or (p_followup='import_pending' and r.import_status in('received','generating')))),
 page as(select * from filtered order by issued_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
 return result;
end;$$;
revoke all on function public.list_invitation_links(uuid,text,text,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.list_invitation_links(uuid,text,text,text,boolean,integer,integer) to service_role;
commit;