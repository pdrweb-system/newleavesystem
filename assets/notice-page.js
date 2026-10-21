import { el } from './dom.js';
import { renderNotice, overflows } from './notice-render.js';
import { suggestIncrement, suggestNewSalary } from './calc.js';

// notice.html?round=<uuid>                 ครู: ใบของตัวเองในรอบนั้น / แอดมิน, ผอ.: ทุกคน
// notice.html?round=<uuid>&teacher=<uuid>  แอดมิน, ผอ.: เฉพาะครูคนนั้น
// notice.html?round=<uuid>&all=1           ทั้งรอบ (ครูจะเห็นแค่ของตัวเองตาม RLS)
// ...&print=1                             เปิดหน้าต่างพิมพ์ให้เองเมื่อโหลดเสร็จ (ปุ่ม "บันทึกเป็น PDF" ของครู)
// notice.html?demo=1&round=1|2&promoted=0  ตัวอย่างข้อมูลสมมติ ไม่ต่อฐานข้อมูล (ตรวจเลย์เอาต์)
const q = new URLSearchParams(location.search);
const out = document.getElementById('out');
const printBtn = document.getElementById('printBtn');
const backLink = document.getElementById('backLink');
const statusBox = document.getElementById('status');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function setStatus(text, kind = '') {
  statusBox.textContent = text;
  statusBox.className = `status ${kind}`;
  statusBox.hidden = !text;
}

// ไม่บอกว่ามีเอกสารแต่ไม่มีสิทธิ์: ทุกกรณีที่อ่านไม่ได้แสดงข้อความเดียวกัน
function notFound() {
  out.replaceChildren(el('div', { class: 'not-found' }, 'ไม่พบเอกสาร'));
  printBtn.hidden = true;
  setStatus('');
}

// ย่อใบให้พอดีจอมือถือ (เฉพาะบนจอ ตอนพิมพ์ใช้ขนาดจริง)
function fitToScreen() {
  const sheetPx = 210 * 96 / 25.4;
  document.documentElement.style.setProperty('--sheet-zoom', String(Math.min(1, (innerWidth - 16) / sheetPx)));
}
addEventListener('resize', fitToScreen);
fitToScreen();

// รอฟอนต์และรูปลายเซ็นโหลดเสร็จก่อนให้พิมพ์
async function assetsReady() {
  await document.fonts.ready;
  const results = await Promise.allSettled([...out.querySelectorAll('img')].map((img) => img.decode()));
  return results.every((r) => r.status === 'fulfilled');
}

function show(sheets, title) {
  out.replaceChildren(...sheets);
  document.title = title;   // เป็นชื่อไฟล์ตั้งต้นตอน "บันทึกเป็น PDF"
}

async function finish(sheets, { requireImages }) {
  const imagesOk = await assetsReady();
  if (requireImages && !imagesOk) {
    setStatus('โหลดภาพลายเซ็นไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่', 'error');
    return false;
  }
  const over = sheets.filter(overflows).length;
  if (over) setStatus(`มี ${over} ใบที่เนื้อหายาวเกิน 1 หน้า (เช่น เหตุผลยาวเกินไป) กรุณาแก้ข้อความก่อนพิมพ์`, 'error');
  printBtn.disabled = false;
  return over === 0;
}

function demo() {
  const roundNo = q.get('round') === '2' ? 2 : 1;
  const promoted = q.get('promoted') !== '0';
  const issuer = {
    school_name: 'โรงเรียนตัวอย่าง', affiliation: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาตัวอย่าง',
    order_issuer: 'สพป.ตัวอย่าง', director_name: 'นายตัวอย่าง นามสมมติ', director_title: 'ผู้อำนวยการโรงเรียนตัวอย่าง',
  };
  const round = { start_year: roundNo === 1 ? 2568 : 2569, round_no: roundNo, order_no: '200/2569', order_date: '2026-04-29', notice_date: '2026-05-28' };
  const base = 30200, pct = roundNo === 1 ? 2.30 : 2.10, before = roundNo === 1 ? 26490 : 27190;
  const inc = suggestIncrement(base, pct);
  const notice = {
    snap_full_name: 'นางสาวสมหญิง ใจดี', snap_position: 'ครู', snap_academic_rank: 'ครูชำนาญการ',
    promoted, before_salary: before, base_amount: base, percent: pct, increment: inc,
    special_comp: 0, new_salary: suggestNewSalary(before, inc),
    reason: promoted ? null : 'ตัวอย่างเหตุผล (ข้อมูลสมมติ)',
  };
  const sheets = [renderNotice({ issuer, round, notice, signatureUrl: 'assets/sig_sample.png', label: 'ตัวอย่างข้อมูลสมมติ' })];
  show(sheets, 'ตัวอย่างหนังสือแจ้งผลการเลื่อนเงินเดือน');
  backLink.hidden = true;
  printBtn.addEventListener('click', () => window.print());
  finish(sheets, { requireImages: false });
}

async function fromDatabase() {
  const { sb } = await import('./supabase-client.js');
  const { guard, homeFor } = await import('./auth-guard.js');
  const profile = await guard(null);
  backLink.href = homeFor(profile.role);

  const roundId = q.get('round') ?? '';
  const teacherId = q.get('teacher');
  if (!UUID.test(roundId) || (teacherId && !UUID.test(teacherId))) return notFound();

  const { data: round } = await sb.from('rounds').select('*').eq('id', roundId).maybeSingle();
  if (!round) return notFound();

  let query = sb.from('salary_notices').select('*, teachers(employee_code)').eq('round_id', roundId);
  if (profile.role === 'teacher') query = query.eq('teacher_id', profile.teacher_id);
  else if (teacherId) query = query.eq('teacher_id', teacherId);
  const { data: notices, error } = await query;
  if (error || !notices?.length) return notFound();
  notices.sort((a, b) => (a.teachers?.employee_code ?? '').localeCompare(b.teachers?.employee_code ?? ''));

  // รอบที่เผยแพร่แล้วใช้ snapshot ตอนอนุมัติ; รอบอื่นเป็นตัวอย่างจากการตั้งค่าปัจจุบัน
  const published = round.status === 'published';
  let issuer;
  let signatureUrl = null;
  if (published) {
    issuer = {
      school_name: round.snap_school_name, affiliation: round.snap_affiliation, order_issuer: round.snap_order_issuer,
      director_name: round.snap_director_name, director_title: round.snap_director_title,
    };
    const { data: signed, error: sigErr } = await sb.storage.from('signatures').createSignedUrl(round.snap_signature_path, 300);
    if (sigErr) {
      setStatus('โหลดภาพลายเซ็นไม่สำเร็จ กรุณาโหลดหน้านี้ใหม่', 'error');
      return;
    }
    signatureUrl = signed.signedUrl;
  } else {
    const { data: s } = await sb.from('school_settings').select('*').maybeSingle();
    issuer = s
      ? { school_name: s.school_name, affiliation: s.affiliation, order_issuer: s.order_issuer,
          director_name: `${s.director_prefix}${s.director_name}`, director_title: s.director_title }
      : { school_name: '(ยังไม่ได้ตั้งค่าโรงเรียน)' };
  }

  const sheets = notices.map((notice) => renderNotice({ issuer, round, notice, signatureUrl, draft: !published }));
  const who = notices.length === 1 ? notices[0].snap_full_name : 'ทั้งรอบ';
  show(sheets, `หนังสือแจ้งผลการเลื่อนเงินเดือน ${round.start_year} รอบ ${round.round_no} ${who}`);
  if (!published) setStatus('ฉบับร่าง (ยังไม่อนุมัติ) — ใช้ตรวจความถูกต้องเท่านั้น ลายเซ็นจะใส่เมื่อ ผอ. อนุมัติ');

  // บันทึกการดาวน์โหลดก่อนพิมพ์; Ctrl+P ก็บันทึกด้วย (กันบันทึกซ้ำภายใน 5 วินาที)
  let loggedAt = 0;
  const logDownload = async () => {
    if (Date.now() - loggedAt < 5000) return true;
    const { error: logErr } = await sb.rpc('log_download', { p_round: round.id });
    if (!logErr) loggedAt = Date.now();
    return !logErr;
  };
  addEventListener('beforeprint', () => { logDownload(); });
  printBtn.addEventListener('click', async () => {
    printBtn.disabled = true;
    const ok = await logDownload();
    printBtn.disabled = false;
    if (!ok) return setStatus('บันทึกการดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
    window.print();
  });

  if (await finish(sheets, { requireImages: published }) && q.get('print') === '1') printBtn.click();
}

if (q.get('demo') === '1') demo();
else fromDatabase();
