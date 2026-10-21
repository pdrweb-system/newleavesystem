import { sb } from './supabase-client.js';
import { guard, wireLogout } from './auth-guard.js';
import { el } from './dom.js';
import { formatThaiDate, roundPeriod } from './thai-date.js';
import { $, fullName, flash, errText, revealPage } from './ui.js';

const profile = await guard(['teacher']);
revealPage();
wireLogout();

// RLS ให้เห็นเฉพาะใบของตัวเองในรอบที่เผยแพร่แล้ว (ไม่แสดงตัวเลขเงินเดือนในหน้านี้ ดูได้ในใบเท่านั้น)
const [meRes, nRes] = await Promise.all([
  sb.from('teachers').select('prefix, first_name, last_name').eq('id', profile.teacher_id).maybeSingle(),
  sb.from('salary_notices').select('round_id, rounds(start_year, round_no, notice_date)').eq('teacher_id', profile.teacher_id),
]);

if (meRes.data) $('hello').textContent = `สวัสดี ${fullName(meRes.data)}`;

if (meRes.error || nRes.error) {
  flash($('msg'), errText(meRes.error || nRes.error));
} else {
  const items = nRes.data
    .filter((n) => n.rounds)
    .sort((a, b) => b.rounds.start_year - a.rounds.start_year || b.rounds.round_no - a.rounds.round_no);
  $('noticeList').replaceChildren(...(items.length
    ? items.map(({ round_id: id, rounds: r }) => el('div', { class: 'notice-item' },
      el('div', {},
        el('strong', {}, `ปีที่เริ่ม ${r.start_year} · รอบที่ ${r.round_no}`),
        el('div', { class: 'muted' }, roundPeriod(r.start_year, r.round_no)),
        el('div', { class: 'muted' }, `ลงนามวันที่ ${formatThaiDate(r.notice_date)}`)),
      el('div', { class: 'button-row' },
        el('a', { class: 'button', href: `notice.html?round=${encodeURIComponent(id)}` }, 'ดูใบ'),
        el('a', { class: 'button primary', href: `notice.html?round=${encodeURIComponent(id)}&print=1` }, 'บันทึกเป็น PDF'))))
    : [el('p', { class: 'muted' }, 'ยังไม่มีใบแจ้งที่เผยแพร่')]));
}
