-- Model selection only. API keys remain in Vercel and are never stored here.
begin;
create table public.clinic_ai_settings(
 provider text primary key check(provider='anthropic'),
 model_id text not null check(model_id ~ '^claude-[a-z0-9-]{1,100}$'),
 updated_by uuid not null,updated_at timestamptz not null default now()
);
alter table public.clinic_ai_settings enable row level security;
revoke all on public.clinic_ai_settings from public,anon,authenticated;
grant all on public.clinic_ai_settings to service_role;
create function public.set_clinic_ai_model(p_actor uuid,p_model text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.clinic_ai_settings%rowtype;
begin
 if not exists(select 1 from public.clinic_staff where id=p_actor and status='active' and role='admin' and email='galadv73@gmail.com') then raise exception 'admin required';end if;
 insert into public.clinic_ai_settings(provider,model_id,updated_by) values('anthropic',p_model,p_actor)
 on conflict(provider) do update set model_id=excluded.model_id,updated_by=p_actor,updated_at=now()
 returning * into result;
 insert into public.audit_events(event,actor_id,details) values('anthropic_model_changed',p_actor,jsonb_build_object('model_id',p_model));
 return to_jsonb(result);
end;$$;
revoke all on function public.set_clinic_ai_model(uuid,text) from public,anon,authenticated;
grant execute on function public.set_clinic_ai_model(uuid,text) to service_role;
commit;
