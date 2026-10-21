// แอดมินสร้างบัญชีล็อกอินให้ครู (ชื่อล็อกอิน = รหัสประจำตัว)
// body: { teacher_id: uuid, password: string }
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const LOGIN_DOMAIN = 'school.invalid';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ตรวจว่าผู้เรียกเป็นแอดมินก่อนทุกครั้ง
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user: caller } } = await sb.auth.getUser(token);
  if (!caller) return json(401, { error: 'กรุณาเข้าสู่ระบบใหม่' });
  const { data: callerProfile } = await sb.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (callerProfile?.role !== 'admin') return json(403, { error: 'ไม่มีสิทธิ์ดำเนินการ' });

  let body: { teacher_id?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'ข้อมูลไม่ถูกต้อง' }); }
  const { teacher_id, password } = body;
  if (typeof teacher_id !== 'string' || typeof password !== 'string') {
    return json(400, { error: 'ข้อมูลไม่ถูกต้อง' });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: 'รหัสผ่านต้องยาว 8–72 ตัวอักษร' });
  }

  const { data: teacher } = await sb.from('teachers').select('employee_code, active').eq('id', teacher_id).maybeSingle();
  if (!teacher) return json(404, { error: 'ไม่พบข้อมูลครู' });
  if (!teacher.active) return json(400, { error: 'ครูคนนี้ถูกปิดใช้งานอยู่' });
  if (password === teacher.employee_code) return json(400, { error: 'ห้ามใช้รหัสประจำตัวเป็นรหัสผ่าน' });

  const { data: existing } = await sb.from('profiles').select('id').eq('teacher_id', teacher_id).maybeSingle();
  if (existing) return json(409, { error: 'ครูคนนี้มีบัญชีแล้ว ใช้ปุ่มรีเซ็ตรหัสผ่านแทน' });

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: `${teacher.employee_code.toLowerCase()}@${LOGIN_DOMAIN}`,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    console.error('createUser failed', createErr?.code ?? createErr?.message);
    return json(400, { error: 'สร้างบัญชีไม่สำเร็จ (รหัสประจำตัวนี้อาจมีบัญชีอยู่แล้ว)' });
  }

  const { error: profileErr } = await sb.from('profiles').insert({
    id: created.user.id, role: 'teacher', teacher_id, must_change_password: true,
  });
  if (profileErr) {
    console.error('profile insert failed', profileErr.code);
    await sb.auth.admin.deleteUser(created.user.id);
    return json(500, { error: 'สร้างบัญชีไม่สำเร็จ' });
  }

  await sb.from('audit_log').insert({
    user_id: caller.id, action: 'create_account', table_name: 'profiles',
    row_id: created.user.id, detail: { teacher_id },
  });
  return json(200, { ok: true });
});
