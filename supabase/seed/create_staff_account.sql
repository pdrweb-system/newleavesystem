-- สร้างบัญชีแอดมิน/ผอ. ครั้งเดียวตอนติดตั้ง (บัญชีครูให้แอดมินสร้างจากหน้าเว็บ)
-- แก้ 3 ค่าใน declare แล้วรันใน SQL editor ด้วยสิทธิ์ postgres
-- ห้าม commit ไฟล์ที่ใส่รหัสผ่านจริง; ใช้รหัสชั่วคราว ระบบจะบังคับให้เปลี่ยนตอนล็อกอินครั้งแรก
do $$
declare
  v_login text := 'admin';                 -- ชื่อล็อกอิน (ต่อเป็น {login}@school.invalid)
  v_role  public.app_role := 'admin';      -- 'admin' หรือ 'director'
  v_pw    text := 'CHANGE-ME-temporary';   -- รหัสชั่วคราว อย่างน้อย 8 ตัว
  v_id    uuid := gen_random_uuid();
  v_email text;
begin
  if v_role = 'teacher' then
    raise exception 'บัญชีครูให้สร้างจากหน้าแอดมิน';
  end if;
  if length(v_pw) < 8 or v_pw = 'CHANGE-ME-temporary' then
    raise exception 'กรุณาตั้งรหัสผ่านชั่วคราว (อย่างน้อย 8 ตัว)';
  end if;
  v_email := lower(v_login) || '@school.invalid';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into public.profiles (id, role, must_change_password) values (v_id, v_role, true);
end $$;
