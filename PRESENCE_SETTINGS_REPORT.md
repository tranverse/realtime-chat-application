# Presence and Settings verification

## Backend

Presence is ephemeral Redis state, not a MySQL user column. Each authenticated STOMP session is a member of `chat:presence:user:{userId}`, a sorted set scored by expiry. An atomic Lua script prunes, touches/removes sessions and publishes only effective transitions. Separate `chat:presence:deadlines`, `chat:presence:online` and `chat:presence:events` keys/channel handle expiry and transition delivery. Existing OTP and OAuth exchange namespaces are unchanged.

Defaults: heartbeat 25 seconds, session expiry 75 seconds, sweep 5 seconds; all configurable. Multiple tabs/devices remain Online while any valid session remains. Clean disconnect removes its own session; silent loss expires. Redis Pub/Sub forwards transitions to each local STOMP broker; it is not a durable event log or a claim of clustered deployment. The multi-key Lua script targets standalone Redis, not Redis Cluster.

Additions: authenticated `GET /api/v1/users/{userId}/presence`, `GET /api/v1/presence/config`, `/app/presence/heartbeat`, `/topic/presence/{userId}`. REST and subscriptions allow self or active direct-conversation peers. Group membership alone is insufficient. Client SEND to presence broker topics is rejected. Heartbeat identity/session come from authenticated Spring headers.

Full `mvnw.cmd test`: **56 passed, 0 failures/errors/skipped**. Real Redis and MySQL Testcontainers ran. New coverage includes multi-session transitions, heartbeat, silent expiry, concurrent session updates, reconnect, event deduplication, namespace isolation and authorization. Maven returned BUILD SUCCESS/exit 0; Surefire also logged a fork shutdown timeout after completed tests, which is not represented as a clean shutdown.

## Frontend

Direct headers use authenticated snapshots and realtime peer presence; groups show member count. Unknown/unavailable presence is not fabricated Offline. Switching peers cleans subscriptions without recreating the session-scoped transport. Reconnect and periodic snapshots reconcile Redis Pub/Sub gaps. Old-client callbacks are guarded, and heartbeat timers stop on logout/disconnect.

Settings and Profile remain separate. Shared localStorage preferences support cross-tab synchronization: Light/Dark/System, IME-safe Enter-to-send, and in-app Notifications visibility without deleting unread/message state. Density is removed. Profile/session shortcuts reuse existing controls; Active sessions does not claim a device enumeration API. Existing avatar uploads, stable Notifications navigation and viewport composer layout remain.

- Lint: exit 0; three non-blocking React lint warnings remain.
- Tests: **45 passed across 16 files**.
- Production build: passed, including Docker build.
- Visual review: Light/Dark Settings and mobile composer screenshots inspected.

## System verification and release status

Playwright uses real browsers with Docker MySQL, Redis, backend, frontend and Mailpit. The local ignored Compose override builds the working repositories rather than stale parent submodule pointers.

An earlier complete run passed all 7 journeys. After adding the backend presence SEND-spoof guard, the final rebuild run passed 2 journeys but hit the 60-second aggregate private-chat timeout; 4 serial tests did not run. Both captured browsers showed reply, edited/deleted messages, quoted reply and Seen. The two multi-browser journeys now have a 120-second aggregate budget; assertion timeouts and production behavior are unchanged. A clean-data rerun is required before merge.

The clean-data rerun was blocked by infrastructure: MySQL initially exceeded the Compose health-check deadline, then completed initialization and became healthy. Starting the remaining services subsequently failed with HTTP 500 from Docker Desktop's `dockerDesktopLinuxEngine/v1.51/containers/.../json` inspection route. The final browser rerun could not start. No unrelated code or Docker Desktop configuration was changed to bypass this failure.

Final E2E: **not fully verified on the final backend build** (2 passed, 1 aggregate timeout, 4 skipped in the last completed run). k6 smoke: **not run**, because the clean environment did not become ready and had not seeded test accounts. The earlier 7/7 run is useful evidence but is not substituted for final verification.

**Merge status: blocked, not safe to declare ready under the requested merge rule. Nothing merged or pushed.** Restore Docker Desktop health, run the clean parent E2E workflow and k6, then review/merge normally. Temporary E2E containers may remain because the engine failed; cleanup is limited to Compose project `luma-presence-e2e`. Do not remove unrelated containers.

## Git status

All work remains on `feat/user-presence` in the three repositories. Main branches were not modified by implementation work.

- Backend feature commits: `d01053b` (implementation), `c034a1c` (tests/docs). No merged backend SHA.
- Frontend feature commits: `9b3b7b9` (presence/lifecycle), `24eaa34` (preferences). No merged frontend SHA.
- Parent test commits: `18ea0db`, `8b2f405`; this report is committed separately. No final parent release SHA.
- Parent backend/frontend submodule pointers remain unchanged, intentionally, until final verification and child merges succeed.
- Pushed: **no**. Force push: **no**.

## Changed files

Backend: new `presence/` source/tests and `docs/PRESENCE.md`; changes to the WebSocket interceptor/tests, member repository and application/test configuration.

Frontend: presence source/tests; shared realtime lifecycle/tests; Settings preferences/theme/tests; workspace/profile navigation; composer keyboard tests and multiline rendering; rail/auth layout and shared theme CSS. See `docs/PREFERENCES_AND_PRESENCE.md`.

Parent: `e2e/chat-features.spec.ts` and this report; submodule update is pending successful verification. Review the exact file lists with `git diff --name-only main...HEAD` in each repository.
