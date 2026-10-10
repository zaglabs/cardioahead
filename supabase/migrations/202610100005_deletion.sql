-- Deletion controls: files are purged before card metadata is removed.
begin;
alter table public.appointments add column deletion_requested_at timestamptz;
alter table public.audit_events add column details jsonb not null default '{}';
alter table public.appointments alter column created_by drop not null;
alter table public.appointments drop constraint appointments_created_by_fkey;
alter table public.appointments add constraint appointments_created_by_fkey foreign key(created_by) references public.clinic_staff(id) on delete set null;
alter table public.visit_analysis drop constraint visit_analysis_reviewed_by_fkey;
alter table public.visit_analysis add constraint visit_analysis_reviewed_by_fkey foreign key(reviewed_by) references public.clinic_staff(id) on delete set null;
alter table public.visit_presentations alter column created_by drop not null;
alter table public.visit_presentations drop constraint visit_presentations_created_by_fkey;
alter table public.visit_presentations add constraint visit_presentations_created_by_fkey foreign key(created_by) references public.clinic_staff(id) on delete set null;
alter table public.visit_presentations drop constraint visit_presentations_reviewed_by_fkey;
alter table public.visit_presentations add constraint visit_presentations_reviewed_by_fkey foreign key(reviewed_by) references public.clinic_staff(id) on delete set null;

create function public.guard_deleting_card_insert() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype;
begin
 select * into a from public.appointments where id=new.appointment_id for no key update;
 if not found or a.deletion_requested_at is not null then raise exception 'card unavailable'; end if;
 return new;
end; $$;
create trigger guard_card_document before insert on public.documents for each row execute function public.guard_deleting_card_insert();
create trigger guard_card_analysis before insert on public.visit_analysis for each row execute function public.guard_deleting_card_insert();
revoke all on function public.guard_deleting_card_insert() from public,anon,authenticated;

create function public.begin_patient_card_delete(p_actor uuid,p_id uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.appointments%rowtype; paths jsonb;
begin
 perform 1 from public.clinic_staff where id=p_actor and status='active' for share;
 if not found then raise exception 'staff required'; end if;
 select * into a from public.appointments where id=p_id for no key update;
 if not found then return null; end if;
 if a.patient_label<>p_confirmation then raise exception 'confirmation mismatch'; end if;
 update public.appointments set deletion_requested_at=coalesce(deletion_requested_at,now()),revoked_at=coalesce(revoked_at,now()) where id=p_id;
 delete from public.portal_sessions where appointment_id=p_id;
 delete from public.visit_presentations where appointment_id=p_id;
 delete from public.visit_analysis where appointment_id=p_id;
 select coalesce(jsonb_agg(storage_path),'[]') into paths from public.documents where appointment_id=p_id;
 if a.deletion_requested_at is null then
  insert into public.audit_events(event,actor_id,appointment_id) values('patient_card_deletion_requested',p_actor,p_id);
 end if;
 return jsonb_build_object('paths',paths);
end; $$;

create function public.finish_patient_card_delete(p_actor uuid,p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.clinic_staff where id=p_actor and status='active' for share;
 if not found then raise exception 'staff required'; end if;
 perform 1 from public.appointments where id=p_id and deletion_requested_at is not null for update;
 if not found then return false; end if;
 delete from public.appointments where id=p_id;
 insert into public.audit_events(event,actor_id,appointment_id) values('patient_card_deleted',p_actor,p_id);
 return true;
end; $$;

create function public.delete_clinic_staff(p_actor uuid,p_id uuid,p_email text) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.clinic_staff%rowtype;
begin
 perform 1 from public.clinic_staff where id=p_actor and email='galadv73@gmail.com' and role='admin' and status='active' for share;
 if not found then raise exception 'admin required'; end if;
 if p_actor=p_id or p_email='galadv73@gmail.com' then raise exception 'owner protected'; end if;
 -- Use the same challenge-before-identity lock order as OTP verification.
 perform 1 from public.staff_otp_challenges where email=p_email for update;
 select * into s from public.clinic_staff where id=p_id for update;
 if not found then return false; end if;
 if s.email='galadv73@gmail.com' then raise exception 'owner protected'; end if;
 if s.email<>p_email then raise exception 'confirmation mismatch'; end if;
 delete from public.staff_otp_challenges where email=s.email;
 delete from public.clinic_staff where id=p_id;
 insert into public.audit_events(event,actor_id,details)
 values('staff_user_deleted',p_actor,jsonb_build_object('target_user_id',s.id,'target_email',s.email,'previous_role',s.role));
 return true;
end; $$;
revoke all on function public.begin_patient_card_delete(uuid,uuid,text),public.finish_patient_card_delete(uuid,uuid),public.delete_clinic_staff(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_patient_card_delete(uuid,uuid,text),public.finish_patient_card_delete(uuid,uuid),public.delete_clinic_staff(uuid,uuid,text) to service_role;
commit;
