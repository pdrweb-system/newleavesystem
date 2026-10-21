// ตรวจสูตรเสนอค่าใน assets/calc.js เทียบกับการคำนวณแบบจำนวนเต็มแม่นยำ (BigInt)
// รัน: node tests/calc.test.mjs
import { suggestIncrement, suggestNewSalary } from '../assets/calc.js';

let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
};

// ค่าอ้างอิงจากใบตัวอย่างจริง: ฐาน 30,200 × 2.30% = 694.60 → ได้เลื่อน 700 → 26,490 + 700 = 27,190
check('ใบตัวอย่าง: เงินที่ได้เลื่อน', suggestIncrement(30200, 2.3) === 700);
check('ใบตัวอย่าง: เงินเดือนใหม่', suggestNewSalary(26490, 700) === 27190);
check('หารลงตัวพอดีไม่ปัดขึ้น', suggestIncrement(30000, 10) === 3000);
check('ร้อยละ 0', suggestIncrement(30200, 0) === 0);
check('ฐานมีสตางค์', suggestIncrement(30200.5, 2.3) === 700);
check('เงินเดือนใหม่มีสตางค์', suggestNewSalary(26490.55, 700) === 27190.55);

// exact = ceil(สตางค์ × ร้อยละ×100 / 10^7) × 10 ด้วย BigInt
const exact = (satang, pctH) => {
  const n = BigInt(satang) * BigInt(pctH);
  return Number((n + 9999999n) / 10000000n) * 10;
};

// สุ่มฐาน 5,000.00–99,999.99 บาท และร้อยละ 0.00–10.00 (ตามที่กรอกในหน้าแอดมินได้)
let seed = 20261021;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let mismatches = 0;
const N = 1_000_000;
for (let i = 0; i < N; i++) {
  const satang = 500000 + Math.floor(rand() * 9500000);
  const pctH = Math.floor(rand() * 1001);
  const base = Number((satang / 100).toFixed(2));   // ค่าที่อ่านจากช่องกรอก
  const pct = Number((pctH / 100).toFixed(2));
  if (suggestIncrement(base, pct) !== exact(satang, pctH)) mismatches++;
}
check(`สุ่ม ${N.toLocaleString()} ค่า ตรงกับการคำนวณแม่นยำทุกค่า`, mismatches === 0, `(ไม่ตรง ${mismatches})`);

// ขอบหลัก 10 บาทที่ผลคูณหารลงตัวพอดี (ต้องไม่ปัดขึ้นอีก 10 บาท)
let boundaryMiss = 0;
for (let pctH = 1; pctH <= 1000; pctH++) {
  for (let k = 1; k <= 400; k++) {
    const target = BigInt(k) * 10000000n;            // ผลคูณที่หารลงตัว
    if (target % BigInt(pctH) !== 0n) continue;
    const satang = Number(target / BigInt(pctH));
    if (satang < 100000 || satang > 10000000) continue;
    if (suggestIncrement(satang / 100, pctH / 100) !== k * 10) boundaryMiss++;
  }
}
check('กรณีขอบที่หารลงตัวพอดีไม่ปัดเกิน', boundaryMiss === 0, `(ผิด ${boundaryMiss})`);

process.exit(failures ? 1 : 0);
