-- 5 บัญชีและล็อกอิน
-- ชื่อล็อกอินของครู = รหัสประจำตัว ระบบต่อเป็นอีเมลภายใน {รหัส}@school.invalid
-- จึงจำกัดตัวอักษรให้เป็นอีเมลที่ถูกต้อง
alter table public.teachers
  add constraint teachers_employee_code_format check (employee_code ~ '^[A-Za-z0-9._-]+$');

-- เปลี่ยนรหัสผ่านสำเร็จ (ผ่าน Supabase Auth) → ปลดธง must_change_password
-- Edge Function รีเซ็ตรหัสจะตั้งธงกลับเป็น true หลังเปลี่ยนรหัสให้
create or replace function private.clear_must_change_password() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles set must_change_password = false
    where id = new.id and must_change_password;
  end if;
  return new;
end $$;

revoke all on function private.clear_must_change_password() from public, anon, authenticated;

create trigger on_auth_password_changed
  after update of encrypted_password on auth.users
  for each row execute function private.clear_must_change_password();
