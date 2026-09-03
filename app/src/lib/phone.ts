export const normalizePhone = (p: string) => (p ?? '').replace(/[^0-9]/g, '');
export const isValidMobile = (p: string) => /^01[016789]\d{7,8}$/.test(normalizePhone(p));
export function formatPhone(p: string) {
  const d = normalizePhone(p);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
