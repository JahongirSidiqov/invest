import { formatMajor, MINOR_PER_MAJOR, money } from '@invest/shared';

/** So'm amounts in the UI are whole numbers; storage is tiyin. */
export function parseSumInput(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const sum = Number(digits);
  if (!Number.isSafeInteger(sum * MINOR_PER_MAJOR.UZS) || sum <= 0) return null;
  return sum * MINOR_PER_MAJOR.UZS;
}

/** "4000000" -> "4 000 000" while typing. */
export function groupDigits(text: string): string {
  return text
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatSum(amountMinor: number, sign: '+' | '-' | '' = ''): string {
  const body = formatMajor(money(amountMinor, 'UZS'));
  return sign === '-' ? `−${body}` : sign === '+' ? `+${body}` : body;
}

/** Local calendar date as YYYY-MM-DD; offsetDays = -1 for yesterday. */
export function localDate(offsetDays = 0, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
