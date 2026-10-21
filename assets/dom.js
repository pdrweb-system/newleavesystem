// สร้าง DOM โดยไม่ใช้ innerHTML กับข้อมูลจากฐานข้อมูล (กัน XSS): string ทุกตัวกลายเป็น text node
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

export function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) e.append(c);
  }
  return e;
}
