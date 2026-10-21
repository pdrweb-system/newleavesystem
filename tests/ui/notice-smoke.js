// ทดสอบหน้าเว็บด้วย Playwright โดยจำลอง Supabase (ไม่ต่อฐานข้อมูลจริง)
// รัน: python3 -m http.server 8765 (ที่รากโปรเจกต์) แล้ว node tests/ui/notice-smoke.js <โฟลเดอร์ผลลัพธ์>
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const SIG = fs.readFileSync(require('path').join(__dirname, '../../assets/sig_sample.png'));
const RID_PUB = '11111111-1111-4111-8111-111111111111';
const RID_DRAFT = '22222222-2222-4222-8222-222222222222';
const PUB = { id: RID_PUB, start_year: 2568, round_no: 1, status: 'published', order_no: '200/2569', order_date: '2026-04-29', notice_date: '2026-05-28',
  snap_signature_path: 'signature-1.png', snap_school_name: 'โรงเรียนบ้านหนองน้ำใส', snap_affiliation: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาทดสอบ เขต 1',
  snap_order_issuer: 'สพป.ทดสอบ เขต 1', snap_director_name: 'นายผู้อำนวยการ ทดสอบ', snap_director_title: 'ผู้อำนวยการโรงเรียนบ้านหนองน้ำใส' };
const DRAFT = { ...PUB, id: RID_DRAFT, status: 'draft', round_no: 2, start_year: 2569, snap_signature_path: null, snap_school_name: null };
const mk = (o) => ({ round_id: RID_PUB, promoted: true, before_salary: 26490, base_amount: 30200, percent: 2.3, increment: 700, special_comp: 0, new_salary: 27190, reason: null, snap_position: 'ครู', ...o });
let NOTICES = [
  mk({ id: 'n1', teacher_id: 't1', teachers: { employee_code: 'T001' }, snap_full_name: 'นางสาวปิ่นมณี ศรีสุขใส', snap_academic_rank: 'ครูชำนาญการพิเศษ' }),
  mk({ id: 'n2', teacher_id: 't2', teachers: { employee_code: 'T002' }, snap_full_name: 'นายณัฏฐ์ ปู่ฎีกาฤทธิ์', snap_academic_rank: 'ครูชำนาญการ', before_salary: 30120.5, base_amount: 31000.25, percent: 2.95, increment: 920, special_comp: 1234.5, new_salary: 31040.5 }),
  mk({ id: 'n3', teacher_id: 't3', teachers: { employee_code: 'T003' }, snap_full_name: 'นางน้ำทิพย์ ญาณวุฒิ', snap_academic_rank: null, promoted: false, base_amount: null, percent: null, increment: null, new_salary: null, reason: 'ถูกลงโทษทางวินัยในรอบการประเมินนี้ และมีวันลาเกินกว่าที่ระเบียบกำหนด' }),
  mk({ id: 'n4', teacher_id: 't4', teachers: { employee_code: 'T004' }, snap_full_name: 'นายฐิติพงษ์ กิ่งก้อยผู้ใหญ่', snap_academic_rank: 'ครูเชี่ยวชาญ' }),
];
const state = { role: 'admin', rpc: [], printCalls: 0, round: PUB, lastNoticeQuery: '' };
const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);

async function page(b, width = 1000) {
  const pg = await b.newPage({ viewport: { width, height: 1200 } });
  pg.errs = []; pg.on('pageerror', (e) => pg.errs.push(e.message));
  await pg.addInitScript((role) => {
    sessionStorage.setItem('sb-xepwiaxxuzgcmossejbx-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-' + role, email: role + '@school.invalid', aud: 'authenticated' } }));
    window.print = () => { window.__printed = (window.__printed || 0) + 1; };
  }, state.role);
  await pg.route('**/*.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const one = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (url.pathname.startsWith('/storage/v1/object/sign/') && req.method() === 'POST') return json({ signedURL: '/object/sign/signatures/signature-1.png?token=abc' });
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return route.fulfill({ status: 200, contentType: 'image/png', body: SIG });
    if (url.pathname.startsWith('/rest/v1/rpc/')) { state.rpc.push({ fn: url.pathname.split('/').pop(), body: req.postDataJSON(), printedBefore: await pg.evaluate(() => window.__printed || 0) }); return json(null); }
    const table = url.pathname.replace('/rest/v1/', ''); const q = decodeURIComponent(url.search);
    let rows = [];
    if (table === 'profiles') rows = [{ role: state.role, must_change_password: false, teacher_id: state.role === 'teacher' ? 't1' : null }];
    if (table === 'rounds') rows = state.round && q.includes(`id=eq.${state.round.id}`) ? [state.round] : [];
    if (table === 'salary_notices') { state.lastNoticeQuery = q; rows = NOTICES.filter((n) => !q.includes('teacher_id=eq.') || q.includes(`teacher_id=eq.${n.teacher_id}`)); }
    if (table === 'school_settings') rows = [{ id: true, school_name: 'โรงเรียนตั้งค่าปัจจุบัน', affiliation: 'สพป.ปัจจุบัน', order_issuer: 'สพป.ปัจจุบัน', director_prefix: 'นาง', director_name: 'ผอ ปัจจุบัน', director_title: 'ผู้อำนวยการโรงเรียนตั้งค่าปัจจุบัน', signature_path: 'x.png' }];
    return json(one ? rows[0] ?? null : rows);
  });
  return pg;
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const base = 'http://localhost:8765/notice.html';

  // A: แอดมิน รอบเผยแพร่แล้ว ทั้งรอบ
  let pg = await page(b);
  await pg.goto(`${base}?round=${RID_PUB}&all=1`);
  await pg.waitForFunction(() => !document.getElementById('printBtn').disabled, null, { timeout: 15000 });
  check('A 4 sheets rendered', (await pg.$$('.sheet')).length === 4);
  check('A signature images loaded', await pg.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0) && document.images.length === 4));
  check('A no watermark on published', (await pg.$$('.watermark')).length === 0);
  check('A uses snapshot issuer', (await pg.textContent('.sheet')).includes('โรงเรียนบ้านหนองน้ำใส'));
  const t2 = await pg.textContent('.sheet:nth-child(2) table');
  check('A satang amounts kept', t2.includes('31,000.25') && t2.includes('2.95') && t2.includes('1,234.50') && t2.includes('31,040.50'), t2.replace(/\s+/g, ' '));
  const t1 = await pg.textContent('.sheet:nth-child(1) table');
  check('A integer amounts without decimals', t1.includes('30,200') && t1.includes('700') && t1.includes('0.00') && t1.includes('27,190'));
  const s3 = await pg.textContent('.sheet:nth-child(3)');
  check('A not-promoted shows reason and dashes', s3.includes('ถูกลงโทษทางวินัย') && (await pg.textContent('.sheet:nth-child(3) table')).includes('–'));
  check('A title for PDF filename', (await pg.title()).includes('2568 รอบ 1 ทั้งรอบ'), await pg.title());
  check('A no overflow warning', await pg.isHidden('#status'));
  await pg.click('#printBtn');
  await pg.waitForFunction(() => window.__printed === 1);
  check('A log_download before print', state.rpc.length === 1 && state.rpc[0].fn === 'log_download' && state.rpc[0].body.p_round === RID_PUB && state.rpc[0].printedBefore === 0);
  await pg.emulateMedia({ media: 'print' });
  await pg.pdf({ path: `${OUT}/notice-all.pdf`, preferCSSPageSize: true, printBackground: true });
  check('A page errors', pg.errs.length === 0, JSON.stringify(pg.errs));
  await pg.close();

  // B: แอดมิน รอบร่าง
  state.round = DRAFT; NOTICES = NOTICES.map((n) => ({ ...n, round_id: RID_DRAFT }));
  pg = await page(b);
  await pg.goto(`${base}?round=${RID_DRAFT}&all=1`);
  await pg.waitForFunction(() => !document.getElementById('printBtn').disabled, null, { timeout: 15000 });
  check('B watermark on draft', (await pg.$$('.watermark')).length === 4);
  check('B no signature image on draft', (await pg.$$('.sig-img img')).length === 0);
  check('B uses current settings', (await pg.textContent('.sheet')).includes('โรงเรียนตั้งค่าปัจจุบัน') && (await pg.textContent('.sheet')).includes('(นางผอ ปัจจุบัน)'));
  check('B draft status shown', (await pg.textContent('#status')).includes('ฉบับร่าง'));
  await pg.emulateMedia({ media: 'print' });
  await pg.pdf({ path: `${OUT}/notice-draft.pdf`, preferCSSPageSize: true, printBackground: true });
  await pg.close();

  // C: ครู เห็นเฉพาะของตัวเอง แม้ส่ง teacher ของคนอื่นมา
  state.role = 'teacher'; state.round = PUB; NOTICES = NOTICES.map((n) => ({ ...n, round_id: RID_PUB }));
  pg = await page(b, 390);
  await pg.goto(`${base}?round=${RID_PUB}&teacher=33333333-3333-4333-8333-333333333333`);
  await pg.waitForFunction(() => !document.getElementById('printBtn').disabled, null, { timeout: 15000 });
  check('C teacher query filtered to own', state.lastNoticeQuery.includes('teacher_id=eq.t1'), state.lastNoticeQuery);
  check('C single sheet', (await pg.$$('.sheet')).length === 1);
  check('C mobile no horizontal scroll', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await pg.evaluate(() => `${document.documentElement.scrollWidth}/${innerWidth}`));
  await pg.screenshot({ path: `${OUT}/notice-mobile.png` });
  await pg.close();

  // D: ไม่พบเอกสาร
  state.role = 'admin';
  pg = await page(b);
  await pg.goto(`${base}?round=not-a-uuid`);
  await pg.waitForSelector('.not-found');
  check('D invalid id -> not found', (await pg.textContent('.not-found')) === 'ไม่พบเอกสาร' && await pg.isHidden('#printBtn'));
  state.round = null;
  await pg.goto(`${base}?round=${RID_PUB}&all=1`);
  await pg.waitForSelector('.not-found');
  check('D missing round -> not found', true);
  await pg.close();

  // E: เหตุผลยาวจนล้นหน้า
  state.round = PUB;
  NOTICES = [mk({ id: 'n9', teacher_id: 't9', teachers: { employee_code: 'T009' }, snap_full_name: 'นายทดสอบ ยาวมาก', promoted: false, base_amount: null, percent: null, increment: null, new_salary: null, reason: 'เหตุผลยาวมาก '.repeat(160) })];
  pg = await page(b);
  await pg.goto(`${base}?round=${RID_PUB}`);
  await pg.waitForFunction(() => !document.getElementById('printBtn').disabled, null, { timeout: 15000 });
  check('E overflow warning shown', (await pg.textContent('#status')).includes('เกิน 1 หน้า'));
  await pg.close();

  // F: โหมดตัวอย่าง
  pg = await page(b);
  await pg.goto(`${base}?demo=1`);
  await pg.waitForFunction(() => !document.getElementById('printBtn').disabled);
  await pg.emulateMedia({ media: 'print' });
  await pg.pdf({ path: `${OUT}/notice-demo.pdf`, preferCSSPageSize: true, printBackground: true });
  check('F demo page errors', pg.errs.length === 0, JSON.stringify(pg.errs));
  await b.close();
})();
