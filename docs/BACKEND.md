# Going live: backend, payments and notifications

## Status

The live backend runs on **Neon** (free plan): Postgres, Neon Auth (Managed Better Auth) and the
Neon Data API (PostgREST-compatible). This document started as a Supabase plan; the database design
carried over unchanged, and the sections below note where Neon differs.

| Piece | State |
|---|---|
| Shared database, row-level security, sign-in by email code | **Done.** `db/migrations/`, `src/lib/remote/`, `src/components/LiveGate.tsx` |
| Seat holds, sales, refunds, check-in, booking payments as server functions | **Done.** Prices and fees are computed on the server |
| Seeing other people's changes | **Polling**: every 20 s, every 4–5 s on the seat picker, chat and door (`usePoll` in `src/store/sync.ts`). Neon Realtime is in beta and needs a server to seal each live query; revisit when we add Neon Functions |
| Card payments | **Simulated.** `purchase_seats()` and `add_payment()` accept the demo card. Next: Stripe (below) |
| Push notifications, email receipts | Not started (below) |

Builds without the Neon settings (`NEON_AUTH_BASE_URL`, `NEON_DATA_API_URL`) still run the on-device
demo, where all state lives in the Zustand store (`src/store/useStore.ts`) persisted to AsyncStorage.

### How sign-in works on Neon

`src/lib/remote/auth.ts` calls Neon Auth's REST endpoints directly (Neon's SDK targets browsers and
Next.js): emailed code → `POST /sign-in/email-otp` → `GET /token` returns a ~15-minute JWT, refreshed
a minute before it expires, that the Data API checks. Right after sign-in the app calls `link_me()`,
which attaches the account to the person with the same verified email (or adds a renter). Password
sign-in is turned off.

**The session travels in Neon's cookie.** Tested Nov 2026: Neon does not accept the session token from
the sign-in response as a bearer token (`GET /token` → 401), and the signed token header is not
readable by browser scripts. So:

- **iOS / Android apps:** fine. The native network layer stores the cookie like any first-party cookie.
- **Website:** the cookie comes from `neon.tech`, so it is a third-party cookie for the site. Sign-in
  works where third-party cookies are allowed (default Chrome, the Claude browser pane) and fails in
  Safari and in Chrome with third-party cookies blocked. The sign-in screen then explains this and
  points people to the app. *Decision (Nov 2026): accept this for now and focus on the apps.*
  To fix it later, serve Neon Auth through the website's own address (a reverse proxy such as a
  Netlify rewrite or AWS CloudFront behaviour for `/auth/*`), or add a small Neon Function that signs
  people in server-side and hands the app its own token.

## Stack

| Need | Recommendation | Why |
|---|---|---|
| Database, auth, API | **Neon** (Postgres + Neon Auth + Data API; Functions for webhooks) | Row-level security maps cleanly to owner / renter / member roles |
| Card payments | **Stripe** (`@stripe/stripe-react-native` PaymentSheet) | Apple Pay / Google Pay, PCI handled by Stripe, deposits + refunds |
| Push notifications | **expo-notifications** + Expo Push API | New requests, deposit received, schedule changes, new messages |
| Builds & updates | **EAS Build / Submit / Update** | No Mac needed; OTA fixes without store review |

`db/migrations/` contains the tables, row-level security and the race-safe seat functions.

## Mapping store actions to the API

Every screen calls store actions only, so the migration is mostly swapping action bodies:

| Store action | Backend |
|---|---|
| `createBooking`, `setBookingStatus`, `updateBooking` | `insert/update bookings` (RLS: renter can insert their own, only owner can approve) |
| `addPayment` | written only by the Stripe webhook (`payment_intent.succeeded`), never by the client |
| `hold(performanceId, seats)` | `rpc('hold_seats')` |
| `purchase(...)` | Edge Function `create-ticket-intent` → Stripe → webhook calls `rpc('commit_sale')` |
| `refundTicket` | Edge Function: Stripe refund + delete claim + void ticket |
| `sendMessage`, `markRead` | `insert messages`; the chat screen re-checks every 4 s |
| `upsertScheduleItem`, `rsvp`, `addConflict` | plain inserts/updates guarded by RLS |
| `checkIn(code)` | `rpc('check_in', { code, performance_id })` (owner/staff only) |

## Seats: guaranteeing "sold means blocked"

The client-side logic in `src/lib/seating.ts` is mirrored in SQL so the server is the
authority even when 50 people tap the same seat:

1. `seat_claims` has a **primary key on `(performance_id, seat_id)`**. Two claims on one seat are
   impossible at the database level.
2. `hold_seats()` deletes expired holds, then inserts holds in one transaction. If any seat
   conflicts, the whole insert fails and the client shows "seat just taken".
3. Payment runs while the hold is active (8 minutes). The Stripe webhook calls `commit_sale()`,
   which flips the holder's holds to `sold` and creates tickets. If the hold expired and someone
   else took the seat, the webhook refunds automatically.
4. Clients subscribe to `seat_claims` changes for the open performance, so seat maps update live.

## Deposits

- The booking wizard calls Edge Function `create-deposit-intent(booking_id)`. The amount is
  **recomputed on the server** from `rental_settings`, never trusted from the client.
- Webhook `payment_intent.succeeded` inserts into `payments` and moves the booking to `confirmed`
  when paid ≥ deposit due.
- Security deposit refunds and cancellations use Stripe Refunds, recorded as negative payments.
- Scheduled function (daily): release `awaiting_deposit` holds past `hold_expires_at`, and email
  balance reminders `balance_due_days` before the event.

## Notifications worth sending

| Event | To |
|---|---|
| New rental request | Owner |
| Request approved (with Pay button deep link `dreamtheatre://booking/<id>`) | Renter |
| Deposit / balance received | Owner + renter |
| Hold expiring in 12 h | Renter |
| Call added / moved / cancelled | Called members |
| Announcement posted | Whole company |
| New message in a channel you're in | Channel members (respect mute) |
| Tickets purchased (receipt + tickets) | Buyer (email) |

## Public ticket sales without the app

`npx expo export --platform web` produces a static site from the same code. Host it at e.g.
`tickets.thedreamtheatre.com` and link it from the GoDaddy site's event listings, so patrons can
pick seats in a browser while the owner runs the box office from the phone app.

## Security checklist

- RLS on every table. Renters only see their own bookings. Others' bookings come back as `busy`
  rows from a `stage_busy` view with title redacted unless `is_public`.
- Only the service role (webhooks) writes `payments` and `seat_claims.status = 'sold'`.
- Ticket codes are random (32-char alphabet, 8 chars ≈ 10¹²). `check_in` is rate-limited and staff-only.
- Store Stripe secret keys only in server-side secrets (e.g. Neon Functions environment variables), never in the app bundle.
