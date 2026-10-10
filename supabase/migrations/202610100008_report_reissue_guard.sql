-- Bind each reissue to the previous link so a repeated request cannot issue another email.
begin;
create or replace function public.mutate_visit_record(p_actor uuid,p_patient uuid,p_action text,p_payload jsonb)
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


commit;