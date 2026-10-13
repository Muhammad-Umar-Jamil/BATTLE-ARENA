# Provider retries and live streaming

Updated 13 October 2026.

## Behavior

Each prompt repeats primary, primary, fallback, fallback until a complete, nonempty answer succeeds. There is no attempt-count limit. If only one endpoint has both a URL and a key, all attempts use that endpoint. If neither is configured, the request returns a configuration error immediately.

Each attempt uses the admin-configured timeout. Failed attempts have a one-second pause. Closing the connection aborts the active provider request. Supabase's execution lifetime still applies; this is not a persistent background job that survives server termination.

Provider chunks reach the browser immediately. The browser reveals them using the character gap sent at the beginning of the request. If a partial response fails, a reset event clears both the visible partial answer and queued characters before the next attempt. Only a complete successful answer is saved with the submitted prompt.

The retry event identifies a safe failure category and HTTP status when available. Provider error bodies, keys, prompts, and secrets are not logged. Configuration lookup, history lookup, connection, unexpected server, and chat-saving failures are reported separately.

## Verification

- Typecheck and production build passed.
- 38 unit tests across 9 files passed, including retry ordering beyond eight failures, single-provider behavior, split Unicode streaming before completion, malformed/empty/interrupted provider replies, retry/reset/heartbeat events, and resetting a character queue while its timer is pending.
- Lint passed with existing React warnings; build retains the existing bundle-size warning.
- Deno checked the deployed gateway source successfully.
- Real Makerend POST requests used the saved credentials and configured models for all three rounds. All three returned HTTP 500: round 1 `gpt-4o`, round 2 `gpt-5.6-terra`, round 3 `gpt-6-luna`. These checks confirm upstream HTTP failures, but do not establish their underlying cause.
- No fallback endpoint was configured for any round during these checks.

## Remaining live verification

A successful real-provider stream could not be verified because all three provider checks failed. An authenticated participant browser test was not completed: the previously connected signed-in Chrome profile is unavailable, and the event's saved end time has already passed. No event timing, account credentials, or provider settings were changed for testing.
