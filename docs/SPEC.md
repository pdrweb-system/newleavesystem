# ระบบแจ้งผลการเลื่อนเงินเดือนครู — Spec สำหรับ Claude Code

> เอกสารนี้คือแผนทั้งหมดที่ตกลงกันแล้วในแชท ให้ Claude Code อ่านก่อนเริ่มลงมือ แล้วทำตามลำดับใน "แผนการทำงาน" (หัวข้อ 12)
> ไฟล์อ้างอิงอยู่ในโฟลเดอร์ `reference/` (ตัวอย่าง PDF, สคริปต์ที่ใช้ร่างแบบ, ภาพลายเซ็นสมมติ)

## 1. เป้าหมาย

เว็บไซต์ให้ครู 12 คนล็อกอินเข้าไปดูและบันทึกเป็น PDF "หนังสือแจ้งผลการเลื่อนเงินเดือน" ของตัวเอง
แอดมินกรอกตัวเลขทั้งหมดเอง ผู้อำนวยการ (ผอ.) อนุมัติแล้วระบบจึงเผยแพร่ให้ครูเห็น พร้อมใส่ภาพลายเซ็น ผอ. อัตโนมัติ

**ข้อมูลนี้เป็นความลับ (เงินเดือนรายบุคคล)** ความปลอดภัยต้องมาก่อนความสวยงาม

## 2. สิ่งที่ตัดสินใจแล้ว (ห้ามเปลี่ยนโดยไม่ถาม)

| หัวข้อ | ข้อตกลง |
|---|---|
| ผู้ใช้ | ครู 12 คน + แอดมิน 1 + ผอ. 1 (3 บทบาท: `teacher`, `admin`, `director`) |
| บัญชี | แอดมินเป็นคนสร้างบัญชีและตั้งรหัสผ่านให้ครู ไม่มีการสมัครเอง |
| ตัวเลข | แอดมินกรอกเองทั้งหมดต่อครูต่อรอบ ไม่นำเข้า Excel ไม่มีตารางขั้นสูงบัญชีเงินเดือน |
| การคำนวณ | ระบบ "เสนอค่า" ให้ แอดมินแก้ทับได้ทุกช่อง |
| รอบ | รอบที่ 1 = 1 ต.ค. – 31 มี.ค. (ข้ามปี) / รอบที่ 2 = 1 เม.ย. – 30 ก.ย. |
| ปี | แอดมินกรอก "ปี พ.ศ. ที่เริ่มรอบ" (`start_year`) ระบบคำนวณวันสิ้นสุดเอง |
| ลายเซ็น ผอ. | อัปโหลดภาพไว้ครั้งเดียว ระบบใส่ในใบอัตโนมัติ "เมื่ออนุมัติ" |
| PDF | หน้าตาตามใบตัวอย่างจริง (A4 หน้าเดียวต่อครู มีคำว่า "ลับ" บนและล่าง) |
| ขอบเขตตอนนี้ | ออกแบบ/ทำต้นแบบได้ แต่ยังไม่ใช้ข้อมูลจริงจนกว่าจะทดสอบเสร็จ |

## 3. สถาปัตยกรรมและเทคโนโลยี

- **ฐานข้อมูล + ล็อกอิน + สิทธิ์:** Supabase (Postgres, Auth, RLS, Storage, Edge Functions)
- **หน้าเว็บ:** static site (HTML + JavaScript ล้วน + `@supabase/supabase-js` จาก CDN) deploy บน GitHub Pages หรือ host static ใดก็ได้ ไม่ต้องมี build step
- **การสร้าง PDF:** ใช้ HTML + CSS `@page { size: A4 }` แล้วให้เบราว์เซอร์ "พิมพ์ → บันทึกเป็น PDF" (`window.print()`) เหตุผล: เบราว์เซอร์จัดวรรณยุกต์/สระไทยถูกต้อง ไม่ต้องใช้ไลบรารี PDF และไม่ต้องมีเซิร์ฟเวอร์
  - รวมทั้งรอบ: แสดงใบของทุกคนในหน้าเดียว คั่นด้วย `page-break-after: always` แล้วพิมพ์เป็น PDF ไฟล์เดียว
  - ฟอนต์: **TH Sarabun New** (ใบจริงใช้ฟอนต์นี้) ฝังด้วย `@font-face` จากไฟล์ในโปรเจกต์ (self-host) ไม่พึ่ง CDN ภายนอกตอนพิมพ์
  - ตัวอย่างใน `reference/` ร่างด้วย WeasyPrint + ฟอนต์ Loma เพื่อดูเลย์เอาต์เท่านั้น ไม่ใช่เทคโนโลยีที่ใช้จริง
- **ฟังก์ชันฝั่งเซิร์ฟเวอร์ (Edge Functions):** ใช้เฉพาะงานที่ต้องการ service role คือสร้างบัญชี/รีเซ็ตรหัสผ่าน

> `service_role` key ห้ามอยู่ในโค้ดหน้าเว็บ ห้าม commit เข้า repo ใช้ได้เฉพาะใน Edge Function (secret ของ Supabase)

## 4. บทบาทและสิทธิ์

| การกระทำ | ครู | แอดมิน | ผอ. |
|---|---|---|---|
| ดูใบของตัวเอง (เฉพาะรอบที่เผยแพร่แล้ว) | ✅ | ✅ | ✅ |
| ดูใบของคนอื่น | ❌ | ✅ | ✅ |
| สร้าง/แก้รอบและใบ (เฉพาะสถานะ `draft`) | ❌ | ✅ | ❌ |
| ส่งรอบให้ ผอ. อนุมัติ | ❌ | ✅ | ❌ |
| อนุมัติ/เผยแพร่ | ❌ | ❌ | ✅ |
| ถอนกลับเป็นร่าง | ❌ | ❌ | ✅ |
| จัดการข้อมูลครู บัญชี และรีเซ็ตรหัสผ่าน | ❌ | ✅ | ❌ |
| อัปโหลดลายเซ็น/ตั้งค่าโรงเรียน | ❌ | ✅ | ❌ |
| ดู audit log | ❌ | ✅ | ✅ |

กฎสำคัญ: รอบที่เผยแพร่แล้ว **ห้ามแก้ตัวเลข** ถ้าต้องแก้ ผอ. ถอนกลับเป็น `draft` → แอดมินแก้ → ส่งอนุมัติใหม่ (ทุกขั้นถูกบันทึกใน audit log)

## 5. สถานะของรอบ

```
draft ──(แอดมิน: ส่งอนุมัติ)──▶ pending_approval ──(ผอ.: อนุมัติ)──▶ published
  ▲                                   │                                  │
  └──────────(ผอ.: ตีกลับ)────────────┘◀────────(ผอ.: ถอนการเผยแพร่)────┘
```

## 6. ฐานข้อมูล (Supabase / Postgres)

ให้ทำเป็น migration ไฟล์เดียวหรือหลายไฟล์ใน `supabase/migrations/` โหลด skill `supabase` / `supabase-postgres-best-practices` ก่อนเขียน SQL

### 6.1 ตาราง

```sql
create type app_role as enum ('teacher','admin','director');
create type round_status as enum ('draft','pending_approval','published');

create table public.teachers (
  id            uuid primary key default gen_random_uuid(),
  employee_code text unique not null,           -- รหัสประจำตัว ใช้เป็นชื่อล็อกอิน
  prefix        text not null,                  -- นาย/นาง/นางสาว
  first_name    text not null,
  last_name     text not null,
  position      text not null default 'ครู',    -- ตำแหน่ง
  academic_rank text,                           -- วิทยฐานะ เช่น ครูชำนาญการ
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.profiles (                   -- 1 แถวต่อบัญชีล็อกอิน
  id         uuid primary key references auth.users(id) on delete cascade,
  role       app_role not null,
  teacher_id uuid unique references public.teachers(id),   -- null สำหรับ admin/director
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'teacher') = (teacher_id is not null))
);

create table public.school_settings (            -- มีแถวเดียว
  id               boolean primary key default true check (id),
  school_name      text not null,
  affiliation      text not null,                -- สังกัด (สำนักงานเขตพื้นที่ฯ)
  order_issuer     text not null,                -- เช่น "สพป.xxxx" ใช้ในหมายเหตุ
  director_prefix  text not null default 'นาย',
  director_name    text not null,
  director_title   text not null default 'ผู้อำนวยการโรงเรียน...',
  signature_path   text                          -- path ใน storage bucket 'signatures'
);

create table public.rounds (
  id            uuid primary key default gen_random_uuid(),
  start_year    int  not null check (start_year between 2500 and 2700),  -- ปี พ.ศ. ที่เริ่มรอบ
  round_no      int  not null check (round_no in (1,2)),
  order_no      text,                            -- เลขที่คำสั่ง เช่น 200/2569
  order_date    date,                            -- วันที่สั่ง (ค.ศ. ในฐานข้อมูล แสดงผลเป็น พ.ศ.)
  notice_date   date,                            -- วันที่ลงนามในใบแจ้ง
  status        round_status not null default 'draft',
  submitted_at  timestamptz,
  approved_by   uuid references auth.users(id),
  approved_at   timestamptz,
  -- snapshot ตอนอนุมัติ เพื่อให้ใบเก่าไม่เปลี่ยนตามการตั้งค่าใหม่
  snap_signature_path text,
  snap_director_name  text,
  snap_director_title text,
  created_at    timestamptz not null default now(),
  unique (start_year, round_no)
);

create table public.salary_notices (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds(id) on delete cascade,
  teacher_id    uuid not null references public.teachers(id),
  -- snapshot ข้อมูลครู ณ รอบนั้น (ตำแหน่ง/วิทยฐานะเปลี่ยนได้ในอนาคต)
  snap_full_name     text not null,
  snap_position      text not null,
  snap_academic_rank text,
  promoted      boolean not null default true,   -- true = ได้เลื่อน, false = ไม่ได้เลื่อน
  before_salary numeric(10,2),                   -- เงินเดือนก่อนเลื่อน
  base_amount   numeric(10,2),                   -- ฐานในการคำนวณ
  percent       numeric(5,2),                    -- ร้อยละที่ได้เลื่อน
  increment     numeric(10,2),                   -- เงินเดือนที่ได้เลื่อน
  special_comp  numeric(10,2) not null default 0,-- เงินค่าตอบแทนพิเศษ
  new_salary    numeric(10,2),                   -- เงินเดือนที่ได้รับ
  reason        text,                            -- เหตุผลกรณีไม่ได้เลื่อน
  updated_at    timestamptz not null default now(),
  unique (round_id, teacher_id),
  check (promoted or (reason is not null and length(trim(reason)) > 0)),
  check (not promoted or (before_salary is not null and base_amount is not null
                          and percent is not null and increment is not null
                          and new_salary is not null))
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  action     text not null,        -- insert/update/delete/download/login ฯลฯ
  table_name text,
  row_id     text,
  detail     jsonb
);

create index on public.salary_notices (teacher_id);
create index on public.salary_notices (round_id);
create index on public.audit_log (at desc);
```

### 6.2 ฟังก์ชันช่วย (security definer)

```sql
create or replace function public.app_role() returns app_role
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as
$$ select teacher_id from public.profiles where id = auth.uid() $$;
```

### 6.3 RLS (เปิดทุกตาราง ห้ามมีตารางไหนไม่เปิด)

```sql
alter table public.teachers        enable row level security;
alter table public.profiles        enable row level security;
alter table public.school_settings enable row level security;
alter table public.rounds          enable row level security;
alter table public.salary_notices  enable row level security;
alter table public.audit_log       enable row level security;

-- teachers
create policy t_select on public.teachers for select to authenticated
  using (app_role() in ('admin','director') or id = my_teacher_id());
create policy t_write on public.teachers for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

-- profiles (เขียนผ่าน Edge Function ด้วย service role เท่านั้น)
create policy p_select on public.profiles for select to authenticated
  using (id = auth.uid() or app_role() = 'admin');

-- school_settings
create policy s_select on public.school_settings for select to authenticated using (true);
create policy s_write  on public.school_settings for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

-- rounds: ครูเห็นเฉพาะที่เผยแพร่แล้ว / แอดมินแก้ได้เฉพาะ draft / การเปลี่ยนสถานะผ่าน RPC
create policy r_select on public.rounds for select to authenticated
  using (app_role() in ('admin','director') or status = 'published');
create policy r_insert on public.rounds for insert to authenticated
  with check (app_role() = 'admin' and status = 'draft');
create policy r_update on public.rounds for update to authenticated
  using (app_role() = 'admin' and status = 'draft')
  with check (app_role() = 'admin' and status = 'draft');
create policy r_delete on public.rounds for delete to authenticated
  using (app_role() = 'admin' and status = 'draft');

-- salary_notices
create policy n_select on public.salary_notices for select to authenticated
  using (
    app_role() in ('admin','director')
    or (teacher_id = my_teacher_id()
        and exists (select 1 from public.rounds r
                    where r.id = round_id and r.status = 'published'))
  );
create policy n_write on public.salary_notices for all to authenticated
  using (app_role() = 'admin'
         and exists (select 1 from public.rounds r where r.id = round_id and r.status = 'draft'))
  with check (app_role() = 'admin'
         and exists (select 1 from public.rounds r where r.id = round_id and r.status = 'draft'));

-- audit_log: อ่านได้เฉพาะแอดมิน/ผอ. ไม่มี policy เขียนจากไคลเอนต์ (เขียนผ่าน trigger/RPC)
create policy a_select on public.audit_log for select to authenticated
  using (app_role() in ('admin','director'));
```

หมายเหตุ: ถ้าต้องการให้ `r_update` ของแอดมินห้ามแก้ `status` ผ่าน API ตรง ให้เพิ่ม trigger กันการเปลี่ยน `status` นอกฟังก์ชัน RPC หรือใช้ column privileges

### 6.4 RPC เปลี่ยนสถานะ (security definer, ตรวจบทบาททุกครั้ง)

ทำเป็นฟังก์ชัน Postgres แล้วเรียกด้วย `supabase.rpc(...)`

1. `submit_round(p_round uuid)` — เฉพาะ `admin`, รอบต้องเป็น `draft`
   - ตรวจ: มีใบครบทุกคนที่ `teachers.active`; ใบที่ `promoted=false` ต้องมีเหตุผล; รอบมี `order_no`, `order_date`, `notice_date`
   - ตั้ง `status='pending_approval'`, `submitted_at=now()`
2. `approve_round(p_round uuid)` — เฉพาะ `director`, รอบต้องเป็น `pending_approval`
   - ต้องมี `school_settings.signature_path` มิฉะนั้น error
   - คัดลอก `signature_path/director_name/director_title` ลง `snap_*`, ตั้ง `approved_by/approved_at`, `status='published'`
3. `revert_round(p_round uuid, p_reason text)` — เฉพาะ `director`, จาก `pending_approval` หรือ `published` กลับเป็น `draft`, ล้าง `approved_*`/`snap_*`, บันทึกเหตุผลลง audit
4. `log_download(p_round uuid)` — ผู้ใช้ที่ล็อกอิน บันทึกว่าโหลด/พิมพ์ PDF (ครูโหลดของตัวเอง, แอดมินโหลดทั้งรอบ)

ทุกฟังก์ชัน: `security definer`, `set search_path = public`, ตรวจ `app_role()` เป็นอย่างแรก, ไม่เชื่อค่าจากไคลเอนต์

### 6.5 Trigger

- `before insert` บน `salary_notices`: ถ้า `snap_full_name/position/rank` ว่าง ให้ดึงจาก `teachers` อัตโนมัติ
- `after insert/update/delete` บน `rounds` และ `salary_notices`: เขียน `audit_log` (เก็บค่าเก่า/ใหม่ใน `detail`) — ฟังก์ชัน trigger เป็น `security definer`
- `updated_at` อัปเดตอัตโนมัติ

### 6.6 Storage

- bucket `signatures` (private)
- policy: `select` สำหรับ `authenticated`; `insert/update/delete` เฉพาะ `app_role() = 'admin'`
- ไฟล์ลายเซ็น: PNG พื้นหลังโปร่งใส จำกัดขนาด ≤ 500 KB
- หน้าเว็บขอ signed URL อายุสั้น (เช่น 5 นาที) ก่อนแสดง/พิมพ์ ต้องรอรูปโหลดเสร็จก่อนเรียก `window.print()`
- ลายเซ็นแสดงในใบเฉพาะรอบ `published` (ใช้ `rounds.snap_signature_path`) ส่วนหน้าตัวอย่างของแอดมินแสดงเป็นกรอบเปล่าหรือลายน้ำ "ฉบับร่าง"

## 7. การล็อกอินและจัดการบัญชี

- ใช้ Supabase Auth แบบ email + password โดย **อีเมลภายในที่สร้างจากรหัสประจำตัว** เช่น `{employee_code}@school.invalid` (ครูกรอกแค่รหัสประจำตัว + รหัสผ่าน หน้าเว็บต่อโดเมนให้เอง) หรือใช้อีเมลโรงเรียนจริงถ้ามี — ถามผู้ใช้ก่อนว่าเลือกแบบไหน
- ปิดการสมัครเอง (`Enable signups = off`) และปิดการยืนยันอีเมลสำหรับบัญชีที่แอดมินสร้าง
- Edge Function `admin-create-user` และ `admin-reset-password`
  - ตรวจ JWT ของผู้เรียกว่า `app_role() = 'admin'` ก่อนทุกครั้ง
  - ใช้ `supabase.auth.admin.createUser` / `updateUserById` ด้วย service role
  - สร้างแถว `profiles` พร้อม `must_change_password = true`
  - ตอบกลับโดยไม่ส่งรหัสผ่านกลับไปใน log
- ครั้งแรกที่ล็อกอิน ถ้า `must_change_password` ให้บังคับเปลี่ยนรหัสผ่านก่อนเข้าใช้งาน
- นโยบายรหัสผ่านขั้นต่ำ 8 ตัว ไม่ใช้รหัสประจำตัวเป็นรหัสผ่านเริ่มต้น (แอดมินสุ่มให้หรือกำหนดเอง)
- บัญชี ผอ. และแอดมินสร้างด้วยสคริปต์/ขั้นตอนครั้งเดียวตอนติดตั้ง (seed)

## 8. สูตรคำนวณ (ระบบเสนอค่า แอดมินแก้ได้)

จากใบตัวอย่างใบเดียว: ฐาน 30,200 × 2.30% = 694.60 → ได้เลื่อน **700** → เงินเดือนใหม่ 26,490 + 700 = **27,190**

```
increment  = ceil( base_amount × percent / 100 ÷ 10 ) × 10      -- ปัดขึ้นเป็นหลัก 10 บาท
new_salary = before_salary + increment                           -- ส่วนเกินขั้นสูง (ถ้ามี) แอดมินกรอกเป็น special_comp เอง
```

- **ให้ใช้เลขจำนวนเต็มเลี่ยงปัญหาทศนิยม:** `pctH = Math.round(percent*100)` แล้ว `increment = Math.ceil(base * pctH / 100000) * 10`
- ถ้าแอดมินแก้ `increment` หรือ `new_salary` เอง ให้แสดงไอคอนเตือนว่า "ต่างจากค่าที่ระบบคำนวณ" แต่บันทึกได้
- ⚠️ กฎปัดเศษและกรณีเงินเดือนเกินขั้นสูง สรุปจากตัวอย่างใบเดียว **ให้ผู้ใช้ตรวจกับระเบียบจริงก่อนใช้งาน** อย่าฮาร์ดโค้ดเป็นกฎตายตัว (เก็บไว้เป็นค่าเสนอเท่านั้น)

## 9. วันที่และปี

- เก็บ `start_year` เป็นเลข พ.ศ. ตรง ๆ ส่วนคอลัมน์ `date` เก็บเป็น ค.ศ. แล้วแปลงเป็น พ.ศ. ตอนแสดงผล (ฟังก์ชัน `formatThaiDate(date)` → "28 พฤษภาคม 2569")
- ช่วงรอบ (คำนวณในโค้ด):
  - รอบ 1: `1 ตุลาคม {Y}` – `31 มีนาคม {Y+1}`
  - รอบ 2: `1 เมษายน {Y}` – `30 กันยายน {Y}`
- ในใบ: รอบที่ถูกติ๊กแสดงปีเต็ม รอบที่ไม่ถูกติ๊กแสดงเฉพาะวันที่ (ไม่มีปี)

## 10. หน้าเว็บ

โครงโฟลเดอร์ที่แนะนำ:

```
/
├─ index.html              ล็อกอิน
├─ change-password.html    บังคับเปลี่ยนรหัสครั้งแรก
├─ teacher.html            ครู: รายการรอบที่เผยแพร่ + ดู/พิมพ์ใบ
├─ admin.html              แอดมิน (แท็บ: รอบ / ครู-บัญชี / ตั้งค่าโรงเรียน / audit)
├─ director.html           ผอ.: รออนุมัติ / อนุมัติ / ถอนกลับ
├─ notice.html             หน้าพิมพ์ใบ (รับ ?round=…&teacher=…, หรือ ?round=…&all=1)
├─ assets/
│  ├─ app.js  supabase-client.js  auth-guard.js  thai-date.js  calc.js
│  ├─ notice.css           สไตล์พิมพ์ (@page A4) + ฟอนต์
│  └─ fonts/THSarabunNew*.ttf   (self-host)
└─ supabase/
   ├─ migrations/*.sql
   ├─ functions/admin-create-user/index.ts
   └─ functions/admin-reset-password/index.ts
```

### 10.1 พฤติกรรมแต่ละหน้า

- **auth-guard.js:** ทุกหน้าตรวจ session → โหลด `profiles.role` → ถ้าไม่ตรงบทบาทให้ redirect ไปหน้าของบทบาทตัวเอง (การซ่อนปุ่มเป็นแค่ UX ความปลอดภัยจริงอยู่ที่ RLS)
- **ครู:** ตารางรอบที่เผยแพร่ (ปีที่เริ่ม, รอบ, วันที่ลงนาม) ปุ่ม "ดูใบ" และ "บันทึกเป็น PDF" (เปิด `notice.html` แล้วเรียก print)
- **แอดมิน – รอบ:** สร้างรอบ (กรอก `start_year`, เลือกรอบ 1/2, เลขที่คำสั่ง, วันที่สั่ง, วันที่ลงนาม) → ตารางกรอก 12 แถว (ครูแต่ละคน: ได้เลื่อน/ไม่ได้เลื่อน, เงินเดือนก่อนเลื่อน, ฐาน, ร้อยละ, เงินที่ได้เลื่อน [ระบบเสนอ], ค่าตอบแทนพิเศษ, เงินเดือนใหม่ [ระบบเสนอ], เหตุผล) → ปุ่มดูตัวอย่างใบ → ปุ่ม "ส่งให้ ผอ. อนุมัติ" (เรียก `submit_round` แสดง error ที่ไม่ครบเป็นภาษาไทย)
- **แอดมิน – ครู/บัญชี:** เพิ่ม/แก้ข้อมูลครู, สร้างบัญชี, รีเซ็ตรหัส, ปิดใช้งาน
- **แอดมิน – ตั้งค่า:** ชื่อโรงเรียน สังกัด ผู้ออกคำสั่ง ชื่อ/ตำแหน่ง ผอ. อัปโหลดภาพลายเซ็น (แสดงตัวอย่างก่อนบันทึก)
- **ผอ.:** รายการรอบสถานะ `pending_approval` → เปิดดูตารางสรุป + ตัวอย่างใบทุกคน → "อนุมัติและเผยแพร่" (ยืนยันก่อนกด) หรือ "ตีกลับ" พร้อมเหตุผล
- **notice.html:** เรนเดอร์ใบตามเทมเพลต (หัวข้อ 11) ดึงข้อมูลเฉพาะที่ RLS อนุญาต ถ้าไม่มีสิทธิ์แสดงข้อความ "ไม่พบเอกสาร" (อย่าบอกว่ามีแต่ไม่มีสิทธิ์)

### 10.2 UX ที่ควรมี

- ภาษาไทยทั้งหมด ข้อความ error ที่คนทั่วไปอ่านรู้เรื่อง
- ตัวเลขเงินแสดงมี comma และทศนิยม 2 ตำแหน่งตามที่ใบตัวอย่างแสดง (ฐาน/เงินเดือน แสดงแบบไม่มีทศนิยมได้ตามใบ แต่ค่าตอบแทนพิเศษแสดง `0.00`)
- ใช้ได้ดีบนมือถือ (ครูเปิดจากโทรศัพท์) ปุ่มพิมพ์บนมือถืออาจเปลี่ยนเป็นลิงก์เปิด PDF ที่สร้างฝั่งไคลเอนต์ ถ้า print-to-PDF บนมือถือใช้ยาก ให้พิจารณา fallback ในภายหลัง

## 11. เทมเพลตใบแจ้ง (ดู `reference/salary_notice_sample.pdf`)

องค์ประกอบเรียงบนลงล่าง (A4 แนวตั้ง, ขอบ 18 มม., ฟอนต์ 12–14pt):

1. คำว่า **ลับ** สีแดง กึ่งกลาง (บนสุด) และอีกอันล่างสุดของหน้า
2. หัวเรื่อง **หนังสือแจ้งผลการเลื่อนเงินเดือน** ตัวหนา กึ่งกลาง
3. **รอบการประเมิน** — ช่องติ๊ก "รอบที่ 1 (1 ตุลาคม {Y} – 31 มีนาคม {Y+1})" และ "รอบที่ 2 (1 เมษายน {Y} – 30 กันยายน {Y})" ติ๊กเฉพาะรอบนั้น รอบที่ไม่ติ๊กไม่แสดงปี
4. **ข้อมูลครู** (ขีดเส้นประใต้ค่า): ชื่อ, ตำแหน่ง, โรงเรียน, วิทยฐานะ, สังกัด, เงินเดือนก่อนเลื่อน … บาท
5. ช่องติ๊ก **ได้รับการเลื่อนเงินเดือน** + ตาราง: ฐานในการคำนวณ (บาท) | ร้อยละที่ได้เลื่อน | จำนวนเงินที่ได้เพิ่ม [เงินเดือนที่ได้เลื่อน (บาท) | เงินค่าตอบแทนพิเศษ (บาท)] | เงินเดือนที่ได้รับ (บาท)
6. ช่องติ๊ก **กรณีไม่ได้รับการเลื่อนเงินเดือน เนื่องจาก (เหตุผล)** + เส้นประ 3 บรรทัด (ถ้า `promoted=false` ให้ติ๊กช่องนี้ ใส่เหตุผล และตารางตัวเลขเว้นว่าง/ขีดกลาง)
7. บล็อกลงนามชิดขวา: **ภาพลายเซ็น** → `ลงชื่อ……` → `(ชื่อ ผอ.)` → ตำแหน่ง → `วันที่ {notice_date}`
8. **หมายเหตุ:** เลื่อนเงินเดือนข้าราชการครูและบุคลากรทางการศึกษา ตามคำสั่ง {order_issuer} ที่ {order_no} สั่ง ณ วันที่ {order_date}

กติกา: 1 ใบ = 1 หน้า A4 พอดี; ทุกค่าที่แทรกต้อง escape HTML (กัน XSS) ใช้ `textContent` ไม่ใช้ `innerHTML` กับข้อมูลจากฐานข้อมูล

## 12. แผนการทำงาน (ให้ Claude Code ทำทีละเฟส หยุดให้ผู้ใช้ตรวจเมื่อจบแต่ละเฟส)

**เฟส 0 — เตรียม**
- ถามผู้ใช้: (ก) ใช้โปรเจกต์ Supabase ตัวไหน/สร้างใหม่ (ข) รูปแบบล็อกอิน: รหัสประจำตัว (อีเมลภายใน) หรืออีเมลโรงเรียน (ค) ที่ host หน้าเว็บ (ง) ไฟล์ฟอนต์ TH Sarabun New
- ตรวจ `supabase` CLI / MCP ที่ใช้ได้ ใช้ branch ทดสอบก่อนถ้าโปรเจกต์มีข้อมูลอยู่แล้ว (ผู้ใช้มีโปรเจกต์ Supabase อื่นอยู่ อย่าแตะตารางของโปรเจกต์อื่น)

**เฟส 1 — ฐานข้อมูลและสิทธิ์**
- เขียน migration ตามหัวข้อ 6 (ตาราง, ฟังก์ชัน, RLS, RPC, trigger, storage)
- เขียนชุดทดสอบ RLS (SQL หรือสคริปต์) ด้วยข้อมูลสมมติ: ครู A อ่านใบครู B ไม่ได้, ครูอ่านรอบ `draft` ไม่ได้, แอดมินแก้รอบ `published` ไม่ได้, ครูเรียก RPC อนุมัติไม่ได้ ฯลฯ
- รัน `get_advisors` (security) แก้คำเตือนทั้งหมด

**เฟส 2 — บัญชีและล็อกอิน**
- Edge Functions สร้างบัญชี/รีเซ็ตรหัส, seed บัญชีแอดมิน + ผอ., หน้า login + บังคับเปลี่ยนรหัส + auth-guard

**เฟส 3 — หน้าแอดมิน**
- ตั้งค่าโรงเรียน/อัปโหลดลายเซ็น, จัดการครู, สร้างรอบ, ตารางกรอก 12 แถวพร้อมสูตรเสนอค่า, ส่งอนุมัติ

**เฟส 4 — เทมเพลตใบและ PDF**
- `notice.html` + `notice.css` ตามหัวข้อ 11, พิมพ์รายคน/ทั้งรอบ, ทดสอบวรรณยุกต์ไทยและขนาดหน้า A4 ใน Chrome และบนมือถือ

**เฟส 5 — ผอ. และครู**
- หน้า ผอ. (อนุมัติ/ตีกลับ/ถอนกลับ), หน้าครู (ดู/พิมพ์), บันทึก audit การโหลด

**เฟส 6 — ทดสอบและส่งมอบ**
- ทดสอบครบ flow ด้วยข้อมูลสมมติ 12 คน 2 รอบ, ตรวจ audit log, เขียน `README.md` (วิธีติดตั้ง ตั้งค่า deploy สำรองข้อมูล), ให้ผู้ใช้ตรวจใบจริง 1–2 ใบเทียบกับต้นฉบับก่อนใช้ข้อมูลจริง

## 13. ความปลอดภัยและข้อมูลส่วนบุคคล (PDPA)

- เงินเดือนเป็นข้อมูลส่วนบุคคลที่อ่อนไหวในที่ทำงาน: เข้าถึงเฉพาะเจ้าของ แอดมิน ผอ.
- HTTPS เท่านั้น; ตั้ง Supabase Auth redirect URLs เฉพาะโดเมนของระบบ
- ห้ามใส่ข้อมูลจริงในตัวอย่าง/ข้อมูลทดสอบ/โค้ด/repo สาธารณะ; ถ้า repo เป็นสาธารณะ ห้ามมีค่าลับใด ๆ (anon key ใส่ในหน้าเว็บได้ แต่ service role ห้าม)
- ล็อกเอาต์อัตโนมัติเมื่อไม่ใช้งาน (เช่น 30 นาที) และไม่เก็บตัวเลขเงินเดือนใน localStorage
- สำรองข้อมูลฐานข้อมูลเป็นระยะ (Supabase backups หรือ `pg_dump` ตามแผนที่ใช้)
- ใบแจ้งที่ครูโหลดไปแล้วเป็นไฟล์ในเครื่องครู ระบบควบคุมไม่ได้ — ใส่คำเตือน "เอกสารลับ" ในหน้า

## 14. ข้อควรตรวจสอบโดยผู้ใช้ (ยังไม่ยืนยัน)

1. กฎปัดเศษ (ปัดขึ้นหลัก 10 บาท) และกรณีเงินเดือนเกินขั้นสูง ตรวจกับระเบียบ/คำสั่งจริง
2. ข้อความหมายเหตุ ชื่อหน่วยงานผู้ออกคำสั่ง และรูปแบบเลขที่คำสั่ง
3. ผอ. จะเซ็นลายมือบนกระดาษเพิ่มหรือไม่ เมื่อใบที่ระบบออกมีภาพลายเซ็นแล้ว (ในแง่ระเบียบของโรงเรียน/เขต)
4. ต้องการแจ้งเตือนครู (เช่น LINE/อีเมล) เมื่อเผยแพร่รอบหรือไม่ — ยังไม่อยู่ในขอบเขต

## 15. นอกขอบเขตรอบแรก

นำเข้า Excel, คำนวณตามขั้นเงินเดือนอัตโนมัติ, การแจ้งเตือน LINE/อีเมล, หลายโรงเรียน, ประวัติรอบย้อนหลังก่อนเริ่มใช้ระบบ
