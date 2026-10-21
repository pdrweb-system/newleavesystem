-- 1/4 โครงสร้างตาราง: ระบบแจ้งผลการเลื่อนเงินเดือนครู
-- ทุกตารางเปิด RLS ทันทีที่สร้าง และเพิกถอนสิทธิ์ของ anon/authenticated ไว้ก่อน
-- (สิทธิ์ที่ใช้งานจริงจะ grant ให้ใน migration ถัดไป)

create schema if not exists private;

-- ตาราง/ฟังก์ชันใหม่ในสคีมา public จะไม่ได้สิทธิ์ของ anon/authenticated อัตโนมัติ
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

create type public.app_role as enum ('teacher', 'admin', 'director');
create type public.round_status as enum ('draft', 'pending_approval', 'published');

create table public.teachers (
  id            uuid primary key default gen_random_uuid(),
  employee_code text not null unique check (length(btrim(employee_code)) > 0),
  prefix        text not null,
  first_name    text not null,
  last_name     text not null,
  position      text not null default 'ครู',
  academic_rank text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null,
  teacher_id uuid unique references public.teachers (id),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'teacher') = (teacher_id is not null))
);

-- มีแถวเดียว (แอดมินสร้างจากหน้าตั้งค่าครั้งแรก ไม่ seed ค่าสมมติไว้กันพิมพ์ผิดโรงเรียน)
create table public.school_settings (
  id               boolean primary key default true check (id),
  school_name      text not null,
  affiliation      text not null,
  order_issuer     text not null,
  director_prefix  text not null default 'นาย',
  director_name    text not null,
  director_title   text not null default 'ผู้อำนวยการโรงเรียน',
  signature_path   text
);

create table public.rounds (
  id            uuid primary key default gen_random_uuid(),
  start_year    int  not null check (start_year between 2500 and 2700),
  round_no      int  not null check (round_no in (1, 2)),
  order_no      text,
  order_date    date,
  notice_date   date,
  status        public.round_status not null default 'draft',
  submitted_at  timestamptz,
  approved_by   uuid references auth.users (id),
  approved_at   timestamptz,
  -- snapshot ตอนอนุมัติ เพื่อให้ใบเก่าไม่เปลี่ยนตามการตั้งค่าใหม่
  snap_signature_path text,
  snap_director_name  text,
  snap_director_title text,
  snap_school_name    text,
  snap_affiliation    text,
  snap_order_issuer   text,
  created_at    timestamptz not null default now(),
  unique (start_year, round_no),
  check (status = 'draft' or (submitted_at is not null
         and order_no is not null and order_date is not null and notice_date is not null)),
  check (status <> 'published' or (approved_by is not null and approved_at is not null
         and snap_signature_path is not null and snap_director_name is not null
         and snap_director_title is not null and snap_school_name is not null
         and snap_affiliation is not null and snap_order_issuer is not null))
);

create table public.salary_notices (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds (id) on delete cascade,
  teacher_id    uuid not null references public.teachers (id),
  -- snapshot ข้อมูลครู ณ รอบนั้น (ตำแหน่ง/วิทยฐานะเปลี่ยนได้ในอนาคต)
  snap_full_name     text not null,
  snap_position      text not null,
  snap_academic_rank text,
  promoted      boolean not null default true,
  before_salary numeric(10,2) check (before_salary >= 0),
  base_amount   numeric(10,2) check (base_amount >= 0),
  percent       numeric(5,2)  check (percent between 0 and 100),
  increment     numeric(10,2) check (increment >= 0),
  special_comp  numeric(10,2) not null default 0 check (special_comp >= 0),
  new_salary    numeric(10,2) check (new_salary >= 0),
  reason        text,
  updated_at    timestamptz not null default now(),
  unique (round_id, teacher_id),
  check (promoted or (reason is not null and length(btrim(reason)) > 0)),
  check (not promoted or (before_salary is not null and base_amount is not null
                          and percent is not null and increment is not null
                          and new_salary is not null))
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  action     text not null,
  table_name text,
  row_id     text,
  detail     jsonb
);

-- unique (round_id, teacher_id) ครอบคลุมการค้นด้วย round_id อยู่แล้ว
create index salary_notices_teacher_id_idx on public.salary_notices (teacher_id);
create index rounds_approved_by_idx on public.rounds (approved_by);
create index audit_log_at_idx on public.audit_log (at desc);

alter table public.teachers        enable row level security;
alter table public.profiles        enable row level security;
alter table public.school_settings enable row level security;
alter table public.rounds          enable row level security;
alter table public.salary_notices  enable row level security;
alter table public.audit_log       enable row level security;

revoke all on table public.teachers, public.profiles, public.school_settings,
  public.rounds, public.salary_notices, public.audit_log from anon, authenticated;
