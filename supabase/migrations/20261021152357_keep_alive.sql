-- 7 กันโปรเจกต์แผน Free ถูกพักเพราะไม่มีการใช้งาน
-- GitHub Actions (.github/workflows/supabase-keep-alive.yml) เรียกฟังก์ชันนี้ทุกวันด้วย publishable key
-- ไม่อ่าน/เขียนข้อมูลใด ๆ คืนแค่เวลาของเซิร์ฟเวอร์ (security invoker จึงไม่มีสิทธิ์เกินผู้เรียก)
create or replace function public.keep_alive() returns timestamptz
language sql stable security invoker set search_path = '' as
$$ select now() $$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
