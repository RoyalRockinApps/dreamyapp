// Test data: "The Ballad of Ricky Bobby", a whole production at whichever stage you choose.
//
// The run is dated around today so that today falls in the chosen stage. Everything before it is
// filled in as history (concept work, auditions and casting, rehearsals with RSVPs and attendance,
// tech, ticket sales and check-ins) and everything after it is planned.
//
// It fills an existing production (the owner's "Ballad of Ricky Bobby") when given one as `target`,
// keeping its title, tagline, pitch and its own company members; otherwise it creates its own
// ("p_rickybobby"). Every test row's id starts with "rb_" and its people have rb.*@example.com
// addresses, so it can be replaced or removed without touching anything else. See
// scripts/ricky-bobby.ts to load it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ticketCode } from '../../src/lib/ids';
import { SUGGESTED_MILESTONES } from '../../src/lib/production';
import { buildLayout, configureHouse, DEFAULT_HOUSE, orderTotals, priceFor, TICKET_FEE, type HouseConfig } from '../../src/lib/seating';
import type { PriceTier, ProductionStage, ScheduleKind, Space } from '../../src/lib/types';

export const RB_PRODUCTION = 'p_rickybobby';
export const RB_STAGES = ['concept', 'casting', 'preparation', 'tech', 'performances', 'wrap', 'completed'] as const satisfies readonly ProductionStage[];
export type RbStage = (typeof RB_STAGES)[number];
const at = (s: RbStage) => RB_STAGES.indexOf(s);

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// When: the run opens on a Friday chosen so that today sits in the stage (days from opening)
// ---------------------------------------------------------------------------------------------

/** Allowed "days since opening" for today in each stage, and the preferred one. */
const WINDOWS: Record<RbStage, [lo: number, hi: number, pref: number]> = {
  concept: [-125, -90, -110],
  casting: [-74, -66, -69], // auditions just happened; callbacks are next
  preparation: [-56, -14, -30],
  tech: [-7, -1, -4],
  performances: [0, 9, 7], // the second Friday of the run when today is a Friday: a show tonight
  wrap: [10, 23, 15],
  completed: [30, 60, 40],
};

function openingFor(stage: RbStage, now: Date): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [lo, hi, pref] = WINDOWS[stage];
  let best: { k: number; day: Date } | undefined;
  for (let k = lo; k <= hi; k++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k);
    if (day.getDay() !== 5) continue;
    if (!best || Math.abs(k - pref) < Math.abs(best.k - pref)) best = { k, day };
  }
  return best!.day;
}

// ---------------------------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------------------------

const G = {
  team: 'g_rb_team',
  leads: 'g_rb_leads',
  ensemble: 'g_rb_ensemble',
  pit: 'g_rb_pit',
  kids: 'g_rb_kids',
  crew: 'g_rb_crew',
  band: 'g_rb_band',
} as const;

const GROUPS = [
  { id: G.team, name: 'Production Team', color: '#E8B04B' },
  { id: G.leads, name: 'Leads', color: '#E26D5C' },
  { id: G.ensemble, name: 'Ensemble', color: '#7FB7BE' },
  { id: G.pit, name: 'Pit Crew Dancers', color: '#F08FC0' },
  { id: G.kids, name: 'Kids', color: '#9B8DE3' },
  { id: G.crew, name: 'Tech Crew', color: '#6CC596' },
  { id: G.band, name: 'Band', color: '#5DA9E9' },
];

interface Person {
  id: string;
  name: string;
  /** when they join the company; undefined = auditioned but wasn't cast */
  joins?: 'concept' | 'casting' | 'preparation';
  groups?: string[];
  part?: string;
  director?: boolean;
  reviewer?: boolean;
  planner?: boolean;
  leads?: string[];
  /** auditioned (has a performer profile and an application) */
  performer?: boolean;
  skills?: string[];
  credits?: { production: string; role: string; year?: string }[];
}

const PEOPLE: Person[] = [
  // production team
  { id: 'rb_dale', name: 'Dale Whitaker', joins: 'concept', groups: [G.team], part: 'Director', director: true, planner: true },
  { id: 'rb_june', name: 'June Calloway', joins: 'concept', groups: [G.team, G.band], part: 'Music Director / Keys', reviewer: true, planner: true, leads: [G.band] },
  { id: 'rb_tasha', name: 'Tasha Monroe', joins: 'concept', groups: [G.team], part: 'Choreographer', reviewer: true, leads: [G.pit] },
  { id: 'rb_omar', name: 'Omar Reyes', joins: 'concept', groups: [G.team, G.crew], part: 'Stage Manager', planner: true, leads: [G.crew] },
  { id: 'rb_beth', name: 'Beth Ann Pruitt', joins: 'concept', groups: [G.team], part: 'Producer', planner: true },
  // crew, hired during casting
  { id: 'rb_frank', name: 'Frank Bianchi', joins: 'casting', groups: [G.crew], part: 'Technical Director / Set Build' },
  { id: 'rb_priya', name: 'Priya Desai', joins: 'casting', groups: [G.crew], part: 'Lighting Designer' },
  { id: 'rb_jess', name: 'Jess Okoro', joins: 'casting', groups: [G.crew], part: 'Sound Designer' },
  { id: 'rb_rosa', name: 'Rosa Lin', joins: 'casting', groups: [G.crew], part: 'Costume Designer' },
  { id: 'rb_kenny', name: 'Kenny Moss', joins: 'casting', groups: [G.crew], part: 'Props / Assistant Stage Manager' },
  // band, at the start of rehearsals
  { id: 'rb_al', name: 'Al Turner', joins: 'preparation', groups: [G.band], part: 'Guitar' },
  { id: 'rb_bree', name: 'Bree Watts', joins: 'preparation', groups: [G.band], part: 'Bass' },
  { id: 'rb_sam', name: 'Sam Odom', joins: 'preparation', groups: [G.band], part: 'Drums' },
  // cast (auditioned; joined at the cast list)
  { id: 'rb_cody', name: 'Cody Harlan', joins: 'preparation', groups: [G.leads], part: 'Ricky Bobby', performer: true, skills: ['Baritenor', 'Comedy', 'Stage combat'], credits: [{ production: 'Footloose', role: 'Ren McCormack', year: '2025' }, { production: 'Grease', role: 'Danny Zuko', year: '2023' }] },
  { id: 'rb_wade', name: 'Wade Pickett', joins: 'preparation', groups: [G.leads], part: 'Cal Naughton Jr.', performer: true, skills: ['Tenor', 'Physical comedy'], credits: [{ production: 'The Producers', role: 'Leo Bloom', year: '2024' }] },
  { id: 'rb_luc', name: 'Luc Moreau', joins: 'preparation', groups: [G.leads], part: 'Jean Girard', performer: true, skills: ['Baritone', 'French accent', 'Jazz dance'], credits: [{ production: 'Les Misérables', role: 'Enjolras', year: '2024' }] },
  { id: 'rb_savannah', name: 'Savannah Hale', joins: 'preparation', groups: [G.leads], part: 'Carley Bobby', performer: true, skills: ['Mezzo belt', 'Tap'], credits: [{ production: 'Legally Blonde', role: 'Paulette', year: '2025' }] },
  { id: 'rb_mae', name: 'Mae Lindqvist', joins: 'preparation', groups: [G.leads], part: 'Susan', performer: true, skills: ['Soprano', 'Ballet'], credits: [{ production: 'The Music Man', role: 'Marian Paroo', year: '2023' }] },
  { id: 'rb_hank', name: 'Hank Ellison', joins: 'preparation', groups: [G.leads], part: 'Reese Bobby', performer: true, skills: ['Baritone', 'Guitar'], credits: [{ production: 'Big River', role: 'Pap Finn', year: '2022' }] },
  { id: 'rb_dolores', name: 'Dolores Vance', joins: 'preparation', groups: [G.leads], part: 'Lucy Bobby', performer: true, skills: ['Alto', 'Character work'], credits: [{ production: 'Steel Magnolias', role: 'Ouiser', year: '2024' }] },
  { id: 'rb_grady', name: 'Grady Simms', joins: 'preparation', groups: [G.leads], part: 'Chip', performer: true, skills: ['Bass', 'Comedy'], credits: [{ production: 'Annie', role: 'Daddy Warbucks', year: '2021' }] },
  { id: 'rb_earl', name: 'Earl Dupree', joins: 'preparation', groups: [G.leads], part: 'Larry Dennit Jr.', performer: true, skills: ['Baritone', 'Improv'], credits: [{ production: 'How to Succeed', role: 'J.B. Biggley', year: '2023' }] },
  { id: 'rb_tobias', name: 'Tobias Grant', joins: 'preparation', groups: [G.leads], part: 'Lucius Washington', performer: true, skills: ['Tenor', 'Hip-hop'], credits: [{ production: 'Hairspray', role: 'Seaweed', year: '2024' }] },
  { id: 'rb_nina', name: 'Nina Park', joins: 'preparation', groups: [G.ensemble, G.pit], part: 'Ensemble / Dance Captain', performer: true, skills: ['Jazz', 'Tap', 'Alto'], credits: [{ production: 'A Chorus Line', role: 'Diana', year: '2025' }] },
  { id: 'rb_ray', name: 'Ray Castillo', joins: 'preparation', groups: [G.ensemble], part: 'Ensemble / Crew Chief', performer: true, skills: ['Baritone'], credits: [{ production: 'Guys and Dolls', role: 'Ensemble', year: '2024' }] },
  { id: 'rb_lena', name: 'Lena Fox', joins: 'preparation', groups: [G.ensemble, G.kids], part: 'Ensemble / Kids Wrangler', performer: true, skills: ['Soprano'], leads: [G.kids], credits: [{ production: 'Mary Poppins', role: 'Ensemble', year: '2023' }] },
  { id: 'rb_marcus', name: 'Marcus Bell', joins: 'preparation', groups: [G.ensemble], part: 'Ensemble / Announcer', performer: true, skills: ['Tenor', 'Voice-over'], credits: [{ production: 'Into the Woods', role: 'Narrator', year: '2022' }] },
  { id: 'rb_ivy', name: 'Ivy Turner', joins: 'preparation', groups: [G.ensemble], part: 'Ensemble / Race Fan', performer: true, skills: ['Mezzo'], credits: [{ production: 'Oklahoma!', role: 'Ensemble', year: '2024' }] },
  { id: 'rb_dwight', name: 'Dwight Coleman', joins: 'preparation', groups: [G.ensemble], part: 'Ensemble / Pit Crew', performer: true, skills: ['Bass'], credits: [{ production: 'Newsies', role: 'Ensemble', year: '2023' }] },
  { id: 'rb_kayla', name: 'Kayla Brooks', joins: 'preparation', groups: [G.pit], part: 'Pit Crew Dancer', performer: true, skills: ['Hip-hop', 'Jazz'], credits: [{ production: 'Fame', role: 'Carmen', year: '2025' }] },
  { id: 'rb_jaden', name: 'Jaden Rivers', joins: 'preparation', groups: [G.pit], part: 'Pit Crew Dancer', performer: true, skills: ['Tumbling', 'Hip-hop'], credits: [{ production: 'In the Heights', role: 'Graffiti Pete', year: '2024' }] },
  { id: 'rb_sofia', name: 'Sofia Marino', joins: 'preparation', groups: [G.pit], part: 'Pit Crew Dancer', performer: true, skills: ['Ballet', 'Jazz'], credits: [{ production: 'West Side Story', role: 'Anita (understudy)', year: '2023' }] },
  { id: 'rb_trey', name: 'Trey Hollis', joins: 'preparation', groups: [G.pit], part: 'Pit Crew Dancer', performer: true, skills: ['Tap', 'Stilts'], credits: [{ production: '42nd Street', role: 'Ensemble', year: '2022' }] },
  { id: 'rb_owen', name: 'Owen Shaw', joins: 'preparation', groups: [G.kids], part: 'Walker', performer: true, skills: ['Treble'], credits: [{ production: 'Annie', role: 'Orphan chorus', year: '2025' }] },
  { id: 'rb_liam', name: 'Liam Shaw', joins: 'preparation', groups: [G.kids], part: 'Texas Ranger', performer: true, skills: ['Treble', 'Comedy'], credits: [{ production: 'Matilda', role: 'Bruce (understudy)', year: '2025' }] },
  // auditioned, not cast
  { id: 'rb_ashley', name: 'Ashley Tran', performer: true, skills: ['Mezzo', 'Jazz'], credits: [{ production: 'Chicago', role: 'Ensemble', year: '2024' }] },
  { id: 'rb_derek', name: 'Derek Vaughn', performer: true, skills: ['Baritone'], credits: [{ production: 'Godspell', role: 'Judas', year: '2023' }] },
  { id: 'rb_hailey', name: 'Hailey Sutton', performer: true, skills: ['Soprano', 'Tap'], credits: [{ production: 'Anything Goes', role: 'Hope Harcourt', year: '2022' }] },
  { id: 'rb_victor', name: 'Victor Ames', performer: true, skills: ['Tenor'], credits: [{ production: 'Spamalot', role: 'Sir Robin', year: '2024' }] },
  { id: 'rb_gina', name: 'Gina Lowe', performer: true, skills: ['Alto', 'Comedy'], credits: [{ production: 'Nunsense', role: 'Sister Hubert', year: '2023' }] },
  { id: 'rb_patrick', name: 'Patrick Doyle', performer: true, skills: ['Baritone', 'Fiddle'], credits: [{ production: 'Fiddler on the Roof', role: 'Fiddler', year: '2021' }] },
];

const COLORS = ['#E8B04B', '#E26D5C', '#7FB7BE', '#9B8DE3', '#6CC596', '#F08FC0', '#5DA9E9', '#F2C14E', '#C3A6FF', '#82D2A5'];
const emailOf = (p: Person) => `rb.${p.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`;

/** Tiny deterministic random numbers, so a stage loads the same way every time. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// The production
// ---------------------------------------------------------------------------------------------

const PITCH =
  'Our fall musical comedy follows a hotshot stock-car driver whose winning streak, marriage and best friendship all crash in one season, and the long road back to the track. Big ensemble numbers, a live five-piece band, a pit crew that dances, and a race car on stage.';

const CONCEPT = {
  premise:
    'A loud, warm-hearted comedy about winning, losing and family. Ricky Bobby has always been fast; after a wreck and a rival from France take everything, he learns to drive again with help from his estranged father and the people he left behind. Staged as a NASCAR broadcast: an announcer narrates, the pit crew is the dancing ensemble, and the race car rolls on a platform.',
  audience: 'Families and teens; racing fans; our subscriber base. PG-13 for language and slapstick.',
  performance_window: 'Two weekends, Friday to Sunday, with Sunday matinees.',
  cast_size: '18 to 22 performers, 2 children, 5-piece band',
  rough_budget: '$28,000 including rights, set and costumes',
  audition_roles: 'Ricky Bobby, Cal Naughton Jr., Jean Girard, Carley Bobby, Susan, Reese Bobby, Lucy Bobby, Chip, Larry Dennit Jr., Lucius Washington, Walker and Texas Ranger (ages 9 to 13), ensemble and pit crew dancers.',
  audition_timing: 'Auditions on one evening plus a dance call; callbacks two days later. Rehearsals Monday, Tuesday and Thursday evenings and Saturday mornings.',
  audition_preparation: 'Prepare 32 bars of a contemporary musical theatre song that shows your range and personality. Bring a headshot and a list of conflicts. Wear clothes you can move in for the dance call.',
};

const AUDITION_DETAILS = `${CONCEPT.audition_roles}\n\n${CONCEPT.audition_timing}\n\n${CONCEPT.audition_preparation}`;

const FEASIBILITY: Record<'concept' | 'later', Row[]> = {
  concept: [
    { item: 'rights', status: 'working', assignee_id: 'rb_beth', days: -120, notes: 'Licensing request sent; the agent expects to answer within two weeks.' },
    { item: 'venue', status: 'ready', assignee_id: 'rb_dale', days: -112, notes: 'Main Stage held for both weekends, plus load-in the week before.' },
    { item: 'budget', status: 'working', assignee_id: 'rb_beth', days: -112, notes: 'Draft at $28k. Two sponsors interested in the race car.' },
    { item: 'staffing', status: 'open', assignee_id: 'rb_omar', days: -105, notes: 'Still need a sound designer and a costume lead.' },
    { item: 'technical', status: 'blocked', assignee_id: 'rb_omar', days: -100, notes: 'The race car needs a rolling platform that clears the wings; waiting on a quote.' },
  ],
  later: [
    { item: 'rights', status: 'ready', assignee_id: 'rb_beth', days: -120, notes: 'Licence signed for six performances.' },
    { item: 'venue', status: 'ready', assignee_id: 'rb_dale', days: -112, notes: 'Main Stage confirmed for both weekends and load-in.' },
    { item: 'budget', status: 'ready', assignee_id: 'rb_beth', days: -112, notes: 'Approved at $28,500 with two car sponsors.' },
    { item: 'staffing', status: 'ready', assignee_id: 'rb_omar', days: -105, notes: 'Full crew hired.' },
    { item: 'technical', status: 'ready', assignee_id: 'rb_omar', days: -100, notes: 'Rolling platform built off-site by Frank; fits through the scene shop door.' },
  ],
};

/** Who the review team called back, passed on, or (during casting) hasn't decided yet. */
const PASSED = ['rb_derek', 'rb_victor', 'rb_gina'];
const PENDING_IN_CASTING = ['rb_ashley', 'rb_hailey', 'rb_patrick', 'rb_ivy', 'rb_dwight', 'rb_trey', 'rb_marcus'];

const FEEDBACK: { person: string; author: string; kind: 'note' | 'role'; body: string; days: number }[] = [
  { person: 'rb_cody', author: 'rb_dale', kind: 'role', body: 'Ricky Bobby', days: -70 },
  { person: 'rb_cody', author: 'rb_june', kind: 'note', body: 'Easy top notes, great comic timing in the sides. Strong Ricky.', days: -70 },
  { person: 'rb_wade', author: 'rb_dale', kind: 'role', body: 'Cal Naughton Jr.', days: -70 },
  { person: 'rb_wade', author: 'rb_tasha', kind: 'note', body: 'Fearless with physical comedy; picked up the combination fast.', days: -69 },
  { person: 'rb_luc', author: 'rb_dale', kind: 'role', body: 'Jean Girard', days: -70 },
  { person: 'rb_luc', author: 'rb_june', kind: 'note', body: 'Rich baritone. Accent is committed without being a cartoon.', days: -70 },
  { person: 'rb_savannah', author: 'rb_june', kind: 'role', body: 'Carley Bobby', days: -70 },
  { person: 'rb_mae', author: 'rb_june', kind: 'note', body: 'Lovely legit soprano. Read Susan with real warmth.', days: -70 },
  { person: 'rb_hank', author: 'rb_dale', kind: 'note', body: 'Played his own guitar for the song. Reese Bobby for sure.', days: -70 },
  { person: 'rb_nina', author: 'rb_tasha', kind: 'note', body: 'Strongest dancer in the room. Dance captain?', days: -69 },
  { person: 'rb_kayla', author: 'rb_tasha', kind: 'note', body: 'Sharp, clean hip-hop; great energy for the pit crew number.', days: -69 },
  { person: 'rb_derek', author: 'rb_june', kind: 'note', body: 'Good voice, but conflicts with most Tuesday rehearsals.', days: -70 },
  { person: 'rb_owen', author: 'rb_dale', kind: 'role', body: 'Walker', days: -70 },
  { person: 'rb_liam', author: 'rb_dale', kind: 'role', body: 'Texas Ranger', days: -70 },
];

// ---------------------------------------------------------------------------------------------
// Board cards, by the stage they belong to
// ---------------------------------------------------------------------------------------------

interface Card {
  id: string;
  stage: Exclude<RbStage, 'completed'>;
  title: string;
  notes?: string;
  group?: string;
  assignee: string;
  created: number; // days from opening
  due: number;
  /** status while its own stage is the current one */
  during: 'not_started' | 'in_progress' | 'completed';
  updates?: { by: string; body: string; days: number }[];
}

const CARDS: Card[] = [
  { id: 'rb_k_rights', stage: 'concept', title: 'Secure performance rights', assignee: 'rb_beth', created: -126, due: -120, during: 'in_progress', updates: [{ by: 'rb_beth', body: 'Application sent with our dates and house size.', days: -124 }, { by: 'rb_beth', body: 'Licence agreement signed; scripts and scores ship next month.', days: -118 }] },
  { id: 'rb_k_budget', stage: 'concept', title: 'Draft the production budget', assignee: 'rb_beth', created: -125, due: -112, during: 'in_progress', updates: [{ by: 'rb_beth', body: 'First draft is up on the shared drive. Set is the big unknown.', days: -115 }] },
  { id: 'rb_k_dates', stage: 'concept', title: 'Hold the theatre dates', assignee: 'rb_dale', created: -126, due: -112, during: 'completed', updates: [{ by: 'rb_dale', body: 'Both weekends and load-in week are on the calendar.', days: -121 }] },
  { id: 'rb_k_team', stage: 'concept', title: 'Hire sound and costume designers', assignee: 'rb_omar', created: -122, due: -100, during: 'not_started' },
  { id: 'rb_k_car', stage: 'concept', title: 'Get quotes for the rolling race car platform', notes: 'Must clear the wings (11 ft) and carry two actors.', assignee: 'rb_omar', created: -120, due: -98, during: 'in_progress', updates: [{ by: 'rb_omar', body: 'One quote back at $3,200. Waiting on the second.', days: -105 }] },

  { id: 'rb_k_notice', stage: 'casting', title: 'Post the audition notice', assignee: 'rb_dale', created: -86, due: -84, during: 'completed', updates: [{ by: 'rb_dale', body: 'Posted in the app, on the website and with the arts council.', days: -84 }] },
  { id: 'rb_k_accomp', stage: 'casting', title: 'Book an audition accompanist', assignee: 'rb_june', created: -84, due: -72, during: 'completed', updates: [{ by: 'rb_june', body: 'Booked; she can stay for callbacks too.', days: -78 }] },
  { id: 'rb_k_combo', stage: 'casting', title: 'Teach-ready dance call combination', group: G.pit, assignee: 'rb_tasha', created: -82, due: -70, during: 'completed', updates: [{ by: 'rb_tasha', body: '32 counts of the pit stop number, with an easier version for actors.', days: -74 }] },
  { id: 'rb_k_sides', stage: 'casting', title: 'Print audition sides and sign-in sheets', group: G.crew, assignee: 'rb_omar', created: -80, due: -71, during: 'completed' },
  { id: 'rb_k_castlist', stage: 'casting', title: 'Post the cast list', assignee: 'rb_dale', created: -70, due: -66, during: 'in_progress', updates: [{ by: 'rb_dale', body: 'Callback list is set. Final decisions after Wednesday.', days: -69 }] },

  { id: 'rb_k_carbuild', stage: 'preparation', title: 'Build the race car set piece', group: G.crew, assignee: 'rb_frank', created: -60, due: -10, during: 'in_progress', notes: 'Rolling platform, steering wheel that lights up, sponsor decals.', updates: [{ by: 'rb_frank', body: 'Frame welded. Platform rolls; brakes next.', days: -40 }, { by: 'rb_frank', body: 'Decals arrived from both sponsors.', days: -22 }] },
  { id: 'rb_k_plot', stage: 'preparation', title: 'Finalize the lighting plot', group: G.crew, assignee: 'rb_priya', created: -58, due: -14, during: 'in_progress', updates: [{ by: 'rb_priya', body: 'Race sequence chase effect is programmed in the previz.', days: -28 }] },
  { id: 'rb_k_engine', stage: 'preparation', title: 'Engine and crowd sound effects', group: G.crew, assignee: 'rb_jess', created: -56, due: -12, during: 'not_started' },
  { id: 'rb_k_fittings', stage: 'preparation', title: 'Costume fittings for the leads', group: G.crew, assignee: 'rb_rosa', created: -55, due: -21, during: 'in_progress', updates: [{ by: 'rb_rosa', body: 'Fire suits ordered. Fittings sign-up is in the Leads chat.', days: -35 }] },
  { id: 'rb_k_finale', stage: 'preparation', title: 'Teach the finale choreography', group: G.pit, assignee: 'rb_tasha', created: -50, due: -20, during: 'in_progress', updates: [{ by: 'rb_tasha', body: 'Ensemble has it; adding the kids on Saturday.', days: -24 }] },
  { id: 'rb_k_charts', stage: 'preparation', title: 'Band charts in the pit binders', group: G.band, assignee: 'rb_june', created: -60, due: -45, during: 'completed', updates: [{ by: 'rb_june', body: 'All charts printed and in binders. Key change in the finale marked.', days: -47 }] },
  { id: 'rb_k_program', stage: 'preparation', title: 'Program bios and sponsor ads', assignee: 'rb_beth', created: -45, due: -10, during: 'not_started', notes: 'Bios 50 words max. Ads due from both sponsors.' },
  { id: 'rb_k_props', stage: 'preparation', title: 'Props list: trophies, helmets, the cougar cage', group: G.crew, assignee: 'rb_kenny', created: -52, due: -14, during: 'in_progress' },

  { id: 'rb_k_focus', stage: 'tech', title: 'Hang and focus lights', group: G.crew, assignee: 'rb_priya', created: -8, due: -6, during: 'completed', updates: [{ by: 'rb_priya', body: 'Focus done. Two movers need new lamps before dress.', days: -6 }] },
  { id: 'rb_k_cuesheet', stage: 'tech', title: 'Calling script and cue sheets', group: G.crew, assignee: 'rb_omar', created: -9, due: -5, during: 'in_progress', updates: [{ by: 'rb_omar', body: '214 cues. Race sequence still needs timing.', days: -5 }] },
  { id: 'rb_k_quickchange', stage: 'tech', title: 'Quick-change booth stage left', group: G.crew, assignee: 'rb_rosa', created: -7, due: -3, during: 'not_started' },
  { id: 'rb_k_mics', stage: 'tech', title: 'Mic plot and spare packs', group: G.crew, assignee: 'rb_jess', created: -7, due: -4, during: 'in_progress' },

  { id: 'rb_k_house', stage: 'performances', title: 'Front-of-house volunteer schedule', assignee: 'rb_beth', created: -10, due: -1, during: 'completed', updates: [{ by: 'rb_beth', body: 'Ushers and concessions covered for all six shows.', days: -3 }] },
  { id: 'rb_k_photos', stage: 'performances', title: 'Production photos at the Saturday show', assignee: 'rb_dale', created: -2, due: 1, during: 'in_progress' },
  { id: 'rb_k_brokenwheel', stage: 'performances', title: 'Fix the race car steering wheel light', group: G.crew, assignee: 'rb_frank', created: 1, due: 6, during: 'not_started', notes: 'Flickered in the Act II race on opening night.' },

  { id: 'rb_k_strike', stage: 'wrap', title: 'Strike the set', group: G.crew, assignee: 'rb_frank', created: 8, due: 10, during: 'completed', updates: [{ by: 'rb_frank', body: 'Car is stored in the scene shop. Stage is clear.', days: 10 }] },
  { id: 'rb_k_returns', stage: 'wrap', title: 'Return the rented costumes and scripts', group: G.crew, assignee: 'rb_rosa', created: 10, due: 16, during: 'in_progress', updates: [{ by: 'rb_rosa', body: 'Costumes shipped. Scripts still coming in from the ensemble.', days: 12 }] },
  { id: 'rb_k_royalty', stage: 'wrap', title: 'File the royalty report', assignee: 'rb_beth', created: 10, due: 23, during: 'not_started' },
  { id: 'rb_k_thanks', stage: 'wrap', title: 'Thank-you notes to sponsors and volunteers', assignee: 'rb_dale', created: 10, due: 20, during: 'not_started' },
];

// ---------------------------------------------------------------------------------------------
// Chat, by when it was posted (days from opening)
// ---------------------------------------------------------------------------------------------

const MESSAGES: { ch: string; by: string; days: number; hour: number; body: string }[] = [
  { ch: 'team', by: 'rb_dale', days: -125, hour: 19, body: 'Welcome aboard, team. Kickoff meeting is on the schedule; bring your wish lists.' },
  { ch: 'team', by: 'rb_beth', days: -119, hour: 10, body: 'Rights are signed! We are officially doing this.' },
  { ch: 'team', by: 'rb_omar', days: -104, hour: 16, body: 'Car platform quote is in the team folder. It is the biggest single line in the budget.' },
  { ch: 'ann', by: 'rb_dale', days: -84, hour: 11, body: 'Auditions are open! Sign up in the app, prepare 32 bars, and wear shoes you can move in.' },
  { ch: 'team', by: 'rb_june', days: -71, hour: 21, body: 'Accompanist confirmed for both nights. Sides are printed.' },
  { ch: 'team', by: 'rb_tasha', days: -69, hour: 22, body: 'Dance call notes are in the review cards. Nina and Kayla were standouts.' },
  { ch: 'team', by: 'rb_dale', days: -68, hour: 22, body: 'Great callbacks. Let us lock the cast list tomorrow night.' },
  { ch: 'ann', by: 'rb_dale', days: -63, hour: 10, body: 'Welcome to the company of {title}! The full rehearsal calendar is in Schedule. Please RSVP to every call and add your conflicts this week.' },
  { ch: 'all', by: 'rb_cody', days: -63, hour: 22, body: 'Great read-through, everybody. This is going to be a blast.' },
  { ch: 'all', by: 'rb_wade', days: -63, hour: 22, body: 'I cannot stop laughing at the dinner scene.' },
  { ch: 'leads', by: 'rb_rosa', days: -36, hour: 12, body: 'Fitting sign-ups are open for Saturday. Fire suits need exact measurements, so please come.' },
  { ch: 'leads', by: 'rb_savannah', days: -36, hour: 13, body: 'Signed up for 10:30.' },
  { ch: 'pit', by: 'rb_tasha', days: -33, hour: 20, body: 'Video of the pit stop combo is in the shared folder. Know counts 1 to 64 by Saturday.' },
  { ch: 'pit', by: 'rb_nina', days: -33, hour: 21, body: 'I will run it with anyone who wants to stay after Thursday.' },
  { ch: 'ann', by: 'rb_dale', days: -30, hour: 9, body: 'Off-book for Act I is this Thursday. Scripts down, call for line from Omar.' },
  { ch: 'crew', by: 'rb_frank', days: -27, hour: 18, body: 'Need three volunteers for set build Saturday afternoon. Pizza provided.' },
  { ch: 'crew', by: 'rb_kenny', days: -27, hour: 19, body: 'I can come at 1.' },
  { ch: 'band', by: 'rb_june', days: -25, hour: 21, body: 'New finale chart is up. Note the key change at bar 112.' },
  { ch: 'kids', by: 'rb_lena', days: -22, hour: 17, body: 'Parents: kids are called at 6:00 on Monday for the dinner scene. Pickup at 8:30.' },
  { ch: 'all', by: 'rb_omar', days: -15, hour: 22, body: 'Tonight was the first full run with the car. It rolls, it lights up, nobody got hurt. Proud of you all.' },
  { ch: 'ann', by: 'rb_dale', days: -7, hour: 9, body: 'Tech week! Load-in today, cue-to-cue Sunday at noon. Bring snacks, patience and a book.' },
  { ch: 'crew', by: 'rb_priya', days: -6, hour: 23, body: 'Focus is done. Two movers need lamps; I have spares in the booth.' },
  { ch: 'ann', by: 'rb_omar', days: -3, hour: 16, body: 'First dress tonight: full costumes and makeup, call at 5:30.' },
  { ch: 'ann', by: 'rb_dale', days: 0, hour: 12, body: 'Opening night! Call is 5:30. Break legs, everyone.' },
  { ch: 'all', by: 'rb_cody', days: 0, hour: 23, body: 'What a crowd. Thank you all.' },
  { ch: 'crew', by: 'rb_frank', days: 1, hour: 10, body: 'Steering wheel light flickered in the Act II race. Fixing it before tonight.' },
  { ch: 'ann', by: 'rb_dale', days: 7, hour: 10, body: 'Second weekend! Saturday is nearly sold out; tell friends to come Friday or Sunday.' },
  { ch: 'ann', by: 'rb_dale', days: 10, hour: 9, body: 'Thank you for an amazing run. Strike is tonight at 6; many hands make it quick.' },
  { ch: 'all', by: 'rb_wade', days: 10, hour: 23, body: 'Going to miss this crew. Same time next year?' },
  { ch: 'ann', by: 'rb_beth', days: 16, hour: 11, body: 'Please return scripts to the box outside the green room by Friday.' },
  { ch: 'ann', by: 'rb_dale', days: 23, hour: 18, body: 'Company debrief tonight in the lobby. Bring your notes and your favorite moment.' },
  { ch: 'dm', by: 'rb_dale', days: -20, hour: 21, body: 'Cody, your big number is landing. Can you come 15 minutes early Tuesday to work the restaurant scene?' },
  { ch: 'dm', by: 'rb_cody', days: -20, hour: 21, body: 'Absolutely, see you then.' },
];

/** When the director moved the show on (days from opening, hour). */
const STAGE_CHANGES: Record<Exclude<RbStage, 'concept'>, [number, number]> = {
  casting: [-84, 10],
  preparation: [-63, 9],
  tech: [-7, 8],
  performances: [0, 8],
  wrap: [10, 8],
  completed: [24, 10],
};

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

export interface RbOptions {
  stage: RbStage;
  now?: Date;
  /** the live seating chart and service fee */
  house?: HouseConfig;
  ticketFee?: number;
  /** person ids whose chat reads should be set (so only recent messages show as unread) */
  readers?: string[];
  /** an existing production to fill (its title, tagline, pitch and own members are kept) */
  target?: { id: string; title: string };
}

export function rickyBobbyRows({ stage, now = new Date(), house = DEFAULT_HOUSE, ticketFee = TICKET_FEE, readers = [], target }: RbOptions) {
  const pid = target?.id ?? RB_PRODUCTION;
  const title = target?.title ?? 'The Ballad of Ricky Bobby';
  const rand = mulberry32(2026);
  const cur = at(stage);
  const O = openingFor(stage, now);
  const day = (d: number, h = 0, m = 0) => new Date(O.getFullYear(), O.getMonth(), O.getDate() + d, h, m);
  const iso = (d: Date) => d.toISOString();
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const past = (d: Date) => d.getTime() <= now.getTime();
  const notAfterNow = (d: Date) => (past(d) ? d : new Date(now.getTime() - 15 * 60_000));
  const C = 9; // closing Sunday, days from opening
  const joined = (p: Person) => !!p.joins && at(p.joins) <= cur;
  // people appear once they're part of the story: the company as it forms, performers when auditions open
  const present = PEOPLE.filter((p) => joined(p) || (p.performer && cur >= at('casting')));
  const members = PEOPLE.filter(joined);
  const memberIds = new Set(members.map((p) => p.id));
  const isDirector = new Set(members.filter((p) => p.director).map((p) => p.id));

  // ---------- people ----------
  let tick = day(-130).getTime();
  const stamp = () => new Date((tick += 1000)).toISOString();
  const people: Row[] = present.map((p) => ({ p, i: PEOPLE.indexOf(p) })).map(({ p, i }) => ({
    id: p.id, auth_user_id: null, name: p.name, email: emailOf(p), phone: `(256) 555-${String(1000 + i * 37).slice(-4)}`,
    role: joined(p) ? 'member' : 'renter', color: COLORS[i % COLORS.length], created_at: stamp(), team_lead: false,
  }));

  // ---------- production ----------
  const production = {
    id: pid, title, tagline: 'A full-throttle musical comedy about speed, family and second place.',
    color: '#E26D5C', opening_date: iso(day(0, 19, 30)), closing_date: iso(day(C, 16, 30)), groups: GROUPS, created_at: iso(day(-126, 9)),
  };
  const plan = { stage, pitch: PITCH };

  const memberships: Row[] = members.map((p) => ({
    production_id: pid, person_id: p.id, group_ids: p.groups ?? [], part: p.part ?? null, is_director: !!p.director,
    can_review_auditions: !!p.reviewer, can_plan_concept: !!p.planner, lead_group_ids: p.leads ?? [],
    created_at: iso(day(p.joins === 'concept' ? -126 : p.joins === 'casting' ? -80 : -64, 9)),
  }));

  // ---------- milestones ----------
  const milestones: Row[] = [];
  for (const [ms, list] of Object.entries(SUGGESTED_MILESTONES)) {
    list.forEach(({ title, days, fromClosing }, i) => {
      const due = day((fromClosing ? C : 0) + days, 12);
      milestones.push({ id: `rb_ms_${ms}_${i}`, production_id: pid, stage: ms, title, due_date: dayKey(due), completed: due.getTime() < now.getTime() - 12 * 3600_000 });
    });
  }

  // ---------- concept workspace ----------
  const concept = { production_id: pid, ...CONCEPT };
  const feasibility = (cur === at('concept') ? FEASIBILITY.concept : FEASIBILITY.later).map((f) => ({
    production_id: pid, item: f.item, status: f.status, assignee_id: f.assignee_id, due_date: dayKey(day(f.days as number)), notes: f.notes,
  }));

  // ---------- auditions ----------
  const performers = PEOPLE.filter((p) => p.performer);
  const headshot = (id: string) => `data:image/jpeg;base64,${readFileSync(join(__dirname, 'headshots', `${id}.jpg`)).toString('base64')}`;
  const profiles: Row[] = cur >= at('casting') ? performers.map((p) => ({ person_id: p.id, headshot: headshot(p.id), skills: p.skills ?? [], credits: p.credits ?? [] })) : [];
  const audition = cur >= at('casting') ? [{ production_id: pid, is_open: cur === at('casting'), details: AUDITION_DETAILS }] : [];
  const applications: Row[] = profiles.map((p, i) => ({ production_id: pid, person_id: p.person_id, submitted_at: iso(notAfterNow(day(-83 + Math.floor((i * 12) / profiles.length), 9 + (i % 10), (i * 17) % 60))) }));
  const reviews: Row[] = profiles.map((p) => {
    const id = p.person_id as string;
    const decision = PASSED.includes(id) ? 'pass' : cur === at('casting') && PENDING_IN_CASTING.includes(id) ? 'pending' : PEOPLE.find((x) => x.id === id)!.joins ? 'callback' : 'pass';
    return { production_id: pid, person_id: id, decision };
  });
  const feedback: Row[] = cur >= at('casting')
    ? FEEDBACK.filter((f) => day(f.days, 22) <= now || cur > at('casting')).map((f, i) => ({
      id: `rb_af_${i}`, production_id: pid, person_id: f.person, author_id: f.author, kind: f.kind, body: f.body, created_at: iso(notAfterNow(day(f.days, 21, i))),
    }))
    : [];

  // ---------- schedule ----------
  type Item = { id: string; title: string; kind: ScheduleKind; space: Space; start: Date; end: Date; groups: string[]; notes?: string; published: RbStage };
  const items: Item[] = [];
  let n = 0;
  const add = (published: RbStage, title: string, kind: ScheduleKind, space: Space, d: number, from: [number, number], to: [number, number], groups: string[], notes?: string) =>
    items.push({ id: `rb_s_${n++}`, title, kind, space, start: day(d, ...from), end: day(d, ...to), groups, notes, published });
  add('concept', 'Production team kickoff', 'Meeting', 'Lobby', -118, [18, 0], [19, 30], [G.team], 'Bring your wish lists and a calendar.');
  add('concept', 'Design concept meeting', 'Meeting', 'Lobby', -98, [18, 0], [20, 0], [G.team], 'Set, lights, costumes: the broadcast look.');
  add('concept', 'Budget review', 'Meeting', 'Lobby', -91, [17, 30], [18, 30], [G.team]);
  add('casting', 'Auditions', 'Audition', 'Rehearsal Room', -70, [18, 0], [21, 30], [G.team], 'Sign-in at 5:45. Accompanist provided.');
  add('casting', 'Dance call', 'Audition', 'Rehearsal Room', -69, [18, 30], [20, 30], [G.team]);
  add('casting', 'Callbacks', 'Audition', 'Rehearsal Room', -68, [18, 0], [21, 0], [G.team], 'Sides for callbacks are posted in the team chat.');
  add('casting', 'Casting meeting', 'Meeting', 'Lobby', -67, [19, 0], [20, 30], [G.team]);
  add('preparation', 'First read-through', 'Rehearsal', 'Rehearsal Room', -63, [18, 30], [21, 0], [], 'Scripts handed out at the door. Bring a pencil.');
  for (let d = -62; d <= -8; d++) {
    const wd = day(d).getDay();
    if (wd === 1) add('preparation', 'Music rehearsal', 'Music', 'Rehearsal Room', d, [18, 30], [20, 30], [G.leads, G.ensemble, G.kids, G.band], 'Bring your score and a pencil.');
    if (wd === 2) add('preparation', `Blocking: Act ${d % 2 ? 'I' : 'II'}`, 'Blocking', 'Main Stage', d, [18, 0], [21, 0], [G.leads, G.ensemble]);
    if (wd === 3) add('preparation', 'Production meeting', 'Meeting', 'Lobby', d, [17, 30], [18, 30], [G.team, G.crew]);
    if (wd === 4) add('preparation', d >= -35 ? 'Full company run' : 'Blocking: race sequences', 'Rehearsal', 'Main Stage', d, [18, 0], [21, 0], d >= -35 ? [] : [G.leads, G.ensemble, G.pit], d === -28 ? 'Off-book for Act I.' : undefined);
    if (wd === 6) {
      add('preparation', 'Choreography: pit stop number', 'Choreography', 'Rehearsal Room', d, [10, 0], [12, 30], [G.pit, G.ensemble], 'Sneakers and water.');
      add('preparation', 'Set build', 'Tech', 'Main Stage', d, [13, 0], [17, 0], [G.crew]);
    }
  }
  add('preparation', 'Load-in', 'Tech', 'Main Stage', -7, [9, 0], [17, 0], [G.crew, G.team]);
  add('preparation', 'Cue-to-cue', 'Tech', 'Main Stage', -5, [12, 0], [20, 0], [], 'Crew call 11:00. Cast call noon.');
  add('preparation', 'Tech run with lights and sound', 'Tech', 'Main Stage', -4, [18, 0], [22, 0], []);
  add('preparation', 'First dress rehearsal', 'Dress', 'Main Stage', -3, [17, 30], [22, 0], [], 'Full costumes and makeup.');
  add('preparation', 'Final dress (invited audience)', 'Dress', 'Main Stage', -1, [17, 30], [22, 0], [], 'Family and sponsors in the house.');
  const SHOWS: [number, [number, number], string | undefined][] = [[0, [19, 30], 'Opening Night'], [1, [19, 30], undefined], [2, [14, 0], 'Sunday Matinee'], [7, [19, 30], undefined], [8, [19, 30], undefined], [C, [14, 0], 'Closing Matinee']];
  for (const [d, [h, m]] of SHOWS) add('preparation', 'Call time: performance', 'Call Time', 'Main Stage', d, [h - 2, m], [h + 3, m], [], 'Sign in with the stage manager on arrival.');
  add('preparation', 'Strike', 'Strike', 'Main Stage', C + 1, [18, 0], [22, 0], [], 'Closed-toe shoes. Pizza after.');
  add('preparation', 'Company debrief', 'Meeting', 'Lobby', 23, [19, 0], [20, 30], []);
  const schedule = items.filter((it) => at(it.published) <= cur);

  const called = (it: Item) => members.filter((p) => !it.groups.length || isDirector.has(p.id) || (p.groups ?? []).some((g) => it.groups.includes(g))).map((p) => p.id);

  // ---------- conflicts ----------
  const CONFLICTS: [string, number, number, string][] = [
    ['rb_luc', -50, -50, 'Work dinner'],
    ['rb_hank', -41, -40, 'Out of town for work'],
    ['rb_owen', -33, -33, 'School concert'],
    ['rb_savannah', -26, -26, 'Sister’s wedding rehearsal'],
    ['rb_al', -12, -10, 'Gig in Nashville'],
  ];
  const conflicts: Row[] = cur >= at('preparation')
    ? CONFLICTS.map(([person, from, to, note], i) => ({ id: `rb_c_${i}`, production_id: pid, person_id: person, starts_at: iso(day(from, 0)), ends_at: iso(day(to, 23, 59)), note }))
    : [];
  const hasConflict = (person: string, it: Item) => conflicts.some((c) => c.person_id === person && new Date(c.starts_at as string) < it.end && new Date(c.ends_at as string) > it.start);

  // ---------- RSVPs and attendance ----------
  const rsvps: Row[] = [];
  const attendance: Row[] = [];
  for (const it of schedule) {
    const ids = called(it);
    const done = past(it.end);
    const daysAway = (it.start.getTime() - now.getTime()) / 86_400_000;
    const answerChance = done ? 1 : daysAway < 7 ? 0.8 : daysAway < 21 ? 0.5 : 0.2;
    for (const id of ids) {
      const r = rand();
      if (r > answerChance) continue;
      const conflict = hasConflict(id, it);
      rsvps.push({ item_id: it.id, person_id: id, answer: conflict ? 'no' : r < answerChance * 0.88 ? 'yes' : r < answerChance * 0.95 ? 'maybe' : 'no' });
    }
    // roll at past calls once rehearsals start: not meetings or auditions, and not the directors
    if (done && cur >= at('preparation') && !['Meeting', 'Audition'].includes(it.kind)) {
      for (const id of ids.filter((x) => !isDirector.has(x))) {
        const r = rand();
        const excused = hasConflict(id, it);
        attendance.push({
          item_id: it.id, person_id: id, status: excused ? 'excused' : r < 0.87 ? 'present' : r < 0.96 ? 'late' : 'absent',
          note: excused ? 'Conflict on file' : '', marked_by: id === 'rb_omar' ? 'rb_dale' : 'rb_omar', marked_at: iso(new Date(it.start.getTime() + 15 * 60_000)),
        });
      }
    }
  }

  // ---------- chat ----------
  const channels: Row[] = [
    { id: 'rb_ch_ann', production_id: pid, name: 'Announcements', kind: 'announcements', group_id: null, member_ids: null, created_at: iso(day(-126, 9, 1)) },
    { id: 'rb_ch_all', production_id: pid, name: 'Full Company', kind: 'group', group_id: null, member_ids: null, created_at: iso(day(-126, 9, 2)) },
    ...GROUPS.map((g, i) => ({ id: `rb_ch_${g.id.slice(5)}`, production_id: pid, name: g.name, kind: 'group', group_id: g.id, member_ids: null, created_at: iso(day(-126, 9, 3 + i)) })),
    ...(cur >= at('preparation') ? [{ id: 'rb_ch_dm', production_id: pid, name: 'Direct', kind: 'direct', group_id: null, member_ids: ['rb_dale', 'rb_cody'], created_at: iso(day(-20, 21)) }] : []),
  ];
  const channelIds = new Set(channels.map((c) => c.id));
  const messages: Row[] = [];
  MESSAGES.forEach((m, i) => {
    const when = day(m.days, m.hour, i % 50);
    const ch = `rb_ch_${m.ch}`;
    if (!past(when) || !channelIds.has(ch) || !memberIds.has(m.by)) return;
    messages.push({ id: `rb_m_${i}`, channel_id: ch, person_id: m.by, body: m.body.replace('{title}', title), at: iso(when), production_stage: null });
  });
  for (const [s, [d, h]] of Object.entries(STAGE_CHANGES)) {
    const idx = at(s as RbStage);
    if (idx > cur) continue;
    const from = RB_STAGES[idx - 1];
    const label = (x: RbStage) => ({ concept: 'Concept', casting: 'Casting', preparation: 'Preparation', tech: 'Tech & dress', performances: 'Performances', wrap: 'Wrap', completed: 'Completed' })[x];
    messages.push({ id: `rb_m_stage_${s}`, channel_id: 'rb_ch_ann', person_id: 'rb_dale', body: `Production stage changed from ${label(from)} to ${label(s as RbStage)}.`, at: iso(notAfterNow(day(d, h))), production_stage: s });
  }
  const reads: Row[] = readers.flatMap((person) => channels.filter((c) => c.kind !== 'direct').map((c) => ({ person_id: person, channel_id: c.id, read_at: iso(new Date(now.getTime() - 24 * 3600_000)) })));

  // ---------- board ----------
  const tasks: Row[] = [];
  const taskUpdates: Row[] = [];
  for (const c of CARDS) {
    const own = at(c.stage);
    if (own > cur + 1 || !memberIds.has(c.assignee)) continue;
    const status = own < cur ? 'completed' : own === cur ? c.during : 'not_started';
    const created = notAfterNow(day(c.created, 10));
    const changed = status === 'completed' ? notAfterNow(day(Math.min(c.due, Math.ceil((now.getTime() - O.getTime()) / 86_400_000)), 17)) : created;
    tasks.push({
      id: c.id, production_id: pid, group_id: c.group ?? null, title: c.title, notes: c.notes ?? '', status, assignee_id: c.assignee,
      due_date: dayKey(day(c.due)), created_by: 'rb_dale', created_at: iso(created), updated_at: iso(changed < created ? created : changed),
    });
    if (status === 'not_started') continue;
    (c.updates ?? []).forEach((u, i) => {
      const when = day(u.days, 18, i * 7);
      if (!past(when) || !memberIds.has(u.by)) return;
      taskUpdates.push({ id: `${c.id}_u${i}`, task_id: c.id, person_id: u.by, author_name: PEOPLE.find((p) => p.id === u.by)!.name, body: u.body, at: iso(when) });
    });
  }

  // ---------- performances and ticket sales ----------
  configureHouse(house);
  const layout = buildLayout();
  const prices: Record<PriceTier, number> = { premium: 32, standard: 26, value: 18, accessible: 18 };
  const onSale = day(-42, 10);
  const performances: Row[] = [];
  const claims: Row[] = [];
  const orders: Row[] = [];
  const tickets: Row[] = [];
  const FILL = [0.8, 0.88, 0.62, 0.72, 0.93, 0.85];
  const BUYERS = ['Patel', 'Johnson', 'Nguyen', 'Garcia', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Lee'];
  if (cur >= at('preparation') && past(onSale)) {
    SHOWS.forEach(([d, [h, m], subtitle], pi) => {
      const id = `rb_perf_${pi + 1}`;
      const start = day(d, h, m);
      performances.push({ id, title, subtitle: subtitle ?? null, production_id: pid, booking_id: null, starts_at: iso(start), doors_mins: 30, prices, on_sale: true });
      const r = mulberry32(500 + pi);
      const taken = new Set<string>();
      for (const seat of ['N-C6', 'N-C7', 'N-C8', 'N-C9', 'O-C6', 'O-C7', 'O-C8', 'O-C9']) {
        if (!layout.some((s) => s.id === seat)) continue;
        taken.add(seat);
        claims.push({ performance_id: id, seat_id: seat, status: 'blocked', holder_id: null, hold_expires_at: null, order_id: null, note: 'Sound board' });
      }
      for (const seat of ['J-C5', 'J-C6', 'J-C7', 'J-C8']) {
        if (!layout.some((s) => s.id === seat) || taken.has(seat)) continue;
        taken.add(seat);
        claims.push({ performance_id: id, seat_id: seat, status: 'comp', holder_id: null, hold_expires_at: null, order_id: null, note: 'Company comps' });
      }
      const cutoff = past(start) ? start : now;
      let i = 0;
      while (i < layout.length) {
        const size = 1 + Math.floor(r() * 4);
        const run = layout.slice(i, i + size).filter((s) => !taken.has(s.id));
        const bias = 1 - layout[i].row.charCodeAt(0) / 100 + (layout[i].section === 'C' ? 0.1 : -0.1);
        i += size;
        if (!run.length || r() >= FILL[pi] * (0.6 + bias)) continue;
        // sales pick up as the show gets closer; only those made by now exist
        const sold = new Date(onSale.getTime() + Math.pow(r(), 0.6) * (start.getTime() - 3600_000 - onSale.getTime()));
        if (sold > cutoff) continue;
        const ids = run.map((s) => s.id);
        ids.forEach((s) => taken.add(s));
        const orderId = `rb_o_${pi + 1}_${orders.length}`;
        const last = BUYERS[Math.floor(r() * BUYERS.length)];
        const totals = orderTotals(ids, prices, ticketFee);
        orders.push({
          id: orderId, performance_id: id, seat_ids: ids, buyer_id: null, buyer_name: `${'ABCDEJKLMRST'[Math.floor(r() * 12)]}. ${last}`,
          buyer_email: `${last.toLowerCase()}.${orders.length}@example.com`, ...totals, method: r() < 0.85 ? 'card' : 'cash', refunded: false, at: iso(sold),
        });
        for (const seat of ids) {
          claims.push({ performance_id: id, seat_id: seat, status: 'sold', holder_id: null, hold_expires_at: null, order_id: orderId, note: null });
          const checkedIn = past(start) && r() < 0.94 ? iso(new Date(start.getTime() - Math.floor(r() * 45) * 60_000)) : null;
          tickets.push({ id: `rb_t_${tickets.length}`, order_id: orderId, performance_id: id, seat_id: seat, code: ticketCode(r), price: priceFor(seat, prices), checked_in_at: checkedIn, void: false });
        }
      }
    });
  }

  return {
    pid, existing: !!target, opening: O, people, production, plan, memberships, milestones, concept, feasibility, profiles, audition, applications, reviews, feedback,
    schedule: schedule.map((it) => ({ id: it.id, production_id: pid, title: it.title, kind: it.kind, space: it.space, starts_at: iso(it.start), ends_at: iso(it.end), group_ids: it.groups, notes: it.notes ?? null })),
    rsvps, conflicts, attendance, channels, messages, reads, tasks, taskUpdates, performances, claims, orders, tickets,
  };
}

// ---------------------------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------------------------

/** Triggers that would stamp "now" and the signed-in person over the history, or send alerts. */
const QUIET_TRIGGERS: [table: string, trigger: string][] = [
  ['tasks', 'check_task'],
  ['tasks', 'push_task_assignment'],
  ['task_updates', 'stamp_task_update'],
  ['attendance', 'check_attendance'],
  ['messages', 'push_announcement'],
  ['schedule_items', 'push_schedule'],
];

const quiet = (on: 'disable' | 'enable') => QUIET_TRIGGERS.map(([t, g]) => `alter table public.${t} ${on} trigger ${g};`).join('\n');

/** The test people (ids starting rb_) and the separate test show, if there is one. */
const REMOVE_OWN_SQL = `
delete from public.orders where performance_id in (select id from public.performances where production_id = '${RB_PRODUCTION}');
delete from public.performances where production_id = '${RB_PRODUCTION}';
delete from public.productions where id = '${RB_PRODUCTION}';
delete from public.people where id like 'rb\\_%';
`;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Clears an existing production's test data, keeping the production itself and its own (non-test) members. */
function clearTargetSql(id: string): string {
  const t = q(id);
  return `
delete from public.orders where performance_id in (select id from public.performances where production_id = ${t});
delete from public.performances where production_id = ${t};
delete from public.schedule_items where production_id = ${t};
delete from public.member_conflicts where production_id = ${t};
delete from public.production_milestones where production_id = ${t};
delete from public.tasks where production_id = ${t};
delete from public.channels where production_id = ${t};
delete from public.production_concepts where production_id = ${t};
delete from public.production_feasibility where production_id = ${t};
delete from public.production_auditions where production_id = ${t};
delete from public.memberships where production_id = ${t} and person_id like 'rb\\_%';
`;
}

function insert(table: string, rows: Row[]): string {
  if (!rows.length) return '';
  const json = JSON.stringify(rows).replace(/'/g, "''");
  return `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, '${json}'::jsonb);\n`;
}

/** SQL that replaces any earlier test data with the show at the given stage, in one transaction. */
export function rickyBobbySql(opts: RbOptions): string {
  const d = rickyBobbyRows(opts);
  const t = q(d.pid);
  const readers = (opts.readers ?? []).map(q).join(', ');
  const production = d.existing
    ? [
      clearTargetSql(d.pid),
      REMOVE_OWN_SQL,
      insert('people', d.people),
      // the show keeps its title, tagline and colour; its run dates and groups become the test ones
      `update public.productions set opening_date = ${q(d.production.opening_date)}, closing_date = ${q(d.production.closing_date)}, groups = ${q(JSON.stringify(d.production.groups))}::jsonb where id = ${t};`,
      `update public.production_plans set stage = ${q(d.plan.stage)}, pitch = coalesce(nullif(pitch, ''), ${q(d.plan.pitch)}) where production_id = ${t};`,
      // the show's own members (the owner, say) join the production team group
      `update public.memberships set group_ids = '{${GROUPS[0].id}}' where production_id = ${t} and person_id not like 'rb\\_%';`,
    ]
    : [
      REMOVE_OWN_SQL,
      insert('people', d.people),
      insert('productions', [d.production]),
      // a new production gets a plan row from a trigger; set its stage and pitch
      `update public.production_plans set stage = ${q(d.plan.stage)}, pitch = ${q(d.plan.pitch)} where production_id = ${t};`,
    ];
  return [
    'begin;',
    quiet('disable'),
    ...production,
    insert('memberships', d.memberships),
    insert('production_milestones', d.milestones),
    insert('production_concepts', [d.concept]),
    insert('production_feasibility', d.feasibility),
    insert('performer_profiles', d.profiles),
    insert('production_auditions', d.audition),
    insert('audition_applications', d.applications),
    insert('audition_reviews', d.reviews),
    insert('audition_feedback', d.feedback),
    insert('schedule_items', d.schedule),
    insert('rsvps', d.rsvps),
    insert('member_conflicts', d.conflicts),
    insert('attendance', d.attendance),
    insert('channels', d.channels),
    insert('messages', d.messages),
    readers ? `insert into public.channel_reads select * from jsonb_populate_recordset(null::public.channel_reads, '${JSON.stringify(d.reads).replace(/'/g, "''")}'::jsonb) where person_id in (select id from public.people where id in (${readers})) on conflict (person_id, channel_id) do update set read_at = excluded.read_at;` : '',
    insert('tasks', d.tasks),
    insert('task_updates', d.taskUpdates),
    insert('performances', d.performances),
    insert('orders', d.orders),
    insert('seat_claims', d.claims),
    insert('tickets', d.tickets),
    quiet('enable'),
    'commit;',
    '',
  ].join('\n');
}

/**
 * SQL that removes the test data: the test people, the separate test show, and (given an existing
 * production) its test company, schedule, chat, cards and sales. That production stays, back in Concept.
 */
export function rickyBobbyRemoveSql(targetId?: string): string {
  const target = targetId
    ? [clearTargetSql(targetId), `update public.production_plans set stage = 'concept' where production_id = ${q(targetId)};`]
    : [];
  return ['begin;', quiet('disable'), ...target, REMOVE_OWN_SQL, quiet('enable'), 'commit;', ''].join('\n');
}
