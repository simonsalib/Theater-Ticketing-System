# Frontend Audit

## Scope and map

- Reviewed the Next.js App Router surface: public event discovery, authentication, booking, payment receipt, QR tickets, organizer operations, admin, theater design, and scanner views.
- The frontend contains 105 TypeScript/TSX files and 129 direct API call sites. The business-critical flows are concentrated in `bookings/new/[eventId]`, `SeatSelector`, `TheaterDesigner`, `EventForm`, and the organizer booking page.
- The browser is a presentation and workflow layer only. Booking ownership, seat holds, ticket issuance, receipt authorization, and QR consumption must remain backend-authoritative.

## Fixed in this pass

| Risk | Change | Coverage |
| --- | --- | --- |
| A saved seat snapshot stayed stale and could show an unavailable seat as selectable. | `SeatSelector` polls server availability even when it starts with eager data, and drops a selected seat once the server marks it booked, pending, or inactive. | Seat-selector integration test |
| The balcony was clipped on mobile after switching sections, and labels shifted/clipped around the map. | Recalculate canvas scale/height when switching floors; retain label coordinate padding on mobile and reserve space above/beside the map for labels. | Seat-selector balcony-switch integration test; production build |
| Releasing some seats could leave the UI pointing at a hold that had already been released if the reduced hold failed. | Clear stale selection only after the old hold is known to be released; preserve the current hold when release itself fails. | Theater booking integration path; typecheck/build |
| Theater designer callbacks captured old removed/disabled seat state. | Corrected callback dependencies so remove, disable, corridor, undo, and history actions use the latest layout state. | Typecheck/build; browser E2E remains recommended |
| Organizer payment links were rendered directly from API data. | Only render absolute `http`/`https` payment links and reject executable or malformed schemes. | URL security tests |
| Custom theater rows were regenerated instead of using saved labels. | Booking selector, theater designer, and event configurator preserve `rowLabels`. | Seat-selector and configurator tests |
| A row such as `BALC-A` was split incorrectly while saving seat configuration. | Added `createSeatKey` / `parseSeatKey`, which treats only the first and final hyphen as separators. | Seat-key and configurator tests |
| Changing a theater could retain the previous theater's seat overrides/pre-booked seats. | Switching theaters clears theater-scoped configuration before loading the new layout. | Covered by code path; include in future browser E2E |
| Instant-QR general-admission bookings went to the payment screen. | Any confirmed booking redirects to its ticket QR page. | New-booking integration test |
| The booking page highlighted a user's historical seats while creating a new booking. | Removed the unrelated `/user/bookings` request and historical highlight state. | Manual/UI review |
| A stale/missing theater hold could proceed toward a booking request. | The client stops theater booking submission when no active hold exists; backend remains final authority. | Backend integration remains source of truth |
| Old `isAuthenticated` localStorage flag could hide a valid token; failed logout left stale UI state. | Auth restores from token, reacts globally to 401 expiry, and always clears local state on logout. | Auth integration tests |
| The language provider used a function before its declaration. | Moved DOM language synchronization to an explicit module helper. | Language-provider integration test |
| Route errors led to an unhandled blank/error screen. | Added App Router `error.tsx` and `not-found.tsx`. | Production build includes both routes |
| Image object URLs leaked after event-image changes. | Event form revokes replaced object URLs and clears stale previews when URL mode is selected. | Typecheck/build |
| Frontend package runtime conflicted with the Azure Static Web Apps Node 22 workflow. | Frontend engine and CI now consistently use Node 22, which is the deployed frontend runtime. | Node 22 tests, typecheck, production build |
| Old compiler output and a dummy receipt were tracked as application files. | Removed the unused artifacts and ignored future local copies. | Repository file/reference scan |

## Remaining risks

### Must be planned before a larger public launch

1. **Bearer token storage:** the browser keeps the token in `localStorage`. An XSS issue could expose it. Move to short-lived, `HttpOnly`, `Secure`, `SameSite` cookies with server-side CSRF protection; this is a backend/API contract change, not a frontend-only edit.
2. **Deployment API configuration:** `NEXT_PUBLIC_API_URL` must be set in the Static Web App build environment. Its fallback is appropriate only for local/direct backend use and must not be relied on in production.
3. **Real browser E2E:** component integration tests use mocked API responses. Add Playwright against a seeded staging environment for login, CORS, attendee information, hold expiry, receipt upload, organizer approval, instant tickets, scanning, and mobile theater layout.
4. **Scanner privacy:** scanner pages display attendee and purchaser data. Confirm the organizer/scanner policy, minimize the data returned to scanners, and log scan actions on the backend.

### Engineering quality backlog

- `eslint` reports a remaining baseline of 381 findings (250 errors, 131 warnings), mostly explicit `any`, unused imports, raw `<img>` elements, and effect dependencies. Typecheck, tests, and production build are blocking CI now; do not make repository-wide lint blocking until the baseline is remediated in focused batches.
- There are 243 explicit `any` findings. Create API response types and Zod runtime schemas at the API boundary, then replace `any` in booking/auth/theater modules first.
- Several workflow files are too large for safe change review: theater designer, new booking, organizer bookings, user bookings, language context, and admin user creation. Extract API hooks, timer helpers, seat-key helpers, and presentation components without changing public behavior.
- Scanner implementations exist in both `/scanner/[eventId]` and `/my-events/[id]/scan`. Consolidate the shared camera lifecycle, result display, and statistics logic.
- `ProtectedRoutes`, `LanguageSyncer`, `CustomToast`, `SearchBar`, `SocialMedia`, `UserRow`, and `EventSeatTypeEditor` have no active reference found under `src` beyond their own files/styles. Do not delete them blindly; verify with a staging smoke test, then remove or merge them in a dedicated cleanup PR. `RequestCancellationModal` is actively used and must remain.
- The current security headers are useful but incomplete. Add a tested Content Security Policy after listing the actual image/API/QR hosts; a guessed CSP could break receipt images, QR rendering, or the scanner.

## Roadmap

### P0 complete in this change

- Fix availability refresh, custom row serialization, instant-QR routing, session cleanup, event fulfillment/deadline propagation, and theater-switch reset.
- Add a Node 24 frontend quality gate: install, TypeScript check, component integration tests, and production build before deploy.

### P1 next

- Add Playwright staging tests with a disposable event and two users attempting the same seat concurrently.
- Add runtime API schemas for authentication, event, seat availability, booking, ticket, and scan responses.
- Extract booking flow into `useBookingFlow`, `useSeatHold`, and receipt helpers; preserve existing server endpoints.
- Replace manual base64 image payloads with object storage signed uploads when receipts/images grow beyond current limits.

### P2 after P1 is stable

- Remove confirmed dead components and consolidate duplicated scanner/booking screens.
- Introduce performance budgets, route-level loading states, image delivery policy, and a tested CSP.
- Make ESLint blocking after the `any`/hook backlog is reduced in reviewable batches.

## Test boundary

Frontend tests prove rendering, state transitions, requests, and navigation. They cannot prove database atomicity or eliminate ghost/orphan seats on their own. The backend integration suite must keep validating the actual invariants: one active owner per seat, one ticket/QR per confirmed seat, holds expiring safely, and no duplicate ticket issuance.
