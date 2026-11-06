# The Dream Theatre — iOS & Android app

An all-in-one app for the owner of **[The Dream Theatre](https://thedreamtheatre.com/)**
(3401 Holmes Ave NW, Suite B, Huntsville, AL, in the former Butler High School Theatre).
Today the theatre takes bookings by email and phone ("Book Your Event Now" → `mailto:`).
This app moves that, along with the owner's own productions and ticket sales, onto phones.

Built with **Expo SDK 58 / React Native 0.88 / Expo Router**. One TypeScript codebase
ships to **iOS, Android** and the web.

> _Creating memories, one dream at a time._

---

## What's inside

### 1. Rentals: calendar, booking and deposit portal
- **Live availability calendar.** Rentals, tentative holds, rehearsals and performances
  are color-coded. Renters see other events only as "Reserved", so private details stay private.
- **Booking wizard** (date → event → contact → review) with an **instant quote**: packages
  (Rehearsal Block, Half-Day, Full-Day, Show Weekend), hourly billing with a minimum,
  overtime, and add-ons (sound/lighting techs, box office, lobby, green room, piano, cleaning).
- **Automatic double-booking protection.** Every start time is checked against bookings and
  main-stage rehearsals, with a configurable turnover buffer. Times that conflict are struck out.
- **Deposit portal.** Approved requests hold the date for _N_ hours. Paying the reservation
  deposit plus the refundable security deposit **confirms the booking automatically**.
  Unpaid holds expire and release the date to other renters.
- **Owner pipeline.** Approve or decline requests, extend holds, record cash and check payments,
  send a payment request through the share sheet, mark events complete, refund security deposits,
  and see confirmed and pending revenue.

### 2. The owner's show place: productions, company, schedule and chat
- **Productions** with groups (Leads, Ensemble, Dance Corps, Kids Chorus, Tech Crew, Pit Band…).
- **Rehearsal scheduler.** Set the call type, space, which groups are called, and weekly repeats.
  It **refuses to double-book the Main Stage** and warns about cast/crew who have submitted
  conflicts for that date.
- **RSVPs.** Each member answers Going / Maybe / Can't. Directors see the counts and who hasn't replied.
- **Conflict calendar.** Cast submit dates they can't make, and directors see them all in one place.
- **Messaging.** Read-only Announcements, Full Company chat, an automatic chat per group,
  and 1:1 direct messages, all with unread badges.

### 3. Assigned-seat ticketing and box office
- **Movie-style seat map** of the 448-seat house (3 sections, rows A–P), with price tiers
  (Premium center C–H, Standard, Value N–P, Accessible spaces) and a zoom/whole-house toggle.
- **Auto-block on sold seats.** A sale is committed atomically. A seat that is sold, blocked,
  or in someone else's cart can't be selected or sold again. If any seat in an order was just
  taken, the whole order fails cleanly.
- **8-minute cart holds** with a countdown. Expired holds release automatically.
- **Best available** finds N seats side by side near the sweet spot. An **orphan-seat warning**
  catches selections that would strand a single empty seat.
- **Box office mode** for the owner: sell (card or cash), issue comps, hold back seats
  (sound board, house seats), and inspect or refund a sold seat, which releases it for resale.
- **Tickets with QR codes**, plus **door check-in** by camera scan or typed code. Duplicate,
  voided and wrong-show tickets are rejected, and a live headcount shows who's inside.
- Renters who buy the "Box office & ticketing" add-on get their own ticketed performances (e.g. _Nutcracker_).

### 4. Admin portal: where the owners set everything up
`/admin` on the website (sidebar layout on desktop) or **Settings → Open admin portal** in the app:

| Section | What the owner configures |
|---|---|
| Overview | Setup checklist, new requests, balances owed, ticket sales, APK and website links |
| Venue profile | Name, owner, phone, email, address, tagline |
| Rates & policy | Hourly rate and minimum, deposit %, security deposit, balance due date, turnover buffer, hold length, auto-approve, cancellation policy, with a live example quote |
| Packages & add-ons | Add, edit or remove packages (hours and price) and add-ons (flat or hourly) |
| Seating chart | Rows, seats per section, premium and value rows, wheelchair spaces (tap seats in the live preview). Layouts that would remove a sold seat are blocked. |
| Shows & tickets | Per-performance prices, on sale/off sale, delete, service fee per ticket |
| People & access | Owners/staff, renters, cast & crew: add, edit, change role, remove |
| Data & security | Backup download. In the on-device demo also: restore, reset demo data, change the admin PIN |

In the live app only people whose role is **owner** can open the portal. In the on-device demo it
asks for the **admin PIN** (demo PIN `2020`; change it in Data & security).

### 5. Customizable home screen
Tap **Customize home** at the bottom of Home to show, hide and reorder sections and to pick up to
four shortcuts. Each person's layout is saved separately, so owners, renters and cast each start from
their own sensible default. **Reset to default** restores it.

| Role | Sections available |
|---|---|
| Owner | Shortcuts, Needs you, Coming up, Next show, This month (money), Messages, Setup progress |
| Renter | Book the theatre, Your bookings, On stage soon, Contact |
| Cast & crew | Next call, Production hub, After that, Announcements, My tickets |

### Three roles, one app
In the live app each person signs in and sees their own role. In the on-device demo, use the
profile icon (top right) → **Preview the app as…** to switch personas:

| Persona | Sees |
|---|---|
| **Theatre owner** | Dashboard, calendar, rentals pipeline, productions, box office, check-in, rates & policy settings |
| **Renter** (Jordan Ellis) | Open dates, booking wizard, their bookings and deposits, tickets |
| **Cast member** (Maya Brooks, _Jovie_ in Elf) | Their calls with RSVP, conflicts, company chat, their tickets |

Demo data is seeded from the theatre's real public calendar (UAH Wind Ensemble, The Unknown Tour,
Huntsville Ballet's _Night Songs_, Jon Reddick's NO FEAR TOUR, _Elf: The Musical_, Adonai School
of Ballet's _Nutcracker_), plus a few sample requests. **All prices are placeholders.** The owner
sets real rates in **Settings → Rental rates & policy**.

---

## Download the APK & open the website

`.github/workflows/build.yml` runs on every push to `main` (and on pull requests into it):

1. **Checks:** typecheck, lint, unit tests.
2. **Android:** `expo prebuild` + Gradle `assembleRelease` produce an installable APK
   (downloadable from the run's *Artifacts*).
3. **Website:** `expo export --platform web` builds the same app for browsers, under `/dreamyapp/`.
4. On **main** it also publishes:
   - **APK →** https://github.com/RoyalRockinApps/dreamyapp/releases/download/android-latest/dream-theatre.apk
     (a rolling *android-latest* release, replaced on every push)
   - **Website →** https://royalrockinapps.github.io/dreamyapp/ (admin portal at `/dreamyapp/admin`)

**One-time setup for the website:** in GitHub, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
Then re-run the workflow (Actions → *Build app & website* → *Run workflow*).

Installing the APK: open the link on an Android phone and allow "install unknown apps" for the browser
when prompted. The demo APK is signed with a debug key, which is fine for sideloading. For the Play Store,
use `npx eas-cli@latest build -p android --profile production` with your own upload key. iOS installs
go through TestFlight: `npx eas-cli@latest build -p ios` plus an Apple Developer account.
`eas.json` also has a `preview` profile that builds an APK on Expo's servers.

> **The app and the website run the same code and share the same data** once the build has the
> Neon settings (see *Live backend* below). A build without them runs the on-device demo, where
> each phone and browser keeps its own copy.

## Run it

```bash
npm install
npx expo start          # press i (iOS simulator), a (Android emulator), or scan the QR with a dev build
```

With no Neon settings the app runs the on-device demo. To run against the live backend, run
`neon env pull` (or `neon init`) to write `.env.local`, which git ignores; `.env.example` lists what
it contains. Set `EXPO_PUBLIC_DEMO=1` to force the demo anyway. Restart `npx expo start` after
changing env files.

The app uses `expo-camera` for ticket scanning, which is included in Expo Go. For store builds:

```bash
npx eas-cli@latest build --platform all        # cloud builds for iOS + Android
npx eas-cli@latest submit --platform all       # upload to App Store Connect / Google Play
```

Store accounts needed: Apple Developer Program and Google Play Console. Bundle id / package is
`com.thedreamtheatre.app` (`app.json`).

### Checks
```bash
npm test            # domain logic: seat auto-block, holds, best-available, pricing, conflicts, cards
npm run test:db     # database: who can see/change what, seat holds & sales, check-in (in-process Postgres)
npm run typecheck
npx expo lint
```

Demo payments: card `4242 4242 4242 4242`, any future expiry. `4000 0000 0000 0002` simulates a decline.

---

## Project layout

```
src/
  app/                    Expo Router screens
    (tabs)/               Home · Calendar · Rentals/Book · Shows · Tickets
    booking/new.tsx       booking wizard + live availability & quote
    booking/[id].tsx      booking detail, approvals, payments
    pay.tsx               deposit / balance checkout
    production/[id].tsx   Schedule · Company · Chat · Tickets hub
    rehearsal/edit.tsx    schedule calls (repeat weekly, conflict checks)
    chat/[id].tsx         group & direct messaging
    performance/[id].tsx  seat map, holds, checkout, box office tools
    ticket/[id].tsx       QR ticket
    checkin/[id].tsx      door scanner
    settings.tsx          sign out (live) or personas (demo), venue info
  lib/                    pure, unit-tested domain logic (no React)
    seating.ts            house layout, holds, atomic sale, orphan detection, best available
    pricing.ts            rental quotes, deposits, balances
    scheduling.ts         stage conflicts, open windows, member conflicts
    payments.ts           card validation + PaymentProvider interface (demo provider)
    seed.ts               demo data
    backend.ts            Neon endpoints from app.config.js; LIVE is true when the build has them
    remote/auth.ts        Neon Auth sign-in by emailed code (plain HTTP, works on iOS/Android/web)
    remote/db.ts          Neon Data API client; attaches the signed-in person's token
    remote/rows.ts        database rows <-> app types (unit-tested)
    remote/api.ts         writes and server functions (holds, sales, check-in, payments)
  store/useStore.ts       Zustand store. Every mutation is an action; in live mode it also writes to Neon
  store/sync.ts           live mode: sign-in session, initial load, checking for changes
  components/             UI kit, MonthCalendar, SeatMap, CardForm, LiveGate (email-code sign-in)
db/migrations/            database schema, row-level security and server functions
db/tests/                 those rules exercised as each role on an in-process Postgres
scripts/db.ts             npm run db:migrate / db:seed against the Neon branch in .env.local
scripts/seed-sql.ts       turns the demo data into SQL for a fresh database
neon.ts                   Neon project config: Neon Auth and the Data API (apply with `neon deploy`)
docs/BACKEND.md           backend design, what's done and what's next (Stripe, push)
```

Tune the house layout (rows, section widths, tiers, accessible spaces) in `src/lib/seating.ts → HOUSE`
to match the real seating chart.

## Live backend (Neon)
The live app runs on a free [Neon](https://neon.com) project (Postgres in AWS us-east-1) with
**Neon Auth** for sign-in and the **Neon Data API** for reads and writes.

Everyone signs in with a **one-time code emailed to them** (no passwords). The server decides what each
person can see and do (row-level security): renters see only their own bookings and see other events
as "Reserved", cast see only their own productions and chats, and only owners can open the admin
portal, approve bookings, sell at the box office or check tickets in. Seat holds, ticket sales and
check-in run as database functions, so two people can never buy the same seat, and ticket prices
come from the server. The app checks for other people's changes every 20 seconds, and every few
seconds on the seat picker, in chat and at the door.

Card payments are still **simulated** (demo card numbers above) until Stripe is connected. See
`docs/BACKEND.md` for that and push notifications.

> **Website sign-in limitation:** Neon keeps the sign-in session in a cookie from `neon.tech`. The
> iOS and Android apps handle it fine, but on the website it's a third-party cookie, so sign-in fails
> in Safari and in browsers that block third-party cookies (the sign-in screen says so). Details and
> the fix options are in `docs/BACKEND.md`.

**Setting up a Neon project** (one time; this repo's project is already set up):
1. `npm i -g neon`, `neon login`, then `neon init` in this folder to create or link a project. It
   writes `.env.local` and `.neon` (both git-ignored).
2. `neon deploy` turns on Neon Auth and the Data API as declared in `neon.ts`.
3. Turn off password sign-in so accounts only come from emailed codes:
   `neon neon-auth config email-password update --enabled false`.
4. `npm run db:migrate` creates the tables, rules and functions in `db/migrations`.
5. Optional demo data: `npm run db:seed -- --owner you@example.com` (empty database only). That
   email becomes the theatre owner; without the seed, add yourself to `people` with role `owner`.
6. For the published website, trust its address: `neon neon-auth domain add https://<owner>.github.io`.
7. For the APK and website builds, add GitHub repository variables (**Settings → Secrets and
   variables → Actions → Variables**) `NEON_AUTH_BASE_URL` and `NEON_DATA_API_URL` with the values
   from `.env.local`. They are public endpoints, not secrets. Never add `DATABASE_URL` there.
8. Before inviting real renters and cast, connect your own email provider in Neon Auth. Neon's
   shared sender is meant for development.
