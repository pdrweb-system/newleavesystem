import { formatThaiDate, roundPeriod, roundPeriodNoYear } from './thai-date.js';
import { el } from './dom.js';

// เงินจำนวนเต็มแสดงแบบไม่มีทศนิยมตามใบจริง ถ้ามีสตางค์แสดง 2 ตำแหน่ง (ไม่ปัดทิ้ง)
const money = (n) => {
  const v = Number(n);
  const digits = Number.isInteger(v) ? 0 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const fixed2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const box = (on) => el('span', { class: 'box' }, on ? '✓' : '');
const dot = (text) => el('span', { class: 'dot' }, text || ' '.repeat(10));
const orBlank = (v) => v || '……………';

// issuer = { school_name, affiliation, order_issuer, director_name (รวมคำนำหน้า), director_title }
// signatureUrl: เฉพาะรอบที่เผยแพร่แล้ว; draft = true ใส่ลายน้ำ "ฉบับร่าง"; label = ข้อความมุมขวาบน
export function renderNotice({ issuer, round, notice, signatureUrl = null, draft = false, label = null }) {
  const sheet = el('section', { class: 'sheet' });
  const p = notice.promoted;

  if (draft) sheet.append(el('div', { class: 'watermark', 'aria-hidden': 'true' }, el('span', {}, 'ฉบับร่าง — ยังไม่อนุมัติ')));
  if (label) sheet.append(el('div', { class: 'corner-label' }, label));
  sheet.append(el('div', { class: 'secret' }, 'ลับ'));
  sheet.append(el('h1', {}, 'หนังสือแจ้งผลการเลื่อนเงินเดือน'));

  const r1 = round.round_no === 1, r2 = round.round_no === 2;
  sheet.append(el('p', {}, 'รอบการประเมิน',
    el('span', { class: 'round-row' }, box(r1),
      `รอบที่ 1 (${r1 ? roundPeriod(round.start_year, 1) : roundPeriodNoYear(1)})`),
    el('span', { class: 'round-row' }, box(r2),
      `รอบที่ 2 (${r2 ? roundPeriod(round.start_year, 2) : roundPeriodNoYear(2)})`)));

  sheet.append(el('p', {},
    'ชื่อ ', dot(notice.snap_full_name), ' ตำแหน่ง ', dot(notice.snap_position),
    ' โรงเรียน ', dot(issuer.school_name), el('br'),
    'วิทยฐานะ ', dot(notice.snap_academic_rank), ' สังกัด ', dot(issuer.affiliation), el('br'),
    'เงินเดือนก่อนเลื่อน ', dot(notice.before_salary != null ? money(notice.before_salary) : ''), ' บาท'));

  sheet.append(el('p', {}, box(p), 'ได้รับการเลื่อนเงินเดือน'));

  const th = (text, attrs = {}) => el('th', attrs, ...text.split('\n').flatMap((t, i) => (i ? [el('br'), t] : [t])));
  const cell = (v, f) => el('td', {}, p && v != null ? f(v) : '–');
  sheet.append(el('table', {},
    el('tr', {},
      th('ฐานในการคำนวณ\n(บาท)', { rowspan: 2 }), th('ร้อยละ\nที่ได้เลื่อน', { rowspan: 2 }),
      th('จำนวนเงินที่ได้เพิ่ม', { colspan: 2 }), th('เงินเดือนที่ได้รับ\n(บาท)', { rowspan: 2 })),
    el('tr', {}, th('เงินเดือน\nที่ได้เลื่อน (บาท)'), th('เงินค่าตอบแทน\nพิเศษ (บาท)')),
    el('tr', {},
      cell(notice.base_amount, money), cell(notice.percent, fixed2), cell(notice.increment, money),
      cell(notice.special_comp ?? 0, fixed2), cell(notice.new_salary, money))));

  sheet.append(el('p', { class: 'not-promoted' }, box(!p), 'กรณีไม่ได้รับการเลื่อนเงินเดือน เนื่องจาก (เหตุผล)'));
  sheet.append(el('div', { class: 'reason' }, !p && notice.reason ? notice.reason : ''));

  const sigImg = el('div', { class: 'sig-img' });
  if (signatureUrl) sigImg.append(el('img', { src: signatureUrl, alt: '' }));
  sheet.append(el('div', { class: 'sig' }, sigImg,
    'ลงชื่อ......................................................', el('br'),
    `(${orBlank(issuer.director_name)})`, el('br'),
    orBlank(issuer.director_title), el('br'),
    `วันที่ ${orBlank(formatThaiDate(round.notice_date))}`));

  sheet.append(el('p', { class: 'remark' },
    'หมายเหตุ : เลื่อนเงินเดือนข้าราชการครูและบุคลากรทางการศึกษา', el('br'),
    el('span', { class: 'remark-indent' },
      `ตามคำสั่ง ${orBlank(issuer.order_issuer)} ที่ ${orBlank(round.order_no)} สั่ง ณ วันที่ ${orBlank(formatThaiDate(round.order_date))}`)));

  sheet.append(el('div', { class: 'secret foot' }, 'ลับ'));
  return sheet;
}

// เนื้อหาล้นลงไปทับคำว่า "ลับ" ด้านล่าง = เกิน 1 หน้า A4
export function overflows(sheet) {
  const foot = sheet.querySelector('.secret.foot');
  const last = foot.previousElementSibling;
  return last.getBoundingClientRect().bottom > foot.getBoundingClientRect().top;
}
