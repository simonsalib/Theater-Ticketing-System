# Ticketing System Audit

Audit date: 2026-09-14. Scope: the local checkout, its tracked source/configuration, and disposable integration fixtures. This is a review and regression-test addition, not a production migration or a claim that existing customer bookings are corrupt.

## Build Verification

The backend production scripts start `dist/main.js`, but the previous build configuration also compiled ignored `local-tools` files. TypeScript therefore inferred the repository as its root and emitted `dist/src/main.js`, leaving the production entry point missing. This was corrected during the audit by restricting `tsconfig.build.json` to `src/**/*.ts` and setting `rootDir` to `./src`.

`nest build` completed successfully under Node `v24.21.0` on 2026-09-14, and emitted `dist/main.js` with no `dist/src/main.js` left behind. This is a build-artifact verification only; it does not prove Azure App Service environment variables, networking, or startup health.

## Findings, In Priority Order

### P1: Customer bookings, receipts and QR codes are readable by unrelated users

`backend-nest/src/bookings/bookings.controller.ts:79` forwards only the booking ID to `findOne`; the receipt, event-bookings and cancellation-list endpoints have the same missing ownership check. `backend-nest/src/tickets/tickets.controller.ts:27` and `:94` expose booking tickets and individual tickets without checking the caller. The corresponding services also lack that check. Public event responses expose `bookedSeats.bookingId`, so booking identifiers are discoverable, not a meaningful secret.

Impact: a logged-in customer can obtain another customer's attendee information, receipt or admission QR. Organizer-role checks on event ticket lists and scanning also do not establish ownership of the event. Scanner assignment does not exist in the current schema; whether scanners should be global is a product decision, but an unrelated organizer should not automatically control every event.

Regression coverage: AUTH-01 through AUTH-04, AUTH-08. Repair: shared authorization policies using the actual booking/event ownership; explicit response DTOs; omit private IDs, receipts and QR values from public responses. Test owner, stranger, organizer, unrelated organizer, scanner and admin separately.

### P1: Any authenticated account can change theater layouts

`backend-nest/src/theaters/theaters.controller.ts:23`, `:44`, `:51`, `:59` use only `JwtAuthGuard`. The service does not enforce admin/owner permissions. A customer can change a theater that existing events reference, potentially changing the displayed positions and capacity of already sold seats. The in-use check prevents deletion, but does not protect edits.

Regression: AUTH-05. Repair: role/ownership checks and a published-layout version or immutable event layout snapshot. Permit cosmetic label edits without altering seat identity; constrain structural edits when bookings or holds exist.

### P1: Event approval and deletion authorization can be bypassed

`backend-nest/src/events/events.service.ts:166` accepts `status` updates from the event owner, letting organizers approve their own events. `:222` assigns the whole request onto the document, including sensitive schema fields such as `bookedSeats`, `organizerId`, and OTP data. Public `findOne`/`findAllApproved` return the deletion OTP. `verifyDeletionOTP` at `:360` receives no requesting user, and its controller only requires login.

Impact: self-approval, seat-ledger overwrite, and deletion by another authenticated user when there are no bookings and a valid OTP is available. The existing booking-count protection still applies; this is not an unrestricted deletion of events with bookings.

Regression: AUTH-08 through AUTH-10. Repair: separate admin approval endpoint, allowlisted edit DTO, server-only inventory fields, and admin authorization on both deletion steps. Store purpose-bound hashed challenges outside public event documents.

### P1: Converting a hold into a booking is not atomic or retry-safe

`backend-nest/src/bookings/bookings.service.ts:441` saves a booking, pulls hold entries, pushes booking entries, then deletes the hold. Two requests can both read the same hold and create bookings. Between the pull and push, a competing reservation can claim the temporarily free seat. A subset of held seats is accepted without restoring the unused capacity.

Regression: RACE-01, STATE-15. Repair: atomically consume the hold exactly once; validate the exact unique seat set; perform booking, seat ownership transfer and hold consumption in one transaction; introduce a request idempotency key. Retry must return the original booking and original QR codes.

### P1: Release and status operations can corrupt inventory counters

`backend-nest/src/bookings/bookings.service.ts:260` reads a hold, pulls it, then increments capacity regardless of whether the pull removed anything. Concurrent release/cleanup workers can increment twice. `updateBookingStatus` at `:687` does not constrain previous status: repeated rejection releases capacity repeatedly, and rejected/canceled bookings can be reconfirmed after their seats are resold. `delete` at `:631` can release capacity again for a rejected booking. Quantity-event rejection does not restore capacity through the same rejection branch.

Regression: RACE-02, RACE-06, STATE-08 through STATE-10. Repair: compare-and-set allowed transitions and release only successfully owned claims. One transition should be the only operation entitled to change capacity. Do not treat a periodically recomputed counter as a replacement for concurrency safety.

### P1: Seat validity and event eligibility are not enforced by the backend

`backend-nest/src/bookings/bookings.service.ts:141` and `:301` accept seats without proving they exist, are enabled, are unique, and belong to the event layout. Direct bookings bypass the hold's ten-seat limit. A theater event can fall through to quantity booking when `selectedSeats` is omitted. Pending, declined and past events can be booked by direct API calls. Attendee validation exists in the browser but is absent here. Fractional ticket quantities are accepted.

Regression: STATE-01 through STATE-05, STATE-16/17. Repair: one canonical server-side seat resolver and validation policy for both hold and booking. Validate event state/date, seat identity, quantity, attendee fields, per-order limits and disabled/removed seats. Never use display text as the authoritative seat identity.

### P1: Quantity-based events can oversell

`backend-nest/src/bookings/bookings.service.ts:519` checks a stale `remainingTickets` value before a separate unconditional decrement. Concurrent customers can both succeed for the final ticket. Inventory is decremented before booking persistence, so a failed save loses capacity.

Regression: RACE-05, FAIL-02. Repair: an atomic availability predicate and decrement, coordinated transactionally with booking persistence. Validate integer quantities before any write.

### P1: QR generation can duplicate tickets or leave missing tickets permanently

`backend-nest/src/tickets/tickets.service.ts:47` checks for any existing tickets, then inserts each seat separately. Concurrent generation can create two distinct QR codes for one seat; only `qrData` is unique. If one of several inserts fails, subsequent reads return the partial set instead of repairing missing seats. Both confirmation paths log and swallow ticket-generation errors. Quantity-only bookings never receive QR tickets.

Regression: RACE-04, FAIL-01/03/04. Repair: one persisted ticket identity per booking seat and, where appropriate, one active claim per event seat; idempotent upserts; repair missing seats individually; durable issuance jobs or transactional issuance state. Use cryptographic randomness instead of `Math.random` for bearer QR data. Keep existing valid QR values stable when retrying.

MongoDB's unique multikey index does not prevent duplicate array elements inside the same document, so simply adding a unique index on the current `event.bookedSeats` array is insufficient. [MongoDB multikey documentation](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-multikey/).

### P1: Two scanners can both admit the same QR

`backend-nest/src/tickets/tickets.service.ts:258` checks `isScanned`, then separately saves it as true. Two devices can both read false and return `isFree: true`. The booking check also accepts a missing populated booking because it only rejects when a booking exists with a non-confirmed status.

Regression: RACE-03; orphan-ticket scanning remains an additional test target. Repair: a conditional atomic update requiring `isScanned: false`; reject missing booking/event/user references; enforce the event scope server-side. Define admission start/end timestamps instead of allowing all future events until date plus 24 hours.

### P1: Cancellation can remove a scanned ticket or release a seat that was never owned

`backend-nest/src/bookings/bookings.service.ts:1096` excludes scanned seats from the selected cancellation list but preserves `cancelAll: true`. `approveCancellation` at `:1210` then cancels the entire booking, including the scanned seats. Arbitrary cancellation keys are parsed rather than rejected, and approval increments capacity even if no seat was pulled. Pending cancellation uses submitted key count to decide whether to cancel everything. The configured cancellation deadline is not enforced by these service methods.

Regression: STATE-11/12/13/19. Repair: resolve cancellation keys against the booking, deduplicate, enforce deadline, derive cancel-all from the actual eligible seats, and recheck scanned state inside the approval transaction. Coordinate scan versus cancellation so only one can win.

### P1: Event editing drops holds or turns them into permanent organizer reservations

`frontend-next/src/components/Event Components/EventForm.tsx:55` treats every booked seat without a `bookingId` as organizer-reserved, including entries with `holdId`. `backend-nest/src/events/events.service.ts:207` preserves only booking-linked entries when replacing reservations. Submitting an edit can discard active holds or reclassify them as organizer reservations. The form only submits `preBookedSeats` when non-empty, so clearing every reservation is not reliably sent.

Regression: STATE-14 covers preservation on the backend. Repair: distinguish `bookingId`, `holdId`, and explicit organizer blocks; preserve both customer bookings and holds; submit an empty array when clearing organizer blocks. Reject overlaps with active bookings and holds.

### P1: Blocking or resetting an account does not revoke its existing token

`backend-nest/src/auth/jwt.strategy.ts:29` fetches the user but does not check `isBlocked`, verification or password/session version. Blocking is enforced only on new logins. Password reset changes the hash without revoking prior tokens. Profile GET/PUT return the complete user document, including password hash and any active OTP (`users.service.ts:37`, `:67`). Admin listing excludes only the password, not OTP fields.

Regression: AUTH-06/07/11. Repair: explicit public user DTOs, authorization-time account-state checks, and token/session version invalidation on sensitive changes. A password hash should never be a profile response field.

### P1/P2: OTP and authentication flows need lifecycle controls

`backend-nest/src/auth/auth.service.ts` uses one plaintext OTP field for verification, reset and activation, and generates it with `Math.random`. A reset challenge can be reused for activation (AUTH-12). `submitNewPassword` modifies an admin-created user's password before proving mailbox ownership. No rate limit, resend cooldown or attempt counter is present. Changing profile email does not require verification of the new address.

Repair: separate purpose-bound challenges, cryptographic generation, expiry plus maximum attempts, single-use consumption, and rate limits per account/IP. Stage a new password until verification succeeds. Do not log OTP-bearing mail subjects or full profile update bodies. Rotate the credentials previously shared in the conversation; do not copy them into tests or documentation.

## User-Visible Logic And Performance

1. **Availability polling is disabled on the main purchase path.** `SeatSelector.tsx:50` returns before creating the polling interval when `initialSeatsData` is supplied. The booking page supplies that data. Separate initial hydration from polling; reconcile selected seats after updates and on tab focus. Read-only detail maps currently do not poll either.
2. **Timer display wraps after an hour.** `frontend-next/src/app/bookings/[id]/page.tsx:42` uses minutes modulo one hour, so a 90-minute deadline displays about 30 minutes. The new-booking hold timer supports hours, but timer implementations are duplicated. Derive displays from server timestamps through one helper; refetch on expiry rather than inventing a final server status locally.
3. **Rejected bookings can display as confirmed.** The theater branch in `bookings/[id]/page.tsx:154` maps every status except pending/canceled to confirmed. Use one exhaustive status mapping and one shared status union across pages and API DTOs.
4. **Custom row labels can disappear.** `SeatSelector.tsx:121` generates alphabetic row names instead of consuming the layout's stored `rowLabels`, while the API uses stored row labels. Configured rows may not match the `seatMap` keys. Test custom labels, balcony prefixes, more than 26 rows and both stage orientations.
5. **Ticket details expect fields the API does not return.** The ticket page reads `startTime`, `endTime` and `cancellationDeadline`, but `getTicketsByBooking` populates only `title date location`. Define and test one ticket response contract.
6. **Dynamic HTML is not escaped.** `bookings/[id]/tickets/page.tsx:302` interpolates `seatRow` into `document.write` HTML. Backend seat input accepts arbitrary row strings. Replace string interpolation with DOM text nodes or correctly escaped content; keep downloaded canvas images separate from HTML construction. This is a code-level injection path; browser exploitation was not attempted.
7. **Receipt uploads are trusted strings.** `bookings.service.ts:793` accepts arbitrary `receiptBase64` and clears expiry without checking the deadline, image validity or decoded size. Malformed text can hold seats indefinitely. Validate MIME, image bytes/dimensions and size server-side; apply a bounded organizer review deadline distinct from the payment deadline.
8. **Unbounded lists carry heavy fields.** Public approved events return complete documents, including embedded images and seat ledgers. User booking lists include receipts and populated event media. Add projection, pagination and separate authenticated media retrieval; return a lean availability response with a layout version so the static layout does not repeat every poll.
9. **Cleanup scales with total inventory.** Every process starts a 60-second interval and scans all events containing seats, with additional queries per event. There is no distributed ownership or shutdown cleanup. Use an idempotent worker/lease; index expiry and state queries; keep integrity auditing read-only and separate from expiration processing.
10. **Query indexes are missing.** Booking and hold schemas declare no indexes for frequent `eventId/status`, `StandardId/createdAt`, or expiry queries. Add indexes based on measured query plans, avoiding TTL deletion that bypasses seat release. Precompute config maps to replace repeated linear seat-config scans.
11. **Revenue is estimated from occupied capacity.** `events.service.ts:437` includes temporary holds and pending reservations as sold, then multiplies by the average tier price. Aggregate actual financial/booking records and distinguish occupied, paid, confirmed, canceled and refunded quantities. Regression STATE-18.
12. **Availability is not one source of truth.** Seat state is spread across event entries, holds, bookings, tickets and a mutable remaining counter. Establish a seat claim/state model and explicit invariants; retain the organizer-blocked exception rather than demanding a user and QR for intentionally blocked seats.

## Project Roadmap

| Order | Area | Read And Trace | Completion Gate |
| --- | --- | --- | --- |
| 1 | Bootstrap/deployment | package files, `main.ts`, AppModule, GitHub workflows, Next config, frontend API config | Known runtime matrix; failed checks block promotion; isolated tests |
| 2 | Identity/security | auth/users schemas, services/controllers, JWT/role guards, AuthContext and protected routes | Ownership matrix, OTP lifecycle, blocked/revoked sessions |
| 3 | Theater/event configuration | theater schema/designer, event schema/form, reservation updates | Stable seat identity; preserved bookings/holds; validated layouts |
| 4 | Purchase | SeatSelector, purchase page, hold/booking/receipt endpoints | Exactly one claim per chair across retries/concurrency |
| 5 | Fulfilment/admission | confirmation, ticket generation/download, organizer/scanner pages | Exactly one QR per confirmed seat; exactly one admission |
| 6 | Cancellation/expiry | partial/full cancellation, receipt review, background cleanup | Inventory released once; scanned tickets protected |
| 7 | Reporting/performance | event lists, user lists, availability, analytics, indexes | Accurate revenue, bounded payloads, measured latency |
| 8 | Cleanup/maintenance | duplicate components, unused packages, artifacts, types and docs | Reachability verified; tests remain reproducible |

Recommended repair sequence: authorization and response redaction first; atomic seat claims/status transitions and scan protection next; QR issuance/cancellation recovery next; frontend contract repairs next; indexes/pagination and dependency upgrades next. Cleanup of unused files should follow the behavioral repairs, not replace them.

For cross-document invariants, use MongoDB transactions on a replica set with retry handling; single-document atomicity alone does not cover separate booking/event/ticket writes. [MongoDB atomicity documentation](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).

## Existing Things To Remove Or Consolidate

- The file map flags component candidates with no inbound static imports, including legacy BookingDetails, BookingTicketForm, EventDetailPage, EditEventPage, AdminEventsPage, EventAnalytics and old homepage components. Verify route reachability/dynamic imports before removal; CSS can still be imported by live pages.
- Keep one purchase flow, one details view, one scanner implementation, one protected-route component, one receipt compressor, one countdown formatter and one API response adapter. The unused copies explain why a fix in a component can leave the actual route unchanged.
- `frontend-next/ts_errors.txt`, `tsc-errors*.txt`, `dummy_receipt.png`, the empty `tmp/concurrent_booking_test.ts`, default framework icons and historical IDE HTTP responses are artifact candidates. Check actual asset references before deleting.
- `.idea/httpRequests` and cookie/history files are tracked. Remove them from future commits and evaluate whether history contains credentials or private responses; ignoring a file does not remove earlier tracked versions. This audit does not reproduce their contents.
- `frontend-next/.env` is tracked despite root ignore rules. Public build configuration can be intentional, but use a documented `.env.example` and managed deployment variables; never treat `NEXT_PUBLIC_*` as secret.
- The backend still declares mailgun.js, nodemailer and resend although MailService imports googleapis. Remove unused providers after verifying imports. The root package duplicates frontend-oriented dependencies and needs a clear workspace/tooling purpose.
- Replace `any` DTOs and duplicated loose interfaces with validated request/response types. The frontend's `... | string` status unions do not detect spelling/state mistakes.

## Important Missing Capabilities

- Durable idempotency keys and a business event/audit log for holds, payments, approvals, scans and refunds, including actor and previous/new state.
- Explicit `held`, `awaiting_payment`, `awaiting_review`, `confirmed`, `rejected`, `expired`, `canceled` transitions. Admission confirmation and proof of payment are distinct facts.
- A reliable ticket-issuance/outbox retry mechanism with a visible failed/pending state instead of swallowed exceptions.
- Separate scanner-to-event assignments if scanners are not intentionally global.
- Server-enforced booking/admission/cancellation windows with a consistent timezone and actual start/end timestamps.
- A read-only integrity dashboard covering both floors, separating organizer blocks from missing customers/tickets, plus alerts for duplicates, missing QRs and inventory drift.
- Readiness/health checks, structured request IDs, exception metrics, database backup/restore drills and a documented deployment rollback.
- Browser automation for desktop/mobile booking, multi-tab holds, stale availability, receipt failures and QR download; staging camera tests on real phones.

## Verification And Limits

See `AUDIT-TEST-RESULTS.md` for the final run and case-by-case status. The automated file map inventories every tracked file and parses local TypeScript/JavaScript imports and API calls. Generated dependencies/builds, binary image pixels, private environment values and historical HTTP payloads are not claimed as line-by-line manual reviews. Critical live paths received detailed code review; the map is the roadmap for remaining UI/presentation depth.

The integration harness uses real Nest controllers, services, JWT/role guards, Mongoose schemas, MongoDB queries and QR generation. Email delivery is stubbed; no real OTP is sent. It creates a local disposable MongoDB replica set and never imports AppModule or loads `.env`. Startup scheduling is disabled in the harness and cleanup is invoked explicitly. HTTP tests are API integration, not browser end-to-end tests or proof of Azure configuration.

Tests deliberately assert the required safe behavior. Existing defects therefore fail the suite; they are not hidden with `test.failing`, skips or assertions that bless the current bug. Several cases can fail from one shared defect, so failed-test count is not a count of independent vulnerabilities.

Deployment review: backend CI currently runs `npm run test --if-present || true`, allowing failed tests to deploy. Frontend declares Node 22 while backend/root declare Node 24. Document a supported split or align the versions after checking hosting support. The current backend test scaffolds fail dependency injection and do not exercise business behavior. The original E2E test imports AppModule, which can read the real `.env` and start cleanup; do not use it against production credentials.

Dependency audit snapshot (`npm audit --omit=dev`): frontend 8 package findings (1 critical, 5 high, 2 moderate); backend 21 (11 high, 9 moderate, 1 low). These are registry findings and require applicability triage, not evidence every advisory is exploitable in this app. Next 16.1.0 and related libraries need a reviewed patch upgrade; do not use an unreviewed `npm audit fix --force`. Examples from the audit feed: [Next advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [Nest advisory](https://github.com/advisories/GHSA-36xv-jgw5-4q75).

No production booking data was changed during this review. No production fixes, commits, pushes or deployments were performed as part of this audit.
