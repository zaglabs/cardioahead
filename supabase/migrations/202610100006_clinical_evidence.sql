-- Private, versioned evidence reviews. Requires migrations 001-005.
begin;
create table public.clinical_evidence_reviews (
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 created_by uuid references public.clinic_staff(id) on delete set null,
 document_version text not null,
 status text not null check(status in ('processing','ready','failed')),
 stage text not null check(stage in ('analysing','searching','verifying','writing','complete','failed')),
 question text not null default '' check(length(question)<=2000),
 question_kind text not null check(question_kind in ('question','plan')),
 context jsonb, retrieval jsonb, report jsonb,
 created_at timestamptz not null default now(), completed_at timestamptz, searched_at timestamptz,
 lease_until timestamptz not null default now()+interval '5 minutes',
 error_code text, model text
);
create index evidence_card_history on public.clinical_evidence_reviews(appointment_id,created_at desc);
create unique index evidence_one_active on public.clinical_evidence_reviews(appointment_id) where status='processing';
alter table public.clinical_evidence_reviews enable row level security;
revoke all on public.clinical_evidence_reviews from public,anon,authenticated;
grant all on public.clinical_evidence_reviews to service_role;
create trigger guard_card_evidence before insert on public.clinical_evidence_reviews for each row execute function public.guard_deleting_card_insert();
create function public.clear_deleting_card_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deletion_requested_at is not null then delete from public.clinical_evidence_reviews where appointment_id=new.id; end if;
 return new;
end; $$;
create trigger clear_card_evidence after update of deletion_requested_at on public.appointments for each row execute function public.clear_deleting_card_evidence();
create function public.queue_evidence_review(p_actor uuid,p_id uuid,p_version text,p_question text,p_kind text,p_regenerate boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype; r public.clinical_evidence_reviews%rowtype;
begin
 perform 1 from public.clinic_staff where id=p_actor and status='active' and role in ('admin','professor') for share;
 if not found then raise exception 'clinician required'; end if;
 select * into a from public.appointments where id=p_id for no key update;
 if not found or a.deletion_requested_at is not null then raise exception 'card unavailable'; end if;
 update public.clinical_evidence_reviews set status='failed',stage='failed',error_code='JOB_EXPIRED'
 where appointment_id=p_id and status='processing' and lease_until<=now();
 select * into r from public.clinical_evidence_reviews where appointment_id=p_id and status='processing';
 if found then return jsonb_build_object('record',to_jsonb(r),'started',false); end if;
 select * into r from public.clinical_evidence_reviews where appointment_id=p_id order by created_at desc limit 1;
 if found and r.status='ready' and r.document_version=p_version and r.question=p_question and r.question_kind=p_kind and not p_regenerate then return jsonb_build_object('record',to_jsonb(r),'started',false); end if;
 if found and r.created_at>now()-interval '15 seconds' then raise exception 'review cooldown'; end if;
 insert into public.clinical_evidence_reviews(appointment_id,created_by,document_version,status,stage,question,question_kind)
 values(p_id,p_actor,p_version,'processing','analysing',p_question,p_kind) returning * into r;
 insert into public.audit_events(event,actor_id,appointment_id) values('evidence_review_requested',p_actor,p_id);
 return jsonb_build_object('record',to_jsonb(r),'started',true);
end; $$;
revoke all on function public.queue_evidence_review(uuid,uuid,text,text,text,boolean),public.clear_deleting_card_evidence() from public,anon,authenticated;
grant execute on function public.queue_evidence_review(uuid,uuid,text,text,text,boolean) to service_role;
commit;
