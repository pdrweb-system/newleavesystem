import { sb } from './supabase-client.js';
import { guard, wireLogout } from './auth-guard.js';
import { el } from './dom.js';
import { formatThaiDate, roundPeriod } from './thai-date.js';
import { suggestIncrement, suggestNewSalary } from './calc.js';

await guard(['admin']);
document.querySelector('.topbar').hidden = false;
document.querySelector('main').hidden = false;
wireLogout();

const $ = (id) => document.getElementById(id);
const STATUS_TEXT = { draft: 'ร่าง', pending_approval: 'รออนุมัติ', published: 'เผยแพร่แล้ว' };
const ROLE_TEXT = { admin: 'แอดมิน', director: 'ผอ.', teacher: 'ครู' };
const fullName = (t) => `${t.prefix}${t.first_name} ${t.last_name}`;
const money = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const blankToNull = (v) => (v.trim() === '' ? null : v.trim());

function flash(box, text, kind = 'error') {
  box.className = `msg ${kind}`;
  box.textContent = text;
  box.hidden = !text;
  if (text) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// เบราว์เซอร์แสดงช่องวันที่เป็น ค.ศ. จึงแสดงวันที่ พ.ศ. ใต้ช่องให้ตรวจ
function withThaiDateHint(input) {
  const hint = el('span', { class: 'muted date-hint' });
  const update = () => { hint.textContent = formatThaiDate(input.value); };
  input.addEventListener('input', update);
  update();
  return [input, hint];
}

// ข้อความ error จาก RPC (P0001) เป็นภาษาไทยอยู่แล้ว ส่วนอื่นแปลงเป็นข้อความที่อ่านรู้เรื่อง
function errText(error, duplicateText = 'ข้อมูลซ้ำกับที่มีอยู่แล้ว') {
  if (!error) return '';
  if (error.code === 'P0001') return error.message;
  if (error.code === '23505') return duplicateText;
  if (error.code === '23514') return 'ข้อมูลไม่ครบหรือไม่ถูกต้อง';
  if (error.code === '42501') return 'ไม่มีสิทธิ์ดำเนินการ (รอบอาจถูกส่งอนุมัติไปแล้ว)';
  if (!error.code) return 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง';
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}

// ---------- แท็บ ----------
const loaders = { rounds: loadRounds, teachers: loadTeachers, settings: loadSettings, audit: loadAudit };
function showTab(name) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const s of document.querySelectorAll('[data-panel]')) s.hidden = s.dataset.panel !== name;
  loaders[name]();
}
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

// =====================================================================
// รอบ
// =====================================================================
const roundForm = $('roundCreateForm');
const roundMsg = $('roundMsg');
let currentRoundId = null;
let grid = [];

roundForm.elements.start_year.value = new Date().getFullYear() + 543;
for (const name of ['order_date', 'notice_date']) {
  const input = roundForm.elements[name];
  input.after(withThaiDateHint(input)[1]);
}

async function loadRounds() {
  const { data, error } = await sb.from('rounds')
    .select('id, start_year, round_no, status, notice_date')
    .order('start_year', { ascending: false }).order('round_no', { ascending: false });
  if (error) return flash(roundMsg, errText(error));
  $('roundRows').replaceChildren(...(data.length ? data.map((r) => el('tr', {},
    el('td', {}, r.start_year),
    el('td', {}, r.round_no),
    el('td', {}, roundPeriod(r.start_year, r.round_no)),
    el('td', {}, el('span', { class: `badge ${r.status}` }, STATUS_TEXT[r.status])),
    el('td', {}, formatThaiDate(r.notice_date)),
    el('td', { class: 'actions' }, el('button', { type: 'button', onclick: () => openRound(r.id, true) }, 'เปิด'))))
    : [el('tr', {}, el('td', { colspan: 6, class: 'muted' }, 'ยังไม่มีรอบ'))]));
  if (currentRoundId) openRound(currentRoundId);
}

roundForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = roundForm.elements;
  const msg = $('roundCreateMsg');
  const row = {
    start_year: Number(f.start_year.value),
    round_no: Number(f.round_no.value),
    order_no: blankToNull(f.order_no.value),
    order_date: f.order_date.value || null,
    notice_date: f.notice_date.value || null,
  };
  if (!(row.start_year >= 2500 && row.start_year <= 2700)) return flash(msg, 'กรุณากรอกปี พ.ศ. ให้ถูกต้อง เช่น 2569');
  const { data, error } = await sb.from('rounds').insert(row).select('id').single();
  if (error) return flash(msg, errText(error, `มีรอบที่ ${row.round_no} ของปี ${row.start_year} อยู่แล้ว`));
  flash(msg, '');
  roundForm.elements.order_no.value = '';
  currentRoundId = data.id;
  await loadRounds();
  $('roundEditor').scrollIntoView({ behavior: 'smooth' });
});

async function openRound(id, scroll = false) {
  currentRoundId = id;
  const [rRes, nRes, tRes, aRes] = await Promise.all([
    sb.from('rounds').select('*').eq('id', id).maybeSingle(),
    sb.from('salary_notices').select('*').eq('round_id', id),
    sb.from('teachers').select('*').order('employee_code'),
    sb.from('audit_log').select('at, detail').eq('action', 'revert_round').eq('row_id', id)
      .order('at', { ascending: false }).limit(1),
  ]);
  const error = rRes.error || nRes.error || tRes.error || aRes.error;
  if (error) return flash(roundMsg, errText(error));
  const round = rRes.data;
  if (!round) { currentRoundId = null; $('roundEditor').replaceChildren(); return; }

  const byTeacher = new Map(nRes.data.map((n) => [n.teacher_id, n]));
  const editable = round.status === 'draft';
  grid = tRes.data
    .filter((t) => t.active || byTeacher.has(t.id))
    .map((t) => ({ teacher: t, notice: byTeacher.get(t.id) ?? null }));
  const lastRevert = aRes.data[0];

  $('roundEditor').replaceChildren(el('div', { class: 'card' },
    el('h2', {}, `ปีที่เริ่ม ${round.start_year} · รอบที่ ${round.round_no} `,
      el('span', { class: `badge ${round.status}` }, STATUS_TEXT[round.status])),
    el('p', { class: 'muted' }, roundPeriod(round.start_year, round.round_no)),
    editable && lastRevert
      ? el('div', { class: 'msg error' }, `ผอ. ตีกลับเมื่อ ${new Date(lastRevert.at).toLocaleString('th-TH')} — เหตุผล: ${lastRevert.detail?.reason ?? ''}`)
      : null,
    editable ? null : el('p', { class: 'msg ok' }, round.status === 'published'
      ? 'รอบนี้เผยแพร่แล้ว แก้ไขไม่ได้ ถ้าต้องแก้ให้ ผอ. ถอนกลับเป็นร่างก่อน'
      : 'รอบนี้ส่งให้ ผอ. อนุมัติแล้ว แก้ไขไม่ได้จนกว่า ผอ. จะตีกลับ'),
    roundMetaForm(round, editable),
    el('h2', { style: 'margin-top:16px' }, `ใบแจ้ง (${grid.length} คน)`),
    el('p', { class: 'muted' }, 'ระบบเสนอ "เงินเดือนที่ได้เลื่อน" (ปัดขึ้นหลัก 10 บาท) และ "เงินเดือนที่ได้รับ" ให้ แก้ทับได้ทุกช่อง'),
    el('div', { class: 'table-wrap' }, el('table', { class: 'list grid' },
      el('thead', {}, el('tr', {}, ...['ครู', 'ผล', 'เงินเดือนก่อนเลื่อน', 'ฐานในการคำนวณ', 'ร้อยละ',
        'เงินเดือนที่ได้เลื่อน', 'ค่าตอบแทนพิเศษ', 'เงินเดือนที่ได้รับ', 'เหตุผล (ถ้าไม่ได้เลื่อน)', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, ...grid.map((r) => gridRow(r, editable))))),
    roundActions(round, editable)));
  if (scroll) $('roundEditor').scrollIntoView({ behavior: 'smooth' });
}

function roundMetaForm(round, editable) {
  const form = el('form', { novalidate: '' },
    el('div', { class: 'form-grid' },
      el('div', {}, el('label', {}, 'เลขที่คำสั่ง'), el('input', { name: 'order_no', value: round.order_no ?? '', disabled: !editable })),
      el('div', {}, el('label', {}, 'วันที่สั่ง'),
        withThaiDateHint(el('input', { name: 'order_date', type: 'date', value: round.order_date ?? '', disabled: !editable }))),
      el('div', {}, el('label', {}, 'วันที่ลงนามในใบแจ้ง'),
        withThaiDateHint(el('input', { name: 'notice_date', type: 'date', value: round.notice_date ?? '', disabled: !editable })))));
  form.id = 'roundMetaForm';
  return form;
}

async function saveMeta() {
  const f = $('roundMetaForm').elements;
  const { error } = await sb.from('rounds').update({
    order_no: blankToNull(f.order_no.value),
    order_date: f.order_date.value || null,
    notice_date: f.notice_date.value || null,
  }).eq('id', currentRoundId);
  if (error) { flash(roundMsg, errText(error)); return false; }
  return true;
}

function roundActions(round, editable) {
  const preview = el('a', { class: 'button', href: `notice.html?round=${encodeURIComponent(round.id)}&all=1` },
    editable ? 'ดูตัวอย่างใบทั้งรอบ' : 'ดูใบทั้งรอบ');
  if (!editable) return el('div', { class: 'button-row' }, preview);

  const save = el('button', { type: 'button', class: 'primary' }, 'บันทึก');
  save.addEventListener('click', () => busy(save, async () => {
    if (await saveMeta() && await saveGrid()) {
      await openRound(currentRoundId);
      flash(roundMsg, 'บันทึกแล้ว', 'ok');
    }
  }));

  const submit = el('button', { type: 'button' }, 'ส่งให้ ผอ. อนุมัติ');
  submit.addEventListener('click', () => busy(submit, async () => {
    if (!confirm('บันทึกและส่งรอบนี้ให้ ผอ. อนุมัติ?\nหลังส่งแล้วจะแก้ไขไม่ได้จนกว่า ผอ. จะตีกลับ')) return;
    if (!(await saveMeta()) || !(await saveGrid())) return;
    const { error } = await sb.rpc('submit_round', { p_round: currentRoundId });
    if (error) { await openRound(currentRoundId); return flash(roundMsg, errText(error)); }
    flash(roundMsg, 'ส่งให้ ผอ. อนุมัติแล้ว', 'ok');
    loadRounds();
  }));

  const del = el('button', { type: 'button', class: 'danger' }, 'ลบรอบนี้');
  del.addEventListener('click', () => busy(del, async () => {
    if (!confirm('ลบรอบนี้และใบแจ้งทั้งหมดในรอบ? ย้อนกลับไม่ได้')) return;
    const { error } = await sb.from('rounds').delete().eq('id', currentRoundId);
    if (error) return flash(roundMsg, errText(error));
    currentRoundId = null;
    $('roundEditor').replaceChildren();
    flash(roundMsg, 'ลบรอบแล้ว', 'ok');
    loadRounds();
  }));

  return el('div', { class: 'button-row' }, save, preview, submit, del);
}

const num = (input) => (input.value === '' ? null : Number(input.value));

function gridRow(r, editable) {
  const n = r.notice;
  const numInput = (name, value, extra = {}) => el('input', {
    name, type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: value ?? '', disabled: !editable, ...extra,
  });
  const promoted = el('select', { name: 'promoted', disabled: !editable },
    el('option', { value: '1' }, 'ได้เลื่อน'), el('option', { value: '0' }, 'ไม่ได้เลื่อน'));
  promoted.value = n && !n.promoted ? '0' : '1';
  const f = r.f = {
    promoted,
    before: numInput('before_salary', n?.before_salary),
    base: numInput('base_amount', n?.base_amount),
    percent: numInput('percent', n?.percent, { max: '100' }),
    inc: numInput('increment', n?.increment),
    special: numInput('special_comp', n ? n.special_comp : 0),
    newSal: numInput('new_salary', n?.new_salary),
    reason: el('input', { name: 'reason', value: n?.reason ?? '', disabled: !editable }),
  };
  const warnInc = el('span', { class: 'warn', hidden: true });
  const warnNew = el('span', { class: 'warn', hidden: true });
  r.lastInc = null;
  r.lastNew = null;

  const setWarn = (w, value, suggested) => {
    w.hidden = suggested == null || value === suggested;
    w.textContent = `⚠ ต่างจากค่าที่ระบบคำนวณ (${money(suggested)})`;
  };

  // fill = true: เติมค่าเสนอทับเฉพาะช่องที่ว่างหรือยังเป็นค่าเสนอเดิม (ไม่ทับค่าที่แอดมินแก้เอง)
  function recalc(fill) {
    const p = promoted.value === '1';
    for (const k of ['base', 'percent', 'inc', 'special', 'newSal']) f[k].disabled = !editable || !p;
    f.reason.disabled = !editable || p;
    if (!p) { warnInc.hidden = warnNew.hidden = true; return; }

    const before = num(f.before), base = num(f.base), pct = num(f.percent);
    const sInc = base != null && pct != null ? suggestIncrement(base, pct) : null;
    if (fill && sInc != null && (f.inc.value === '' || num(f.inc) === r.lastInc)) f.inc.value = sInc;
    r.lastInc = sInc;

    const inc = num(f.inc);
    const sNew = before != null && inc != null ? suggestNewSalary(before, inc) : null;
    if (fill && sNew != null && (f.newSal.value === '' || num(f.newSal) === r.lastNew)) f.newSal.value = sNew;
    r.lastNew = sNew;

    setWarn(warnInc, num(f.inc), sInc);
    setWarn(warnNew, num(f.newSal), sNew);
  }
  for (const k of ['promoted', 'before', 'base', 'percent', 'inc', 'newSal']) f[k].addEventListener('input', () => recalc(true));
  recalc(false);

  const t = r.teacher;
  let del = null;
  if (n && editable) {
    del = el('button', { type: 'button', class: 'danger' }, 'ลบใบ');
    del.addEventListener('click', () => busy(del, async () => {
      if (!confirm(`ลบใบแจ้งของ ${fullName(t)} ในรอบนี้?`)) return;
      const { error } = await sb.from('salary_notices').delete().eq('id', n.id);
      if (error) return flash(roundMsg, errText(error));
      openRound(currentRoundId);
    }));
  }

  return el('tr', { class: t.active ? '' : 'inactive' },
    el('td', {}, fullName(t), el('div', { class: 'muted' }, t.employee_code, t.active ? '' : ' · ปิดใช้งาน')),
    el('td', {}, promoted),
    el('td', {}, f.before),
    el('td', {}, f.base),
    el('td', {}, f.percent),
    el('td', {}, f.inc, warnInc),
    el('td', {}, f.special),
    el('td', {}, f.newSal, warnNew),
    el('td', {}, f.reason),
    el('td', { class: 'actions' }, del));
}

// แปลงแถวในตารางเป็นข้อมูลบันทึก: { skip } | { error } | { row }
function rowPayload(r) {
  const f = r.f;
  const p = f.promoted.value === '1';
  const untouched = !r.notice && p && f.reason.value.trim() === ''
    && [f.before, f.base, f.percent, f.inc, f.newSal].every((i) => i.value === '');
  if (untouched) return { skip: true };

  const name = fullName(r.teacher);
  const row = {
    round_id: currentRoundId,
    teacher_id: r.teacher.id,
    promoted: p,
    before_salary: num(f.before),
    base_amount: p ? num(f.base) : null,
    percent: p ? num(f.percent) : null,
    increment: p ? num(f.inc) : null,
    special_comp: p ? (num(f.special) ?? 0) : 0,
    new_salary: p ? num(f.newSal) : null,
    reason: p ? null : f.reason.value.trim(),
  };
  const nums = [row.before_salary, row.base_amount, row.percent, row.increment, row.special_comp, row.new_salary];
  if (nums.some((v) => v != null && (Number.isNaN(v) || v < 0))) return { error: `${name}: ตัวเลขต้องไม่ติดลบ` };
  if (p && [row.before_salary, row.base_amount, row.percent, row.increment, row.new_salary].some((v) => v == null)) {
    return { error: `${name}: กรอกตัวเลขให้ครบทุกช่อง` };
  }
  if (p && row.percent > 100) return { error: `${name}: ร้อยละต้องไม่เกิน 100` };
  if (!p && !row.reason) return { error: `${name}: กรุณาระบุเหตุผลที่ไม่ได้เลื่อน` };
  return { row };
}

async function saveGrid() {
  const rows = [];
  const errors = [];
  for (const r of grid) {
    const res = rowPayload(r);
    if (res.error) errors.push(res.error);
    else if (res.row) rows.push(res.row);
  }
  if (errors.length) { flash(roundMsg, `ยังบันทึกไม่ได้:\n${errors.join('\n')}`); return false; }
  if (!rows.length) return true;
  const { error } = await sb.from('salary_notices').upsert(rows, { onConflict: 'round_id,teacher_id' });
  if (error) { flash(roundMsg, errText(error)); return false; }
  return true;
}

// =====================================================================
// ครู / บัญชี
// =====================================================================
const tForm = $('teacherForm');
const tMsg = $('teacherMsg');
let editingTeacherId = null;

async function loadTeachers() {
  const [tRes, pRes] = await Promise.all([
    sb.from('teachers').select('*').order('employee_code'),
    sb.from('profiles').select('teacher_id, must_change_password').not('teacher_id', 'is', null),
  ]);
  const error = tRes.error || pRes.error;
  if (error) return flash(tMsg, errText(error));
  const accounts = new Map(pRes.data.map((p) => [p.teacher_id, p]));
  $('teacherRows').replaceChildren(...(tRes.data.length
    ? tRes.data.map((t) => teacherRow(t, accounts.get(t.id)))
    : [el('tr', {}, el('td', { colspan: 6, class: 'muted' }, 'ยังไม่มีข้อมูลครู'))]));
}

function teacherRow(t, account) {
  const accountText = !account ? 'ยังไม่มีบัญชี' : account.must_change_password ? 'รอครูตั้งรหัสใหม่' : 'ใช้งานแล้ว';
  const btn = (text, fn, cls) => el('button', { type: 'button', class: cls, onclick: fn }, text);
  return el('tr', { class: t.active ? '' : 'inactive' },
    el('td', {}, t.employee_code),
    el('td', {}, fullName(t)),
    el('td', {}, t.position, t.academic_rank ? el('div', { class: 'muted' }, t.academic_rank) : null),
    el('td', {}, t.active ? 'ใช้งาน' : 'ปิดใช้งาน'),
    el('td', {}, accountText),
    el('td', { class: 'actions' },
      btn('แก้ไข', () => editTeacher(t, account)),
      t.active ? btn(account ? 'รีเซ็ตรหัส' : 'สร้างบัญชี',
        () => setPassword(t, account ? 'admin-reset-password' : 'admin-create-user')) : null,
      btn(t.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน', () => toggleActive(t), t.active ? 'danger' : null)));
}

function editTeacher(t, account) {
  editingTeacherId = t.id;
  const f = tForm.elements;
  for (const k of ['employee_code', 'prefix', 'first_name', 'last_name', 'position', 'academic_rank']) f[k].value = t[k] ?? '';
  // ชื่อล็อกอินผูกกับรหัสประจำตัว: มีบัญชีแล้วห้ามเปลี่ยนรหัส
  f.employee_code.disabled = Boolean(account);
  $('teacherFormTitle').textContent = `แก้ไขข้อมูล ${fullName(t)}`;
  $('teacherCancel').hidden = false;
  tForm.scrollIntoView({ behavior: 'smooth' });
}

function resetTeacherForm() {
  editingTeacherId = null;
  tForm.reset();
  tForm.elements.employee_code.disabled = false;
  $('teacherFormTitle').textContent = 'เพิ่มครู';
  $('teacherCancel').hidden = true;
}
$('teacherCancel').addEventListener('click', resetTeacherForm);

tForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = tForm.elements;
  const row = {
    prefix: f.prefix.value.trim(),
    first_name: f.first_name.value.trim(),
    last_name: f.last_name.value.trim(),
    position: f.position.value.trim() || 'ครู',
    academic_rank: blankToNull(f.academic_rank.value),
  };
  if (!f.employee_code.disabled) row.employee_code = f.employee_code.value.trim();
  if (row.employee_code !== undefined && !/^[A-Za-z0-9._-]+$/.test(row.employee_code)) {
    return flash(tMsg, 'รหัสประจำตัวใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข จุด ขีด และขีดล่าง');
  }
  if (!row.prefix || !row.first_name || !row.last_name) return flash(tMsg, 'กรุณากรอกคำนำหน้า ชื่อ และนามสกุลให้ครบ');

  const { error } = editingTeacherId
    ? await sb.from('teachers').update(row).eq('id', editingTeacherId)
    : await sb.from('teachers').insert(row);
  if (error) return flash(tMsg, errText(error, 'รหัสประจำตัวนี้มีอยู่แล้ว'));
  flash(tMsg, 'บันทึกแล้ว', 'ok');
  resetTeacherForm();
  loadTeachers();
});

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (x) => chars[x % chars.length]).join('');
}

async function callAdminFunction(name, body) {
  const { error } = await sb.functions.invoke(name, { body });
  if (!error) return null;
  try {
    return (await error.context.json()).error ?? 'ดำเนินการไม่สำเร็จ';
  } catch {
    return 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง';
  }
}

async function setPassword(t, fnName) {
  const pw = prompt(`ตั้งรหัสผ่านชั่วคราวให้ ${fullName(t)}\n(อย่างน้อย 8 ตัว ระบบสุ่มไว้ให้แล้ว แก้ได้)`, randomPassword());
  if (pw == null) return;
  if (pw.length < 8) return flash(tMsg, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (pw === t.employee_code) return flash(tMsg, 'ห้ามใช้รหัสประจำตัวเป็นรหัสผ่าน');
  flash(tMsg, 'กำลังดำเนินการ…', 'ok');
  const err = await callAdminFunction(fnName, { teacher_id: t.id, password: pw });
  if (err) return flash(tMsg, err);
  flash(tMsg, `${fnName === 'admin-create-user' ? 'สร้างบัญชี' : 'รีเซ็ตรหัสผ่าน'}ให้ ${fullName(t)} แล้ว\n`
    + `ชื่อล็อกอิน: ${t.employee_code}\nรหัสผ่านชั่วคราว: ${pw}\n`
    + 'แจ้งครูโดยตรง (รหัสนี้แสดงครั้งเดียว) ระบบจะให้ครูตั้งรหัสใหม่ตอนล็อกอินครั้งแรก', 'ok');
  loadTeachers();
}

async function toggleActive(t) {
  const next = !t.active;
  if (!confirm(next ? `เปิดใช้งาน ${fullName(t)}?`
    : `ปิดใช้งาน ${fullName(t)}?\nครูคนนี้จะเข้าดูใบแจ้งไม่ได้ และไม่ต้องมีใบในรอบใหม่`)) return;
  const { error } = await sb.from('teachers').update({ active: next }).eq('id', t.id);
  if (error) return flash(tMsg, errText(error));
  flash(tMsg, next ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'ok');
  loadTeachers();
}

// =====================================================================
// ตั้งค่าโรงเรียน + ลายเซ็น
// =====================================================================
const sForm = $('settingsForm');
const SETTINGS_FIELDS = ['school_name', 'affiliation', 'order_issuer', 'director_prefix', 'director_name', 'director_title'];
const SETTINGS_DEFAULTS = { director_prefix: 'นาย', director_title: 'ผู้อำนวยการโรงเรียน' };
const MAX_SIG_BYTES = 500 * 1024;
let settings = null;
let pendingSig = null;

async function loadSettings() {
  const { data, error } = await sb.from('school_settings').select('*').maybeSingle();
  if (error) return flash($('settingsMsg'), errText(error));
  settings = data;
  for (const k of SETTINGS_FIELDS) sForm.elements[k].value = data?.[k] ?? SETTINGS_DEFAULTS[k] ?? '';
  await showCurrentSignature();
}

async function showCurrentSignature() {
  const box = $('sigCurrent');
  if (!settings?.signature_path) return box.replaceChildren(el('p', { class: 'muted' }, 'ยังไม่ได้อัปโหลดลายเซ็น'));
  const { data, error } = await sb.storage.from('signatures').createSignedUrl(settings.signature_path, 300);
  if (error) return box.replaceChildren(el('p', { class: 'muted' }, 'โหลดภาพลายเซ็นปัจจุบันไม่ได้'));
  box.replaceChildren(el('p', { class: 'muted' }, 'ลายเซ็นปัจจุบัน:'), el('img', { src: data.signedUrl, alt: 'ลายเซ็นปัจจุบัน', class: 'sig-preview' }));
}

sForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = { id: true };
  for (const k of SETTINGS_FIELDS) row[k] = sForm.elements[k].value.trim();
  if (SETTINGS_FIELDS.some((k) => !row[k])) return flash($('settingsMsg'), 'กรุณากรอกให้ครบทุกช่อง');
  const { error } = await sb.from('school_settings').upsert(row, { onConflict: 'id' });
  if (error) return flash($('settingsMsg'), errText(error));
  flash($('settingsMsg'), 'บันทึกแล้ว (มีผลกับรอบที่ ผอ. อนุมัติหลังจากนี้)', 'ok');
  loadSettings();
});

$('sigFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  pendingSig = null;
  $('sigSave').disabled = true;
  $('sigPreview').replaceChildren();
  flash($('sigMsg'), '');
  if (!file) return;
  if (file.type !== 'image/png') return flash($('sigMsg'), 'ต้องเป็นไฟล์ PNG เท่านั้น');
  if (file.size > MAX_SIG_BYTES) return flash($('sigMsg'), 'ไฟล์ใหญ่เกิน 500 KB');
  pendingSig = file;
  $('sigSave').disabled = false;
  $('sigPreview').replaceChildren(el('p', { class: 'muted' }, 'ตัวอย่างไฟล์ที่เลือก:'),
    el('img', { src: URL.createObjectURL(file), alt: 'ตัวอย่างลายเซ็นใหม่', class: 'sig-preview' }));
});

$('sigSave').addEventListener('click', () => busy($('sigSave'), async () => {
  const msg = $('sigMsg');
  if (!pendingSig) return;
  if (!settings) return flash(msg, 'กรุณาบันทึกข้อมูลโรงเรียนก่อนอัปโหลดลายเซ็น');
  // ตั้งชื่อใหม่ทุกครั้ง ใบที่อนุมัติไปแล้วจะยังชี้ไฟล์เดิม
  const path = `signature-${Date.now()}.png`;
  const { error: upErr } = await sb.storage.from('signatures').upload(path, pendingSig, { contentType: 'image/png', upsert: false });
  if (upErr) return flash(msg, 'อัปโหลดไม่สำเร็จ (ต้องเป็น PNG ไม่เกิน 500 KB)');
  const { error } = await sb.from('school_settings').update({ signature_path: path }).eq('id', true);
  if (error) return flash(msg, errText(error));
  // ลบไฟล์เดิมถ้าไม่มีรอบไหนอ้างอยู่ (storage policy ไม่ให้ลบไฟล์ที่ยังถูกอ้าง)
  if (settings.signature_path) await sb.storage.from('signatures').remove([settings.signature_path]).catch(() => {});
  pendingSig = null;
  $('sigFile').value = '';
  $('sigPreview').replaceChildren();
  flash(msg, 'อัปโหลดลายเซ็นแล้ว', 'ok');
  loadSettings();
}));

// =====================================================================
// บันทึกการใช้งาน
// =====================================================================
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

async function loadAudit() {
  const [lRes, pRes, tRes] = await Promise.all([
    sb.from('audit_log').select('*').order('at', { ascending: false }).limit(200),
    sb.from('profiles').select('id, role, teacher_id'),
    sb.from('teachers').select('id, prefix, first_name, last_name'),
  ]);
  const error = lRes.error || pRes.error || tRes.error;
  if (error) return flash($('auditMsg'), errText(error));
  const teacherName = new Map(tRes.data.map((t) => [t.id, fullName(t)]));
  const who = new Map(pRes.data.map((p) => [p.id,
    p.role === 'teacher' ? teacherName.get(p.teacher_id) ?? 'ครู' : ROLE_TEXT[p.role]]));
  $('auditRows').replaceChildren(...lRes.data.map((l) => el('tr', {},
    el('td', {}, new Date(l.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })),
    el('td', {}, l.user_id ? who.get(l.user_id) ?? 'ไม่ทราบ' : 'ระบบ'),
    el('td', {}, `${ACTION_TEXT[l.action] ?? l.action}${l.table_name && !['download', 'revert_round'].includes(l.action) ? ` ${TABLE_TEXT[l.table_name] ?? l.table_name}` : ''}`),
    el('td', {}, auditSummary(l)),
    el('td', {}, l.detail ? el('details', {}, el('summary', {}, 'ดู'), el('pre', {}, JSON.stringify(l.detail, null, 2))) : null))));
}

showTab('rounds');
