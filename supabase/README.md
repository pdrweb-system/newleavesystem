# Supabase (โปรเจกต์ `salary-notice`)

- `migrations/` — โครงสร้างฐานข้อมูล สิทธิ์ RLS RPC trigger และ storage (รันตามลำดับชื่อไฟล์)
  เลขเวอร์ชันในชื่อไฟล์ตรงกับประวัติ migration ในโปรเจกต์จริง (Supabase CLI จะไม่รันซ้ำ)
- `tests/rls_test.sql` — ชุดทดสอบสิทธิ์ 92 ข้อด้วยข้อมูลสมมติ รันทั้งไฟล์ด้วยสิทธิ์ `postgres`
- `tests/e2e_flow.sql` — ทดสอบทั้ง flow ครูสมมติ 12 คน 2 รอบ (ส่ง/ตีกลับ/อนุมัติ/ถอน) และตรวจ audit log 32 ข้อ
  ทั้งสองชุดทำในบล็อกเดียวแล้ว rollback เอง ผลลัพธ์อยู่ในข้อความ error `… TEST REPORT: pass=… fail=…`
  รันบนฐานข้อมูลที่มีข้อมูลจริงได้ (ใช้รหัส/ปีทดสอบที่ไม่ชนของจริง และนับเฉพาะข้อมูลทดสอบ)
- `tests/run_local.sh` + `tests/local_stub.sql` — สร้างฐานข้อมูลใหม่บน Postgres ในเครื่องจาก migration ทั้งหมด
  แล้วรัน 2 ชุดข้างบน (ใช้ตรวจ migration ใหม่ก่อนขึ้นของจริง)
- `seed/create_staff_account.sql` — สร้างบัญชีแอดมิน/ผอ. ครั้งแรก
- `seed/reset_test_data.sql` — ล้างข้อมูลทดสอบทั้งหมดก่อนใช้งานจริง (ต้องแก้คำยืนยันก่อนรัน)

วิธีติดตั้ง สำรองข้อมูล และเช็กลิสต์ก่อนใช้งาน ดู [README หลัก](../README.md)

## ต้องตั้งค่าเองใน Dashboard (ตั้งค่าผ่าน SQL ไม่ได้)

- Authentication → Sign In / Providers → ปิด **Allow new users to sign up**
- Authentication → Sign In / Providers → Email → ตั้ง **Minimum password length** = 8
  (และเปิด **Leaked password protection** ถ้าแผนที่ใช้รองรับ)
- ห้ามนำ `service_role` key ใส่ในหน้าเว็บหรือ commit เข้า repo (ใช้ใน Edge Function เท่านั้น)

## บัญชีและล็อกอิน

- ชื่อล็อกอิน = รหัสประจำตัว (ตัวอักษร A–Z, 0–9, `.` `_` `-`) หน้าเว็บต่อเป็น `{รหัส}@school.invalid`
- บัญชีแอดมิน/ผอ. สร้างครั้งเดียวด้วย `seed/create_staff_account.sql` (ใส่รหัสชั่วคราว ห้าม commit)
- บัญชีครูสร้าง/รีเซ็ตผ่าน Edge Function `admin-create-user`, `admin-reset-password`
  (ผู้เรียกต้องเป็นแอดมิน; รีเซ็ตได้เฉพาะบัญชีครู บัญชี ผอ./แอดมินรีเซ็ตใน Dashboard)
- ทุกบัญชีใหม่/ที่ถูกรีเซ็ตต้องเปลี่ยนรหัสตอนล็อกอินครั้งแรก: trigger บน `auth.users`
  ปลดธง `must_change_password` เมื่อรหัสผ่านเปลี่ยน
- หน้าเว็บเก็บ session ใน sessionStorage และออกจากระบบเองเมื่อไม่ใช้งาน 30 นาที

## หมายเหตุการออกแบบ

- ฟังก์ชันช่วยของ RLS อยู่ในสคีมา `private` (ไม่เปิดเป็น API); ชื่อ `current_app_role()` แทน `app_role()` เพื่อไม่ชนกับชื่อ type
- `rounds.status` และ `snap_*` เปลี่ยนได้ผ่าน RPC เท่านั้น (จำกัดด้วยสิทธิ์ระดับคอลัมน์)
- รอบที่อนุมัติแล้วเก็บ snapshot ของลายเซ็น ชื่อ/ตำแหน่ง ผอ. ชื่อโรงเรียน สังกัด และผู้ออกคำสั่ง ใบเก่าจึงไม่เปลี่ยนตามการตั้งค่าใหม่
- ผอ. อ่าน `profiles` ได้ทุกแถว (บทบาท/ครูที่ผูก ไม่มีข้อมูลอ่อนไหว) เพื่อแสดงชื่อผู้ใช้ใน audit log
- ไฟล์ลายเซ็นควรตั้งชื่อใหม่ทุกครั้งที่อัปโหลด (ลบไฟล์ที่รอบหรือการตั้งค่าอ้างอยู่ไม่ได้)
- Security advisor เตือน WARN 4 รายการสำหรับ `submit_round`, `approve_round`, `revert_round`, `log_download`
  เพราะเป็น `SECURITY DEFINER` ที่ผู้ล็อกอินเรียกได้ ซึ่งตั้งใจ: ทุกฟังก์ชันตรวจบทบาทก่อนทำงาน และมีในชุดทดสอบ
