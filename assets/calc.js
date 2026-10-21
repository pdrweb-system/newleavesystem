// ค่าที่ระบบ "เสนอ" ให้แอดมินเท่านั้น แอดมินแก้ทับได้ทุกช่อง
// (กฎปัดเศษสรุปจากใบตัวอย่างใบเดียว ต้องตรวจกับระเบียบจริงก่อนใช้งาน)

// increment = ceil(base × percent / 100 / 10) × 10 ใช้เลขจำนวนเต็มเลี่ยงทศนิยมลอยตัว
export function suggestIncrement(base, percent) {
  const pctH = Math.round(percent * 100);
  return Math.ceil((base * pctH) / 100000) * 10;
}

export function suggestNewSalary(beforeSalary, increment) {
  return beforeSalary + increment;
}
