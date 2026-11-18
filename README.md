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

### 2. Production planning for directors, staff and cast
- **Timeline.** Start with a pitch and optional run dates. Move the show through Stage 0 Concept,
  Stage 1 Casting, Stage 2 Preparation, and Stage 3 Production. Mark it Completed after the run.
  Directors can set dated milestones and mark them done. Each stage change updates the timeline
  and posts an unread company announcement that appears on Home.
- **Concept workspace.** Directors and staff with Concept planning access can write a private
  production brief, assign feasibility checks with deadlines, and draft audition details. The
  stage confirmation shows open checks and the draft. Directors can then edit and publish it
  from Company when they open audition registration.
- **Company.** The venue owner can designate directors. Directors can add cast and staff, assign
  roles and groups, and schedule calls. Added members sign in with the email used on the roster.
- **Auditions.** Directors open registration and grant staff review access from the Company tab.
  In Audition Review, tap a card to see the full profile, swipe right for Callback, or swipe left
  for Not a fit. The review team shares decisions, audition notes, and suggested roles.
  Performers apply from
  Home using one reusable profile with a headshot, optional skills, and any past roles.
- **Scheduler.** Plan auditions, rehearsals, tech, performances, and strike. Set the space, groups
  called, and weekly repeats.
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
use `npx eas-cli@latest build -p android --profile production` with your own upload key.
`eas.json` also has a `preview` profile that builds an APK on Expo's servers.

> **The app and the website run the same code and share the same data** once the build has the
> Supabase settings (see *Live backend* below). A build without them runs the on-device demo, where
> each phone and browser keeps its own copy.

## Run and distribute on iOS

To open the demo on a Mac with an iOS Simulator and Expo Go for SDK 58:

```bash
EXPO_PUBLIC_DEMO=1 npm run ios -- --go
```

For a standalone simulator build, sign in to Expo (`npx eas-cli@latest login`), then run:

```bash
npx eas-cli@latest build --platform ios --profile ios-simulator
```

Accept the CLI's install prompt when the build finishes. The simulator profile runs in demo mode
and requires no Apple signing credentials. Use a physical iPhone to test camera-based ticket scanning.

### TestFlight

**App Review needs a way in.** A live build opens on the sign-in screen, so in App Store Connect →
TestFlight → Test Information → Beta App Review Information, tick **Sign-in required** and enter the
review account's email and password (an owner account that shows every feature; see *Live backend*).

Every TestFlight release is built on a Mac and goes to the external group **DT External Testing**
(the same procedure as the KH Royals app). The app is `com.thedreamtheatre.app` on the Apple team
**Never Ending Technology, Inc.** (`NH4U6X4G8C`). From an up-to-date `main`, with the Supabase
settings in `.env.local` and an App Store Connect API key in the environment (`ASC_KEY_ID`,
`ASC_ISSUER_ID`, `ASC_KEY_PATH` = the `.p8` file, kept outside the repo):

```bash
APPLE_TEAM_ID=NH4U6X4G8C scripts/testflight.sh "What to test in this build"
```

- The script runs a clean prebuild, archives, and uploads with the key. It then waits for Apple to
  process the build, sets the "What to Test" note, adds the build to DT External Testing, and
  submits it for Beta App Review when Apple asks. Apple won't take emoji in the note, so the script
  leaves them out.
- For a build that's already uploaded: `node scripts/testflight_distribute.mjs <build number>
  --note "…"`. Set `TESTFLIGHT_UPLOAD_ONLY=1` to stop the script after the upload.
- Each upload gets a build number from the date and time (`2026.1118.2330`). The version stays
  `app.json`'s, so Apple reviews it once, and later builds of the same version pass at once. Don't
  mix in EAS iOS builds, whose numbers (6, 7…) are lower.
- Make the key under **Users and Access → Integrations → App Store Connect API**. App Manager access
  is enough; an Admin key also lets Xcode make the distribution certificate and profile.

## Run it

```bash
npm install
npx expo start          # press i (iOS simulator), a (Android emulator), or scan the QR with a dev build
```

With no Supabase settings the app runs the on-device demo. To run against the live backend, copy
`.env.example` to `.env.local` (git ignores it) and fill in the project URL and publishable key. Set `EXPO_PUBLIC_DEMO=1` to force the demo anyway. Restart `npx expo start` after
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
    settings.tsx          sign out and delete account (live) or personas (demo), venue info
  lib/                    pure, unit-tested domain logic (no React)
    seating.ts            house layout, holds, atomic sale, orphan detection, best available
    pricing.ts            rental quotes, deposits, balances
    scheduling.ts         stage conflicts, open windows, member conflicts
    payments.ts           card validation + PaymentProvider interface (demo provider)
    seed.ts               demo data
    backend.ts            Supabase URL + key from app.config.js; LIVE is true when the build has them
    remote/auth.ts        Supabase Auth: email + password sign-in and account creation
    remote/db.ts          the Supabase client (session kept in AsyncStorage on every platform)
    remote/rows.ts        database rows <-> app types (unit-tested)
    remote/api.ts         writes and server functions (holds, sales, check-in, payments)
  store/useStore.ts       Zustand store. Every mutation is an action; in live mode it also writes to Supabase
  store/sync.ts           live mode: sign-in session, initial load, Realtime updates
  components/             UI kit, MonthCalendar, SeatMap, CardForm, LiveGate (sign-in / create account)
supabase/migrations/      database schema, row-level security and server functions (`npm run db:migrate`)
supabase/config.toml      Supabase project settings, including auth (`supabase config push`)
supabase/tests/           those rules exercised as each role on an in-process Postgres
scripts/db.ts             npm run db:seed against the Supabase database in .env.local
scripts/seed-sql.ts       turns the demo data into SQL for a fresh database
docs/BACKEND.md           backend design, what's done and what's next (Stripe, push)
```

Tune the house layout (rows, section widths, tiers, accessible spaces) in `src/lib/seating.ts → HOUSE`
to match the real seating chart.

## Live backend (Supabase)
The live app runs on a free [Supabase](https://supabase.com) project in the **DagerHappens**
organization: Postgres, Supabase Auth, the PostgREST API and Realtime.

Everyone signs in with **email and password**; new people create their own account in the app. The
server decides what each person can see and do (row-level security): renters see only their own
bookings and see other events as "Reserved", cast see only their own productions and chats, and only
owners can open the admin portal, approve bookings, sell at the box office or check tickets in. Seat
holds, ticket sales and check-in run as database functions, so two people can never buy the same
seat, and ticket prices come from the server. Changes from other people arrive live (Realtime).

**Accounts and the owner's approval.** There's no email sender yet, so Supabase can't prove who owns
an address. A new email becomes a renter right away, but an account whose email matches someone the
theatre already has (cast, staff, an owner) waits until the owner confirms it under **People &
access → Accounts to confirm**; otherwise anyone could claim the owner's record by typing the owner's
email. Anyone can delete their account in **Settings → Delete my account** (an App Store requirement).
Forgotten passwords are reset by the owner in the Supabase dashboard (Authentication → Users).

Card payments are still **simulated** (demo card numbers above) until Stripe is connected. See
`docs/BACKEND.md` for that and push notifications.

**Setting up a Supabase project** (one time; this repo's project is already set up):
1. `brew install supabase/tap/supabase`, `supabase login`, then `supabase link --project-ref <ref>`.
2. `npm run db:migrate` (`supabase db push --remote`) creates the tables, rules, functions and
   Realtime publication in `supabase/migrations`.
3. `supabase config push` applies the auth settings in `supabase/config.toml`: email + password on,
   **Confirm email** off (there's no email sender yet) and an 8-character minimum password.
4. Optional demo data: `npm run db:seed -- --owner you@example.com` (empty database only; needs
   `SUPABASE_DB_URL` in `.env.local`). The first owner is linked by hand once: create an account in
   the app with that email, then set `people.auth_user_id` for the owner row in the SQL editor.
5. For the APK and website builds, add GitHub repository variables (**Settings → Secrets and
   variables → Actions → Variables**) and Expo `production` environment variables
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Both are public by design. Never put the
   database password or a secret / service-role key there.
6. Before inviting real renters and cast, connect an email provider (Authentication → SMTP) so
   accounts can be verified and passwords reset by email.
