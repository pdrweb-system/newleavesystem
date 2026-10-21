-- 4/4 Storage: bucket ลายเซ็น ผอ. (private, PNG ≤ 500 KB)
-- ครูอ่านได้เฉพาะไฟล์ที่รอบที่เผยแพร่แล้วอ้างถึง; แอดมินอัปโหลด/แก้ได้; ลบไม่ได้ถ้ายังมีรอบอ้างอยู่
-- แนะนำให้ตั้งชื่อไฟล์ใหม่ทุกครั้งที่อัปโหลด (ไม่ทับไฟล์เดิม) เพื่อให้ใบเก่ายังชี้ไฟล์เดิมได้

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 512000, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy signatures_select on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and (
    (select private.current_app_role()) in ('admin', 'director')
    or exists (select 1 from public.rounds r
               where r.status = 'published' and r.snap_signature_path = objects.name)));

create policy signatures_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and (select private.current_app_role()) = 'admin');

create policy signatures_update on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and (select private.current_app_role()) = 'admin')
  with check (bucket_id = 'signatures' and (select private.current_app_role()) = 'admin');

create policy signatures_delete on storage.objects for delete to authenticated
  using (bucket_id = 'signatures'
         and (select private.current_app_role()) = 'admin'
         and not exists (select 1 from public.rounds r where r.snap_signature_path = objects.name)
         and not exists (select 1 from public.school_settings s where s.signature_path = objects.name));
