// แอดมินรีเซ็ตรหัสผ่านให้ครู แล้วบังคับเปลี่ยนรหัสอีกครั้งตอนล็อกอิน
// รีเซ็ตได้เฉพาะบัญชีครู (บัญชี ผอ./แอดมินรีเซ็ตใน Supabase Dashboard) เพื่อไม่ให้แอดมินสวมสิทธิ์ ผอ.
// body: { teacher_id: uuid, password: string }
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

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

  const { data: target } = await sb.from('profiles')
    .select('id, role, teachers(employee_code)').eq('teacher_id', teacher_id).maybeSingle();
  if (!target || target.role !== 'teacher') return json(404, { error: 'ครูคนนี้ยังไม่มีบัญชี' });
  // deno-lint-ignore no-explicit-any
  if (password === (target.teachers as any)?.employee_code) {
    return json(400, { error: 'ห้ามใช้รหัสประจำตัวเป็นรหัสผ่าน' });
  }

  const { error: updErr } = await sb.auth.admin.updateUserById(target.id, { password });
  if (updErr) {
    console.error('updateUserById failed', updErr.code ?? updErr.message);
    return json(400, { error: 'รีเซ็ตรหัสผ่านไม่สำเร็จ' });
  }
  // trigger ปลดธงตอนรหัสเปลี่ยน จึงต้องตั้งกลับหลังรีเซ็ต
  await sb.from('profiles').update({ must_change_password: true }).eq('id', target.id);

  await sb.from('audit_log').insert({
    user_id: caller.id, action: 'reset_password', table_name: 'profiles',
    row_id: target.id, detail: { teacher_id },
  });
  return json(200, { ok: true });
});
