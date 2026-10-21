-- ล้าง "ข้อมูลทดสอบ" ทั้งหมดก่อนเริ่มใช้ข้อมูลจริง — ย้อนกลับไม่ได้ ใช้ครั้งเดียวก่อนเปิดใช้งาน
-- ลบ:  รอบและใบแจ้งทั้งหมด, ข้อมูลครูและบัญชีล็อกอินของครูทั้งหมด, บันทึกการใช้งาน (audit log) ทั้งหมด
-- เก็บ: บัญชีแอดมิน/ผอ., ข้อมูลโรงเรียน, ไฟล์ลายเซ็น
-- วิธีใช้: สำรองข้อมูลก่อน (ดู README หัวข้อ "สำรองข้อมูล") แล้วแก้ v_confirm ให้ตรงกับข้อความยืนยัน
--          จากนั้นรันทั้งไฟล์ใน SQL editor ของ Supabase (สิทธิ์ postgres)
do $$
declare
  v_confirm text := 'ยังไม่ยืนยัน';
begin
  if v_confirm <> 'ยืนยันลบข้อมูลทดสอบทั้งหมด' then
    raise exception 'ยังไม่ได้ยืนยัน: แก้ v_confirm เป็น ''ยืนยันลบข้อมูลทดสอบทั้งหมด'' ก่อนรัน';
  end if;

  delete from public.salary_notices;
  delete from public.rounds;
  -- ลบบัญชีครู (profiles ถูกลบตามด้วย on delete cascade)
  delete from auth.users where id in (select id from public.profiles where role = 'teacher');
  delete from public.teachers;

  -- audit_log ปกติแก้/ลบไม่ได้ ปิด trigger ป้องกันชั่วคราวเฉพาะตอนล้างข้อมูลทดสอบ แล้วเปิดคืนทันที
  alter table public.audit_log disable trigger audit_log_immutable;
  delete from public.audit_log;
  alter table public.audit_log enable trigger audit_log_immutable;

  insert into public.audit_log (action, detail)
  values ('reset_test_data', jsonb_build_object('note', 'ล้างข้อมูลทดสอบก่อนเริ่มใช้งานจริง'));
end $$;
