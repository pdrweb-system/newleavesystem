// ตัวช่วยหน้าจอที่ใช้ร่วมกันระหว่างหน้าแอดมิน ผอ. และครู
import { el } from './dom.js';

export const $ = (id) => document.getElementById(id);
export const STATUS_TEXT = { draft: 'ร่าง', pending_approval: 'รออนุมัติ', published: 'เผยแพร่แล้ว' };
export const ROLE_TEXT = { admin: 'แอดมิน', director: 'ผอ.', teacher: 'ครู' };
export const fullName = (t) => `${t.prefix}${t.first_name} ${t.last_name}`;
export const money = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
export const statusBadge = (status) => el('span', { class: `badge ${status}` }, STATUS_TEXT[status]);
export const thaiDateTime = (ts) => (ts ? new Date(ts).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function revealPage() {
  document.querySelector('.topbar').hidden = false;
  document.querySelector('main').hidden = false;
}

export function flash(box, text, kind = 'error') {
  box.className = `msg ${kind}`;
  box.textContent = text;
  box.hidden = !text;
  if (text) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ข้อความ error จาก RPC (P0001) เป็นภาษาไทยอยู่แล้ว ส่วนอื่นแปลงเป็นข้อความที่อ่านรู้เรื่อง
export function errText(error, duplicateText = 'ข้อมูลซ้ำกับที่มีอยู่แล้ว') {
  if (!error) return '';
  if (error.code === 'P0001') return error.message;
  if (error.code === '23505') return duplicateText;
  if (error.code === '23514') return 'ข้อมูลไม่ครบหรือไม่ถูกต้อง';
  if (error.code === '42501') return 'ไม่มีสิทธิ์ดำเนินการ หรือรอบนี้เปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่';
  if (!error.code) return 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง';
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

export async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } finally { btn.disabled = false; }
}

// ปุ่ม [data-tab] สลับ section [data-panel] แล้วเรียก loader ของแท็บนั้น; คืนฟังก์ชันเปิดแท็บ
export function setupTabs(loaders) {
  const show = (name) => {
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const s of document.querySelectorAll('[data-panel]')) s.hidden = s.dataset.panel !== name;
    loaders[name]?.();
  };
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => show(b.dataset.tab));
  return show;
}
