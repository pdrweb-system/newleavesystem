import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ต้องโหลด assets/vendor/supabase-js-*.js ด้วย <script> ก่อน (ตั้ง window.supabase)
// เก็บ session ใน sessionStorage: ปิดแท็บแล้วต้องล็อกอินใหม่ (เครื่องใช้ร่วมกันในโรงเรียน)
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
});
