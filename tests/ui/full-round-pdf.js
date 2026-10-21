// สร้าง PDF ทั้งรอบจากครูสมมติ 12 คน × 2 รอบ แล้วตรวจว่าได้ 1 หน้า A4 ต่อ 1 คน
// รัน: python3 -m http.server 8765 (ที่รากโปรเจกต์) แล้ว node tests/ui/full-round-pdf.js <โฟลเดอร์ผลลัพธ์>
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const { newPage, report } = require('./mock');

const OUT = process.argv[2] || '.';
const NAMES = [
  ['นาย', 'สมชาย', 'ใจดี', 'ครูชำนาญการ'], ['นาง', 'ปิ่นมณี', 'ศรีสุขใส', 'ครูชำนาญการพิเศษ'],
  ['นางสาว', 'ณัฏฐ์ธิดา', 'ปู่ฎีกาฤทธิ์', 'ครูชำนาญการ'], ['นาย', 'ฐิติพงษ์', 'กิ่งก้อยผู้ใหญ่', null],
  ['นาง', 'น้ำทิพย์', 'ญาณวุฒิ', 'ครูเชี่ยวชาญ'], ['นางสาว', 'กัญญ์ณพัชร์', 'ศักดิ์สิทธิ์เจริญรุ่งเรือง', 'ครูชำนาญการ'],
  ['นาย', 'ภูมิ', 'ใจเย็น', null], ['นาง', 'วิไลวรรณ', 'ทองคำ', 'ครูชำนาญการพิเศษ'],
  ['นางสาว', 'สุดารัตน์', 'มีสุข', 'ครูชำนาญการ'], ['นาย', 'ธีรวัฒน์', 'บุญมาก', 'ครูชำนาญการ'],
  ['นาง', 'อรุณี', 'แสงทอง', 'ครูชำนาญการพิเศษ'], ['นางสาว', 'พรรณี', 'รุ่งเรือง', null],
];
const ROUND = (id, year, no, status) => ({
  id, start_year: year, round_no: no, status, order_no: `${no === 1 ? 101 : 202}/${year + 1}`,
  order_date: '2026-04-29', notice_date: '2026-05-28', snap_signature_path: 'signature-1.png',
  snap_school_name: 'โรงเรียนบ้านหนองน้ำใสวิทยาคาร', snap_affiliation: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาทดสอบ เขต 1',
  snap_order_issuer: 'สพป.ทดสอบ เขต 1', snap_director_name: 'นายผู้อำนวยการ ทดสอบ', snap_director_title: 'ผู้อำนวยการโรงเรียนบ้านหนองน้ำใสวิทยาคาร',
});
const RA = '11111111-1111-4111-8111-111111111111';
const RB = '22222222-2222-4222-8222-222222222222';
const ceil10 = (base, pct) => Math.ceil((Math.round(base * 100) * Math.round(pct * 100)) / 1e7) * 10;

function notices(roundId, offset) {
  return NAMES.map(([prefix, first, last, rank], k) => {
    const i = k + 1;
    const before = 20000 + i * 1370 + offset + (i === 7 ? 0.5 : 0);
    const base = before + 2150;
    const pct = 1.5 + (i % 5) * 0.37;
    const np = i === 5 || i === 11;
    const inc = ceil10(base, pct);
    return {
      id: `${roundId}-${i}`, round_id: roundId, teacher_id: `t${i}`, teachers: { employee_code: `T${String(i).padStart(3, '0')}` },
      snap_full_name: `${prefix}${first} ${last}`, snap_position: 'ครู', snap_academic_rank: rank, promoted: !np,
      before_salary: before, base_amount: np ? null : base, percent: np ? null : Number(pct.toFixed(2)),
      increment: np ? null : inc, special_comp: i === 9 ? 1250.75 : 0, new_salary: np ? null : before + inc,
      reason: np ? (i === 5 ? 'มีวันลาเกินกว่าที่ระเบียบกำหนด' : 'อยู่ระหว่างถูกดำเนินการทางวินัย และผลการประเมินการปฏิบัติงานต่ำกว่าเกณฑ์ที่หน่วยงานกำหนดไว้สำหรับรอบการประเมินนี้') : null,
    };
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  for (const [rid, year, no, offset] of [[RA, 2568, 1, 0], [RB, 2568, 2, 900]]) {
    const pg = await newPage(b, { role: 'admin', tables: { rounds: [ROUND(rid, year, no, 'published')], salary_notices: notices(rid, offset) } });
    await pg.goto(`http://localhost:8765/notice.html?round=${rid}&all=1`);
    await pg.waitForFunction(() => !document.getElementById('printBtn').disabled, null, { timeout: 20000 });
    report(`รอบ ${no}: แสดง 12 ใบ`, (await pg.$$('.sheet')).length === 12);
    report(`รอบ ${no}: ไม่มีใบล้นหน้า`, await pg.isHidden('#status'), await pg.textContent('#status'));
    report(`รอบ ${no}: ลายเซ็นโหลดครบ`, await pg.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0)));
    const file = `${OUT}/ตัวอย่าง-รอบ${no}-12คน.pdf`;
    await pg.emulateMedia({ media: 'print' });
    await pg.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const info = execFileSync('pdfinfo', [file]).toString();
    report(`รอบ ${no}: PDF 12 หน้า A4`, /Pages:\s+12\b/.test(info) && /pts \(A4\)/.test(info), (info.match(/Pages:\s+\d+/) || [''])[0]);
    report(`รอบ ${no}: ไม่มี JS error`, pg.errs.length === 0, JSON.stringify(pg.errs));
    await pg.close();
  }
  await b.close();
})();
