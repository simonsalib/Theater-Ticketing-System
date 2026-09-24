# Frontend Verification Results

## Runtime

- Node: `v22.14.0`
- Next.js: `16.1.0`
- Test runner: Vitest `3.2.4`

## Automated checks

| Command | Result |
| --- | --- |
| `tsc --noEmit` under Node 22 | Passed |
| `vitest run` under Node 22 | Passed: 9 files, 18 tests |
| `next build` under Node 22 | Passed; all 29 app routes generated |
| Local route smoke test | Passed: HTTP 200 from `/events/6a89d5a6cb4651200e13dc26` |
| Repository-wide ESLint | Existing baseline failure; tracked in `FRONTEND-AUDIT.md`, not used as a deploy gate yet |

## Current integration coverage

1. Restores a valid token-based session without the obsolete localStorage flag.
2. Clears protected UI state after a shared API 401-expiry event.
3. Clears local auth UI state even when remote logout fails.
4. Renders saved custom theater row labels and refreshes an eager availability snapshot.
5. Sends a confirmed general-admission booking to the QR ticket route.
6. Serializes/parses seat keys that contain hyphenated row names.
7. Preserves event-configurator labels and saves `BALC-A` seats without corruption.
8. Sends organizer-selected payment and seat-hold deadlines while creating an event.
9. Restores saved Arabic language and synchronizes the document language/direction.
10. Switches from the main floor to configured balcony rows without rendering an empty section.
11. Holds a theater seat, submits its attendee ownership data, omits client-forged status, and routes a confirmed booking to its QR ticket page.
12. Accepts only `http`/`https` organizer payment links and rejects executable or malformed schemes.
13. Creates an instant-QR event with organizer confirmation disabled.
14. Redirects anonymous and wrong-role users while rendering protected content for the allowed role.
15. Maps empty balcony row configuration to `BALC-*` inventory rows so real seat buttons render instead of placeholders.

## CI gate

`.github/workflows/azure-static-web-apps-purple-wave-002c50103.yml` runs `npm ci`, typecheck, frontend integration tests, and a production build on Node 22 before the Azure Static Web Apps deploy step.

The remaining gap is real-browser staging E2E. The local browser-control service was unavailable during this pass, so the mobile layout is covered by component integration plus production build, not a new screenshot run. Staging E2E should cover the API/CORS boundary, camera permissions, actual QR scan, mobile floor switching/labels, and concurrent customers trying to reserve the same seat.
