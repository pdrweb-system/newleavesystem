const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// "2026-05-28" (ค.ศ.) -> "28 พฤษภาคม 2569"
export function formatThaiDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
}

// ช่วงรอบ: รอบ 1 = 1 ต.ค. {Y} – 31 มี.ค. {Y+1}, รอบ 2 = 1 เม.ย. {Y} – 30 ก.ย. {Y}
export function roundPeriod(startYear, roundNo) {
  return roundNo === 1
    ? `1 ตุลาคม ${startYear} – 31 มีนาคม ${startYear + 1}`
    : `1 เมษายน ${startYear} – 30 กันยายน ${startYear}`;
}

// รอบที่ไม่ถูกเลือกแสดงเฉพาะวันที่ ไม่มีปี
export function roundPeriodNoYear(roundNo) {
  return roundNo === 1 ? '1 ตุลาคม – 31 มีนาคม' : '1 เมษายน – 30 กันยายน';
}
