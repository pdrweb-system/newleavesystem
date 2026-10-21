-- ชุดทดสอบ RLS/สิทธิ์ ด้วยข้อมูลสมมติ (ไม่มีข้อมูลจริง)
-- รันทั้งสคริปต์ด้วยสิทธิ์ postgres (SQL editor หรือ execute_sql)
-- ทำทุกอย่างในบล็อกเดียวแล้ว raise exception ท้ายบล็อก เพื่อ rollback ข้อมูลทดสอบทั้งหมด
-- และส่งรายงานผลออกมาทางข้อความ error (PASS/FAIL ต่อหนึ่งข้อทดสอบ)

do $test$
declare
  v_pass int; v_fail int; v_txt text;
  u_admin uuid := gen_random_uuid();
  u_dir   uuid := gen_random_uuid();
  u_ta    uuid := gen_random_uuid();
  u_tb    uuid := gen_random_uuid();
  u_none  uuid := gen_random_uuid();   -- ล็อกอินได้แต่ไม่มี profile
  t_a uuid; t_b uuid; t_c uuid;
  r1  uuid;
begin
  -- ===== ตัวช่วยทดสอบ (อยู่ในสคีมา _t ซึ่งหายไปพร้อม rollback) =====
  execute 'create schema _t';
  execute 'create table _t.res (n serial primary key, name text, ok boolean)';
  execute 'grant usage on schema _t to public';
  execute 'grant all on _t.res to public';
  execute 'grant usage, select on sequence _t.res_n_seq to public';

  execute $f$ create function _t.rec(p_name text, p_ok boolean) returns void language sql as
    $b$ insert into _t.res (name, ok) values (p_name, coalesce(p_ok, false)) $b$ $f$;

  -- สลับเป็นผู้ใช้ที่ล็อกอินแล้ว (ตั้ง JWT claims + role authenticated)
  execute $f$ create function _t.as_user(p_uid uuid) returns void language plpgsql as $b$
    begin
      perform set_config('request.jwt.claims',
        jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end $b$ $f$;

  -- คาดว่าต้อง error ด้วย sqlstate ที่ระบุ (และข้อความตรง pattern ถ้าใส่มา)
  execute $f$ create function _t.expect_err(p_name text, p_state text, p_sql text, p_msg text default null)
    returns void language plpgsql as $b$
    begin
      execute p_sql;
      perform _t.rec(p_name || ' [ไม่เกิด error]', false);
    exception when others then
      perform _t.rec(p_name || ' [' || sqlstate || ' ' || left(sqlerrm, 70) || ']',
                     sqlstate = p_state and (p_msg is null or sqlerrm like p_msg));
    end $b$ $f$;

  -- คาดว่า DML กระทบจำนวนแถวที่ระบุ (RLS กรองเงียบ ๆ = 0 แถว)
  execute $f$ create function _t.expect_rows(p_name text, p_rows int, p_sql text)
    returns void language plpgsql as $b$
    declare n int;
    begin
      execute p_sql;
      get diagnostics n = row_count;
      perform _t.rec(p_name || ' [rows=' || n || ']', n = p_rows);
    exception when others then
      perform _t.rec(p_name || ' [error ' || sqlstate || ' ' || left(sqlerrm, 70) || ']', false);
    end $b$ $f$;

  execute $f$ create function _t.expect_count(p_name text, p_count int, p_select text)
    returns void language plpgsql as $b$
    declare n int;
    begin
      execute 'select count(*) from (' || p_select || ') q' into n;
      perform _t.rec(p_name || ' [count=' || n || ']', n = p_count);
    exception when others then
      perform _t.rec(p_name || ' [error ' || sqlstate || ' ' || left(sqlerrm, 70) || ']', false);
    end $b$ $f$;

  execute $f$ create function _t.expect_ok(p_name text, p_sql text)
    returns void language plpgsql as $b$
    begin
      execute p_sql;
      perform _t.rec(p_name, true);
    exception when others then
      perform _t.rec(p_name || ' [error ' || sqlstate || ' ' || left(sqlerrm, 70) || ']', false);
    end $b$ $f$;

  -- ===== เตรียมข้อมูล (สิทธิ์เจ้าของ) =====
  insert into auth.users (id, email) values
    (u_admin, 'admin@test.invalid'), (u_dir, 'director@test.invalid'),
    (u_ta, 'ta@test.invalid'), (u_tb, 'tb@test.invalid'), (u_none, 'none@test.invalid');
  insert into public.teachers (employee_code, prefix, first_name, last_name, position, academic_rank)
    values ('T001', 'นาย', 'สมชาย', 'ใจดี', 'ครู', 'ครูชำนาญการ') returning id into t_a;
  insert into public.teachers (employee_code, prefix, first_name, last_name, position)
    values ('T002', 'นางสาว', 'สมหญิง', 'รักเรียน', 'ครู') returning id into t_b;
  insert into public.teachers (employee_code, prefix, first_name, last_name, position, academic_rank)
    values ('T003', 'นาง', 'สมศรี', 'มั่นคง', 'ครู', 'ครูชำนาญการพิเศษ') returning id into t_c;
  insert into public.profiles (id, role, teacher_id) values
    (u_admin, 'admin', null), (u_dir, 'director', null), (u_ta, 'teacher', t_a), (u_tb, 'teacher', t_b);

  -- ===== 1. แอดมินเตรียมรอบและใบ =====
  perform _t.as_user(u_admin);
  perform _t.expect_ok('1.1 แอดมินสร้างการตั้งค่าโรงเรียนได้', $q$
    insert into public.school_settings (school_name, affiliation, order_issuer, director_name)
    values ('โรงเรียนทดสอบ', 'สพป.ทดสอบ', 'สพป.ทดสอบ', 'ผอ ทดสอบ') $q$);
  insert into public.rounds (start_year, round_no) values (2569, 1) returning id into r1;
  perform _t.expect_err('1.2 แอดมินสร้างรอบสถานะ published ตรง ๆ ไม่ได้', '42501',
    $q$ insert into public.rounds (start_year, round_no, status) values (2569, 2, 'published') $q$);
  perform _t.expect_err('1.3 แอดมินแก้ status ของรอบตรง ๆ ไม่ได้', '42501',
    format($q$ update public.rounds set status = 'published' where id = %L $q$, r1));
  perform _t.expect_err('1.4 แอดมินแก้ snapshot ของรอบตรง ๆ ไม่ได้', '42501',
    format($q$ update public.rounds set snap_signature_path = 'x' where id = %L $q$, r1));

  insert into public.salary_notices (round_id, teacher_id, promoted, before_salary, base_amount, percent, increment, new_salary)
    values (r1, t_a, true, 26490, 30200, 2.30, 700, 27190);
  insert into public.salary_notices (round_id, teacher_id, promoted, reason, before_salary)
    values (r1, t_b, false, 'ทดสอบเหตุผล', 25000);
  perform _t.expect_count('1.5 trigger เติม snapshot ชื่อ/ตำแหน่ง/วิทยฐานะ', 1,
    format($q$ select 1 from public.salary_notices where round_id = %L and teacher_id = %L
      and snap_full_name = 'นายสมชาย ใจดี' and snap_position = 'ครู'
      and snap_academic_rank = 'ครูชำนาญการ' $q$, r1, t_a));
  perform _t.expect_err('1.6 ใบไม่ได้เลื่อนต้องมีเหตุผล', '23514',
    format($q$ insert into public.salary_notices (round_id, teacher_id, promoted) values (%L, %L, false) $q$, r1, t_c));
  perform _t.expect_err('1.7 ใบได้เลื่อนต้องมีตัวเลขครบ', '23514',
    format($q$ insert into public.salary_notices (round_id, teacher_id, promoted) values (%L, %L, true) $q$, r1, t_c));
  perform _t.expect_err('1.8 ส่งอนุมัติไม่ได้ถ้ายังไม่มีเลขที่คำสั่ง', 'P0001',
    format($q$ select public.submit_round(%L) $q$, r1), '%เลขที่คำสั่ง%');
  update public.rounds set order_no = '200/2569', order_date = '2026-04-29', notice_date = '2026-05-28'
    where id = r1;
  perform _t.expect_err('1.9 ส่งอนุมัติไม่ได้ถ้ามีครู active ที่ไม่มีใบ', 'P0001',
    format($q$ select public.submit_round(%L) $q$, r1), '%อีก 1 คน%');
  insert into public.salary_notices (round_id, teacher_id, promoted, before_salary, base_amount, percent, increment, new_salary)
    values (r1, t_c, true, 30000, 32000, 2.00, 640, 30640);

  -- ===== 2. ครู A ขณะรอบยังเป็น draft =====
  reset role;
  perform _t.as_user(u_ta);
  perform _t.expect_count('2.1 ครูไม่เห็นรอบที่เป็น draft', 0, 'select 1 from public.rounds');
  perform _t.expect_count('2.2 ครูไม่เห็นใบในรอบ draft', 0, 'select 1 from public.salary_notices');
  perform _t.expect_err('2.3 ครูเรียก submit_round ไม่ได้', '42501',
    format($q$ select public.submit_round(%L) $q$, r1));
  perform _t.expect_err('2.4 ครูเรียก approve_round ไม่ได้', '42501',
    format($q$ select public.approve_round(%L) $q$, r1));
  perform _t.expect_err('2.5 ครูเรียก revert_round ไม่ได้', '42501',
    format($q$ select public.revert_round(%L, 'x') $q$, r1));
  perform _t.expect_count('2.6 ครูเห็นข้อมูลครูเฉพาะของตัวเอง', 1, 'select 1 from public.teachers');
  perform _t.expect_count('2.7 ครูเห็นเฉพาะ profile ตัวเอง', 1, 'select 1 from public.profiles');
  perform _t.expect_count('2.8 ครูอ่าน audit_log ไม่ได้', 0, 'select 1 from public.audit_log');
  perform _t.expect_count('2.9 ครูอ่านตั้งค่าโรงเรียนได้', 1, 'select 1 from public.school_settings');
  perform _t.expect_rows('2.10 ครูแก้ตั้งค่าโรงเรียนไม่ได้', 0,
    $q$ update public.school_settings set school_name = 'x' $q$);
  perform _t.expect_err('2.11 ครูเพิ่มครูใหม่ไม่ได้', '42501',
    $q$ insert into public.teachers (employee_code, prefix, first_name, last_name) values ('T999', 'นาย', 'ก', 'ข') $q$);
  perform _t.expect_rows('2.12 ครูแก้ข้อมูลครูไม่ได้', 0, $q$ update public.teachers set position = 'x' $q$);
  perform _t.expect_err('2.13 ครูแก้ role ใน profile ไม่ได้', '42501',
    $q$ update public.profiles set role = 'admin' $q$);
  perform _t.expect_err('2.14 ครูเขียน audit_log ไม่ได้', '42501',
    $q$ insert into public.audit_log (action) values ('x') $q$);
  perform _t.expect_err('2.15 ครูสร้างรอบไม่ได้', '42501',
    $q$ insert into public.rounds (start_year, round_no) values (2570, 1) $q$);
  perform _t.expect_err('2.16 ครู log_download รอบ draft ไม่ได้', 'P0001',
    format($q$ select public.log_download(%L) $q$, r1), '%ไม่พบเอกสาร%');

  -- ===== 3. แอดมินส่งอนุมัติ =====
  reset role;
  perform _t.as_user(u_admin);
  perform _t.expect_ok('3.1 แอดมินส่งรอบให้ ผอ. อนุมัติได้',
    format($q$ select public.submit_round(%L) $q$, r1));
  perform _t.expect_count('3.2 สถานะเป็น pending_approval', 1,
    format($q$ select 1 from public.rounds where id = %L and status = 'pending_approval' $q$, r1));
  perform _t.expect_rows('3.3 แอดมินแก้ใบในรอบที่รออนุมัติไม่ได้', 0,
    format($q$ update public.salary_notices set special_comp = 1 where round_id = %L $q$, r1));
  perform _t.expect_rows('3.4 แอดมินลบใบในรอบที่รออนุมัติไม่ได้', 0,
    format($q$ delete from public.salary_notices where round_id = %L $q$, r1));
  perform _t.expect_rows('3.5 แอดมินแก้รอบที่รออนุมัติไม่ได้', 0,
    format($q$ update public.rounds set order_no = 'x' where id = %L $q$, r1));
  perform _t.expect_rows('3.6 แอดมินลบรอบที่รออนุมัติไม่ได้', 0,
    format($q$ delete from public.rounds where id = %L $q$, r1));
  perform _t.expect_err('3.7 แอดมินเพิ่มใบในรอบที่รออนุมัติไม่ได้', '42501',
    format($q$ insert into public.salary_notices (round_id, teacher_id, promoted, reason) values (%L, %L, false, 'x') $q$, r1, t_a));
  perform _t.expect_err('3.8 แอดมินอนุมัติเองไม่ได้', '42501',
    format($q$ select public.approve_round(%L) $q$, r1));

  -- ===== 4. ผอ. ก่อนมีลายเซ็น =====
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_count('4.1 ผอ. เห็นรอบ', 1, 'select 1 from public.rounds');
  perform _t.expect_count('4.2 ผอ. เห็นใบทุกคน', 3, 'select 1 from public.salary_notices');
  perform _t.expect_count('4.3 ผอ. เห็นข้อมูลครูทุกคน', 3, 'select 1 from public.teachers');
  perform _t.expect_rows('4.4 ผอ. แก้ตั้งค่าโรงเรียนไม่ได้', 0,
    $q$ update public.school_settings set school_name = 'x' $q$);
  perform _t.expect_err('4.5 อนุมัติไม่ได้ถ้ายังไม่มีลายเซ็น', 'P0001',
    format($q$ select public.approve_round(%L) $q$, r1), '%ลายเซ็น%');

  -- ===== 5. ลายเซ็น (ไฟล์ใน storage) =====
  reset role;
  insert into storage.objects (bucket_id, name) values
    ('signatures', 'test-sig.png'), ('signatures', 'other-sig.png');
  perform _t.as_user(u_admin);
  perform _t.expect_rows('5.1 แอดมินตั้งลายเซ็นในหน้าตั้งค่าได้', 1,
    $q$ update public.school_settings set signature_path = 'test-sig.png' $q$);
  perform _t.expect_ok('5.2 แอดมินอัปโหลดไฟล์เข้า bucket signatures ได้',
    $q$ insert into storage.objects (bucket_id, name) values ('signatures', 'admin-upload.png') $q$);

  -- ===== 6. ผอ. อนุมัติ =====
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_ok('6.1 ผอ. อนุมัติและเผยแพร่ได้',
    format($q$ select public.approve_round(%L) $q$, r1));
  perform _t.expect_count('6.2 รอบเป็น published พร้อม snapshot ครบ', 1,
    format($q$ select 1 from public.rounds where id = %L and status = 'published'
      and snap_signature_path = 'test-sig.png' and snap_school_name = 'โรงเรียนทดสอบ'
      and snap_affiliation = 'สพป.ทดสอบ' and snap_order_issuer = 'สพป.ทดสอบ'
      and snap_director_name = 'นายผอ ทดสอบ' and approved_by = %L and approved_at is not null $q$, r1, u_dir));
  perform _t.expect_err('6.3 อนุมัติซ้ำไม่ได้', 'P0001',
    format($q$ select public.approve_round(%L) $q$, r1), '%รออนุมัติ%');

  -- ===== 7. แอดมินหลังเผยแพร่ =====
  reset role;
  perform _t.as_user(u_admin);
  perform _t.expect_rows('7.1 แอดมินแก้ใบที่เผยแพร่แล้วไม่ได้', 0,
    format($q$ update public.salary_notices set special_comp = 1 where round_id = %L $q$, r1));
  perform _t.expect_rows('7.2 แอดมินแก้รอบที่เผยแพร่แล้วไม่ได้', 0,
    format($q$ update public.rounds set order_no = 'x' where id = %L $q$, r1));
  perform _t.expect_rows('7.3 แอดมินลบรอบที่เผยแพร่แล้วไม่ได้', 0,
    format($q$ delete from public.rounds where id = %L $q$, r1));
  perform _t.expect_err('7.4 แอดมินส่งอนุมัติซ้ำไม่ได้', 'P0001',
    format($q$ select public.submit_round(%L) $q$, r1));
  perform _t.expect_rows('7.5 แอดมินแก้ชื่อโรงเรียนในตั้งค่าได้', 1,
    $q$ update public.school_settings set school_name = 'โรงเรียนเปลี่ยนชื่อ' $q$);
  perform _t.expect_count('7.6 snapshot ของรอบเก่าไม่เปลี่ยนตามตั้งค่าใหม่', 1,
    format($q$ select 1 from public.rounds where id = %L and snap_school_name = 'โรงเรียนทดสอบ' $q$, r1));

  -- ===== 8. ครู A หลังเผยแพร่ =====
  reset role;
  perform _t.as_user(u_ta);
  perform _t.expect_count('8.1 ครูเห็นรอบที่เผยแพร่แล้ว', 1, 'select 1 from public.rounds');
  perform _t.expect_count('8.2 ครูเห็นใบของตัวเอง 1 ใบ', 1, 'select 1 from public.salary_notices');
  perform _t.expect_count('8.3 ครูอ่านใบของครูคนอื่นไม่ได้', 0,
    format($q$ select 1 from public.salary_notices where teacher_id <> %L $q$, t_a));
  perform _t.expect_rows('8.4 ครูแก้ใบตัวเองไม่ได้', 0,
    $q$ update public.salary_notices set new_salary = 99999 $q$);
  perform _t.expect_rows('8.5 ครูลบใบตัวเองไม่ได้', 0, $q$ delete from public.salary_notices $q$);
  perform _t.expect_err('8.6 ครูเพิ่มใบไม่ได้', '42501',
    format($q$ insert into public.salary_notices (round_id, teacher_id, promoted, reason) values (%L, %L, false, 'x') $q$, r1, t_a));
  perform _t.expect_ok('8.7 ครูบันทึกการดาวน์โหลดรอบที่เผยแพร่ได้',
    format($q$ select public.log_download(%L) $q$, r1));
  perform _t.expect_count('8.8 ครูอ่านไฟล์ลายเซ็นที่รอบเผยแพร่อ้างถึงได้', 1,
    $q$ select 1 from storage.objects where bucket_id = 'signatures' and name = 'test-sig.png' $q$);
  perform _t.expect_count('8.9 ครูอ่านไฟล์ลายเซ็นอื่นไม่ได้', 0,
    $q$ select 1 from storage.objects where bucket_id = 'signatures' and name <> 'test-sig.png' $q$);
  perform _t.expect_err('8.10 ครูอัปโหลดไฟล์เข้า bucket signatures ไม่ได้', '42501',
    $q$ insert into storage.objects (bucket_id, name) values ('signatures', 'evil.png') $q$);

  -- ===== 9. ครู B =====
  reset role;
  perform _t.as_user(u_tb);
  perform _t.expect_count('9.1 ครู B เห็นใบ 1 ใบ', 1, 'select 1 from public.salary_notices');
  perform _t.expect_count('9.2 ใบที่เห็นเป็นของ B (ไม่ได้เลื่อน)', 1,
    $q$ select 1 from public.salary_notices where promoted = false and reason = 'ทดสอบเหตุผล' $q$);

  -- ===== 10. audit log =====
  reset role;
  perform _t.as_user(u_admin);
  perform _t.expect_count('10.1 แอดมินเห็นบันทึกการดาวน์โหลดของครู', 1,
    $q$ select 1 from public.audit_log where action = 'download' $q$);
  perform _t.expect_count('10.2 audit_log มีบันทึกการเปลี่ยนรอบเป็น published', 1,
    $q$ select 1 from public.audit_log where table_name = 'rounds' and action = 'update'
        and detail -> 'new' ->> 'status' = 'published' $q$);
  perform _t.expect_err('10.3 แอดมินแก้ audit_log ไม่ได้', '42501',
    $q$ update public.audit_log set action = 'x' $q$);
  perform _t.expect_err('10.4 แอดมินลบ audit_log ไม่ได้', '42501', $q$ delete from public.audit_log $q$);
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_count('10.5 ผอ. เห็น audit_log', 1,
    $q$ select 1 from public.audit_log where action = 'download' $q$);
  reset role;
  perform _t.expect_err('10.6 แม้เจ้าของฐานข้อมูลก็แก้ audit_log ไม่ได้ (trigger)', 'P0001',
    $q$ update public.audit_log set action = 'x' $q$);

  -- ===== 11. ครูที่ถูกปิดใช้งาน =====
  update public.teachers set active = false where id = t_a;
  perform _t.as_user(u_ta);
  perform _t.expect_count('11.1 ครูที่ถูกปิดใช้งานไม่เห็นรอบ', 0, 'select 1 from public.rounds');
  perform _t.expect_count('11.2 ครูที่ถูกปิดใช้งานไม่เห็นใบ', 0, 'select 1 from public.salary_notices');
  perform _t.expect_count('11.3 ครูที่ถูกปิดใช้งานไม่เห็นข้อมูลครู', 0, 'select 1 from public.teachers');
  perform _t.expect_err('11.4 ครูที่ถูกปิดใช้งาน log_download ไม่ได้', 'P0001',
    format($q$ select public.log_download(%L) $q$, r1), '%ไม่พบเอกสาร%');
  reset role;
  update public.teachers set active = true where id = t_a;

  -- ===== 12. ถอนกลับเป็น draft =====
  perform _t.as_user(u_admin);
  perform _t.expect_err('12.1 แอดมินถอนการเผยแพร่ไม่ได้', '42501',
    format($q$ select public.revert_round(%L, 'x') $q$, r1));
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_err('12.2 ผอ. ถอนกลับโดยไม่ระบุเหตุผลไม่ได้', 'P0001',
    format($q$ select public.revert_round(%L, '  ') $q$, r1), '%เหตุผล%');
  perform _t.expect_ok('12.3 ผอ. ถอนกลับเป็น draft ได้',
    format($q$ select public.revert_round(%L, 'ตัวเลขผิด') $q$, r1));
  perform _t.expect_count('12.4 รอบกลับเป็น draft และล้าง snapshot/การอนุมัติ', 1,
    format($q$ select 1 from public.rounds where id = %L and status = 'draft'
      and approved_by is null and approved_at is null and submitted_at is null
      and snap_signature_path is null and snap_school_name is null $q$, r1));
  perform _t.expect_count('12.5 บันทึกเหตุผลการถอนใน audit_log', 1,
    $q$ select 1 from public.audit_log where action = 'revert_round' and detail ->> 'reason' = 'ตัวเลขผิด' $q$);
  reset role;
  perform _t.as_user(u_tb);
  perform _t.expect_count('12.6 ครูไม่เห็นรอบที่ถูกถอนกลับ', 0, 'select 1 from public.rounds');
  perform _t.expect_count('12.7 ครูไม่เห็นใบของรอบที่ถูกถอนกลับ', 0, 'select 1 from public.salary_notices');
  reset role;
  perform _t.as_user(u_admin);
  perform _t.expect_rows('12.8 แอดมินแก้ใบได้อีกครั้งหลังถอนกลับ', 1,
    format($q$ update public.salary_notices set special_comp = 100 where round_id = %L and teacher_id = %L $q$, r1, t_a));

  -- ===== 13. anon และผู้ใช้ที่ไม่มี profile =====
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform _t.expect_err('13.1 anon อ่านรอบไม่ได้', '42501', 'select 1 from public.rounds');
  perform _t.expect_err('13.2 anon อ่านใบไม่ได้', '42501', 'select 1 from public.salary_notices');
  perform _t.expect_err('13.3 anon เรียก submit_round ไม่ได้', '42501',
    format($q$ select public.submit_round(%L) $q$, r1));
  perform _t.expect_err('13.4 anon เรียก log_download ไม่ได้', '42501',
    format($q$ select public.log_download(%L) $q$, r1));
  perform _t.expect_count('13.5 anon อ่านไฟล์ใน storage ไม่ได้', 0, 'select 1 from storage.objects');

  reset role;
  perform _t.as_user(u_none);
  perform _t.expect_count('14.1 ผู้ใช้ไม่มี profile ไม่เห็นรอบ', 0, 'select 1 from public.rounds');
  perform _t.expect_count('14.2 ผู้ใช้ไม่มี profile ไม่เห็นใบ', 0, 'select 1 from public.salary_notices');
  perform _t.expect_count('14.3 ผู้ใช้ไม่มี profile ไม่เห็นข้อมูลครู', 0, 'select 1 from public.teachers');
  perform _t.expect_count('14.4 ผู้ใช้ไม่มี profile ไม่เห็นตั้งค่าโรงเรียน', 0, 'select 1 from public.school_settings');
  perform _t.expect_count('14.5 ผู้ใช้ไม่มี profile ไม่เห็น profile ใคร', 0, 'select 1 from public.profiles');
  perform _t.expect_err('14.6 ผู้ใช้ไม่มี profile เรียก log_download ไม่ได้', '42501',
    format($q$ select public.log_download(%L) $q$, r1));

  -- ===== สรุปผล (raise exception เพื่อ rollback ทุกอย่าง) =====
  reset role;
  select count(*) filter (where ok), count(*) filter (where not ok),
         string_agg((case when ok then 'PASS ' else 'FAIL ' end) || name, E'\n' order by n)
    into v_pass, v_fail, v_txt
  from _t.res;
  raise exception E'RLS TEST REPORT: pass=% fail=%\n%', v_pass, v_fail, v_txt;
end $test$;
