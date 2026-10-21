// ตารางบันทึกการใช้งาน (แอดมินและ ผอ. อ่านได้ตาม RLS)
import { sb } from './supabase-client.js';
import { el } from './dom.js';
import { STATUS_TEXT, ROLE_TEXT, fullName, flash, errText, thaiDateTime } from './ui.js';

const ACTION_TEXT = {
  insert: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ', download: 'ดาวน์โหลด/พิมพ์',
  revert_round: 'ผอ. ถอนกลับเป็นร่าง', create_account: 'สร้างบัญชี', reset_password: 'รีเซ็ตรหัสผ่าน',
};
const TABLE_TEXT = { teachers: 'ข้อมูลครู', profiles: 'บัญชี', school_settings: 'ตั้งค่าโรงเรียน', rounds: 'รอบ', salary_notices: 'ใบแจ้ง' };

function auditSummary(log) {
  const d = log.detail ?? {};
  const row = d.new ?? d.old;
  if (log.action === 'revert_round') return `เหตุผล: ${d.reason ?? ''}`;
  if (log.table_name === 'rounds' && log.action === 'update' && d.old?.status !== d.new?.status) {
    return `สถานะ ${STATUS_TEXT[d.old?.status] ?? ''} → ${STATUS_TEXT[d.new?.status] ?? ''}`;
  }
  if (log.table_name === 'rounds' && row) return `ปี ${row.start_year} รอบ ${row.round_no}`;
  if (log.table_name === 'salary_notices' && row) return row.snap_full_name;
  if (log.table_name === 'teachers' && row) return fullName(row);
  return '';
}

export async function loadAudit(tbody, msgBox) {
  const [lRes, pRes, tRes] = await Promise.all([
    sb.from('audit_log').select('*').order('at', { ascending: false }).limit(200),
    sb.from('profiles').select('id, role, teacher_id'),
    sb.from('teachers').select('id, prefix, first_name, last_name'),
  ]);
  const error = lRes.error || pRes.error || tRes.error;
  if (error) return flash(msgBox, errText(error));
  const teacherName = new Map(tRes.data.map((t) => [t.id, fullName(t)]));
  const who = new Map(pRes.data.map((p) => [p.id,
    p.role === 'teacher' ? teacherName.get(p.teacher_id) ?? 'ครู' : ROLE_TEXT[p.role]]));
  tbody.replaceChildren(...lRes.data.map((l) => el('tr', {},
    el('td', {}, thaiDateTime(l.at)),
    el('td', {}, l.user_id ? who.get(l.user_id) ?? 'ไม่ทราบ' : 'ระบบ'),
    el('td', {}, `${ACTION_TEXT[l.action] ?? l.action}${l.table_name && !['download', 'revert_round'].includes(l.action) ? ` ${TABLE_TEXT[l.table_name] ?? l.table_name}` : ''}`),
    el('td', {}, auditSummary(l)),
    el('td', {}, l.detail ? el('details', {}, el('summary', {}, 'ดู'), el('pre', {}, JSON.stringify(l.detail, null, 2))) : null))));
}
