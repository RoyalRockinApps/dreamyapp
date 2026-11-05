/**
 * Card validation + a pluggable payment provider.
 *
 * The app ships with `DemoPaymentProvider`, which simulates a processor so the full
 * deposit/ticket flow works offline. For production, implement `PaymentProvider` with
 * Stripe (PaymentSheet via @stripe/stripe-react-native) backed by a server that creates
 * PaymentIntents — card numbers must never touch your own server. See docs/BACKEND.md.
 */

export interface CardInput {
  number: string;
  expiry: string; // MM/YY
  cvc: string;
  zip: string;
  name: string;
}

export interface ChargeResult {
  ok: boolean;
  reference?: string; // e.g. last4
  error?: string;
}

export interface PaymentProvider {
  charge(amount: number, card: CardInput, description: string): Promise<ChargeResult>;
}

export function digits(s: string) {
  return s.replace(/\D/g, '');
}

export function luhnValid(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function cardBrand(num: string): string {
  const d = digits(num);
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  if (/^6(011|5)/.test(d)) return 'Discover';
  return 'Card';
}

export function formatCardNumber(s: string) {
  return digits(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatExpiry(s: string) {
  const d = digits(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function expiryValid(exp: string, now: Date = new Date()): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(exp);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const endOfMonth = new Date(year, month, 1);
  return endOfMonth > now;
}

export function validateCard(c: CardInput, now: Date = new Date()): Partial<Record<keyof CardInput, string>> {
  const e: Partial<Record<keyof CardInput, string>> = {};
  if (!c.name.trim()) e.name = 'Name on card is required';
  if (!luhnValid(c.number)) e.number = 'Card number looks invalid';
  if (!expiryValid(c.expiry, now)) e.expiry = 'Use MM/YY, not expired';
  const cvcLen = cardBrand(c.number) === 'Amex' ? 4 : 3;
  if (digits(c.cvc).length !== cvcLen) e.cvc = `${cvcLen} digits`;
  if (digits(c.zip).length !== 5) e.zip = '5-digit ZIP';
  return e;
}

export const DemoPaymentProvider: PaymentProvider = {
  async charge(amount, card) {
    await new Promise((r) => setTimeout(r, 900));
    const d = digits(card.number);
    if (amount <= 0) return { ok: false, error: 'Nothing to charge' };
    if (d === '4000000000000002') return { ok: false, error: 'Your card was declined.' };
    return { ok: true, reference: `${cardBrand(d)} •••• ${d.slice(-4)}` };
  },
};
