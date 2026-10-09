-- Private source-based analysis and explicitly requested saved presentations.
begin;
create table public.visit_analysis(
 appointment_id uuid primary key references public.appointments(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','generating','ready','failed')),
 source_hash text,sources jsonb not null default '[]',summary jsonb,model text,
 attempts integer not null default 0,lease_token uuid,lease_until timestamptz,error_code text,
 created_at timestamptz not null default now(),completed_at timestamptz,
 reviewed_by uuid references public.clinic_staff(id),reviewed_at timestamptz
);
create table public.visit_presentations(
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null unique references public.appointments(id) on delete cascade,
 source_hash text not null,content jsonb not null,created_by uuid not null references public.clinic_staff(id),
 created_at timestamptz not null default now(),reviewed_by uuid references public.clinic_staff(id),reviewed_at timestamptz
);
alter table public.visit_analysis enable row level security;
alter table public.visit_presentations enable row level security;
revoke all on public.visit_analysis,public.visit_presentations from anon,authenticated;
grant all on public.visit_analysis,public.visit_presentations to service_role;
create function public.queue_visit_analysis(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.appointments where id=p_id and status in ('submitted','reviewed')) then return; end if;
 insert into public.visit_analysis(appointment_id) values(p_id) on conflict do nothing;
end; $$;
create function public.claim_visit_analysis(p_id uuid,p_hash text,p_sources jsonb,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.visit_analysis%rowtype;
begin
 perform 1 from public.appointments where id=p_id and status in ('submitted','reviewed') for update;
 if not found then return false; end if;
 insert into public.visit_analysis(appointment_id) values(p_id) on conflict do nothing;
 select * into a from public.visit_analysis where appointment_id=p_id for update;
 if a.status='ready' or a.attempts>=3 or (a.status='generating' and a.lease_until>now()) then return false; end if;
 if a.status='failed' and a.lease_until>now() then return false; end if;
 update public.visit_analysis set status='generating',source_hash=p_hash,sources=p_sources,lease_token=p_token,
 lease_until=now()+interval '5 minutes',attempts=attempts+1,error_code=null where appointment_id=p_id;
 return true;
end; $$;
create function public.finish_visit_analysis(p_id uuid,p_token uuid,p_summary jsonb,p_sources jsonb,p_model text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.visit_analysis set status='ready',summary=p_summary,sources=p_sources,model=p_model,completed_at=now(),lease_token=null,lease_until=null,error_code=null
 where appointment_id=p_id and status='generating' and lease_token=p_token and lease_until>now();
 if not found then return false; end if;
 insert into public.audit_events(event,appointment_id) values('summary_created',p_id);
 return true;
end; $$;
create function public.fail_visit_analysis(p_id uuid,p_token uuid,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.visit_analysis set status='failed',lease_token=null,lease_until=now()+interval '1 minute',error_code=p_error
 where appointment_id=p_id and status='generating' and lease_token=p_token;
end; $$;
create function public.save_visit_presentation(p_id uuid,p_actor uuid,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.visit_analysis%rowtype; p public.visit_presentations%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active' and role in ('admin','professor')) then raise exception 'clinician required'; end if;
 select * into a from public.visit_analysis where appointment_id=p_id for update;
 if not found or a.status<>'ready' or (a.summary->'presentation'->>'eligible')::boolean is not true then raise exception 'summary not eligible'; end if;
 select * into p from public.visit_presentations where appointment_id=p_id;
 if found then return jsonb_build_object('record',to_jsonb(p),'reused',true); end if;
 insert into public.visit_presentations(appointment_id,source_hash,content,created_by) values(p_id,a.source_hash,p_content,p_actor) returning * into p;
 insert into public.audit_events(event,actor_id,appointment_id) values('presentation_created',p_actor,p_id);
 return jsonb_build_object('record',to_jsonb(p),'reused',false);
end; $$;
create function public.review_visit_artifact(p_id uuid,p_actor uuid,p_kind text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active' and role in ('admin','professor')) then return false; end if;
 if p_kind='summary' then
  update public.visit_analysis set reviewed_by=p_actor,reviewed_at=now() where appointment_id=p_id and status='ready';
 elsif p_kind='presentation' then
  update public.visit_presentations set reviewed_by=p_actor,reviewed_at=now() where appointment_id=p_id;
 else return false; end if;
 if not found then return false; end if;
 insert into public.audit_events(event,actor_id,appointment_id) values(p_kind||'_reviewed',p_actor,p_id);
 return true;
end; $$;
revoke all on function public.queue_visit_analysis(uuid),public.claim_visit_analysis(uuid,text,jsonb,uuid),public.finish_visit_analysis(uuid,uuid,jsonb,jsonb,text),public.fail_visit_analysis(uuid,uuid,text),public.save_visit_presentation(uuid,uuid,jsonb),public.review_visit_artifact(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.queue_visit_analysis(uuid),public.claim_visit_analysis(uuid,text,jsonb,uuid),public.finish_visit_analysis(uuid,uuid,jsonb,jsonb,text),public.fail_visit_analysis(uuid,uuid,text),public.save_visit_presentation(uuid,uuid,jsonb),public.review_visit_artifact(uuid,uuid,text) to service_role;
commit;
