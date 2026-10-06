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

An earlier complete run passed all 7 journeys. After adding the backend presence SEND-spoof guard, a rebuild run passed 2 journeys but hit the 60-second aggregate private-chat timeout; 4 serial tests did not run. Both captured browsers showed reply, edited/deleted messages, quoted reply and Seen. The two multi-browser journeys now have a 120-second aggregate budget; assertion timeouts and production behavior are unchanged.

The clean-data rerun was blocked by infrastructure: MySQL initially exceeded the Compose health-check deadline, then completed initialization and became healthy. Starting the remaining services subsequently failed with HTTP 500 from Docker Desktop's `dockerDesktopLinuxEngine/v1.51/containers/.../json` inspection route. The final browser rerun could not start. No unrelated code or Docker Desktop configuration was changed to bypass this failure.

After Docker Desktop recovered on 2026-10-07, the final backend/frontend images were rebuilt and the isolated environment became healthy. **Final Playwright: 7 passed, 0 failures/skipped, 48.8 seconds.** The previously timed-out private journey passed in 12.8 seconds. Coverage includes authentication/session restoration, invalid login, private realtime reply/edit/delete/read receipts, group membership/confirmed leave, multi-tab presence/logout/reconnect, stable transport navigation, persisted Settings and presence API authorization.

**Existing k6 smoke passed:** 10 maximum virtual users over 20 seconds, 598 iterations, 1,795 HTTP requests, 1,794/1,794 successful checks, 0 failed requests, HTTP p95 282.95 ms (threshold <750 ms). This measures local profile/conversation/history API read paths, not a presence stress test or a production capacity guarantee.

**Merge status: verification passed.** Backend and frontend were normally merged and pushed; parent pointers now target those exact merged SHAs. No production code changed during infrastructure recovery. Cleanup is scoped only to temporary Compose project `luma-presence-e2e`.

## Git status

Implementation and test/document changes were made on `feat/user-presence`, not directly on main. Main was updated only by the explicitly authorized normal merges after verification.

- Backend feature commits: `d01053b` (implementation), `c034a1c` (tests/docs). Merged/pushed backend SHA: `2f6bf128536c25f747b77f049a03e9aeccd3aa19`.
- Frontend feature commits: `9b3b7b9` (presence/lifecycle), `24eaa34` (preferences). Merged/pushed frontend SHA: `d8f1bdc3d5678f8ffc4f20decdba8f952a46313b`.
- Parent test commits: `18ea0db`, `8b2f405`; report history is preserved, including the earlier blocked state.
- Parent backend/frontend submodule pointers equal the merged SHAs above. The final parent SHA is supplied in the completion message and can be verified with `git rev-parse main` (the report cannot contain its own commit hash).
- Normal pushes only; force push: **no**. Feature branches are retained.

## Changed files

Backend: new `presence/` source/tests and `docs/PRESENCE.md`; changes to the WebSocket interceptor/tests, member repository and application/test configuration.

Frontend: presence source/tests; shared realtime lifecycle/tests; Settings preferences/theme/tests; workspace/profile navigation; composer keyboard tests and multiline rendering; rail/auth layout and shared theme CSS. See `docs/PREFERENCES_AND_PRESENCE.md`.

Parent: `e2e/chat-features.spec.ts`, this report and both submodule pointers. Review exact file lists from the retained feature branches/merge commits. The local `.docker-e2e` build override and generated browser artifacts are ignored, not committed.
