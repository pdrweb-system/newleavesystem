import { formatThaiDate, roundPeriod, roundPeriodNoYear } from './thai-date.js';

const fmt0 = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);   // string -> text node ไม่ผ่าน innerHTML
  return e;
}
const box = (on) => el('span', { class: 'box' }, on ? '✓' : '');
const dot = (text) => el('span', { class: 'dot' }, text ?? '');

// ctx = { school, round, notice, signatureUrl|null, draft }
export function renderNotice({ school, round, notice, signatureUrl, draft }) {
  const sheet = el('section', { class: 'sheet' });
  const p = notice.promoted;

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
    ' โรงเรียน ', dot(school.school_name), el('br'),
    'วิทยฐานะ ', dot(notice.snap_academic_rank), ' สังกัด ', dot(school.affiliation), el('br'),
    'เงินเดือนก่อนเลื่อน ', dot(notice.before_salary != null ? fmt0(notice.before_salary) : ''), ' บาท'));

  sheet.append(el('p', {}, box(p), 'ได้รับการเลื่อนเงินเดือน'));

  const th = (text, attrs = {}) => el('th', attrs, ...text.split('\n').flatMap((t, i) => i ? [el('br'), t] : [t]));
  const dash = (v, f) => (p ? f(v) : '–');
  sheet.append(el('table', {},
    el('tr', {},
      th('ฐานในการคำนวณ\n(บาท)', { rowspan: 2 }), th('ร้อยละ\nที่ได้เลื่อน', { rowspan: 2 }),
      th('จำนวนเงินที่ได้เพิ่ม', { colspan: 2 }), th('เงินเดือนที่ได้รับ\n(บาท)', { rowspan: 2 })),
    el('tr', {}, th('เงินเดือน\nที่ได้เลื่อน (บาท)'), th('เงินค่าตอบแทน\nพิเศษ (บาท)')),
    el('tr', {},
      el('td', {}, dash(notice.base_amount, fmt0)), el('td', {}, dash(notice.percent, fmt2)),
      el('td', {}, dash(notice.increment, fmt0)), el('td', {}, p ? fmt2(notice.special_comp ?? 0) : '–'),
      el('td', {}, dash(notice.new_salary, fmt0)))));

  const reason = (!p && notice.reason) ? notice.reason : '';
  sheet.append(el('p', { style: 'margin-top:5mm' }, box(!p),
    'กรณีไม่ได้รับการเลื่อนเงินเดือน เนื่องจาก (เหตุผล)'));
  for (let i = 0; i < 3; i++) sheet.append(el('div', { class: 'reason-line' }, i === 0 ? reason : ''));

  const sigImg = el('div', { class: 'sig-img' });
  if (signatureUrl) sigImg.append(el('img', { src: signatureUrl, alt: '' }));
  else if (draft) sigImg.append(el('span', { class: 'draft-mark' }, 'ฉบับร่าง'));
  sheet.append(el('div', { class: 'sig' }, sigImg, 'ลงชื่อ......................................................', el('br'),
    `(${school.director_prefix}${school.director_name})`, el('br'),
    school.director_title, el('br'), `วันที่ ${formatThaiDate(round.notice_date)}`));

  sheet.append(el('p', { style: 'margin-top:4mm' },
    'หมายเหตุ : เลื่อนเงินเดือนข้าราชการครูและบุคลากรทางการศึกษา', el('br'),
    `          ตามคำสั่ง ${school.order_issuer} ที่ ${round.order_no} สั่ง ณ วันที่ ${formatThaiDate(round.order_date)}`));

  sheet.append(el('div', { class: 'secret foot' }, 'ลับ'));
  return sheet;
}
