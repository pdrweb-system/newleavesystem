#!/usr/bin/env bash
# สร้างฐานข้อมูลทดสอบใหม่บน Postgres ในเครื่อง → ใส่ตัวแทน Supabase → รัน migration ทุกไฟล์
# → รันชุดทดสอบ RLS และ E2E (ไม่แตะโปรเจกต์จริง)
# ต้องมี psql และ Postgres ที่ต่อได้ เช่น: PGHOST=/tmp/pgtest PGPORT=55432 PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=salary_notice_test

psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

run -f supabase/tests/local_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  run -f "$f" >/dev/null && echo "migration ok: $(basename "$f")"
done

# ชุดทดสอบจบด้วย raise exception เพื่อ rollback จึงพิมพ์เฉพาะบรรทัดรายงาน
for t in rls_test e2e_flow; do
  psql -X -q -d "$DB" -f "supabase/tests/$t.sql" 2>&1 | sed -n 's/^.*\(TEST REPORT: .*\)$/\1/p; /^FAIL /p'
done
