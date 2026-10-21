// ค่าที่ระบบ "เสนอ" ให้แอดมินเท่านั้น แอดมินแก้ทับได้ทุกช่อง
// (กฎปัดเศษสรุปจากใบตัวอย่างใบเดียว ต้องตรวจกับระเบียบจริงก่อนใช้งาน)

// increment = ceil(base × percent / 100 / 10) × 10
// คิดเป็นจำนวนเต็ม (สตางค์ × ร้อยละ×100) เลี่ยงทศนิยมลอยตัวปัดขึ้นเกินที่ขอบหลัก 10 บาท
export function suggestIncrement(base, percent) {
  const satang = Math.round(base * 100);
  const pctH = Math.round(percent * 100);
  return Math.ceil((satang * pctH) / 1e7) * 10;
}

export function suggestNewSalary(beforeSalary, increment) {
  return Math.round((beforeSalary + increment) * 100) / 100;
}
