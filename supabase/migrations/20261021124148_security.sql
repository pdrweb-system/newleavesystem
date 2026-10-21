-- 2/4 ฟังก์ชันช่วย, สิทธิ์ระดับคอลัมน์ และนโยบาย RLS
-- ฟังก์ชันช่วยอยู่ในสคีมา private (ไม่เปิดเป็น API) ใช้ได้เฉพาะตอนประเมิน RLS

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as
$$ select p.role from public.profiles p where p.id = (select auth.uid()) $$;

-- ครูที่ถูกปิดใช้งาน (active = false) จะได้ null จึงไม่เห็นข้อมูลใดเลย
create or replace function private.my_teacher_id() returns uuid
language sql stable security definer set search_path = '' as
$$ select p.teacher_id
   from public.profiles p
   join public.teachers t on t.id = p.teacher_id and t.active
   where p.id = (select auth.uid()) $$;

-- อ่านสถานะรอบโดยไม่ผ่าน RLS ของ rounds (กัน policy วนอ้างกันระหว่างตาราง)
create or replace function private.round_status_of(p_round uuid) returns public.round_status
language sql stable security definer set search_path = '' as
$$ select r.status from public.rounds r where r.id = p_round $$;

revoke all on function private.current_app_role(), private.my_teacher_id(),
  private.round_status_of(uuid) from public, anon;
grant execute on function private.current_app_role(), private.my_teacher_id(),
  private.round_status_of(uuid) to authenticated;

-- สิทธิ์ระดับตาราง/คอลัมน์ (RLS กรองแถวอีกชั้น)
grant select on public.teachers, public.profiles, public.school_settings,
  public.rounds, public.salary_notices, public.audit_log to authenticated;
grant insert, update, delete on public.teachers to authenticated;
grant insert, update on public.school_settings to authenticated;
grant delete on public.rounds to authenticated;
grant insert, update, delete on public.salary_notices to authenticated;
-- rounds: แก้สถานะ/ผู้อนุมัติ/snapshot ผ่าน RPC เท่านั้น
grant insert (start_year, round_no, order_no, order_date, notice_date),
      update (start_year, round_no, order_no, order_date, notice_date)
  on public.rounds to authenticated;
-- profiles และ audit_log: ไคลเอนต์อ่านได้อย่างเดียว

-- teachers
create policy teachers_select on public.teachers for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'director')
         or id = (select private.my_teacher_id()));
create policy teachers_insert on public.teachers for insert to authenticated
  with check ((select private.current_app_role()) = 'admin');
create policy teachers_update on public.teachers for update to authenticated
  using ((select private.current_app_role()) = 'admin')
  with check ((select private.current_app_role()) = 'admin');
create policy teachers_delete on public.teachers for delete to authenticated
  using ((select private.current_app_role()) = 'admin');

-- profiles (เขียนผ่าน Edge Function ด้วย service role เท่านั้น)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.current_app_role()) = 'admin');

-- school_settings (ต้องมีบทบาทในระบบจึงอ่านได้)
create policy settings_select on public.school_settings for select to authenticated
  using ((select private.current_app_role()) is not null);
create policy settings_insert on public.school_settings for insert to authenticated
  with check ((select private.current_app_role()) = 'admin');
create policy settings_update on public.school_settings for update to authenticated
  using ((select private.current_app_role()) = 'admin')
  with check ((select private.current_app_role()) = 'admin');

-- rounds: ครูเห็นเฉพาะรอบที่เผยแพร่แล้ว / แอดมินแก้ได้เฉพาะ draft
create policy rounds_select on public.rounds for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'director')
         or ((select private.my_teacher_id()) is not null and status = 'published'));
create policy rounds_insert on public.rounds for insert to authenticated
  with check ((select private.current_app_role()) = 'admin' and status = 'draft');
create policy rounds_update on public.rounds for update to authenticated
  using ((select private.current_app_role()) = 'admin' and status = 'draft')
  with check ((select private.current_app_role()) = 'admin' and status = 'draft');
create policy rounds_delete on public.rounds for delete to authenticated
  using ((select private.current_app_role()) = 'admin' and status = 'draft');

-- salary_notices
create policy notices_select on public.salary_notices for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'director')
         or (teacher_id = (select private.my_teacher_id())
             and private.round_status_of(round_id) = 'published'));
create policy notices_insert on public.salary_notices for insert to authenticated
  with check ((select private.current_app_role()) = 'admin'
              and private.round_status_of(round_id) = 'draft');
create policy notices_update on public.salary_notices for update to authenticated
  using ((select private.current_app_role()) = 'admin'
         and private.round_status_of(round_id) = 'draft')
  with check ((select private.current_app_role()) = 'admin'
              and private.round_status_of(round_id) = 'draft');
create policy notices_delete on public.salary_notices for delete to authenticated
  using ((select private.current_app_role()) = 'admin'
         and private.round_status_of(round_id) = 'draft');

-- audit_log: อ่านได้เฉพาะแอดมิน/ผอ. ไม่มี policy เขียนจากไคลเอนต์
create policy audit_select on public.audit_log for select to authenticated
  using ((select private.current_app_role()) in ('admin', 'director'));
