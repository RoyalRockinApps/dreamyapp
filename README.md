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

### Three roles, one app
Use the profile icon (top right) → **Preview the app as…** to switch personas:

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

## Run it

```bash
npm install
npx expo start          # press i (iOS simulator), a (Android emulator), or scan the QR with a dev build
```

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
    settings.tsx          personas, venue info, rates & policy
  lib/                    pure, unit-tested domain logic (no React)
    seating.ts            house layout, holds, atomic sale, orphan detection, best available
    pricing.ts            rental quotes, deposits, balances
    scheduling.ts         stage conflicts, open windows, member conflicts
    payments.ts           card validation + PaymentProvider interface (demo provider)
    seed.ts               demo data
  store/useStore.ts       Zustand store persisted to AsyncStorage. Every mutation is an action.
  components/             UI kit, MonthCalendar, SeatMap, CardForm
docs/BACKEND.md           plan for going live: multi-user sync, Stripe, push, security
docs/schema.sql           Postgres schema incl. race-safe seat purchase
```

Tune the house layout (rows, section widths, tiers, accessible spaces) in `src/lib/seating.ts → HOUSE`
to match the real seating chart.

## Going live
Right now the app is **local-first**: data lives on the device, so you can demo and try it with
zero infrastructure. Making it multi-user means connecting a backend and a real card processor.
`docs/BACKEND.md` covers the recommended Supabase + Stripe setup step by step. The store
actions already map one-to-one to the API calls.
