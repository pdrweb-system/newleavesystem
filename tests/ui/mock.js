// ตัวจำลอง Supabase สำหรับทดสอบหน้าเว็บ: ตอบ REST/RPC/Storage จาก fixture และจดคำขอที่เขียนข้อมูล
const fs = require('fs');
const path = require('path');
const SIG = fs.readFileSync(path.join(__dirname, '../../assets/sig_sample.png'));

async function newPage(browser, { role, teacherId = null, width = 1000, tables, rpc = {} }) {
  const pg = await browser.newPage({ viewport: { width, height: 1000 } });
  pg.errs = [];
  pg.calls = [];
  pg.on('pageerror', (e) => pg.errs.push(e.message));
  pg.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined));
  await pg.addInitScript((r) => {
    sessionStorage.setItem('sb-xepwiaxxuzgcmossejbx-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: `u-${r}`, email: `${r}@school.invalid`, aud: 'authenticated' } }));
    window.print = () => { window.__printed = (window.__printed || 0) + 1; };
  }, role);
  await pg.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    if (url.pathname.startsWith('/storage/v1/object/sign/') && req.method() === 'POST') {
      return json({ signedURL: `${url.pathname.replace('/storage/v1', '')}?token=t` });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return route.fulfill({ status: 200, contentType: 'image/png', body: SIG });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      pg.calls.push({ rpc: fn, body: req.postDataJSON() });
      const res = rpc[fn];
      return res ? json(res.body, res.status) : json(null);
    }
    const table = url.pathname.replace('/rest/v1/', '');
    const q = decodeURIComponent(url.search);
    if (req.method() !== 'GET') {
      pg.calls.push({ table, method: req.method(), q, body: req.postData() ? req.postDataJSON() : null });
      return json([], 201);
    }
    if (table === 'profiles' && q.includes(`id=eq.u-${role}`)) {
      const rows = [{ role, must_change_password: false, teacher_id: teacherId }];
      return json(one ? rows[0] : rows);
    }
    let rows = typeof tables[table] === 'function' ? tables[table](q) : (tables[table] ?? []);
    // ตัวกรอง eq แบบง่าย (id=eq.x, round_id=eq.x, teacher_id=eq.x)
    for (const m of q.matchAll(/(?:^|[?&])(id|round_id|teacher_id)=eq\.([^&]+)/g)) rows = rows.filter((r) => String(r[m[1]]) === m[2]);
    return json(one ? rows[0] ?? null : rows);
  });
  return pg;
}

const report = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);

module.exports = { newPage, report };
