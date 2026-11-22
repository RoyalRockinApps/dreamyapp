# Going live: backend, payments and notifications

## Status

The live backend runs on **Supabase** (free plan, DagerHappens organization): Postgres, Supabase
Auth, the PostgREST API and Realtime. It moved here from Neon in Nov 2026 to get password sign-in
for App Review, sessions that work in every browser, and Realtime instead of polling.

| Piece | State |
|---|---|
| Shared database, row-level security, email + password sign-in | **Done.** `supabase/migrations/`, `src/lib/remote/`, `src/components/LiveGate.tsx` |
| Linking a sign-in to an existing person | **Owner-approved** (`link_me()`, `link_requests`). New emails become renters immediately; a renter in no company only applies for auditions (`private.is_affiliated()`, `guard_outsider_sales`) |
| Delete my account (App Store 5.1.1(v)) | **Done.** `delete_my_account()`; bookkeeping rows stay, personal details go |
| Seat holds, sales, refunds, check-in, booking payments as server functions | **Done.** Prices and fees are computed on the server |
| Seeing other people's changes | **Realtime** (`postgres_changes` in `src/store/sync.ts`), a full refresh every 5 minutes, and fast re-checks on the seat picker, chat and door only while Realtime is down |
| Email (verification, password reset) | Not yet: no email sender. "Confirm email" is off; passwords are reset by the owner in the dashboard |
| Card payments | **Simulated.** `purchase_seats()` and `add_payment()` accept the demo card. Next: Stripe (below) |
| Push notifications | **Done.** `push_tokens`, `register_push_token()`, and triggers that send through Expo's push service with pg_net (`20261121000100_push_notifications.sql`). Needs an APNs key on the Expo project; Android needs FCM. Not yet: removing tokens Expo reports as `DeviceNotRegistered` |
| Email receipts | Not started |

Builds without the Supabase settings (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) still run the
on-device demo, where all state lives in the Zustand store (`src/store/useStore.ts`) persisted to
AsyncStorage.

**Grants.** Supabase normally gives its API roles every privilege on each new table and function.
The first migration turns that default off so each table gets exactly the access its migration
grants, including column-level limits (e.g. which `production_plans` columns a director may change).
`supabase/tests/db.test.ts` checks this.

## Stack

| Need | Recommendation | Why |
|---|---|---|
| Database, auth, realtime | **Supabase** (Postgres + Auth + Realtime + Edge Functions) | Row-level security maps cleanly to owner / renter / member roles, and Realtime powers chat and live seat maps |
| Card payments | **Stripe** (`@stripe/stripe-react-native` PaymentSheet) | Apple Pay / Google Pay, PCI handled by Stripe, deposits + refunds |
| Push notifications | **expo-notifications** + Expo Push API | New requests, deposit received, schedule changes, new messages |
| Builds & updates | **EAS Build / Submit / Update** | No Mac needed; OTA fixes without store review |

`supabase/migrations/` contains the tables, row-level security and the race-safe seat functions;
`supabase/config.toml` holds the project settings, including auth.

## Mapping store actions to the API

Every screen calls store actions only, so the migration is mostly swapping action bodies:

| Store action | Backend |
|---|---|
| `createBooking`, `setBookingStatus`, `updateBooking` | `insert/update bookings` (RLS: renter can insert their own, only owner can approve) |
| `addPayment` | written only by the Stripe webhook (`payment_intent.succeeded`), never by the client |
| `hold(performanceId, seats)` | `rpc('hold_seats')` |
| `purchase(...)` | Edge Function `create-ticket-intent` → Stripe → webhook calls `rpc('commit_sale')` |
| `refundTicket` | Edge Function: Stripe refund + delete claim + void ticket |
| `sendMessage`, `markRead` | `insert messages`; Realtime delivers new messages |
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
| Call added / moved / cancelled | Called members (**sent**) |
| Announcement posted, production stage changed | Whole company (**sent**) |
| Card assigned | The assignee (**sent**) |
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
- Store Stripe secret keys only in Supabase Edge Function secrets, never in the app bundle.
