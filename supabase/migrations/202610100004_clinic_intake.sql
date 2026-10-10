-- Clinic-created cards and staff uploads. Existing invitations stay unchanged.
begin;
alter table public.appointments add column intake_mode text not null default 'invitation'
 check(intake_mode in ('invitation','clinic'));
create or replace function public.audit_appointment_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(event,actor_id,appointment_id)
 values(case when new.intake_mode='clinic' then 'clinic_card_created' else 'invitation_created' end,new.created_by,new.id);
 return new;
end; $$;
create function public.attach_clinic_document(p_record jsonb,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype; n integer;
begin
 perform 1 from public.clinic_staff where id=p_actor and status='active' for share;
 if not found then raise exception 'staff required'; end if;
 select * into a from public.appointments where id=(p_record->>'appointment_id')::uuid for update;
 if not found or a.status<>'invited' then raise exception 'upload closed'; end if;
 select count(*) into n from public.documents where appointment_id=a.id;
 if n>=10 then raise exception 'document limit'; end if;
 insert into public.documents(id,appointment_id,filename,storage_path,sha256,bytes,created_at)
 values((p_record->>'id')::uuid,a.id,p_record->>'filename',p_record->>'storage_path',p_record->>'sha256',(p_record->>'bytes')::integer,(p_record->>'created_at')::timestamptz);
 insert into public.audit_events(event,actor_id,appointment_id,document_id)
 values('staff_document_uploaded',p_actor,a.id,(p_record->>'id')::uuid);
end; $$;
create function public.submit_clinic_appointment(p_id uuid,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype;
begin
 perform 1 from public.clinic_staff where id=p_actor and status='active' for share;
 if not found then raise exception 'staff required'; end if;
 select * into a from public.appointments where id=p_id for update;
 if not found or a.status<>'invited' then return false; end if;
 if not exists(select 1 from public.documents where appointment_id=p_id) then return false; end if;
 update public.appointments set status='submitted',submitted_at=now() where id=p_id;
 insert into public.audit_events(event,actor_id,appointment_id) values('staff_documents_submitted',p_actor,p_id);
 return true;
end; $$;
revoke all on function public.attach_clinic_document(jsonb,uuid),public.submit_clinic_appointment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.attach_clinic_document(jsonb,uuid),public.submit_clinic_appointment(uuid,uuid) to service_role;
commit;
