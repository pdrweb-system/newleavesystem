// ทดสอบหน้า ผอ. ด้วย Playwright โดยจำลอง Supabase (ไม่ต่อฐานข้อมูลจริง)
// รัน: python3 -m http.server 8765 (ที่รากโปรเจกต์) แล้ว node tests/ui/director-smoke.js
const { chromium } = require('playwright');
const { newPage, report } = require('./mock');

const ROUNDS = [
  { id: 'r-pend', start_year: 2569, round_no: 1, status: 'pending_approval', order_no: '200/2569', order_date: '2026-04-29', notice_date: '2026-05-28', submitted_at: '2026-10-20T03:00:00Z' },
  { id: 'r-pub', start_year: 2568, round_no: 2, status: 'published', order_no: '1/2568', order_date: '2025-10-01', notice_date: '2025-10-05', submitted_at: '2025-10-02T03:00:00Z', approved_at: '2025-10-03T03:00:00Z' },
  { id: 'r-draft', start_year: 2569, round_no: 2, status: 'draft', order_no: null, order_date: null, notice_date: null },
];
const TEACHERS = [
  { id: 't1', employee_code: 'T001', prefix: 'นาย', first_name: 'สมชาย', last_name: 'ใจดี', active: true },
  { id: 't2', employee_code: 'T002', prefix: 'นางสาว', first_name: 'สมหญิง', last_name: 'รักเรียน', active: true },
  { id: 't3', employee_code: 'T003', prefix: 'นาง', first_name: 'สมศรี', last_name: 'มาใหม่', active: true },
];
const NOTICES = [
  { id: 'n1', round_id: 'r-pend', teacher_id: 't1', snap_full_name: 'นายสมชาย ใจดี', promoted: true, before_salary: 26490, base_amount: 30200, percent: 2.3, increment: 800, special_comp: 0, new_salary: 27290, reason: null },
  { id: 'n2', round_id: 'r-pend', teacher_id: 't2', snap_full_name: 'นางสาวสมหญิง รักเรียน', promoted: false, before_salary: 25000, base_amount: null, percent: null, increment: null, special_comp: 0, new_salary: null, reason: 'ลาเกินกำหนด' },
];
let signaturePath = 'signature-1.png';
const tables = {
  rounds: ROUNDS, teachers: TEACHERS, salary_notices: NOTICES,
  school_settings: () => [{ id: true, school_name: 'โรงเรียนทดสอบ', affiliation: 'สพป.ทดสอบ', order_issuer: 'สพป.ทดสอบ', director_prefix: 'นาย', director_name: 'ผอ ทดสอบ', director_title: 'ผู้อำนวยการโรงเรียนทดสอบ', signature_path: signaturePath }],
  profiles: [{ id: 'u-admin', role: 'admin', teacher_id: null }, { id: 'u-director', role: 'director', teacher_id: null }],
  audit_log: [{ id: 1, at: '2026-10-20T03:00:00Z', user_id: 'u-admin', action: 'update', table_name: 'rounds', row_id: 'r-pend', detail: { old: { status: 'draft' }, new: { status: 'pending_approval' } } }],
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const pg = await newPage(b, { role: 'director', tables, width: 390 });
  await pg.goto('http://localhost:8765/director.html');
  await pg.waitForSelector('#pendingList button');
  report('pending list shows 1 round', (await pg.$$('#pendingList button')).length === 1);
  await pg.click('#pendingList button');
  await pg.waitForSelector('#roundDetail table');
  const detail = await pg.textContent('#roundDetail');
  report('summary counts', detail.includes('ได้เลื่อน 1 คน') && detail.includes('ไม่ได้เลื่อน 1 คน') && detail.includes('รวมเงินที่ได้เลื่อน 800 บาท'));
  report('override flagged', detail.includes('⚠ ระบบคำนวณ 700'));
  report('missing teacher warned', detail.includes('นางสมศรี มาใหม่'));
  report('issuer shown', detail.includes('โรงเรียน: โรงเรียนทดสอบ') && detail.includes('นายผอ ทดสอบ'));
  await pg.waitForFunction(() => { const i = document.querySelector('#roundDetail .issuer img'); return i && i.complete && i.naturalWidth > 0; });
  report('signature preview loaded', true);
  report('per-teacher notice link', (await pg.getAttribute('#roundDetail tbody tr:first-child a', 'href')) === 'notice.html?round=r-pend&teacher=t1');

  await pg.click('#roundDetail button.danger');
  await pg.waitForSelector('#roundMsg:not([hidden])');
  report('revert needs reason', (await pg.textContent('#roundMsg')).includes('กรุณาระบุเหตุผล') && !pg.calls.some((c) => c.rpc === 'revert_round'));

  await pg.click('#roundDetail button.primary');
  await pg.waitForFunction(() => document.getElementById('roundMsg').textContent.includes('อนุมัติและเผยแพร่แล้ว'));
  report('approve calls rpc', pg.calls.some((c) => c.rpc === 'approve_round' && c.body.p_round === 'r-pend'));

  await pg.click('#pendingList button');
  await pg.waitForSelector('#roundDetail textarea');
  await pg.fill('#roundDetail textarea', 'ตัวเลขของนายสมชายไม่ถูกต้อง');
  await pg.click('#roundDetail button.danger');
  await pg.waitForFunction(() => document.getElementById('roundMsg').textContent.includes('ส่งกลับเป็นร่างแล้ว'));
  report('revert sends reason', pg.calls.some((c) => c.rpc === 'revert_round' && c.body.p_reason === 'ตัวเลขของนายสมชายไม่ถูกต้อง'));

  await pg.click('#roundRows tr:nth-child(2) button');
  await pg.waitForFunction(() => document.querySelector('#roundDetail h2')?.textContent.includes('2568'));
  report('published round offers unpublish only', (await pg.textContent('#roundDetail button.danger')).includes('ถอนการเผยแพร่') && !(await pg.$('#roundDetail button.primary')));

  await pg.click('#roundRows tr:nth-child(3) button');
  await pg.waitForFunction(() => document.getElementById('roundDetail').textContent.includes('แอดมินยังแก้ไขอยู่'));
  report('draft round read-only', !(await pg.$('#roundDetail textarea')));

  signaturePath = null;
  await pg.click('#pendingList button');
  await pg.waitForFunction(() => document.getElementById('roundDetail').textContent.includes('ยังไม่มีภาพลายเซ็น'));
  report('approve disabled without signature', await pg.isDisabled('#roundDetail button.primary'));

  await pg.click('[data-tab=audit]');
  await pg.waitForSelector('#auditRows tr');
  const audit = await pg.textContent('#auditRows');
  report('audit names the actor', audit.includes('แอดมิน') && audit.includes('ร่าง → รออนุมัติ'));
  report('no horizontal page scroll on phone', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report('page errors', pg.errs.length === 0, JSON.stringify(pg.errs));
  await b.close();
})();
