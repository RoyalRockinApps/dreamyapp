import { addDays, fmtDate, hoursBetween } from './dates';
import type { Booking, Quote, QuoteLine, RentalSettings } from './types';

export interface QuoteInput {
  start: string;
  end: string;
  packageId?: string;
  addOnIds: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Price a rental. With a package the package price covers its hours and any extra time
 * is billed at the hourly rate; otherwise hourly with a minimum. Hourly add-ons (techs)
 * are billed for the full booked time.
 */
export function quoteRental(settings: RentalSettings, input: QuoteInput): Quote {
  const hours = Math.max(0, round2(hoursBetween(input.start, input.end)));
  const lines: QuoteLine[] = [];
  const pkg = settings.packages.find((p) => p.id === input.packageId);

  if (pkg) {
    lines.push({ label: `${pkg.name} (${pkg.hours} hrs)`, amount: pkg.price });
    const extra = Math.max(0, hours - pkg.hours);
    if (extra > 0) lines.push({ label: `Extra time · ${extra} hrs × $${settings.hourlyRate}`, amount: round2(extra * settings.hourlyRate) });
  } else {
    const billable = Math.max(hours, settings.minHours);
    const label = billable > hours ? `Theatre rental · ${settings.minHours} hr minimum` : `Theatre rental · ${hours} hrs × $${settings.hourlyRate}`;
    lines.push({ label, amount: round2(billable * settings.hourlyRate) });
  }

  for (const id of input.addOnIds) {
    const a = settings.addOns.find((x) => x.id === id);
    if (!a) continue;
    if (a.per === 'hour') lines.push({ label: `${a.name} · ${hours} hrs × $${a.price}`, amount: round2(a.price * hours) });
    else lines.push({ label: a.name, amount: a.price });
  }

  const rentalTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const reservation = Math.ceil(rentalTotal * settings.depositPercent);
  const balanceDueDate = addDays(new Date(input.start), -settings.balanceDueDays).toISOString();
  return {
    lines,
    rentalTotal,
    securityDeposit: settings.securityDeposit,
    depositDue: reservation + settings.securityDeposit,
    balanceDue: round2(rentalTotal - reservation),
    balanceDueDate,
    hours,
  };
}

export function amountPaid(b: Booking): number {
  return round2(b.payments.reduce((s, p) => s + p.amount, 0));
}

/** Everything the renter owes in total (rental + refundable security deposit). */
export function grandTotal(b: Booking): number {
  return round2(b.quote.rentalTotal + b.quote.securityDeposit);
}

export function outstanding(b: Booking): number {
  return Math.max(0, round2(grandTotal(b) - amountPaid(b)));
}

export function depositPaid(b: Booking): boolean {
  return amountPaid(b) >= b.quote.depositDue;
}

export function bookingSummaryText(b: Booking, venueName: string): string {
  const paid = amountPaid(b);
  return [
    `${venueName} — ${b.title}`,
    `${fmtDate(b.start, { weekday: true, year: true })}`,
    '',
    ...b.quote.lines.map((l) => `• ${l.label}: $${l.amount.toFixed(2)}`),
    `• Refundable security deposit: $${b.quote.securityDeposit.toFixed(2)}`,
    '',
    `Due now to reserve: $${b.quote.depositDue.toFixed(2)}`,
    `Balance $${b.quote.balanceDue.toFixed(2)} due by ${fmtDate(b.quote.balanceDueDate, { year: true })}`,
    `Paid so far: $${paid.toFixed(2)}`,
  ].join('\n');
}
