-- 6 ผอ. อ่าน profiles ได้ทุกแถว (บทบาท/ครูที่ผูก) เพื่อแสดงชื่อผู้ใช้ใน audit log
-- profiles ไม่มีข้อมูลอ่อนไหว (ไม่มีอีเมล/รหัสผ่าน) และ ผอ. อ่าน audit_log ได้อยู่แล้ว
alter policy profiles_select on public.profiles
  using (id = (select auth.uid()) or (select private.current_app_role()) in ('admin', 'director'));
