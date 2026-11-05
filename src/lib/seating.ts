import type { PriceTier, Seat, SeatClaim } from './types';

/**
 * House layout for the main auditorium (former Butler High School Theatre).
 * Three orchestra sections (house-left, center, house-right) split by two aisles.
 * The owner can tune rows/section widths here to match the real seat chart.
 */
export const HOUSE = {
  rows: 'ABCDEFGHIJKLMNOP'.split(''),
  sectionWidths: { L: 7, C: 14, R: 7 } as Record<'L' | 'C' | 'R', number>,
  premiumRows: ['C', 'D', 'E', 'F', 'G', 'H'],
  valueRows: ['N', 'O', 'P'],
  /** wheelchair-accessible spaces (with companion seats beside them) */
  accessibleSeats: ['P-C1', 'P-C2', 'P-C13', 'P-C14', 'P-L1', 'P-R7'],
};

export const TIER_LABEL: Record<PriceTier, string> = {
  premium: 'Premium',
  standard: 'Standard',
  value: 'Value',
  accessible: 'Accessible',
};

export const HOLD_MINUTES = 8;

let cachedLayout: Seat[] | null = null;

export function buildLayout(): Seat[] {
  if (cachedLayout) return cachedLayout;
  const seats: Seat[] = [];
  for (const row of HOUSE.rows) {
    for (const section of ['L', 'C', 'R'] as const) {
      const width = HOUSE.sectionWidths[section];
      for (let i = 0; i < width; i++) {
        const number = i + 1;
        const id = `${row}-${section}${number}`;
        const accessible = HOUSE.accessibleSeats.includes(id);
        let tier: PriceTier = 'standard';
        if (accessible) tier = 'accessible';
        else if (HOUSE.valueRows.includes(row)) tier = 'value';
        else if (section === 'C' && HOUSE.premiumRows.includes(row)) tier = 'premium';
        seats.push({ id, row, section, number, tier, accessible, index: i });
      }
    }
  }
  cachedLayout = seats;
  return seats;
}

export function seatById(id: string): Seat | undefined {
  return buildLayout().find((s) => s.id === id);
}

export function seatLabel(id: string): string {
  const s = seatById(id);
  if (!s) return id;
  const sec = s.section === 'C' ? 'Center' : s.section === 'L' ? 'House Left' : 'House Right';
  return `Row ${s.row} · ${sec} ${s.number}`;
}

export type Availability = 'available' | 'mine' | 'held' | 'sold' | 'blocked';

/** Effective status of a seat at time `now` for viewer `holderId`. Expired holds count as available. */
export function seatAvailability(
  claims: Record<string, SeatClaim>,
  seatId: string,
  holderId: string | undefined,
  now: Date = new Date(),
): Availability {
  const c = claims[seatId];
  if (!c) return 'available';
  if (c.status === 'sold' || c.status === 'comp') return 'sold';
  if (c.status === 'blocked') return 'blocked';
  // held
  if (c.holdExpiresAt && new Date(c.holdExpiresAt).getTime() <= now.getTime()) return 'available';
  if (holderId && c.holderId === holderId) return 'mine';
  return 'held';
}

export class SeatUnavailableError extends Error {
  constructor(public seatIds: string[]) {
    super(`Sorry — ${seatIds.length === 1 ? 'seat' : 'seats'} ${seatIds.join(', ')} ${seatIds.length === 1 ? 'was' : 'were'} just taken.`);
    this.name = 'SeatUnavailableError';
  }
}

/** Drop holds that have expired. Returns a new claims object. */
export function releaseExpired(claims: Record<string, SeatClaim>, now: Date = new Date()): Record<string, SeatClaim> {
  const next: Record<string, SeatClaim> = {};
  for (const [id, c] of Object.entries(claims)) {
    if (c.status === 'held' && c.holdExpiresAt && new Date(c.holdExpiresAt).getTime() <= now.getTime()) continue;
    next[id] = c;
  }
  return next;
}

/**
 * Place a temporary hold on seats while the buyer checks out.
 * Fails atomically if any seat is sold, blocked, or held by someone else.
 */
export function holdSeats(
  claims: Record<string, SeatClaim>,
  seatIds: string[],
  holderId: string,
  now: Date = new Date(),
  minutes = HOLD_MINUTES,
): Record<string, SeatClaim> {
  const taken = seatIds.filter((id) => {
    const a = seatAvailability(claims, id, holderId, now);
    return a !== 'available' && a !== 'mine';
  });
  if (taken.length) throw new SeatUnavailableError(taken);
  const expires = new Date(now.getTime() + minutes * 60000).toISOString();
  const next = releaseExpired(claims, now);
  for (const id of seatIds) next[id] = { status: 'held', holderId, holdExpiresAt: expires };
  return next;
}

export function releaseHolds(claims: Record<string, SeatClaim>, holderId: string, seatIds?: string[]): Record<string, SeatClaim> {
  const next: Record<string, SeatClaim> = {};
  for (const [id, c] of Object.entries(claims)) {
    const mine = c.status === 'held' && c.holderId === holderId && (!seatIds || seatIds.includes(id));
    if (!mine) next[id] = c;
  }
  return next;
}

/**
 * Convert seats to sold/comp. This is the "auto block": once sold, a seat can never be
 * selected, held or sold again until the ticket is refunded. Atomic — all or nothing.
 */
export function commitSale(
  claims: Record<string, SeatClaim>,
  seatIds: string[],
  holderId: string,
  orderId: string,
  now: Date = new Date(),
  status: 'sold' | 'comp' = 'sold',
): Record<string, SeatClaim> {
  if (new Set(seatIds).size !== seatIds.length) throw new Error('Duplicate seats in order');
  const taken = seatIds.filter((id) => {
    if (!seatById(id)) return true;
    const a = seatAvailability(claims, id, holderId, now);
    return a !== 'available' && a !== 'mine';
  });
  if (taken.length) throw new SeatUnavailableError(taken);
  const next = releaseExpired(claims, now);
  for (const id of seatIds) next[id] = { status, orderId };
  return next;
}

/** Free seats (refund / void). */
export function releaseSeats(claims: Record<string, SeatClaim>, seatIds: string[]): Record<string, SeatClaim> {
  const next = { ...claims };
  for (const id of seatIds) delete next[id];
  return next;
}

/** Owner tool: block or unblock seats (house seats, sound board, broken seat...). */
export function setBlocked(claims: Record<string, SeatClaim>, seatIds: string[], blocked: boolean, note?: string) {
  const next = { ...claims };
  for (const id of seatIds) {
    const c = next[id];
    if (blocked) {
      if (c && (c.status === 'sold' || c.status === 'comp')) continue; // never override a sale
      next[id] = { status: 'blocked', note };
    } else if (c?.status === 'blocked') {
      delete next[id];
    }
  }
  return next;
}

/**
 * Returns seat ids that would be left as a single stranded empty seat between taken
 * seats (or a taken seat and the aisle) if `selection` were purchased. Venues avoid
 * these because they almost never sell.
 */
export function orphanedSeats(
  claims: Record<string, SeatClaim>,
  selection: string[],
  holderId: string | undefined,
  now: Date = new Date(),
): string[] {
  const sel = new Set(selection);
  const orphans = new Set<string>();
  const touched = new Set<string>();
  for (const id of selection) {
    const s = seatById(id);
    if (s) touched.add(`${s.row}-${s.section}`);
  }
  for (const key of touched) {
    const [row, section] = key.split('-');
    const block = buildLayout().filter((s) => s.row === row && s.section === section);
    const occupied = block.map((s) => sel.has(s.id) || seatAvailability(claims, s.id, holderId, now) !== 'available');
    for (let i = 0; i < block.length; i++) {
      if (occupied[i]) continue;
      const leftWall = i === 0 || occupied[i - 1];
      const rightWall = i === block.length - 1 || occupied[i + 1];
      const nextToSelection = sel.has(block[i - 1]?.id) || sel.has(block[i + 1]?.id);
      if (leftWall && rightWall && nextToSelection) orphans.add(block[i].id);
    }
  }
  return [...orphans];
}

/**
 * "Best available": find `count` side-by-side seats, preferring center section,
 * rows closest to the sweet spot (row F), and seats near the middle of the block.
 */
export function bestAvailable(
  claims: Record<string, SeatClaim>,
  count: number,
  holderId: string | undefined,
  now: Date = new Date(),
  opts: { tier?: PriceTier; accessible?: boolean } = {},
): string[] | null {
  const layout = buildLayout();
  const sweetRow = HOUSE.rows.indexOf('F');
  let best: { ids: string[]; score: number } | null = null;
  for (const row of HOUSE.rows) {
    for (const section of ['C', 'L', 'R'] as const) {
      const block = layout.filter((s) => s.row === row && s.section === section);
      for (let i = 0; i + count <= block.length; i++) {
        const run = block.slice(i, i + count);
        const ok = run.every((s) => {
          if (opts.tier && s.tier !== opts.tier) return false;
          if (opts.accessible !== undefined && !opts.accessible && s.accessible) return false;
          const a = seatAvailability(claims, s.id, holderId, now);
          return a === 'available' || a === 'mine';
        });
        if (!ok) continue;
        const rowDist = Math.abs(HOUSE.rows.indexOf(row) - sweetRow);
        const mid = (block.length - 1) / 2;
        const runMid = i + (count - 1) / 2;
        const sectionPenalty = section === 'C' ? 0 : 6;
        let score = rowDist * 2 + Math.abs(runMid - mid) + sectionPenalty;
        if (orphanedSeats(claims, run.map((s) => s.id), holderId, now).length) score += 4;
        if (!best || score < best.score) best = { ids: run.map((s) => s.id), score };
      }
    }
  }
  return best?.ids ?? null;
}

export function seatsAreTogether(seatIds: string[]): boolean {
  if (seatIds.length < 2) return true;
  const seats = seatIds.map(seatById).filter(Boolean) as Seat[];
  const { row, section } = seats[0];
  if (!seats.every((s) => s.row === row && s.section === section)) return false;
  const idx = seats.map((s) => s.index).sort((a, b) => a - b);
  return idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
}

export function priceFor(seatId: string, prices: Record<PriceTier, number>): number {
  const s = seatById(seatId);
  return s ? prices[s.tier] : 0;
}

export const TICKET_FEE = 1.5; // per-ticket service fee

export function orderTotals(seatIds: string[], prices: Record<PriceTier, number>, feePerTicket = TICKET_FEE) {
  const subtotal = seatIds.reduce((sum, id) => sum + priceFor(id, prices), 0);
  const fees = +(seatIds.length * feePerTicket).toFixed(2);
  return { subtotal, fees, total: +(subtotal + fees).toFixed(2) };
}

export function salesSummary(claims: Record<string, SeatClaim>, now: Date = new Date()) {
  const capacity = buildLayout().length;
  let sold = 0, comp = 0, blocked = 0, held = 0;
  for (const id of Object.keys(claims)) {
    const a = seatAvailability(claims, id, undefined, now);
    const c = claims[id];
    if (c.status === 'sold') sold++;
    else if (c.status === 'comp') comp++;
    else if (a === 'blocked') blocked++;
    else if (a === 'held') held++;
  }
  const available = capacity - sold - comp - blocked - held;
  return { capacity, sold, comp, blocked, held, available, sellable: capacity - blocked };
}

