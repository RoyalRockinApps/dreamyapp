# Going live: backend, payments and notifications

The app ships local-first. All state lives in one Zustand store (`src/store/useStore.ts`),
persisted to AsyncStorage. That is enough for demos and a single owner device. With real renters,
cast and ticket buyers, every device has to share one source of truth. This is the recommended path.

## Stack

| Need | Recommendation | Why |
|---|---|---|
| Database, auth, realtime | **Supabase** (Postgres + Auth + Realtime + Edge Functions) | Row-level security maps cleanly to owner / renter / member roles, and Realtime powers chat and live seat maps |
| Card payments | **Stripe** (`@stripe/stripe-react-native` PaymentSheet) | Apple Pay / Google Pay, PCI handled by Stripe, deposits + refunds |
| Push notifications | **expo-notifications** + Expo Push API | New requests, deposit received, schedule changes, new messages |
| Builds & updates | **EAS Build / Submit / Update** | No Mac needed; OTA fixes without store review |

`docs/schema.sql` contains the tables, RLS sketch and the race-safe seat purchase function.

## Mapping store actions to the API

Every screen calls store actions only, so the migration is mostly swapping action bodies:

| Store action | Backend |
|---|---|
| `createBooking`, `setBookingStatus`, `updateBooking` | `insert/update bookings` (RLS: renter can insert their own, only owner can approve) |
| `addPayment` | written only by the Stripe webhook (`payment_intent.succeeded`), never by the client |
| `hold(performanceId, seats)` | `rpc('hold_seats')` |
| `purchase(...)` | Edge Function `create-ticket-intent` → Stripe → webhook calls `rpc('commit_sale')` |
| `refundTicket` | Edge Function: Stripe refund + delete claim + void ticket |
| `sendMessage`, `markRead` | `insert messages`; subscribe with `supabase.channel('messages:production_id=eq.X')` |
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
- Store Stripe secret keys only in Supabase Edge Function secrets, never in the app bundle.
