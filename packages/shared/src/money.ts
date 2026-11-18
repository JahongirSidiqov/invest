/**
 * Money is always an integer number of minor units (tiyin for UZS, cents for USD)
 * plus an ISO 4217 currency code. Never use floating point for money.
 */
export const CURRENCIES = ['UZS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  amountMinor: number;
  currency: Currency;
}

/** Minor units per major unit. Both supported currencies use 2 decimals. */
export const MINOR_PER_MAJOR: Record<Currency, number> = { UZS: 100, USD: 100 };

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

export function money(amountMinor: number, currency: Currency): Money {
  assertSafeInteger(amountMinor, 'amountMinor');
  return { amountMinor, currency };
}

/**
 * Parses a decimal string in major units ("40000", "12.5", "12,50") into minor units
 * without going through floating point.
 */
export function parseMajor(input: string, currency: Currency): Money {
  // \s also matches the non-breaking space used as a thousands separator.
  const normalised = input.trim().replace(/\s/g, '').replace(',', '.');
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(normalised);
  if (!match) {
    throw new RangeError(`Not a valid amount: "${input}"`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const minor = Number(whole) * MINOR_PER_MAJOR[currency] + Number(fraction.padEnd(2, '0') || '0');
  const amountMinor = sign ? -minor : minor;
  return money(amountMinor, currency);
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot add ${a.currency} and ${b.currency}`);
  }
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function sum(items: readonly Money[], currency: Currency): Money {
  return items.reduce((acc, item) => add(acc, item), money(0, currency));
}

/**
 * Integer percentage of `part` in `whole`, rounded half up. Used for budget progress.
 * Returns 0 when whole is 0.
 */
export function percentOf(part: Money, whole: Money): number {
  if (part.currency !== whole.currency) {
    throw new TypeError(`Cannot compare ${part.currency} and ${whole.currency}`);
  }
  if (whole.amountMinor === 0) return 0;
  return Math.floor((part.amountMinor * 100 * 2 + whole.amountMinor) / (whole.amountMinor * 2));
}

const SEPARATOR = ' '; // non-breaking space between thousands, as in the mockups

/**
 * Formats major units with thousands separators: 4000000 tiyin -> "40 000".
 * Drops the fraction when it is zero. Currency labels are added by the UI per locale.
 */
export function formatMajor(value: Money, opts: { signed?: boolean } = {}): string {
  const per = MINOR_PER_MAJOR[value.currency];
  const abs = Math.abs(value.amountMinor);
  const whole = Math.floor(abs / per);
  const fraction = abs % per;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATOR);
  const body = fraction === 0 ? grouped : `${grouped},${fraction.toString().padStart(2, '0')}`;
  if (value.amountMinor < 0) return `−${body}`;
  if (opts.signed && value.amountMinor > 0) return `+${body}`;
  return body;
}
