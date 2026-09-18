# Frontend Verification Results

## Runtime

- Node: `v24.21.0`
- Next.js: `16.1.0`
- Test runner: Vitest `3.2.4`

## Automated checks

| Command | Result |
| --- | --- |
| `tsc --noEmit` under Node 24 | Passed |
| `vitest run` under Node 24 | Passed: 7 files, 10 tests |
| `next build` under Node 24 | Passed; all 29 app routes generated |
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

## CI gate

`.github/workflows/azure-static-web-apps-purple-wave-002c50103.yml` now runs `npm ci`, typecheck, frontend integration tests, and a production build on Node 24 before the Azure Static Web Apps deploy step.

The remaining gap is real-browser staging E2E. It should cover the API/CORS boundary, camera permissions, actual QR scan, and concurrent customers trying to reserve the same seat.
