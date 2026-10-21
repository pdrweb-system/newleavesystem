// ทดสอบหน้าเว็บด้วย Playwright โดยจำลอง Supabase (ไม่ต่อฐานข้อมูลจริง)
// รัน: python3 -m http.server 8765 (ที่รากโปรเจกต์) แล้ว node tests/ui/admin-smoke.js <โฟลเดอร์ผลลัพธ์>
const { chromium } = require('playwright');
const OUT = process.argv[2];
const T = [
  { id: 't1', employee_code: 'T001', prefix: 'นาย', first_name: 'สมชาย', last_name: 'ใจดี', position: 'ครู', academic_rank: 'ครูชำนาญการ', active: true },
  { id: 't2', employee_code: 'T002', prefix: 'นางสาว', first_name: 'สมหญิง', last_name: 'รักเรียน', position: 'ครู', academic_rank: null, active: true },
  { id: 't3', employee_code: 'T003', prefix: 'นาง', first_name: 'สมศรี', last_name: 'ลาออก', position: 'ครู', academic_rank: null, active: false },
];
const R = [
  { id: 'r1', start_year: 2569, round_no: 1, status: 'draft', order_no: '200/2569', order_date: '2026-04-29', notice_date: '2026-05-28' },
  { id: 'r0', start_year: 2568, round_no: 2, status: 'published', order_no: '1/2568', order_date: '2025-10-01', notice_date: '2025-10-05' },
];
const N = [{ id: 'n1', round_id: 'r1', teacher_id: 't1', promoted: true, before_salary: 26490, base_amount: 30200, percent: 2.3, increment: 700, special_comp: 0, new_salary: 27190, reason: null }];
const writes = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const pg = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
  await pg.addInitScript(() => {
    sessionStorage.setItem('sb-xepwiaxxuzgcmossejbx-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'adm', email: 'admin@school.invalid', aud: 'authenticated' } }));
  });
  await pg.route('**/*.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (url.pathname.startsWith('/functions/v1/')) { writes.push({ m, path: url.pathname, body: req.postDataJSON() }); return json({ ok: true }); }
    if (url.pathname.startsWith('/storage/v1/')) return json({ signedURL: '/object/sign/signatures/x.png?token=t' });
    if (url.pathname === '/rest/v1/rpc/submit_round') { writes.push({ m, path: url.pathname, body: req.postDataJSON() }); return json({ code: 'P0001', message: 'ยังไม่มีใบแจ้งของครูอีก 1 คน: นางสาวสมหญิง รักเรียน' }, 400); }
    const table = url.pathname.replace('/rest/v1/', '');
    if (m !== 'GET') { writes.push({ m, table, q: url.search, body: req.postData() ? req.postDataJSON() : null }); return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); }
    const q = url.search; let rows = [];
    if (table === 'profiles') rows = q.includes('id=eq.') ? [{ role: 'admin', must_change_password: false, teacher_id: null }] : [{ id: 'p1', role: 'teacher', teacher_id: 't1', must_change_password: true }, { id: 'adm', role: 'admin', teacher_id: null }];
    if (table === 'teachers') rows = T;
    if (table === 'rounds') rows = q.includes('id=eq.') ? R.filter((r) => q.includes(`id=eq.${r.id}`)) : R;
    if (table === 'salary_notices') rows = N.filter((n) => q.includes(`round_id=eq.${n.round_id}`));
    if (table === 'audit_log') rows = q.includes('revert_round') ? [{ at: '2026-10-20T03:00:00Z', detail: { reason: 'ตัวเลขผิด' } }]
      : [{ id: 1, at: '2026-10-20T03:00:00Z', user_id: 'adm', action: 'update', table_name: 'rounds', row_id: 'r1', detail: { old: { status: 'draft' }, new: { status: 'pending_approval' } } }];
    if (table === 'school_settings') rows = [{ id: true, school_name: 'โรงเรียนทดสอบ', affiliation: 'สพป.ทดสอบ', order_issuer: 'สพป.ทดสอบ', director_prefix: 'นาย', director_name: 'ผอ ทดสอบ', director_title: 'ผู้อำนวยการโรงเรียนทดสอบ', signature_path: 'signature-1.png' }];
    return json(one ? rows[0] ?? null : rows);
  });
  const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);

  await pg.goto('http://localhost:8765/admin.html');
  await pg.waitForSelector('#roundRows tr');
  check('rounds list', (await pg.$$('#roundRows tr')).length === 2);
  await pg.click('#roundRows tr:first-child button');
  await pg.waitForSelector('table.grid tbody tr');
  const rows = await pg.$$('table.grid tbody tr');
  check('grid shows active teachers only', rows.length === 2, rows.length);
  check('revert reason shown', (await pg.textContent('#roundEditor')).includes('ตัวเลขผิด'));
  const r2 = 'table.grid tbody tr:nth-child(2)';
  await pg.fill(`${r2} [name=before_salary]`, '26490');
  await pg.fill(`${r2} [name=base_amount]`, '30200');
  await pg.fill(`${r2} [name=percent]`, '2.3');
  check('increment suggested', await pg.inputValue(`${r2} [name=increment]`) === '700', await pg.inputValue(`${r2} [name=increment]`));
  check('new salary suggested', await pg.inputValue(`${r2} [name=new_salary]`) === '27190', await pg.inputValue(`${r2} [name=new_salary]`));
  await pg.fill(`${r2} [name=increment]`, '800');
  check('new salary follows manual increment', await pg.inputValue(`${r2} [name=new_salary]`) === '27290');
  check('warning on manual increment', await pg.isVisible(`${r2} td:nth-child(6) .warn`));
  const r1 = 'table.grid tbody tr:nth-child(1)';
  await pg.selectOption(`${r1} [name=promoted]`, '0');
  check('base disabled when not promoted', await pg.isDisabled(`${r1} [name=base_amount]`));
  await pg.click('#roundEditor button.primary');
  await pg.waitForSelector('#roundMsg:not([hidden])');
  check('reason required error', (await pg.textContent('#roundMsg')).includes('เหตุผล'), await pg.textContent('#roundMsg'));
  await pg.fill(`${r1} [name=reason]`, 'ทดสอบ');
  writes.length = 0;
  await pg.click('#roundEditor button.primary');
  await pg.waitForFunction(() => document.getElementById('roundMsg').textContent === 'บันทึกแล้ว');
  const up = writes.find((w) => w.table === 'salary_notices');
  check('meta patch sent', writes.some((w) => w.table === 'rounds' && w.m === 'PATCH'));
  check('upsert has 2 rows', up && up.body.length === 2, JSON.stringify(up?.body));
  check('upsert on_conflict', up && up.q.includes('on_conflict=round_id%2Cteacher_id'), up?.q);
  check('not promoted row cleared', up && up.body[0].promoted === false && up.body[0].base_amount === null && up.body[0].reason === 'ทดสอบ');
  await pg.click('#roundEditor .button-row button:nth-of-type(2)');
  await pg.waitForFunction(() => document.getElementById('roundMsg').textContent.includes('ยังไม่มีใบ'));
  check('rpc error shown in Thai', true);
  await pg.screenshot({ path: `${OUT}/admin-rounds.png`, fullPage: true });

  await pg.click('[data-tab=teachers]');
  await pg.waitForSelector('#teacherRows tr');
  check('teachers listed', (await pg.$$('#teacherRows tr')).length === 3);
  writes.length = 0;
  await pg.click('#teacherRows tr:nth-child(2) button:nth-child(2)');
  await pg.waitForFunction(() => document.getElementById('teacherMsg').textContent.includes('รหัสผ่านชั่วคราว'));
  const fn = writes.find((w) => w.path === '/functions/v1/admin-create-user');
  check('create-user called', fn && fn.body.teacher_id === 't2' && fn.body.password.length >= 8);
  await pg.fill('#t_code', 'bad code!');
  await pg.fill('#t_prefix', 'นาย'); await pg.fill('#t_first', 'ก'); await pg.fill('#t_last', 'ข');
  await pg.click('#teacherForm button.primary');
  check('code format validated', (await pg.textContent('#teacherMsg')).includes('รหัสประจำตัว'));

  await pg.click('[data-tab=settings]');
  await pg.waitForFunction(() => document.getElementById('s_school').value === 'โรงเรียนทดสอบ');
  check('settings loaded', true);
  await pg.click('[data-tab=audit]');
  await pg.waitForSelector('#auditRows tr');
  check('audit summary', (await pg.textContent('#auditRows')).includes('ร่าง → รออนุมัติ'));
  console.log('pageerrors', JSON.stringify(errs));
  await b.close();
})();
