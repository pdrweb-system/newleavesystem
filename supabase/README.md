# Supabase (โปรเจกต์ `salary-notice`)

- `migrations/` — โครงสร้างฐานข้อมูล สิทธิ์ RLS RPC trigger และ storage (รันตามลำดับชื่อไฟล์)
- `tests/rls_test.sql` — ชุดทดสอบสิทธิ์ด้วยข้อมูลสมมติ รันทั้งไฟล์ด้วยสิทธิ์ `postgres`
  ทำในบล็อกเดียวแล้ว rollback เอง ผลลัพธ์อยู่ในข้อความ error `RLS TEST REPORT: pass=… fail=…`

## ต้องตั้งค่าเองใน Dashboard (ตั้งค่าผ่าน SQL ไม่ได้)

- Authentication → Sign In / Providers → ปิด **Allow new users to sign up**
- ห้ามนำ `service_role` key ใส่ในหน้าเว็บหรือ commit เข้า repo (ใช้ใน Edge Function เท่านั้น)

## หมายเหตุการออกแบบ

- ฟังก์ชันช่วยของ RLS อยู่ในสคีมา `private` (ไม่เปิดเป็น API); ชื่อ `current_app_role()` แทน `app_role()` เพื่อไม่ชนกับชื่อ type
- `rounds.status` และ `snap_*` เปลี่ยนได้ผ่าน RPC เท่านั้น (จำกัดด้วยสิทธิ์ระดับคอลัมน์)
- รอบที่อนุมัติแล้วเก็บ snapshot ของลายเซ็น ชื่อ/ตำแหน่ง ผอ. ชื่อโรงเรียน สังกัด และผู้ออกคำสั่ง ใบเก่าจึงไม่เปลี่ยนตามการตั้งค่าใหม่
- ไฟล์ลายเซ็นควรตั้งชื่อใหม่ทุกครั้งที่อัปโหลด (ลบไฟล์ที่รอบหรือการตั้งค่าอ้างอยู่ไม่ได้)
- Security advisor เตือน WARN 4 รายการสำหรับ `submit_round`, `approve_round`, `revert_round`, `log_download`
  เพราะเป็น `SECURITY DEFINER` ที่ผู้ล็อกอินเรียกได้ ซึ่งตั้งใจ: ทุกฟังก์ชันตรวจบทบาทก่อนทำงาน และมีในชุดทดสอบ
