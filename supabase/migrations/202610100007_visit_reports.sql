-- Private versioned drafts, clinician approvals, exact PDF snapshots and scoped delivery.
-- Apply after migrations 001-006.
begin;
create table public.patient_record_versions(
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.appointments(id) on delete cascade,
 kind text not null check(kind in ('findings','lifestyle','summary')),revision integer not null,
 data jsonb not null,source_snapshot jsonb not null default '{}',document_version text not null,
 origin text not null check(origin in ('ai','clinician','copied')),created_by uuid not null,author_identity jsonb not null,
 created_at timestamptz not null default now(),unique(appointment_id,kind,revision)
);
create table public.patient_report_approvals(
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.appointments(id) on delete cascade,
 version_id uuid not null references public.patient_record_versions(id) on delete cascade,
 language text not null check(language in ('he','en')),recipient text not null,content_hash text not null,
 snapshot jsonb not null,pdf_base64 text not null,pdf_sha256 text not null,
 approved_by uuid not null,approver_identity jsonb not null,approved_at timestamptz not null default now()
);
create table public.patient_visit_workspaces(
 appointment_id uuid primary key references public.appointments(id) on delete cascade,
 findings_id uuid,lifestyle_id uuid,summary_id uuid,approval_id uuid
);
create table public.patient_draft_jobs(
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.appointments(id) on delete cascade,
 kind text not null check(kind in ('lifestyle','summary')),created_by uuid not null,
 base_version_id uuid,findings_version_id uuid,document_version text not null,regeneration_decision text,result_version_id uuid,
 status text not null check(status in ('processing','ready','failed')),stage text not null,
 lease_until timestamptz not null default now()+interval '5 minutes',error_code text,
 created_at timestamptz not null default now(),completed_at timestamptz
);
create unique index one_active_patient_draft on public.patient_draft_jobs(appointment_id,kind) where status='processing';
create table public.patient_report_deliveries(
 id uuid primary key,appointment_id uuid not null references public.appointments(id) on delete cascade,
 approval_id uuid not null references public.patient_report_approvals(id) on delete cascade,
 recipient text not null,language text not null check(language in ('he','en')),
 status text not null check(status in ('sending','accepted','delivered','failed','unknown','bounced')),
 token_hash text not null unique,token_encrypted text not null,expires_at timestamptz not null,revoked_at timestamptz,
 created_at timestamptz not null default now(),lease_until timestamptz,active_attempt_id uuid,
 provider_id text,provider_event text,accepted_at timestamptz,attempts integer not null default 1,
 notice_payload jsonb not null,last_error text
);
create unique index one_active_report_delivery on public.patient_report_deliveries(approval_id) where revoked_at is null;
create table public.patient_report_send_attempts(
 id uuid primary key,delivery_id uuid not null references public.patient_report_deliveries(id) on delete cascade,
 actor_id uuid not null,started_at timestamptz not null default now(),finished_at timestamptz,
 status text not null check(status in ('sending','accepted','failed','unknown')),provider_id text
);
create table public.patient_report_challenges(
 id text primary key,delivery_id uuid not null references public.patient_report_deliveries(id) on delete cascade,
 code_digest text not null,ip_hash text not null,created_at timestamptz not null,
 expires_at timestamptz not null,attempts integer not null default 0,delivered boolean not null default false,consumed boolean not null default false
);
create table public.patient_report_sessions(
 session_hash text primary key,delivery_id uuid not null references public.patient_report_deliveries(id) on delete cascade,expires_at timestamptz not null
);
create index record_versions_history on public.patient_record_versions(appointment_id,created_at desc);
create index report_challenge_rate on public.patient_report_challenges(delivery_id,created_at);
create index report_challenge_ip on public.patient_report_challenges(ip_hash,created_at);

create function public.immutable_patient_report() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable report snapshot'; end; $$;
create trigger immutable_record_version before update on public.patient_record_versions for each row execute function public.immutable_patient_report();
create trigger immutable_report_approval before update on public.patient_report_approvals for each row execute function public.immutable_patient_report();
create trigger guard_record_version before insert on public.patient_record_versions for each row execute function public.guard_deleting_card_insert();
create trigger guard_report_approval before insert on public.patient_report_approvals for each row execute function public.guard_deleting_card_insert();
create trigger guard_patient_draft before insert on public.patient_draft_jobs for each row execute function public.guard_deleting_card_insert();

create function public.clear_deleting_visit_records() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deletion_requested_at is not null then
  delete from public.patient_visit_workspaces where appointment_id=new.id;
  delete from public.patient_draft_jobs where appointment_id=new.id;
  delete from public.patient_record_versions where appointment_id=new.id;
 end if;
 return new;
end; $$;
create trigger clear_visit_records after update of deletion_requested_at on public.appointments for each row execute function public.clear_deleting_visit_records();

create function public.mutate_visit_record(p_actor uuid,p_patient uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor public.clinic_staff%rowtype; w public.patient_visit_workspaces%rowtype; v public.patient_record_versions%rowtype;
 ap public.patient_report_approvals%rowtype; d public.patient_report_deliveries%rowtype; j public.patient_draft_jobs%rowtype;
 k text; head uuid; expected uuid; attempt uuid; next_revision integer;
begin
 select * into actor from public.clinic_staff where id=p_actor and status='active' for share;
 if not found then raise exception 'staff required'; end if;
 if p_action not in ('save_lifestyle','generate_lifestyle') and actor.role not in ('admin','professor') then raise exception 'clinician required'; end if;
 perform 1 from public.appointments where id=p_patient and deletion_requested_at is null for no key update;
 if not found then raise exception 'card unavailable'; end if;
 insert into public.patient_visit_workspaces(appointment_id) values(p_patient) on conflict do nothing;
 select * into w from public.patient_visit_workspaces where appointment_id=p_patient for update;
 if p_action in ('save_findings','save_lifestyle','save_summary','generate_lifestyle','generate_summary') then
  k=case when p_action='save_findings' then 'findings' when p_action in ('save_lifestyle','generate_lifestyle') then 'lifestyle' else 'summary' end;
  head=case k when 'findings' then w.findings_id when 'lifestyle' then w.lifestyle_id else w.summary_id end;
  expected=nullif(p_payload->>'base_version_id','')::uuid;
  if head is distinct from expected then raise exception 'draft changed'; end if;
  if k='summary' and exists(select 1 from public.patient_report_deliveries where appointment_id=p_patient and status='sending' and lease_until>now()) then raise exception 'send in progress'; end if;
  if p_action in ('generate_lifestyle','generate_summary') then
   if head is not null and coalesce(p_payload->>'regeneration_decision','') not in ('preserve','replace') then raise exception 'regeneration confirmation required'; end if;
   update public.patient_draft_jobs set status='failed',stage='failed',error_code='JOB_EXPIRED' where appointment_id=p_patient and kind=k and status='processing' and lease_until<=now();
   select * into j from public.patient_draft_jobs where appointment_id=p_patient and kind=k and status='processing';
   if found then return jsonb_build_object('job',to_jsonb(j),'started',false); end if;
   insert into public.patient_draft_jobs(appointment_id,kind,created_by,base_version_id,findings_version_id,document_version,regeneration_decision,status,stage)
   values(p_patient,k,p_actor,head,w.findings_id,p_payload->>'document_version',p_payload->>'regeneration_decision','processing','analysing') returning * into j;
   insert into public.audit_events(event,actor_id,appointment_id,details) values('patient_draft_generation_requested',p_actor,p_patient,jsonb_build_object('job_id',j.id,'kind',k));
   return jsonb_build_object('job',to_jsonb(j),'started',true);
  end if;
  select coalesce(max(revision),0)+1 into next_revision from public.patient_record_versions where appointment_id=p_patient and kind=k;
  insert into public.patient_record_versions(appointment_id,kind,revision,data,source_snapshot,document_version,origin,created_by,author_identity)
  values(p_patient,k,next_revision,p_payload->'data',p_payload->'source_snapshot',p_payload->>'document_version',coalesce(p_payload->>'origin','clinician'),p_actor,jsonb_build_object('email',actor.email,'role',actor.role)) returning * into v;
  if k='findings' then update public.patient_visit_workspaces set findings_id=v.id where appointment_id=p_patient;
  elsif k='lifestyle' then update public.patient_visit_workspaces set lifestyle_id=v.id where appointment_id=p_patient;
  else update public.patient_visit_workspaces set summary_id=v.id,approval_id=null where appointment_id=p_patient; end if;
  insert into public.audit_events(event,actor_id,appointment_id,details) values('patient_draft_saved',p_actor,p_patient,jsonb_build_object('version_id',v.id,'kind',k,'revision',v.revision));
  return to_jsonb(v);
 elsif p_action='approve' then
  select * into v from public.patient_record_versions where id=(p_payload->>'version_id')::uuid and appointment_id=p_patient and kind='summary';
  if not found or w.summary_id is distinct from v.id or p_payload->>'reviewed' is distinct from 'true' then raise exception 'current reviewed draft required'; end if;
  if exists(select 1 from public.patient_report_deliveries where appointment_id=p_patient and status='sending' and lease_until>now()) then raise exception 'send in progress'; end if;
  if exists(select 1 from public.patient_draft_jobs where appointment_id=p_patient and kind='summary' and status='processing' and lease_until>now()) then raise exception 'draft generation in progress'; end if;
  select * into ap from public.patient_report_approvals where id=w.approval_id;
  if found and ap.version_id=v.id and ap.content_hash=p_payload->>'content_hash' and ap.recipient=p_payload->>'recipient' then return to_jsonb(ap); end if;
  insert into public.patient_report_approvals(appointment_id,version_id,language,recipient,content_hash,snapshot,pdf_base64,pdf_sha256,approved_by,approver_identity)
  values(p_patient,v.id,p_payload->>'language',p_payload->>'recipient',p_payload->>'content_hash',p_payload->'snapshot',p_payload->>'pdf_base64',p_payload->>'pdf_sha256',p_actor,jsonb_build_object('email',actor.email,'role',actor.role)) returning * into ap;
  update public.patient_visit_workspaces set approval_id=ap.id where appointment_id=p_patient;
  insert into public.audit_events(event,actor_id,appointment_id,details) values('patient_report_approved',p_actor,p_patient,jsonb_build_object('approval_id',ap.id,'version_id',v.id));
  return to_jsonb(ap);
 elsif p_action='claim_send' then
  select * into ap from public.patient_report_approvals where id=(p_payload->>'approval_id')::uuid and appointment_id=p_patient;
  if not found or w.approval_id is distinct from ap.id or w.summary_id is distinct from ap.version_id or
     ap.recipient is distinct from p_payload->>'confirmed_recipient' or ap.content_hash is distinct from p_payload->>'content_hash' then raise exception 'current approved report required'; end if;
  if exists(select 1 from public.patient_draft_jobs where appointment_id=p_patient and kind='summary' and status='processing' and lease_until>now()) then raise exception 'draft generation in progress'; end if;
  if p_payload->'notice_payload'->'to' is distinct from jsonb_build_array(ap.recipient) then raise exception 'recipient mismatch'; end if;
  select * into d from public.patient_report_deliveries where approval_id=ap.id and revoked_at is null for update;
  if p_payload->>'reissue'='true' then
   perform 1 from public.patient_report_deliveries where id=nullif(p_payload->>'expected_delivery_id','')::uuid and approval_id=ap.id;
   if not found then raise exception 'reissue required'; end if;
   if d.id is not null and d.id is distinct from (p_payload->>'expected_delivery_id')::uuid then
    return jsonb_build_object('delivery',to_jsonb(d),'send',false);
   end if;
   if d.id is null and exists(select 1 from public.patient_report_deliveries where approval_id=ap.id and created_at>(select created_at from public.patient_report_deliveries where id=(p_payload->>'expected_delivery_id')::uuid)) then raise exception 'reissue required'; end if;
  end if;
  if d.id is not null then
   if p_payload->>'reissue'='true' then
    if d.status='sending' and d.lease_until>now() then return jsonb_build_object('delivery',to_jsonb(d),'send',false); end if;
    update public.patient_report_deliveries set revoked_at=now() where id=d.id;
    delete from public.patient_report_sessions where delivery_id=d.id;
   else
    if d.status in ('accepted','delivered') or (d.status='sending' and d.lease_until>now()) then return jsonb_build_object('delivery',to_jsonb(d),'send',false); end if;
    if d.created_at<now()-interval '23 hours' or d.expires_at<=now() or d.status='bounced' then raise exception 'reissue required'; end if;
    attempt=(p_payload->>'attempt_id')::uuid;
    update public.patient_report_deliveries set status='sending',lease_until=now()+interval '1 minute',active_attempt_id=attempt,attempts=attempts+1,last_error=null where id=d.id returning * into d;
    insert into public.patient_report_send_attempts(id,delivery_id,actor_id,status) values(attempt,d.id,p_actor,'sending');
    return jsonb_build_object('delivery',to_jsonb(d),'send',true);
   end if;
  elsif p_payload->>'reissue'<>'true' and exists(select 1 from public.patient_report_deliveries where approval_id=ap.id) then raise exception 'reissue required';
  end if;
  attempt=(p_payload->>'attempt_id')::uuid;
  insert into public.patient_report_deliveries(id,appointment_id,approval_id,recipient,language,status,token_hash,token_encrypted,expires_at,lease_until,active_attempt_id,notice_payload)
  values((p_payload->>'delivery_id')::uuid,p_patient,ap.id,ap.recipient,ap.language,'sending',p_payload->>'token_hash',p_payload->>'token_encrypted',now()+interval '7 days',now()+interval '1 minute',attempt,p_payload->'notice_payload') returning * into d;
  insert into public.patient_report_send_attempts(id,delivery_id,actor_id,status) values(attempt,d.id,p_actor,'sending');
  insert into public.audit_events(event,actor_id,appointment_id,details) values('patient_report_send_requested',p_actor,p_patient,jsonb_build_object('approval_id',ap.id,'delivery_id',d.id));
  return jsonb_build_object('delivery',to_jsonb(d),'send',true);
 elsif p_action='revoke' then
  update public.patient_report_deliveries set revoked_at=coalesce(revoked_at,now()) where id=(p_payload->>'delivery_id')::uuid and appointment_id=p_patient returning * into d;
  if not found then raise exception 'delivery unavailable'; end if;
  delete from public.patient_report_sessions where delivery_id=d.id;
  insert into public.audit_events(event,actor_id,appointment_id,details) values('patient_report_link_revoked',p_actor,p_patient,jsonb_build_object('delivery_id',d.id));
  return to_jsonb(d);
 end if;
 raise exception 'unsupported action';
end; $$;

create function public.finish_patient_draft(p_job uuid,p_data jsonb,p_sources jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.patient_draft_jobs%rowtype; w public.patient_visit_workspaces%rowtype; v public.patient_record_versions%rowtype; actor public.clinic_staff%rowtype; head uuid; n integer;
begin
 select * into j from public.patient_draft_jobs where id=p_job;
 if not found then return null; end if;
 perform 1 from public.appointments where id=j.appointment_id and deletion_requested_at is null for no key update;
 if not found then return null; end if;
 select * into w from public.patient_visit_workspaces where appointment_id=j.appointment_id for update;
 select * into j from public.patient_draft_jobs where id=p_job and status='processing' and lease_until>now() for update;
 if not found then return null; end if;
 head=case j.kind when 'lifestyle' then w.lifestyle_id else w.summary_id end;
 if head is distinct from j.base_version_id or w.findings_id is distinct from j.findings_version_id then
  update public.patient_draft_jobs set status='failed',stage='failed',error_code='DRAFT_CHANGED' where id=j.id; return null;
 end if;
 select * into actor from public.clinic_staff where id=j.created_by and status='active';
 if not found or (j.kind='summary' and actor.role not in ('admin','professor')) then
  update public.patient_draft_jobs set status='failed',stage='failed',error_code='ACCESS_CHANGED' where id=j.id; return null;
 end if;
 if j.kind='summary' and exists(select 1 from public.patient_report_deliveries where appointment_id=j.appointment_id and status='sending' and lease_until>now()) then
  update public.patient_draft_jobs set status='failed',stage='failed',error_code='SEND_IN_PROGRESS' where id=j.id;return null;
 end if;
 select coalesce(max(revision),0)+1 into n from public.patient_record_versions where appointment_id=j.appointment_id and kind=j.kind;
 insert into public.patient_record_versions(appointment_id,kind,revision,data,source_snapshot,document_version,origin,created_by,author_identity)
 values(j.appointment_id,j.kind,n,p_data,p_sources,j.document_version,'ai',j.created_by,jsonb_build_object('email',actor.email,'role',actor.role)) returning * into v;
 if j.regeneration_decision='preserve' and j.base_version_id is not null then null;
 elsif j.kind='lifestyle' then update public.patient_visit_workspaces set lifestyle_id=v.id where appointment_id=j.appointment_id;
 else update public.patient_visit_workspaces set summary_id=v.id,approval_id=null where appointment_id=j.appointment_id; end if;
 update public.patient_draft_jobs set status='ready',stage='complete',completed_at=now(),result_version_id=v.id where id=j.id;
 insert into public.audit_events(event,actor_id,appointment_id,details) values('patient_draft_generated',j.created_by,j.appointment_id,jsonb_build_object('version_id',v.id,'job_id',j.id));
 return to_jsonb(v);
end; $$;

create function public.finish_report_send(p_delivery uuid,p_attempt uuid,p_status text,p_provider text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.patient_report_deliveries%rowtype;
begin
 if p_status not in ('accepted','failed','unknown') then raise exception 'invalid send status'; end if;
 select * into d from public.patient_report_deliveries where id=p_delivery and active_attempt_id=p_attempt and status='sending' for update;
 if not found then return false; end if;
 update public.patient_report_deliveries set status=p_status,lease_until=null,provider_id=p_provider,last_error=p_error,
 accepted_at=case when p_status='accepted' then now() else accepted_at end where id=d.id;
 update public.patient_report_send_attempts set status=p_status,finished_at=now(),provider_id=p_provider where id=p_attempt;
 insert into public.audit_events(event,appointment_id,details) values('patient_report_send_'||p_status,d.appointment_id,jsonb_build_object('delivery_id',d.id,'attempt_id',p_attempt));
 return true;
end; $$;

create function public.reserve_report_code(p_challenge jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.patient_report_deliveries%rowtype; ip text; n integer;
begin
 select * into d from public.patient_report_deliveries where id=(p_challenge->>'delivery_id')::uuid and revoked_at is null and expires_at>now() and status<>'failed' and status<>'bounced' for update;
 if not found then return false; end if;
 ip=p_challenge->>'ip_hash';
 perform pg_advisory_xact_lock(hashtext('report-ip:'||ip));
 if exists(select 1 from public.patient_report_challenges where delivery_id=d.id and created_at>now()-interval '1 minute') then return false; end if;
 select count(*) into n from public.patient_report_challenges where delivery_id=d.id and created_at>now()-interval '1 hour';
 if n>=5 then return false; end if;
 select count(*) into n from public.patient_report_challenges where ip_hash=ip and created_at>now()-interval '1 hour';
 if n>=30 then return false; end if;
 update public.patient_report_challenges set consumed=true where delivery_id=d.id;
 insert into public.patient_report_challenges(id,delivery_id,code_digest,ip_hash,created_at,expires_at)
 values(p_challenge->>'id',d.id,p_challenge->>'code_digest',ip,(p_challenge->>'created_at')::timestamptz,(p_challenge->>'expires_at')::timestamptz);
 return true;
end; $$;
create function public.verify_report_code(p_id text,p_delivery uuid,p_digest text,p_session text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.patient_report_deliveries%rowtype; c public.patient_report_challenges%rowtype;
begin
 select * into d from public.patient_report_deliveries where id=p_delivery and revoked_at is null and expires_at>now() and status not in ('failed','bounced') for share;
 if not found then return false; end if;
 select * into c from public.patient_report_challenges where id=p_id and delivery_id=d.id for update;
 if not found or c.consumed or not c.delivered or c.attempts>=5 or c.expires_at<=now() then return false; end if;
 if c.code_digest<>p_digest then update public.patient_report_challenges set attempts=attempts+1 where id=c.id;return false; end if;
 update public.patient_report_challenges set consumed=true where id=c.id;
 insert into public.patient_report_sessions(session_hash,delivery_id,expires_at) values(p_session,d.id,least(now()+interval '2 hours',d.expires_at));
 insert into public.audit_events(event,appointment_id,details) values('approved_patient_report_opened',d.appointment_id,jsonb_build_object('delivery_id',d.id));
 return true;
end; $$;

alter table public.patient_record_versions enable row level security;
alter table public.patient_report_approvals enable row level security;
alter table public.patient_visit_workspaces enable row level security;
alter table public.patient_draft_jobs enable row level security;
alter table public.patient_report_deliveries enable row level security;
alter table public.patient_report_send_attempts enable row level security;
alter table public.patient_report_challenges enable row level security;
alter table public.patient_report_sessions enable row level security;
revoke all on public.patient_record_versions,public.patient_report_approvals,public.patient_visit_workspaces,public.patient_draft_jobs,public.patient_report_deliveries,public.patient_report_send_attempts,public.patient_report_challenges,public.patient_report_sessions from public,anon,authenticated;
grant all on public.patient_record_versions,public.patient_report_approvals,public.patient_visit_workspaces,public.patient_draft_jobs,public.patient_report_deliveries,public.patient_report_send_attempts,public.patient_report_challenges,public.patient_report_sessions to service_role;
revoke all on function public.mutate_visit_record(uuid,uuid,text,jsonb),public.finish_patient_draft(uuid,jsonb,jsonb),public.finish_report_send(uuid,uuid,text,text,text),public.reserve_report_code(jsonb),public.verify_report_code(text,uuid,text,text),public.immutable_patient_report(),public.clear_deleting_visit_records() from public,anon,authenticated;
grant execute on function public.mutate_visit_record(uuid,uuid,text,jsonb),public.finish_patient_draft(uuid,jsonb,jsonb),public.finish_report_send(uuid,uuid,text,text,text),public.reserve_report_code(jsonb),public.verify_report_code(text,uuid,text,text) to service_role;
commit;
