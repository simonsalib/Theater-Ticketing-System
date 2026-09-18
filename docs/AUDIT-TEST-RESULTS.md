# Integration Audit Results

## Final Run

- Date: 2026-09-18
- Runtime: Node.js `v24.21.0`
- Command:

  ```powershell
  npm.cmd exec --yes --package=node@24 -- node node_modules/jest/bin/jest.js --config test/jest-integration.json --runInBand
  ```

- Result: **75 passed, 0 failed, 75 total** in 44.8 seconds.
- Database: a disposable, local MongoDB replica set created by `mongodb-memory-server-core`. The harness never imports `AppModule`, loads `.env`, contacts Azure, sends email, or accesses production data.

The suite expresses the intended safe contract. All cases currently pass without skips or assertions that accept an unsafe result.

## Build Verification

`nest build` completed successfully with Node `v24.21.0` after restricting the production build to `src/**/*.ts`. The artifact is now `dist/main.js`, which matches `start` and `start:prod`; the old output was `dist/src/main.js` and would not have started through those scripts.

## Verified Contracts

- Event creation preserves organizer-selected confirmation mode and timer settings.
- The configured 120-minute seat hold and 90-minute payment deadline are persisted.
- Client-supplied price and confirmed status are ignored.
- Concurrent hold/direct-book attempts produce one winner; a hold is atomically consumed once, and concurrent cleanup/release cannot return capacity twice.
- Cleanup removes ghost seat entries with no live booking/hold owner, and restores an active booking/hold whose event seat claim was accidentally lost. A conflicting claim is left unchanged and logged for manual audit rather than overwriting another buyer.
- Confirmed theater and quantity bookings produce exactly one stable QR per ticket. Missing QRs are repaired without replacing existing QR data, and QR-generation failure rolls back an instant booking.
- Receipt uploads require a supported image and reject an expired booking. The configured cancellation deadline is enforced by the server, and scanned seats are retained when the rest of a booking is cancelled.
- Customers and foreign organizers cannot read or alter another party's booking, receipt, tickets, theater, or event operations.
- Password resets revoke existing bearer tokens. OTPs are purpose-bound, so a reset OTP cannot activate an admin-created account.
- Revenue is calculated from confirmed bookings only, not pending bookings or holds.
- Deleting a theater referenced by an event is rejected.
- Invalid/missing/expired JWTs and expired password-reset OTPs are rejected.
- The local 504-chair availability sample completed 25 requests with p50 `12.26ms`, p95 `14.87ms`, and a `92,517` byte response. This is a local empty-database baseline, not a production load test.

## Remediated Areas

| Area | Implemented protection |
| --- | --- |
| Authorization/data exposure | Ownership checks cover booking, receipt, ticket, event-booking, cancellation, theater, event-deletion OTP, and scanner operations. Public event/user responses exclude secrets. |
| Session and OTP handling | JWT token versioning invalidates old tokens after password reset; OTPs carry a purpose (`reset`, `activation`, or `verification`). |
| Booking state | Server-side seat geometry, attendee, event-state, hold-set, receipt, cancellation, and quantity validation prevents invalid transitions. |
| Inventory concurrency | Hold consumption, release, expiry cleanup, scan claiming, and quantity inventory updates use conditional atomic database operations. |
| Ticket issuance | Per-ticket identity has a unique index; issuance is idempotent, repairs missing tickets, supports quantity events, and rolls back an instant booking when issuance fails. |
| Reporting | Organizer revenue derives from confirmed booking totals rather than reserved capacity. |

## Run Locally

```powershell
cd "D:\Projects\Ticketing System fork\Theater-Ticketing-System\backend-nest"
npm ci
npm run test:integration
```

Use Node 24 for the backend. The first run can download a MongoDB binary into the local test cache. Do not point this test configuration at production MongoDB and do not replace the isolated harness with `AppModule`.

The detailed test source is [ticketing.integration-spec.ts](../backend-nest/test/ticketing.integration-spec.ts). The setup and cross-document invariant checker are in [ticketing-harness.ts](../backend-nest/test/support/ticketing-harness.ts). The broader prioritised audit is [PROJECT-AUDIT.md](PROJECT-AUDIT.md).

## Test Scope Still Needed

- Browser E2E tests for mobile/desktop seat maps, custom row labels, timers, stale tabs, QR download and receipt UI.
- A staging load test with production-like indexes, representative event media and concurrent clients.
- Real scanner-device tests and a periodic authorization-regression run.
- Backup/restore, deployment rollback and external-mail failure exercises.
