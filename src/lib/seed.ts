import { addDays, dayKey, localIso, startOfDay } from './dates';
import { ticketCode } from './ids';
import { quoteRental } from './pricing';
import { buildLayout, orderTotals, priceFor } from './seating';
import type {
  Booking,
  Channel,
  MemberConflict,
  Message,
  Order,
  Performance,
  PriceTier,
  Production,
  RentalSettings,
  ScheduleItem,
  SeatClaim,
  Ticket,
  User,
  VenueInfo,
} from './types';

export const VENUE: VenueInfo = {
  name: 'The Dream Theatre',
  ownerName: 'Theatre Owner',
  address: '3401 Holmes Ave NW, Suite B, Huntsville, AL 35816',
  phone: '(256) 361-9033',
  email: 'info@thedreamtheatre.com',
  tagline: 'Creating memories, one dream at a time.',
};

/** Sample rates — the owner edits all of these in Settings → Rental rates. */
export const DEFAULT_SETTINGS: RentalSettings = {
  hourlyRate: 150,
  minHours: 3,
  packages: [
    { id: 'pkg_rehearsal', name: 'Rehearsal Block', hours: 4, price: 450, description: 'Stage + house lights, work lights, no audience.' },
    { id: 'pkg_half', name: 'Half-Day Event', hours: 6, price: 850, description: 'Load-in, show and load-out for a single performance.' },
    { id: 'pkg_full', name: 'Full-Day Event', hours: 12, price: 1500, description: 'Tech/dress plus performance(s) in one day.' },
    { id: 'pkg_weekend', name: 'Show Weekend', hours: 54, price: 3600, description: 'Friday noon through Sunday night. Ideal for recitals & musicals.' },
  ],
  addOns: [
    { id: 'add_sound', name: 'Sound technician', price: 35, per: 'hour', description: 'House engineer runs the board & mics.' },
    { id: 'add_light', name: 'Lighting technician', price: 35, per: 'hour', description: 'Programs and runs the lighting console.' },
    { id: 'add_tickets', name: 'Box office & assigned-seat ticketing', price: 150, per: 'flat', description: 'Sell reserved seats through the Dream Theatre app.' },
    { id: 'add_lobby', name: 'Lobby & concessions area', price: 125, per: 'flat', description: 'Tables, merch & concessions setup.' },
    { id: 'add_green', name: 'Green room & dressing rooms', price: 100, per: 'flat', description: 'Mirrors, racks and backstage restrooms.' },
    { id: 'add_piano', name: 'Piano (tuned)', price: 125, per: 'flat', description: 'Tuned the day of your event.' },
    { id: 'add_clean', name: 'Post-event cleaning', price: 175, per: 'flat', description: 'We handle the house & lobby clean-up.' },
  ],
  depositPercent: 0.5,
  securityDeposit: 250,
  bufferMins: 60,
  balanceDueDays: 14,
  holdHours: 72,
  autoApprove: false,
  ticketFee: 1.5,
  cancellationPolicy:
    'Reservation deposits are non-refundable within 30 days of the event. Cancellations made 30+ days out receive a 50% refund of the reservation deposit. The security deposit is refunded within 7 days after the event, less any damages or overtime.',
};

const COLORS = ['#E8B04B', '#E26D5C', '#7FB7BE', '#9B8DE3', '#6CC596', '#F08FC0', '#5DA9E9', '#F2C14E', '#C3A6FF', '#82D2A5'];

export const OWNER_ID = 'u_owner';
export const RENTER_ID = 'u_renter';
export const MEMBER_ID = 'u_maya';

function person(id: string, name: string, role: User['role'], i: number, phone?: string): User {
  const email = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '') + '@example.com';
  return { id, name, email, role, color: COLORS[i % COLORS.length], phone };
}

/** Tiny deterministic PRNG so demo seat sales look the same every reset. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedData {
  users: User[];
  bookings: Booking[];
  productions: Production[];
  schedule: ScheduleItem[];
  conflicts: MemberConflict[];
  channels: Channel[];
  messages: Message[];
  performances: Performance[];
  orders: Order[];
  tickets: Ticket[];
}

export function buildSeed(now: Date = new Date()): SeedData {
  const S = DEFAULT_SETTINGS;
  const users: User[] = [
    { id: OWNER_ID, name: VENUE.ownerName, email: VENUE.email, phone: VENUE.phone, role: 'owner', color: '#E8B04B' },
    person(RENTER_ID, 'Jordan Ellis', 'renter', 1, '(256) 555-0142'),
    person('u_hb', 'Huntsville Ballet (Box Office)', 'renter', 2),
    person('u_adonai', 'Adonai School of Ballet', 'renter', 3),
    person('u_reddick', 'No Fear Tour Production', 'renter', 4),
  ];

  const cast: [string, string, string[], string][] = [
    [MEMBER_ID, 'Maya Brooks', ['g_leads'], 'Jovie'],
    ['u_caleb', 'Caleb Turner', ['g_leads'], 'Buddy the Elf'],
    ['u_grace', 'Grace Whitfield', ['g_leads'], 'Emily Hobbs'],
    ['u_marcus', 'Marcus Reed', ['g_leads'], 'Walter Hobbs'],
    ['u_eli', 'Eli Montgomery', ['g_leads', 'g_kids'], 'Michael Hobbs'],
    ['u_hannah', 'Hannah Pruitt', ['g_ensemble', 'g_dance'], 'Elf / Shopper'],
    ['u_noah', 'Noah Castillo', ['g_ensemble'], 'Santa'],
    ['u_lily', 'Lily Chen', ['g_ensemble', 'g_dance'], 'Elf / Fake Santa'],
    ['u_ava', 'Ava Simmons', ['g_kids'], 'Kid Chorus'],
    ['u_ben', 'Ben Okafor', ['g_crew'], 'Stage Manager'],
    ['u_zoe', 'Zoe Patel', ['g_crew'], 'Lights Op'],
    ['u_sam', 'Sam Driscoll', ['g_band'], 'Music Director / Keys'],
  ];
  cast.forEach(([id, name], i) => users.push(person(id, name, 'member', i + 5)));

  // ---------- Rentals (real events from thedreamtheatre.com + demo requests) ----------
  const mk = (
    id: string,
    title: string,
    eventType: Booking['eventType'],
    contact: User,
    start: string,
    end: string,
    status: Booking['status'],
    opts: Partial<Booking> & { paid?: 'none' | 'deposit' | 'full' } = {},
  ): Booking => {
    const quote = quoteRental(S, { start, end, packageId: opts.packageId, addOnIds: opts.addOnIds ?? [] });
    const payments: Booking['payments'] = [];
    const paid = opts.paid ?? (status === 'completed' ? 'full' : status === 'confirmed' ? 'deposit' : 'none');
    if (paid !== 'none') payments.push({ id: id + '_p1', amount: quote.depositDue, kind: 'deposit', method: 'card', at: addDays(new Date(start), -45).toISOString(), reference: 'Visa •••• 4242' });
    if (paid === 'full') payments.push({ id: id + '_p2', amount: quote.balanceDue, kind: 'balance', method: 'check', at: addDays(new Date(start), -15).toISOString(), reference: 'Check #1184' });
    return {
      id,
      title,
      eventType,
      organization: opts.organization ?? contact.name,
      contactName: opts.contactName ?? contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone ?? '(256) 555-0100',
      renterId: contact.id,
      start,
      end,
      attendance: opts.attendance ?? 300,
      packageId: opts.packageId,
      addOnIds: opts.addOnIds ?? [],
      notes: opts.notes,
      status,
      quote,
      payments,
      holdExpiresAt: opts.holdExpiresAt,
      createdAt: addDays(new Date(start), -60).toISOString(),
      ticketed: opts.ticketed ?? false,
      isPublic: opts.isPublic ?? true,
    };
  };
  const [hb, adonai, reddick, renter] = [users[2], users[3], users[4], users[1]];
  const uah = person('u_uah', 'UAH Charger Sounds', 'renter', 6);
  const unknown = person('u_unknown', 'The Unknown Tour', 'renter', 7);
  users.push(uah, unknown);

  const bookings: Booking[] = [
    mk('b_uah', 'UAH Wind Ensemble — [B]OLD & NEW', 'Concert', uah, localIso(2026, 10, 1, 17, 30), localIso(2026, 10, 1, 21, 30), 'completed', { packageId: 'pkg_half', addOnIds: ['add_sound'] }),
    mk('b_unknown', 'The Unknown Tour', 'Comedy', unknown, localIso(2026, 10, 3, 15, 0), localIso(2026, 10, 3, 21, 0), 'completed', { packageId: 'pkg_half', addOnIds: ['add_sound', 'add_light', 'add_lobby'] }),
    mk('b_hb', 'Huntsville Ballet — Night Songs', 'Ballet', hb, localIso(2026, 10, 23, 12, 0), localIso(2026, 10, 25, 18, 0), 'completed', { packageId: 'pkg_weekend', addOnIds: ['add_light', 'add_green', 'add_clean'], attendance: 450 }),
    mk('b_reddick', 'Jon Reddick — NO FEAR TOUR w/ Hope Darst & Roman Collins', 'Concert', reddick, localIso(2026, 11, 13, 13, 0), localIso(2026, 11, 13, 23, 0), 'confirmed', { packageId: 'pkg_full', addOnIds: ['add_sound', 'add_lobby'], attendance: 400, paid: 'full', notes: 'Bus parking on Holmes Ave side. Merch tables in lobby.' }),
    mk('b_nutcracker', 'Adonai School of Ballet — Nutcracker', 'Ballet', adonai, localIso(2026, 12, 16, 14, 0), localIso(2026, 12, 17, 22, 30), 'confirmed', { packageId: 'pkg_full', addOnIds: ['add_tickets', 'add_light', 'add_green'], attendance: 380, ticketed: true }),
    mk('b_gospel', 'Holiday Gospel Night', 'Worship / Ministry', renter, localIso(2026, 12, 5, 16, 0), localIso(2026, 12, 5, 22, 0), 'awaiting_deposit', {
      packageId: 'pkg_half', addOnIds: ['add_sound'], organization: 'Northside Community Choir', attendance: 250,
      holdExpiresAt: new Date(now.getTime() + 2 * 86400000).toISOString(), notes: 'Need 3 choir risers if available.',
    }),
    mk('b_recital', 'Winter Dance Showcase', 'Dance Recital', renter, localIso(2026, 11, 21, 12, 0), localIso(2026, 11, 21, 20, 0), 'inquiry', {
      organization: 'Rocket City Dance Collective', addOnIds: ['add_light', 'add_tickets', 'add_green'], attendance: 320,
      notes: 'Two shows: 2pm & 6pm. Would like assigned seating.', ticketed: true,
    }),
    mk('b_meeting', 'Board Retreat & Screening', 'Conference / Meeting', renter, localIso(2027, 1, 16, 9, 0), localIso(2027, 1, 16, 14, 0), 'inquiry', {
      organization: 'Valley Arts Council', addOnIds: ['add_sound'], attendance: 60, isPublic: false,
    }),
  ];
  bookings.forEach((b) => (b.createdAt = b.status === 'inquiry' ? addDays(now, -1).toISOString() : b.createdAt));

  // ---------- The owner's production ----------
  const elf: Production = {
    id: 'p_elf',
    title: 'Elf: The Musical',
    tagline: 'Experience the magic this holiday season!',
    color: '#6CC596',
    openingDate: localIso(2026, 12, 11, 19, 0),
    closingDate: localIso(2026, 12, 13, 22, 0),
    groups: [
      { id: 'g_leads', name: 'Leads', color: '#E8B04B' },
      { id: 'g_ensemble', name: 'Ensemble', color: '#7FB7BE' },
      { id: 'g_dance', name: 'Dance Corps', color: '#F08FC0' },
      { id: 'g_kids', name: 'Kids Chorus', color: '#9B8DE3' },
      { id: 'g_crew', name: 'Tech Crew', color: '#E26D5C' },
      { id: 'g_band', name: 'Pit Band', color: '#5DA9E9' },
    ],
    members: [
      { userId: OWNER_ID, groupIds: [], part: 'Director / Producer', isDirector: true },
      ...cast.map(([userId, , groupIds, part]) => ({ userId, groupIds, part })),
    ],
  };
  elf.members.find((m) => m.userId === 'u_ben')!.isDirector = true;

  const schedule: ScheduleItem[] = [];
  const rand = mulberry32(7);
  const add = (title: string, kind: ScheduleItem['kind'], start: string, end: string, space: ScheduleItem['space'], groupIds: string[], notes?: string) => {
    const rsvps: ScheduleItem['rsvps'] = {};
    const isPast = new Date(end) < now;
    for (const m of elf.members) {
      const r = rand();
      if (isPast || r < 0.55) rsvps[m.userId] = r < 0.9 ? 'yes' : 'maybe';
      else if (r < 0.62) rsvps[m.userId] = 'no';
    }
    delete rsvps[MEMBER_ID];
    schedule.push({ id: `s_${schedule.length}`, productionId: elf.id, title, kind, start, end, space, groupIds, notes, rsvps });
  };

  // Rehearsal calendar: Mon / Tue / Thu evenings + Saturday choreography until tech week.
  for (let d = new Date(2026, 9, 26); d < new Date(2026, 11, 6); d = addDays(d, 1)) {
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const wd = d.getDay();
    if (wd === 1) add('Music rehearsal', 'Music', localIso(y, m, day, 18, 30), localIso(y, m, day, 20, 30), 'Rehearsal Room', ['g_leads', 'g_ensemble', 'g_kids', 'g_band'], 'Bring scores and a pencil.');
    if (wd === 2) add('Blocking — Act ' + (day % 2 ? 'I' : 'II'), 'Blocking', localIso(y, m, day, 18, 0), localIso(y, m, day, 21, 0), 'Main Stage', ['g_leads', 'g_ensemble']);
    if (wd === 4) add('Full company run', 'Rehearsal', localIso(y, m, day, 18, 0), localIso(y, m, day, 21, 0), 'Main Stage', [], 'Off-book deadline is Nov 19!');
    if (wd === 6 && dayKey(d) !== '2026-12-05') add('Dance Corps choreography', 'Choreography', localIso(y, m, day, 10, 0), localIso(y, m, day, 12, 30), 'Rehearsal Room', ['g_dance', 'g_ensemble'], 'Character shoes + water.');
  }
  add('Production meeting', 'Meeting', localIso(2026, 11, 10, 17, 0), localIso(2026, 11, 10, 18, 0), 'Lobby', ['g_crew', 'g_band'], 'Set, props, costumes and sound check-in.');
  add('Tech: cue-to-cue', 'Tech', localIso(2026, 12, 6, 13, 0), localIso(2026, 12, 6, 21, 0), 'Main Stage', [], 'Crew call 12:00. Cast call 1:00.');
  add('Tech: run with lights & sound', 'Tech', localIso(2026, 12, 7, 18, 0), localIso(2026, 12, 7, 22, 0), 'Main Stage', []);
  add('First dress rehearsal', 'Dress', localIso(2026, 12, 8, 17, 30), localIso(2026, 12, 8, 22, 0), 'Main Stage', [], 'Full costumes & makeup. Photos at intermission.');
  add('Final dress (invited audience)', 'Dress', localIso(2026, 12, 10, 17, 30), localIso(2026, 12, 10, 22, 0), 'Main Stage', []);
  for (const day of [11, 12, 13]) add(`Call time — Performance`, 'Call Time', localIso(2026, 12, day, 17, 30), localIso(2026, 12, day, 22, 0), 'Main Stage', [], 'Sign in with the stage manager on arrival.');

  const conflicts: MemberConflict[] = [
    { id: 'c1', userId: 'u_caleb', productionId: elf.id, start: localIso(2026, 11, 17, 0, 0), end: localIso(2026, 11, 17, 23, 59), note: 'Work travel' },
    { id: 'c2', userId: 'u_ava', productionId: elf.id, start: localIso(2026, 11, 26, 0, 0), end: localIso(2026, 11, 29, 23, 59), note: 'Thanksgiving out of town' },
    { id: 'c3', userId: MEMBER_ID, productionId: elf.id, start: localIso(2026, 11, 24, 17, 0), end: localIso(2026, 11, 24, 22, 0), note: 'Choir concert' },
  ];

  const channels: Channel[] = [
    { id: 'ch_ann', productionId: elf.id, name: 'Announcements', kind: 'announcements' },
    { id: 'ch_all', productionId: elf.id, name: 'Full Company', kind: 'group' },
    ...elf.groups.map((g) => ({ id: `ch_${g.id}`, productionId: elf.id, name: g.name, kind: 'group' as const, groupId: g.id })),
    { id: 'ch_dm_maya', productionId: elf.id, name: 'Direct', kind: 'direct', memberIds: [OWNER_ID, MEMBER_ID] },
  ];
  const ago = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
  const messages: Message[] = [
    { id: 'm1', channelId: 'ch_ann', userId: OWNER_ID, text: 'Welcome to the Elf company! Rehearsal calendar is live in the Schedule tab — please RSVP to every call and submit conflicts ASAP. 🎄', at: ago(240) },
    { id: 'm2', channelId: 'ch_ann', userId: OWNER_ID, text: 'Reminder: off-book deadline is Thursday Nov 19 for Act I.', at: ago(20) },
    { id: 'm3', channelId: 'ch_all', userId: 'u_caleb', text: 'Anyone want to run lines before Thursday? I can stay after.', at: ago(30) },
    { id: 'm4', channelId: 'ch_all', userId: 'u_grace', text: "I'm in! Lobby at 9pm?", at: ago(29) },
    { id: 'm5', channelId: 'ch_all', userId: MEMBER_ID, text: 'Count me in 🙋‍♀️', at: ago(28) },
    { id: 'm6', channelId: 'ch_g_dance', userId: 'u_hannah', text: 'Video of the "Sparklejollytwinklejingley" combo is uploaded to the shared drive.', at: ago(50) },
    { id: 'm7', channelId: 'ch_g_crew', userId: 'u_ben', text: 'Need two more volunteers for set build Saturday 1–5pm.', at: ago(12) },
    { id: 'm8', channelId: 'ch_g_crew', userId: 'u_zoe', text: 'I can do it. Should I bring a drill?', at: ago(11) },
    { id: 'm9', channelId: 'ch_g_band', userId: 'u_sam', text: 'Updated vocal score for "A Christmas Song" posted. Key change in the last chorus.', at: ago(70) },
    { id: 'm10', channelId: 'ch_dm_maya', userId: OWNER_ID, text: 'Maya — great work on "Never Fall in Love" last night. Can you come 15 min early Tuesday to work the scene with Caleb?', at: ago(6) },
    { id: 'm11', channelId: 'ch_dm_maya', userId: MEMBER_ID, text: 'Absolutely, see you then!', at: ago(5) },
  ];

  // ---------- Ticketed performances ----------
  const elfPrices: Record<PriceTier, number> = { premium: 28, standard: 22, value: 15, accessible: 15 };
  const performances: Performance[] = [
    { id: 'perf_elf_1', title: 'Elf: The Musical', subtitle: 'Opening Night', productionId: elf.id, start: localIso(2026, 12, 11, 19, 0), doorsMins: 45, prices: elfPrices, onSale: true, seats: {} },
    { id: 'perf_elf_2', title: 'Elf: The Musical', productionId: elf.id, start: localIso(2026, 12, 12, 19, 0), doorsMins: 45, prices: elfPrices, onSale: true, seats: {} },
    { id: 'perf_elf_3', title: 'Elf: The Musical', subtitle: 'Closing Night', productionId: elf.id, start: localIso(2026, 12, 13, 19, 0), doorsMins: 45, prices: elfPrices, onSale: true, seats: {} },
    { id: 'perf_nut_1', title: 'Nutcracker', subtitle: 'Adonai School of Ballet', bookingId: 'b_nutcracker', start: localIso(2026, 12, 16, 18, 30), doorsMins: 30, prices: { premium: 25, standard: 20, value: 12, accessible: 12 }, onSale: true, seats: {} },
    { id: 'perf_nut_2', title: 'Nutcracker', subtitle: 'Adonai School of Ballet', bookingId: 'b_nutcracker', start: localIso(2026, 12, 17, 18, 30), doorsMins: 30, prices: { premium: 25, standard: 20, value: 12, accessible: 12 }, onSale: true, seats: {} },
  ];

  const orders: Order[] = [];
  const tickets: Ticket[] = [];
  const layout = buildLayout();
  const fill: Record<string, number> = { perf_elf_1: 0.72, perf_elf_2: 0.48, perf_elf_3: 0.35, perf_nut_1: 0.4, perf_nut_2: 0.22 };
  const buyers = ['Patel', 'Johnson', 'Nguyen', 'Garcia', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris'];
  performances.forEach((p, pi) => {
    const r = mulberry32(100 + pi);
    // house seats for the sound board
    for (const id of ['N-C6', 'N-C7', 'N-C8', 'N-C9', 'O-C6', 'O-C7', 'O-C8', 'O-C9']) p.seats[id] = { status: 'blocked', note: 'Sound board' };
    const claims: Record<string, SeatClaim> = p.seats;
    let i = 0;
    while (i < layout.length) {
      const groupSize = 1 + Math.floor(r() * 4);
      const run = layout.slice(i, i + groupSize).filter((s) => !claims[s.id]);
      // front + center sells first
      const rowBias = 1 - layout[i].row.charCodeAt(0) / 100 + (layout[i].section === 'C' ? 0.1 : -0.1);
      if (run.length && r() < fill[p.id] * (0.6 + rowBias)) {
        const ids = run.map((s) => s.id);
        const totals = orderTotals(ids, p.prices);
        const orderId = `o_${p.id}_${orders.length}`;
        const last = buyers[Math.floor(r() * buyers.length)];
        orders.push({ id: orderId, performanceId: p.id, seatIds: ids, buyerName: `${'ABCDEJKLMRST'[Math.floor(r() * 12)]}. ${last}`, buyerEmail: `${last.toLowerCase()}@example.com`, ...totals, at: addDays(startOfDay(now), -Math.floor(r() * 30)).toISOString(), method: 'card' });
        for (const id of ids) {
          claims[id] = { status: 'sold', orderId };
          tickets.push({ id: `t_${tickets.length}`, orderId, performanceId: p.id, seatId: id, code: ticketCode(r), price: priceFor(id, p.prices) });
        }
      }
      i += groupSize;
    }
  });

  // Give Maya (member persona) a pair of tickets for her family, and the renter one too.
  const giveOrder = (perfId: string, ids: string[], user: User) => {
    const p = performances.find((x) => x.id === perfId)!;
    for (const id of ids) if (p.seats[id]) delete p.seats[id];
    const totals = orderTotals(ids, p.prices);
    const orderId = `o_${user.id}_${perfId}`;
    orders.push({ id: orderId, performanceId: perfId, seatIds: ids, buyerName: user.name, buyerEmail: user.email, buyerUserId: user.id, ...totals, at: addDays(now, -3).toISOString(), method: 'card' });
    for (const id of ids) {
      p.seats[id] = { status: 'sold', orderId };
      tickets.push({ id: `t_${tickets.length}`, orderId, performanceId: perfId, seatId: id, code: ticketCode(), price: priceFor(id, p.prices) });
    }
  };
  // remove seed tickets/orders that referenced seats we reassign
  const reassign = (perfId: string, ids: string[]) => {
    for (const t of tickets) if (t.performanceId === perfId && ids.includes(t.seatId)) t.void = true;
    for (const o of orders) if (o.performanceId === perfId) o.seatIds = o.seatIds.filter((s) => !ids.includes(s));
  };
  reassign('perf_elf_2', ['E-C6', 'E-C7']);
  giveOrder('perf_elf_2', ['E-C6', 'E-C7'], users.find((u) => u.id === MEMBER_ID)!);
  reassign('perf_nut_1', ['G-C8', 'G-C9', 'G-C10']);
  giveOrder('perf_nut_1', ['G-C8', 'G-C9', 'G-C10'], renter);

  return {
    users,
    bookings,
    productions: [elf],
    schedule,
    conflicts,
    channels,
    messages,
    performances,
    orders: orders
      .filter((o) => o.seatIds.length)
      .map((o) => ({ ...o, ...orderTotals(o.seatIds, performances.find((p) => p.id === o.performanceId)!.prices) })),
    tickets: tickets.filter((t) => !t.void),
  };
}
