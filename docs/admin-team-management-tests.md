# Admin team management validation

Production site: https://battle-arena-xi.vercel.app

Validated on 12 October 2026:

- Typecheck and production build passed.
- All 25 existing unit tests passed.
- Lint passed with the existing React warnings.
- `supabase db query --linked --file supabase/tests/admin_team_management.sql` passed on the actual Supabase database. All writes in that test were rolled back.
- Database checks covered administrator authorization, missing authorization, blank/oversized words, invalid/null rounds, all three round assignments, isolation between rounds, affected team counts, original-word snapshots after a target changes, historical guesses without snapshots, scoring, duplicate-guess rejection, participant secrecy, and deletion of the profile, words, guesses, active chat, and archived chat. Other teams' records remained intact.
- Both score-recording function signatures were confirmed inaccessible to participants. The older deployed signature required an explicit permission fix in migration `20261012000200_submission_server_permissions.sql`.
- The deployed deletion endpoint rejected missing and invalid login tokens with 401, rejected GET with 405, and accepted browser preflight with 200.
- The existing authenticated Chrome session displayed all three independent shared-word controls and loaded 58 teams in the new guesses dashboard without an error banner.

The automated authenticated browser tests reached the login screen but could not proceed because the previously provided admin password was rejected. A separate browser was opened for manual sign-in; its five-minute sign-in window expired. These tests are implemented but remain pending:

- Desktop and phone result filtering and page width.
- Independent round input values and cancellation of bulk changes.
- Creating a disposable team, seeding active and archived chat and a guess in the actual database, displaying the original word and timestamp after a target change, cancelling deletion, confirming deletion, verifying zero related rows, and rejecting login to the deleted account.

To finish those checks without sharing a password, set `E2E_BASE_URL` to the production URL and `E2E_ADMIN_STORAGE_STATE` to an ignored absolute `.local` filename. Run `node scripts/capture-e2e-admin-session.mjs`, sign in in the browser, then run `npx playwright test tests/e2e/admin-secrets.spec.ts tests/e2e/admin-management.spec.ts` with the same environment. Delete the temporary session file afterward. The Supabase CLI must be authenticated and linked to the same project as the deployed site because the disposable-team test seeds and verifies database records.

Shared words currently apply to existing teams. Newly registered teams are configured in the per-team controls. Existing submissions retain their scores and locks. Original words for older submissions are shown as unavailable rather than inferred from today's target.
