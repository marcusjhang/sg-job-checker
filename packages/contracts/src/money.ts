export type Money = { currency: "SGD"; cents: number };

export function sgd(cents: number): Money {
  if (!Number.isInteger(cents)) throw new Error("Money must be integer cents");
  return { currency: "SGD", cents };
}

const MONEY_PATTERN = /^-?\d{1,12}(?:\.\d{1,2})?$/;

/** Parse a user-entered SGD amount into integer cents without floating point. */
export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,\s]/g, "").replace(/^S?\$/, "");
  if (!MONEY_PATTERN.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}S$${dollars.toLocaleString("en-SG")}.${String(remainder).padStart(2, "0")}`;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error("Currency mismatch");
  return { currency: a.currency, cents: a.cents + b.cents };
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Multiply integer cents by a rate expressed as basis points (1 bp = 0.01%).
 * Rounds half up at the cent boundary.
 */
export function applyBasisPoints(cents: number, basisPoints: number): number {
  if (!Number.isInteger(basisPoints)) throw new Error("Rate must be integer basis points");
  const product = cents * basisPoints;
  const sign = product < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(product) + 5000) / 10000);
}

export function roundDollarHalfUp(cents: number): number {
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(cents) + 50) / 100);
}

export function floorCents(cents: number): number {
  return Math.floor(cents);
}

export function parseDecimal(raw: string): { numerator: bigint; scale: number } | null {
  const match = /^-?\d{1,9}(?:\.\d{1,6})?$/.exec(raw.trim());
  if (!match) return null;
  const negative = raw.trim().startsWith("-");
  const unsigned = negative ? raw.trim().slice(1) : raw.trim();
  const [whole, fraction = ""] = unsigned.split(".");
  const numerator = BigInt(whole + fraction.padEnd(6, "0"));
  return { numerator: negative ? -numerator : numerator, scale: 6 };
}
