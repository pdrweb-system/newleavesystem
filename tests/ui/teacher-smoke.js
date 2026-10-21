// ทดสอบหน้าครูและการบันทึก PDF ด้วย Playwright โดยจำลอง Supabase (ไม่ต่อฐานข้อมูลจริง)
// รัน: python3 -m http.server 8765 (ที่รากโปรเจกต์) แล้ว node tests/ui/teacher-smoke.js
const { chromium } = require('playwright');
const { newPage, report } = require('./mock');

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const ROUNDS = [
  { id: R1, start_year: 2568, round_no: 2, status: 'published', order_no: '1/2568', order_date: '2025-10-01', notice_date: '2025-10-05',
    snap_signature_path: 'signature-1.png', snap_school_name: 'โรงเรียนทดสอบ', snap_affiliation: 'สพป.ทดสอบ', snap_order_issuer: 'สพป.ทดสอบ', snap_director_name: 'นายผอ ทดสอบ', snap_director_title: 'ผู้อำนวยการโรงเรียนทดสอบ' },
  { id: R2, start_year: 2569, round_no: 1, status: 'published', order_no: '200/2569', order_date: '2026-04-29', notice_date: '2026-05-28',
    snap_signature_path: 'signature-1.png', snap_school_name: 'โรงเรียนทดสอบ', snap_affiliation: 'สพป.ทดสอบ', snap_order_issuer: 'สพป.ทดสอบ', snap_director_name: 'นายผอ ทดสอบ', snap_director_title: 'ผู้อำนวยการโรงเรียนทดสอบ' },
];
const base = { teacher_id: 't1', snap_full_name: 'นายสมชาย ใจดี', snap_position: 'ครู', snap_academic_rank: null, promoted: true, before_salary: 26490, base_amount: 30200, percent: 2.3, increment: 700, special_comp: 0, new_salary: 27190, reason: null, teachers: { employee_code: 'T001' } };
let notices = [{ ...base, id: 'n1', round_id: R1 }, { ...base, id: 'n2', round_id: R2 }];
const tables = {
  teachers: [{ id: 't1', prefix: 'นาย', first_name: 'สมชาย', last_name: 'ใจดี' }],
  rounds: ROUNDS,
  salary_notices: (q) => notices.map((n) => (q.includes('rounds(') ? { round_id: n.round_id, teacher_id: n.teacher_id, rounds: ROUNDS.find((r) => r.id === n.round_id) } : n)),
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  let pg = await newPage(b, { role: 'teacher', teacherId: 't1', tables, width: 390 });
  await pg.goto('http://localhost:8765/teacher.html');
  await pg.waitForSelector('.notice-item');
  report('greets teacher', (await pg.textContent('#hello')) === 'สวัสดี นายสมชาย ใจดี');
  const items = await pg.$$eval('.notice-item strong', (els) => els.map((e) => e.textContent));
  report('newest round first', items[0].includes('2569') && items[1].includes('2568'), JSON.stringify(items));
  report('no salary figures on list page', !(await pg.textContent('#noticeList')).includes('27,190'));
  const pdfHref = await pg.getAttribute('.notice-item:first-child a.primary', 'href');
  report('PDF link asks to print', pdfHref === `notice.html?round=${R2}&print=1`, pdfHref);
  report('no horizontal page scroll on phone', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await pg.click('.notice-item:first-child a.primary');
  await pg.waitForFunction(() => window.__printed === 1, null, { timeout: 15000 });
  report('auto print after load', true);
  report('download logged before print', pg.calls.some((c) => c.rpc === 'log_download' && c.body.p_round === R2));
  report('back link goes to teacher page', (await pg.getAttribute('#backLink', 'href')) === 'teacher.html');
  report('page errors', pg.errs.length === 0, JSON.stringify(pg.errs));
  await pg.close();

  notices = [];
  pg = await newPage(b, { role: 'teacher', teacherId: 't1', tables, width: 390 });
  await pg.goto('http://localhost:8765/teacher.html');
  await pg.waitForFunction(() => document.getElementById('noticeList').textContent.includes('ยังไม่มีใบแจ้ง'));
  report('empty state', true);
  await b.close();
})();
