-- 3/4 trigger, audit log และ RPC เปลี่ยนสถานะรอบ

-- ---------- trigger functions ----------

create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- เติม snapshot ข้อมูลครูตอนสร้างใบ ถ้าไม่ได้ส่งมา
create or replace function private.fill_notice_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.teachers%rowtype;
begin
  select * into t from public.teachers where id = new.teacher_id;
  if not found then
    raise exception 'ไม่พบข้อมูลครู';
  end if;
  if nullif(btrim(coalesce(new.snap_full_name, '')), '') is null then
    new.snap_full_name := btrim(t.prefix || t.first_name || ' ' || t.last_name);
  end if;
  if nullif(btrim(coalesce(new.snap_position, '')), '') is null then
    new.snap_position := t.position;
  end if;
  if nullif(btrim(coalesce(new.snap_academic_rank, '')), '') is null then
    new.snap_academic_rank := t.academic_rank;
  end if;
  return new;
end $$;

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (user_id, action, table_name, row_id, detail)
    values ((select auth.uid()), 'insert', tg_table_name, to_jsonb(new) ->> 'id',
            jsonb_build_object('new', to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return new;
    end if;
    insert into public.audit_log (user_id, action, table_name, row_id, detail)
    values ((select auth.uid()), 'update', tg_table_name, to_jsonb(new) ->> 'id',
            jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
    return new;
  else
    insert into public.audit_log (user_id, action, table_name, row_id, detail)
    values ((select auth.uid()), 'delete', tg_table_name, to_jsonb(old) ->> 'id',
            jsonb_build_object('old', to_jsonb(old)));
    return old;
  end if;
end $$;

create or replace function private.block_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log แก้ไขหรือลบไม่ได้';
end $$;

revoke all on function private.set_updated_at(), private.fill_notice_snapshot(),
  private.audit_row(), private.block_audit_change() from public, anon, authenticated;

create trigger salary_notices_fill_snapshot before insert on public.salary_notices
  for each row execute function private.fill_notice_snapshot();
create trigger salary_notices_set_updated_at before update on public.salary_notices
  for each row execute function private.set_updated_at();

create trigger audit_teachers after insert or update or delete on public.teachers
  for each row execute function private.audit_row();
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function private.audit_row();
create trigger audit_school_settings after insert or update or delete on public.school_settings
  for each row execute function private.audit_row();
create trigger audit_rounds after insert or update or delete on public.rounds
  for each row execute function private.audit_row();
create trigger audit_salary_notices after insert or update or delete on public.salary_notices
  for each row execute function private.audit_row();

create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function private.block_audit_change();

-- ---------- RPC เปลี่ยนสถานะรอบ (ตรวจบทบาทเป็นอย่างแรก ไม่เชื่อค่าจากไคลเอนต์) ----------

-- แอดมินส่งรอบให้ ผอ. อนุมัติ
create or replace function public.submit_round(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_round   public.rounds%rowtype;
  v_missing int;
  v_names   text;
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode = '42501';
  end if;

  select * into v_round from public.rounds where id = p_round for update;
  if not found then
    raise exception 'ไม่พบรอบการประเมิน';
  end if;
  if v_round.status <> 'draft' then
    raise exception 'รอบนี้ไม่ได้อยู่ในสถานะร่าง ส่งอนุมัติไม่ได้';
  end if;
  if nullif(btrim(coalesce(v_round.order_no, '')), '') is null
     or v_round.order_date is null or v_round.notice_date is null then
    raise exception 'กรุณากรอกเลขที่คำสั่ง วันที่สั่ง และวันที่ลงนามให้ครบก่อนส่งอนุมัติ';
  end if;
  if not exists (select 1 from public.salary_notices where round_id = p_round) then
    raise exception 'รอบนี้ยังไม่มีใบแจ้งของครู';
  end if;

  select count(*), string_agg(t.prefix || t.first_name || ' ' || t.last_name, ', ' order by t.first_name)
    into v_missing, v_names
  from public.teachers t
  where t.active
    and not exists (select 1 from public.salary_notices n
                    where n.round_id = p_round and n.teacher_id = t.id);
  if v_missing > 0 then
    raise exception 'ยังไม่มีใบแจ้งของครูอีก % คน: %', v_missing, v_names;
  end if;

  if exists (select 1 from public.salary_notices n
             where n.round_id = p_round and not n.promoted
               and nullif(btrim(coalesce(n.reason, '')), '') is null) then
    raise exception 'มีใบที่ไม่ได้เลื่อนเงินเดือนแต่ยังไม่ระบุเหตุผล';
  end if;

  update public.rounds set status = 'pending_approval', submitted_at = now() where id = p_round;
end $$;

-- ผอ. อนุมัติและเผยแพร่ (คัดลอกลายเซ็น/ชื่อ/สังกัดเป็น snapshot)
create or replace function public.approve_round(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.rounds%rowtype;
  v_set   public.school_settings%rowtype;
begin
  if private.current_app_role() is distinct from 'director' then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode = '42501';
  end if;

  select * into v_round from public.rounds where id = p_round for update;
  if not found then
    raise exception 'ไม่พบรอบการประเมิน';
  end if;
  if v_round.status <> 'pending_approval' then
    raise exception 'รอบนี้ไม่ได้อยู่ในสถานะรออนุมัติ';
  end if;

  select * into v_set from public.school_settings;
  if not found then
    raise exception 'ยังไม่ได้ตั้งค่าข้อมูลโรงเรียน กรุณาแจ้งแอดมิน';
  end if;
  if v_set.signature_path is null
     or not exists (select 1 from storage.objects
                    where bucket_id = 'signatures' and name = v_set.signature_path) then
    raise exception 'ยังไม่ได้อัปโหลดลายเซ็นผู้อำนวยการ กรุณาแจ้งแอดมิน';
  end if;

  update public.rounds set
    status = 'published',
    approved_by = (select auth.uid()),
    approved_at = now(),
    snap_signature_path = v_set.signature_path,
    snap_director_name  = btrim(v_set.director_prefix || v_set.director_name),
    snap_director_title = v_set.director_title,
    snap_school_name    = v_set.school_name,
    snap_affiliation    = v_set.affiliation,
    snap_order_issuer   = v_set.order_issuer
  where id = p_round;
end $$;

-- ผอ. ตีกลับ/ถอนการเผยแพร่ กลับเป็น draft
create or replace function public.revert_round(p_round uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.rounds%rowtype;
begin
  if private.current_app_role() is distinct from 'director' then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'กรุณาระบุเหตุผล';
  end if;

  select * into v_round from public.rounds where id = p_round for update;
  if not found then
    raise exception 'ไม่พบรอบการประเมิน';
  end if;
  if v_round.status not in ('pending_approval', 'published') then
    raise exception 'รอบนี้เป็นร่างอยู่แล้ว';
  end if;

  update public.rounds set
    status = 'draft', submitted_at = null, approved_by = null, approved_at = null,
    snap_signature_path = null, snap_director_name = null, snap_director_title = null,
    snap_school_name = null, snap_affiliation = null, snap_order_issuer = null
  where id = p_round;

  insert into public.audit_log (user_id, action, table_name, row_id, detail)
  values ((select auth.uid()), 'revert_round', 'rounds', p_round::text,
          jsonb_build_object('reason', btrim(p_reason), 'from_status', v_round.status));
end $$;

-- บันทึกว่าโหลด/พิมพ์ PDF (ครูโหลดของตัวเอง แอดมิน/ผอ. โหลดทั้งรอบ)
create or replace function public.log_download(p_round uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := private.current_app_role();
  v_tid  uuid;
begin
  if v_role is null then
    raise exception 'ไม่มีสิทธิ์ดำเนินการ' using errcode = '42501';
  end if;

  if v_role = 'teacher' then
    v_tid := private.my_teacher_id();
    if v_tid is null or not exists (
         select 1 from public.salary_notices n
         join public.rounds r on r.id = n.round_id
         where n.round_id = p_round and n.teacher_id = v_tid and r.status = 'published') then
      raise exception 'ไม่พบเอกสาร';
    end if;
  elsif not exists (select 1 from public.rounds where id = p_round) then
    raise exception 'ไม่พบเอกสาร';
  end if;

  insert into public.audit_log (user_id, action, table_name, row_id, detail)
  values ((select auth.uid()), 'download', 'rounds', p_round::text,
          jsonb_build_object('role', v_role));
end $$;

revoke all on function public.submit_round(uuid), public.approve_round(uuid),
  public.revert_round(uuid, text), public.log_download(uuid) from public, anon;
grant execute on function public.submit_round(uuid), public.approve_round(uuid),
  public.revert_round(uuid, text), public.log_download(uuid) to authenticated;
