-- ทดสอบทั้ง flow (เฟส 6) ด้วยครูสมมติ 12 คน 2 รอบ ผ่านสิทธิ์จริงของแต่ละบทบาท
-- แอดมินเพิ่มครู/สร้างรอบ/กรอกใบ → ส่ง → ผอ. ตีกลับ → แก้ → ส่งใหม่ → อนุมัติ → ครูดู/ดาวน์โหลด
-- → ผอ. ถอนการเผยแพร่ → อนุมัติใหม่ → ปิดใช้งานครู 1 คน แล้วตรวจ audit log ว่าบันทึกครบและระบุตัวผู้ทำถูกต้อง
-- รันทั้งไฟล์ด้วยสิทธิ์ postgres; rollback ทั้งหมดท้ายบล็อก (ข้อมูลจริงไม่เปลี่ยน) ผลอยู่ในข้อความ error
do $test$
declare
  v_pass int; v_fail int; v_txt text;
  u_admin uuid := gen_random_uuid();
  u_dir   uuid := gen_random_uuid();
  u_t  uuid[] := array[]::uuid[];   -- บัญชีครู 12 คน
  t_id uuid[] := array[]::uuid[];   -- teachers.id ตามลำดับเดียวกัน
  r_a uuid; r_b uuid; v_id uuid;
  i int; cnt int; ok_count int;
begin
  -- ===== ตัวช่วยทดสอบ (สคีมา _t หายไปพร้อม rollback) =====
  execute 'create schema _t';
  execute 'create table _t.res (n serial primary key, name text, ok boolean)';
  execute 'grant usage on schema _t to public';
  execute 'grant all on _t.res to public';
  execute 'grant usage, select on sequence _t.res_n_seq to public';
  execute $f$ create function _t.rec(p_name text, p_ok boolean) returns void language sql as
    $b$ insert into _t.res (name, ok) values (p_name, coalesce(p_ok, false)) $b$ $f$;
  execute $f$ create function _t.as_user(p_uid uuid) returns void language plpgsql as $b$
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end $b$ $f$;
  execute $f$ create function _t.expect_ok(p_name text, p_sql text) returns void language plpgsql as $b$
    begin
      execute p_sql;
      perform _t.rec(p_name, true);
    exception when others then
      perform _t.rec(p_name || ' [error ' || sqlstate || ' ' || left(sqlerrm, 80) || ']', false);
    end $b$ $f$;
  execute $f$ create function _t.expect_count(p_name text, p_count int, p_select text) returns void language plpgsql as $b$
    declare n int;
    begin
      execute 'select count(*) from (' || p_select || ') q' into n;
      perform _t.rec(p_name || ' [count=' || n || ']', n = p_count);
    exception when others then
      perform _t.rec(p_name || ' [error ' || sqlstate || ' ' || left(sqlerrm, 80) || ']', false);
    end $b$ $f$;

  -- ===== เตรียมบัญชี (แทน Edge Function ที่ใช้ service role) =====
  for i in 1..12 loop u_t := u_t || gen_random_uuid(); end loop;
  insert into auth.users (id, email)
    select u, format('e2e-%s@test.invalid', ord) from unnest(array[u_admin, u_dir] || u_t) with ordinality as x(u, ord);
  update public.teachers set active = false where active;   -- ครูจริง (ถ้ามี) ไม่ถูกนับในรอบทดสอบ
  insert into public.profiles (id, role) values (u_admin, 'admin'), (u_dir, 'director');
  insert into storage.objects (bucket_id, name) values ('signatures', 'e2e-sig-1.png');

  -- ===== 1. แอดมิน: ตั้งค่าโรงเรียน + เพิ่มครู 12 คน =====
  perform _t.as_user(u_admin);
  insert into public.school_settings (school_name, affiliation, order_issuer, director_prefix, director_name, director_title, signature_path)
    values ('โรงเรียนทดสอบ E2E', 'สพป.ทดสอบ', 'สพป.ทดสอบ', 'นาย', 'ผอ เดิม', 'ผู้อำนวยการโรงเรียนทดสอบ E2E', 'e2e-sig-1.png')
    on conflict (id) do update set school_name = excluded.school_name, affiliation = excluded.affiliation,
      order_issuer = excluded.order_issuer, director_prefix = excluded.director_prefix, director_name = excluded.director_name,
      director_title = excluded.director_title, signature_path = excluded.signature_path;
  for i in 1..12 loop
    insert into public.teachers (employee_code, prefix, first_name, last_name, position, academic_rank)
      values (format('E2E-%s', lpad(i::text, 2, '0')), (array['นาย', 'นาง', 'นางสาว'])[1 + i % 3],
              'ครูทดสอบ' || i, 'นามสมมติ', 'ครู', case when i % 4 = 0 then null else 'ครูชำนาญการ' end)
      returning id into v_id;
    t_id := t_id || v_id;
  end loop;
  perform _t.expect_count('1.1 แอดมินเพิ่มครู 12 คน', 12, format('select 1 from public.teachers where id = any(%L::uuid[])', t_id));
  reset role;
  insert into public.profiles (id, role, teacher_id) select u_t[g], 'teacher', t_id[g] from generate_series(1, 12) g;

  -- ===== 2. รอบ A: กรอกใบ 12 คน (คนที่ 5, 11 ไม่ได้เลื่อน) → ส่ง → อนุมัติ =====
  perform _t.as_user(u_admin);
  insert into public.rounds (start_year, round_no, order_no, order_date, notice_date)
    values (2697, 1, '101/2697', '2026-04-29', '2026-05-28') returning id into r_a;
  insert into public.salary_notices (round_id, teacher_id, promoted, before_salary, base_amount, percent, increment, new_salary, reason)
    select r_a, t_id[g], not v.np, v.before,
           case when v.np then null else v.base end, case when v.np then null else v.pct end,
           case when v.np then null else v.inc end, case when v.np then null else v.before + v.inc end,
           case when v.np then 'ทดสอบ: มีวันลาเกินกำหนด' end
    from generate_series(1, 12) g
    cross join lateral (
      select g in (5, 11) as np, (20000 + g * 1000)::numeric as before, (22000 + g * 1000)::numeric as base,
             (1.50 + (g % 5) * 0.30)::numeric as pct,
             -- สูตรเดียวกับ assets/calc.js
             ceil(round((22000 + g * 1000) * 100) * round((1.50 + (g % 5) * 0.30) * 100) / 1e7) * 10 as inc) v;
  perform _t.expect_count('2.1 ใบรอบ A ครบ 12 ใบ และเติม snapshot ชื่อ/ตำแหน่งให้', 12,
    format($q$ select 1 from public.salary_notices where round_id = %L and snap_full_name like '%%ครูทดสอบ%% นามสมมติ' and snap_position = 'ครู' $q$, r_a));
  perform _t.expect_ok('2.2 แอดมินส่งรอบ A ให้ ผอ.', format('select public.submit_round(%L)', r_a));
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_ok('2.3 ผอ. อนุมัติรอบ A', format('select public.approve_round(%L)', r_a));

  -- ===== 3. ครูทั้ง 12 คนเห็นเฉพาะใบตัวเอง + ดาวน์โหลด =====
  ok_count := 0;
  for i in 1..12 loop
    reset role;
    perform _t.as_user(u_t[i]);
    select count(*) into cnt from public.salary_notices;
    if cnt = 1 and exists (select 1 from public.salary_notices where teacher_id = t_id[i] and round_id = r_a) then ok_count := ok_count + 1; end if;
    perform public.log_download(r_a);
  end loop;
  perform _t.rec(format('3.1 ครูทั้ง 12 คนเห็นเฉพาะใบของตัวเองในรอบ A [%s/12]', ok_count), ok_count = 12);
  reset role;
  perform _t.as_user(u_t[5]);
  perform _t.expect_count('3.2 ครูที่ไม่ได้เลื่อนเห็นเหตุผลในใบ', 1,
    $q$ select 1 from public.salary_notices where not promoted and reason = 'ทดสอบ: มีวันลาเกินกำหนด' $q$);

  -- ===== 4. เปลี่ยนชื่อ ผอ. ในการตั้งค่า (ใบรอบ A ต้องไม่เปลี่ยน) =====
  reset role;
  perform _t.as_user(u_admin);
  update public.school_settings set director_name = 'ผอ ใหม่' where id;

  -- ===== 5. รอบ B: ต่อยอดเงินเดือนจากรอบ A → ส่ง → ผอ. ตีกลับ → แก้ 1 ใบ → ส่งใหม่ → อนุมัติ =====
  insert into public.rounds (start_year, round_no, order_no, order_date, notice_date)
    values (2697, 2, '202/2697', '2026-10-01', '2026-10-14') returning id into r_b;
  insert into public.salary_notices (round_id, teacher_id, promoted, before_salary, base_amount, percent, increment, new_salary)
    select r_b, a.teacher_id, true, b.before, b.base, b.pct, b.inc, b.before + b.inc
    from public.salary_notices a
    cross join lateral (
      select coalesce(a.new_salary, a.before_salary) as before, coalesce(a.new_salary, a.before_salary) + 2000 as base,
             2.00::numeric as pct,
             ceil(round((coalesce(a.new_salary, a.before_salary) + 2000) * 100) * 200 / 1e7) * 10 as inc) b
    where a.round_id = r_a;
  perform _t.expect_count('5.1 ใบรอบ B ครบ 12 ใบ เงินเดือนก่อนเลื่อนต่อจากรอบ A', 12,
    format($q$ select 1 from public.salary_notices b join public.salary_notices a
               on a.teacher_id = b.teacher_id and a.round_id = %L
               where b.round_id = %L and b.before_salary = coalesce(a.new_salary, a.before_salary) $q$, r_a, r_b));
  perform _t.expect_ok('5.2 แอดมินส่งรอบ B', format('select public.submit_round(%L)', r_b));
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_ok('5.3 ผอ. ตีกลับรอบ B พร้อมเหตุผล', format($q$ select public.revert_round(%L, 'ตัวเลขของครูทดสอบ3 ไม่ถูกต้อง') $q$, r_b));
  reset role;
  perform _t.as_user(u_admin);
  update public.salary_notices set increment = increment + 10, new_salary = new_salary + 10
    where round_id = r_b and teacher_id = t_id[3];
  get diagnostics cnt = row_count;
  perform _t.rec(format('5.4 แอดมินแก้ใบที่ถูกตีกลับได้ [rows=%s]', cnt), cnt = 1);
  perform _t.expect_ok('5.5 แอดมินส่งรอบ B ใหม่', format('select public.submit_round(%L)', r_b));
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_ok('5.6 ผอ. อนุมัติรอบ B', format('select public.approve_round(%L)', r_b));
  perform _t.expect_count('5.7 snapshot: รอบ A ใช้ชื่อ ผอ. เดิม รอบ B ใช้ชื่อใหม่', 2,
    format($q$ select 1 from public.rounds where (id = %L and snap_director_name = 'นายผอ เดิม')
                                          or (id = %L and snap_director_name = 'นายผอ ใหม่') $q$, r_a, r_b));

  -- ===== 6. ครูเห็น 2 ใบ; ผอ. ถอนการเผยแพร่ B → เห็น 1; อนุมัติใหม่ → เห็น 2 =====
  ok_count := 0;
  for i in 1..12 loop
    reset role;
    perform _t.as_user(u_t[i]);
    select count(*) into cnt from public.salary_notices where teacher_id = t_id[i];
    if cnt = 2 and (select count(*) from public.salary_notices) = 2 then ok_count := ok_count + 1; end if;
  end loop;
  perform _t.rec(format('6.1 ครูทั้ง 12 คนเห็นใบของตัวเองครบ 2 รอบ [%s/12]', ok_count), ok_count = 12);

  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_ok('6.2 ผอ. ถอนการเผยแพร่รอบ B', format($q$ select public.revert_round(%L, 'ถอนเพื่อแก้วันที่ลงนาม') $q$, r_b));
  ok_count := 0;
  for i in 1..12 loop
    reset role;
    perform _t.as_user(u_t[i]);
    select count(*) into cnt from public.salary_notices;
    if cnt = 1 then ok_count := ok_count + 1; end if;
  end loop;
  perform _t.rec(format('6.3 หลังถอน ครูเห็นเฉพาะรอบ A [%s/12]', ok_count), ok_count = 12);

  reset role;
  perform _t.as_user(u_admin);
  update public.rounds set notice_date = '2026-10-15' where id = r_b;
  perform _t.expect_ok('6.4 แอดมินแก้วันที่แล้วส่งใหม่', format('select public.submit_round(%L)', r_b));
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_ok('6.5 ผอ. อนุมัติรอบ B อีกครั้ง', format('select public.approve_round(%L)', r_b));

  -- ===== 7. ปิดใช้งานครูคนที่ 12; ครูที่เหลือดาวน์โหลดรอบ B =====
  reset role;
  perform _t.as_user(u_admin);
  update public.teachers set active = false where id = t_id[12];
  ok_count := 0;
  for i in 1..11 loop
    reset role;
    perform _t.as_user(u_t[i]);
    select count(*) into cnt from public.salary_notices;
    if cnt = 2 then ok_count := ok_count + 1; end if;
    perform public.log_download(r_b);
  end loop;
  perform _t.rec(format('7.1 ครูที่ยังใช้งานเห็นครบ 2 รอบและดาวน์โหลดรอบ B ได้ [%s/11]', ok_count), ok_count = 11);
  reset role;
  perform _t.as_user(u_t[12]);
  perform _t.expect_count('7.2 ครูที่ถูกปิดใช้งานไม่เห็นใบใดเลย', 0, 'select 1 from public.salary_notices');

  -- ===== 8. ตรวจ audit log (ในมุมของ ผอ.) =====
  reset role;
  perform _t.as_user(u_dir);
  perform _t.expect_count('8.1 รอบ A: เปลี่ยนสถานะ 2 ครั้ง (ส่ง โดยแอดมิน → อนุมัติ โดย ผอ.)', 2,
    format($q$ select 1 from public.audit_log where table_name = 'rounds' and action = 'update' and row_id = %L
               and ((detail->'old'->>'status' = 'draft' and detail->'new'->>'status' = 'pending_approval' and user_id = %L)
                 or (detail->'old'->>'status' = 'pending_approval' and detail->'new'->>'status' = 'published' and user_id = %L)) $q$,
           r_a, u_admin, u_dir));
  perform _t.expect_count('8.2 รอบ B: เปลี่ยนสถานะครบ 7 ครั้ง', 7,
    format($q$ select 1 from public.audit_log where table_name = 'rounds' and action = 'update' and row_id = %L
               and detail->'old'->>'status' <> detail->'new'->>'status' $q$, r_b));
  perform _t.expect_count('8.3 รอบ B: ทุกการส่งทำโดยแอดมิน ทุกการอนุมัติ/ถอนทำโดย ผอ.', 7,
    format($q$ select 1 from public.audit_log where table_name = 'rounds' and action = 'update' and row_id = %L
               and detail->'old'->>'status' <> detail->'new'->>'status'
               and user_id = case when detail->'new'->>'status' = 'pending_approval' then %L::uuid else %L::uuid end $q$,
           r_b, u_admin, u_dir));
  perform _t.expect_count('8.4 เหตุผลการตีกลับ/ถอน 2 ครั้งพร้อมผู้ทำ', 2,
    format($q$ select 1 from public.audit_log where action = 'revert_round' and row_id = %L and user_id = %L
               and length(detail->>'reason') > 0 $q$, r_b, u_dir));
  perform _t.expect_count('8.5 บันทึกดาวน์โหลดรอบ A ครบ 12 คน', 12,
    format($q$ select distinct user_id from public.audit_log where action = 'download' and row_id = %L
               and user_id = any(%L::uuid[]) $q$, r_a, u_t));
  perform _t.expect_count('8.6 บันทึกดาวน์โหลดรอบ B ครบ 11 คน', 11,
    format($q$ select distinct user_id from public.audit_log where action = 'download' and row_id = %L
               and user_id = any(%L::uuid[]) $q$, r_b, u_t));
  perform _t.expect_count('8.7 บันทึกการเพิ่มใบครบ 24 ใบ โดยแอดมิน', 24,
    format($q$ select 1 from public.audit_log where table_name = 'salary_notices' and action = 'insert' and user_id = %L
               and detail->'new'->>'round_id' in (%L, %L) $q$, u_admin, r_a, r_b));
  perform _t.expect_count('8.8 บันทึกการแก้ใบหลังตีกลับ พร้อมค่าเก่า/ใหม่', 1,
    format($q$ select 1 from public.audit_log where table_name = 'salary_notices' and action = 'update' and user_id = %L
               and detail->'new'->>'teacher_id' = %L
               and (detail->'new'->>'increment')::numeric = (detail->'old'->>'increment')::numeric + 10 $q$, u_admin, t_id[3]));
  perform _t.expect_count('8.9 บันทึกการเพิ่มครู 12 คนและการปิดใช้งาน 1 คน โดยแอดมิน', 13,
    format($q$ select 1 from public.audit_log where table_name = 'teachers' and user_id = %L
               and ((action = 'insert' and detail->'new'->>'id' = any(%L::text[]))
                 or (action = 'update' and detail->'new'->>'id' = %L and detail->'new'->>'active' = 'false')) $q$,
           u_admin, t_id::text[], t_id[12]));
  perform _t.expect_count('8.10 บันทึกการเปลี่ยนชื่อ ผอ. ในการตั้งค่า', 1,
    format($q$ select 1 from public.audit_log where table_name = 'school_settings' and action = 'update' and user_id = %L
               and detail->'old'->>'director_name' = 'ผอ เดิม' and detail->'new'->>'director_name' = 'ผอ ใหม่' $q$, u_admin));

  -- ===== 9. ค่าในใบตรงกับสูตรเสนอค่า ยกเว้นใบที่แอดมินแก้ทับ 1 ใบ =====
  perform _t.expect_count('9.1 ใบที่ตัวเลขต่างจากสูตรเสนอค่ามีใบเดียว', 1,
    format($q$ select 1 from public.salary_notices where round_id in (%L, %L) and promoted
               and (increment <> ceil(round(base_amount * 100) * round(percent * 100) / 1e7) * 10
                    or new_salary <> before_salary + increment) $q$, r_a, r_b));
  perform _t.expect_count('9.2 ใบนั้นคือใบที่แอดมินแก้ทับหลัง ผอ. ตีกลับ', 1,
    format($q$ select 1 from public.salary_notices where round_id = %L and teacher_id = %L
               and increment <> ceil(round(base_amount * 100) * round(percent * 100) / 1e7) * 10 $q$, r_b, t_id[3]));

  reset role;
  select count(*) filter (where ok), count(*) filter (where not ok),
         string_agg((case when ok then 'PASS ' else 'FAIL ' end) || name, E'\n' order by n)
    into v_pass, v_fail, v_txt
  from _t.res;
  raise exception E'E2E TEST REPORT: pass=% fail=%\n%', v_pass, v_fail, v_txt;
end $test$;
