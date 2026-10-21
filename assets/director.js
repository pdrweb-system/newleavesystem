import { sb } from './supabase-client.js';
import { guard, wireLogout } from './auth-guard.js';
import { el } from './dom.js';
import { formatThaiDate, roundPeriod } from './thai-date.js';
import { suggestIncrement, suggestNewSalary } from './calc.js';
import { $, fullName, money, flash, errText, busy, setupTabs, revealPage, statusBadge, thaiDateTime } from './ui.js';
import { loadAudit } from './audit.js';

await guard(['director']);
revealPage();
wireLogout();

const roundMsg = $('roundMsg');
let currentRoundId = null;

const showTab = setupTabs({
  rounds: loadRounds,
  audit: () => loadAudit($('auditRows'), $('auditMsg')),
});

async function loadRounds() {
  const { data, error } = await sb.from('rounds')
    .select('id, start_year, round_no, status, submitted_at, notice_date')
    .order('start_year', { ascending: false }).order('round_no', { ascending: false });
  if (error) return flash(roundMsg, errText(error));

  const pending = data.filter((r) => r.status === 'pending_approval');
  $('pendingList').replaceChildren(pending.length
    ? el('div', { class: 'button-row' }, ...pending.map((r) => el('button', {
      type: 'button', class: 'primary', onclick: () => openRound(r.id, true),
    }, `ปีที่เริ่ม ${r.start_year} รอบที่ ${r.round_no} · ส่งเมื่อ ${thaiDateTime(r.submitted_at)}`)))
    : el('p', { class: 'muted' }, 'ไม่มีรอบที่รออนุมัติ'));

  $('roundRows').replaceChildren(...(data.length ? data.map((r) => el('tr', {},
    el('td', {}, r.start_year),
    el('td', {}, r.round_no),
    el('td', {}, roundPeriod(r.start_year, r.round_no)),
    el('td', {}, statusBadge(r.status)),
    el('td', {}, formatThaiDate(r.notice_date)),
    el('td', { class: 'actions' }, el('button', { type: 'button', onclick: () => openRound(r.id, true) }, 'เปิด'))))
    : [el('tr', {}, el('td', { colspan: 6, class: 'muted' }, 'ยังไม่มีรอบ'))]));

  if (currentRoundId) openRound(currentRoundId);
}

// แสดง ⚠ เมื่อค่าที่แอดมินกรอกต่างจากค่าที่ระบบคำนวณ ให้ ผอ. ตรวจเป็นพิเศษ
function withCheck(value, suggested) {
  if (value == null) return '';
  if (suggested == null || Number(value) === suggested) return money(value);
  return el('span', {}, money(value), el('span', { class: 'warn' }, `⚠ ระบบคำนวณ ${money(suggested)}`));
}

function noticeRow(round, n, teacher) {
  const p = n.promoted;
  const sInc = p && n.base_amount != null && n.percent != null ? suggestIncrement(Number(n.base_amount), Number(n.percent)) : null;
  const sNew = p && n.before_salary != null && n.increment != null ? suggestNewSalary(Number(n.before_salary), Number(n.increment)) : null;
  return el('tr', {},
    el('td', {}, n.snap_full_name,
      el('div', { class: 'muted' }, teacher?.employee_code ?? '', ' · ',
        el('a', { href: `notice.html?round=${encodeURIComponent(round.id)}&teacher=${encodeURIComponent(n.teacher_id)}` }, 'ดูใบ'))),
    el('td', {}, p ? 'ได้เลื่อน' : 'ไม่ได้เลื่อน'),
    el('td', {}, money(n.before_salary)),
    el('td', {}, p ? money(n.base_amount) : '–'),
    el('td', {}, p ? Number(n.percent).toFixed(2) : '–'),
    el('td', {}, p ? withCheck(n.increment, sInc) : '–'),
    el('td', {}, p ? money(n.special_comp) : '–'),
    el('td', {}, p ? withCheck(n.new_salary, sNew) : '–'),
    el('td', {}, p ? '' : n.reason));
}

async function issuerCard(settings) {
  if (!settings) return el('div', { class: 'msg error' }, 'ยังไม่ได้ตั้งค่าข้อมูลโรงเรียน กรุณาแจ้งแอดมินก่อนอนุมัติ');
  let signature = el('p', { class: 'msg error' }, 'ยังไม่มีภาพลายเซ็น กรุณาแจ้งแอดมินให้อัปโหลดก่อนอนุมัติ');
  if (settings.signature_path) {
    const { data, error } = await sb.storage.from('signatures').createSignedUrl(settings.signature_path, 300);
    signature = error
      ? el('p', { class: 'muted' }, 'โหลดภาพลายเซ็นไม่ได้')
      : el('img', { src: data.signedUrl, alt: 'ลายเซ็นที่จะใส่ในใบ', class: 'sig-preview' });
  }
  return el('div', { class: 'issuer' },
    el('p', { class: 'muted' }, 'เมื่ออนุมัติ ระบบจะพิมพ์ข้อมูลต่อไปนี้ลงในใบทุกใบ (ใบที่อนุมัติแล้วจะไม่เปลี่ยนตามการตั้งค่าภายหลัง):'),
    el('ul', {},
      el('li', {}, `โรงเรียน: ${settings.school_name}`),
      el('li', {}, `สังกัด: ${settings.affiliation}`),
      el('li', {}, `ผู้ออกคำสั่ง: ${settings.order_issuer}`),
      el('li', {}, `ผู้ลงนาม: ${settings.director_prefix}${settings.director_name} — ${settings.director_title}`)),
    signature);
}

async function openRound(id, scroll = false) {
  currentRoundId = id;
  const [rRes, nRes, tRes] = await Promise.all([
    sb.from('rounds').select('*').eq('id', id).maybeSingle(),
    sb.from('salary_notices').select('*').eq('round_id', id),
    sb.from('teachers').select('id, employee_code, prefix, first_name, last_name, active'),
  ]);
  const error = rRes.error || nRes.error || tRes.error;
  if (error) return flash(roundMsg, errText(error));
  const round = rRes.data;
  if (!round) { currentRoundId = null; $('roundDetail').replaceChildren(); return; }

  const teachers = new Map(tRes.data.map((t) => [t.id, t]));
  const notices = nRes.data.sort((a, b) =>
    (teachers.get(a.teacher_id)?.employee_code ?? '').localeCompare(teachers.get(b.teacher_id)?.employee_code ?? ''));
  const withNotice = new Set(notices.map((n) => n.teacher_id));
  const missing = tRes.data.filter((t) => t.active && !withNotice.has(t.id));
  const promoted = notices.filter((n) => n.promoted);
  const totalIncrement = promoted.reduce((sum, n) => sum + Number(n.increment ?? 0), 0);

  const pending = round.status === 'pending_approval';
  let issuer = null;
  if (pending) {
    const { data: settings, error: sErr } = await sb.from('school_settings').select('*').maybeSingle();
    if (sErr) return flash(roundMsg, errText(sErr));
    issuer = { settings, card: await issuerCard(settings) };
  }

  $('roundDetail').replaceChildren(el('div', { class: 'card' },
    el('h2', {}, `ปีที่เริ่ม ${round.start_year} · รอบที่ ${round.round_no} `, statusBadge(round.status)),
    el('p', { class: 'muted' }, roundPeriod(round.start_year, round.round_no)),
    el('ul', { class: 'facts' },
      el('li', {}, `เลขที่คำสั่ง: ${round.order_no ?? '-'} · สั่ง ณ วันที่ ${formatThaiDate(round.order_date) || '-'}`),
      el('li', {}, `วันที่ลงนามในใบแจ้ง: ${formatThaiDate(round.notice_date) || '-'}`),
      round.submitted_at ? el('li', {}, `แอดมินส่งเมื่อ: ${thaiDateTime(round.submitted_at)}`) : null,
      round.approved_at ? el('li', {}, `อนุมัติเมื่อ: ${thaiDateTime(round.approved_at)}`) : null,
      el('li', {}, `ใบแจ้ง ${notices.length} ใบ · ได้เลื่อน ${promoted.length} คน · ไม่ได้เลื่อน ${notices.length - promoted.length} คน · รวมเงินที่ได้เลื่อน ${money(totalIncrement)} บาท`)),
    missing.length
      ? el('div', { class: 'msg error' }, `ครูที่ยังไม่มีใบในรอบนี้: ${missing.map(fullName).join(', ')}`)
      : null,
    el('div', { class: 'table-wrap' }, el('table', { class: 'list' },
      el('thead', {}, el('tr', {}, ...['ครู', 'ผล', 'เงินเดือนก่อนเลื่อน', 'ฐาน', 'ร้อยละ', 'ได้เลื่อน',
        'ค่าตอบแทนพิเศษ', 'เงินเดือนที่ได้รับ', 'เหตุผล'].map((h) => el('th', {}, h)))),
      el('tbody', {}, ...notices.map((n) => noticeRow(round, n, teachers.get(n.teacher_id)))))),
    issuer?.card ?? null,
    roundActions(round, notices.length, issuer)));

  if (scroll) $('roundDetail').scrollIntoView({ behavior: 'smooth' });
}

function roundActions(round, count, issuer) {
  const label = `ปีที่เริ่ม ${round.start_year} รอบที่ ${round.round_no}`;
  const preview = el('a', { class: 'button', href: `notice.html?round=${encodeURIComponent(round.id)}&all=1` },
    round.status === 'published' ? 'ดูใบทั้งรอบ' : 'ดูตัวอย่างใบทุกคน');

  if (round.status === 'draft') {
    return el('div', {},
      el('p', { class: 'muted' }, 'รอบนี้แอดมินยังแก้ไขอยู่ ยังไม่ได้ส่งให้อนุมัติ'),
      el('div', { class: 'button-row' }, preview));
  }

  const reason = el('textarea', { rows: '2', placeholder: 'เหตุผล (จำเป็น) เช่น ตัวเลขของครูบางคนไม่ถูกต้อง' });
  const revertText = round.status === 'pending_approval' ? 'ตีกลับให้แอดมินแก้ไข' : 'ถอนการเผยแพร่ (กลับเป็นร่าง)';
  const revert = el('button', { type: 'button', class: 'danger' }, revertText);
  revert.addEventListener('click', () => busy(revert, async () => {
    const text = reason.value.trim();
    if (!text) { reason.focus(); return flash(roundMsg, 'กรุณาระบุเหตุผลก่อน'); }
    const warn = round.status === 'published' ? '\nครูจะไม่เห็นใบของรอบนี้จนกว่าจะอนุมัติใหม่' : '';
    if (!confirm(`${revertText} ${label}?${warn}`)) return;
    const { error } = await sb.rpc('revert_round', { p_round: round.id, p_reason: text });
    if (error) return flash(roundMsg, errText(error));
    flash(roundMsg, 'ส่งกลับเป็นร่างแล้ว แอดมินจะเห็นเหตุผลของท่านในหน้ารอบ', 'ok');
    loadRounds();
  }));

  const rows = [el('div', { class: 'button-row' }, preview)];
  if (round.status === 'pending_approval') {
    const ready = Boolean(issuer?.settings?.signature_path);
    const approve = el('button', { type: 'button', class: 'primary', disabled: !ready }, 'อนุมัติและเผยแพร่');
    approve.addEventListener('click', () => busy(approve, async () => {
      if (!confirm(`อนุมัติและเผยแพร่ ${label}?\nครู ${count} คนจะเห็นใบของตัวเองทันที และระบบจะใส่ลายเซ็นของท่านลงในใบ`)) return;
      const { error } = await sb.rpc('approve_round', { p_round: round.id });
      if (error) return flash(roundMsg, errText(error));
      flash(roundMsg, 'อนุมัติและเผยแพร่แล้ว ครูเข้าดูใบของตัวเองได้ทันที', 'ok');
      loadRounds();
    }));
    rows[0].append(approve);
  }
  rows.push(el('label', {}, round.status === 'pending_approval' ? 'ตีกลับพร้อมเหตุผล' : 'ถอนการเผยแพร่พร้อมเหตุผล'), reason,
    el('div', { class: 'button-row' }, revert));
  return el('div', {}, ...rows);
}

showTab('rounds');
