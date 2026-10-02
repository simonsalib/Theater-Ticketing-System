# Seat Integrity and Load Test

Date: 2026-10-02

## Scope

The test runs against a disposable MongoDB replica set. It uses the real booking, hold, expiry, cancellation, ticket, and QR services without reading or changing production customer data.

## Scenarios

- 24 simultaneous holds across main-floor and balcony seats.
- 6 hold cancellations.
- 18 atomic hold-to-pending conversions.
- 4 pending booking cancellations.
- 4 pending booking expirations and cleanup.
- 10 organizer confirmations with exactly one QR per seat.
- 3 approved cancellations after confirmation.
- 30 users competing for the same chair; exactly one winner.
- 100 users competing for 60 physical chairs; exactly 60 winners and 40 conflicts.
- 60 simultaneous pending cancellations; all inventory restored.
- Integrity audit after every state transition.

## Result

```text
LOAD_RESULT users=62 stages=7 elapsedMs=11301 finalRemaining=52 integrity=healthy
CAPACITY_RESULT attempts=100 winners=60 rejected=40 elapsedMs=1357 finalRemaining=60 integrity=healthy
Integration tests: 77 passed
Seat-audit rule tests: 3 passed
Backend build: passed
```

No double booking, orphan booking seat, ghost booking/hold seat, duplicate QR, missing QR, user mismatch, or inventory counter mismatch was found.

The production event `6ab3f8975efce7d06f343339` was audited read-only. It had 504 total seats, 503 remaining seats, one confirmed seat and one QR, with no integrity issues.

## Interpretation

This proves correctness for the tested concurrency levels and confirms at least 100 simultaneous booking attempts in the local integration environment. It is not an Azure throughput ceiling: production request capacity also depends on the App Service plan, instance count, network latency, and MongoDB tier. A production performance ceiling should be measured only against a dedicated empty event, never an event containing customer bookings.
