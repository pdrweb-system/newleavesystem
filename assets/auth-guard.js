import { sb } from './supabase-client.js';
import { LOGIN_DOMAIN, IDLE_LOGOUT_MS } from './config.js';

// การซ่อนปุ่ม/redirect เป็นแค่ UX ความปลอดภัยจริงอยู่ที่ RLS
const HOME = { teacher: 'teacher.html', admin: 'admin.html', director: 'director.html' };
const never = () => new Promise(() => {});

export const homeFor = (role) => HOME[role] ?? 'index.html';

export function loginToEmail(login) {
  const s = login.trim().toLowerCase();
  return s.includes('@') ? s : `${s}@${LOGIN_DOMAIN}`;
}

export async function getProfile() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('profiles')
    .select('role, must_change_password, teacher_id').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  return data && { ...data, email: session.user.email };
}

export async function signOut() {
  await sb.auth.signOut().catch(() => {});
  location.replace('index.html');
}

// roles = บทบาทที่หน้านี้อนุญาต (null = ทุกบทบาท)
export async function guard(roles, { allowMustChange = false } = {}) {
  const profile = await getProfile().catch(() => null);
  if (!profile) { await signOut(); return never(); }
  if (profile.must_change_password && !allowMustChange) {
    location.replace('change-password.html');
    return never();
  }
  if (roles && !roles.includes(profile.role)) {
    location.replace(homeFor(profile.role));
    return never();
  }
  startIdleLogout();
  return profile;
}

function startIdleLogout() {
  let last = Date.now();
  const touch = () => { last = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
    addEventListener(ev, touch, { passive: true });
  }
  // เช็กเป็นระยะแทน setTimeout ยาว ๆ เพราะแท็บเบื้องหลัง/มือถือพักหน้าจอทำให้ timer เลื่อน
  const check = () => { if (Date.now() - last > IDLE_LOGOUT_MS) signOut(); };
  setInterval(check, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

// ใช้กับหน้าที่มีปุ่ม #logoutBtn
export function wireLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', signOut);
}
