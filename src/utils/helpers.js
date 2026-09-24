export function parseNum(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  const num = parseFloat(String(val).replace(/[,%]/g, '').trim());
  return isNaN(num) ? defaultVal : num;
}

export function formatNum(val, dec = 2) {
  return Number(val || 0).toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function cleanAllSpaces(val) {
  return String(val || '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeAttr(str) {
  return String(str || '')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}
