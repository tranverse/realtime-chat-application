# Realtime Chat Application

Realtime private/group messaging with image sharing, read tracking and real multi-session presence. A React/TypeScript SPA communicates with one Java/Spring Boot **modular-monolith** backend through REST and STOMP/WebSocket. MySQL stores durable application data; Redis holds narrowly scoped ephemeral authentication/presence state.

This repository pins backend/frontend revisions as Git submodules and owns full-system Docker, Playwright and k6 regression verification. It is not a microservices deployment or a claim of production hosting.

## Key capabilities

- Email/OTP registration, password login/recovery, Google OAuth2, JWT refresh rotation/reuse detection and refresh-session revocation.
- Direct and group chats with roles, member management, ownership transfer, invitations and join-request approval.
- Realtime text/image messages, replies, edits, soft deletion, typing and read receipts; cursor history and reconnect reconciliation.
- Authenticated image upload through the backend to Cloudinary, including profile/group avatars.
- Redis-backed peer Online/Offline presence across tabs/devices, distinct from the local socket connection state.
- Responsive React interface with stable Notifications/Settings views and persisted Light/Dark/System, Enter-to-send and notification visibility.

## System architecture

```text
                              Browser
                                 |
                     React / TypeScript SPA
                 Router + Query cache + Preferences
                                 |
                 +---------------+---------------+
                 |                               |
            REST /api/v1/**                  STOMP /ws
                 |                               |
                 +---------------+---------------+
                                 |
                   Spring Boot modular monolith
                  Spring Security + Controllers
                                 |
       +---------+---------+-------------+----------+---------+
       |         |         |             |          |         |
      Auth     Users  Conversations   Messaging    Media   Presence
       |         |         |             |          |         |
       +---------+---------+-------------+----------+---------+
                                 |
              +------------------+------------------+
              |                  |                  |
            MySQL              Redis            Cloudinary
     users / memberships   OTP rate limits       image bytes
     messages / tokens     OAuth exchange codes
     invites / requests    presence sessions/events

     Auth also integrates with Google OAuth2 and SMTP email.
```

The backend modules are responsibility-based services in a layered application, not separate processes. HTTP/STOMP entry points reuse business services; services enforce resource permissions and transaction rules; JPA repositories persist to MySQL. Presence has its own Redis lifecycle. The React SPA is a separate delivery artifact, not another backend microservice.

| Boundary | Responsibility |
| --- | --- |
| Auth | OTP/login/reset, OAuth exchange, JWT issuance, refresh families and revocation |
| Users | Profiles, account data and user search |
| Conversations | Direct/group lifecycle, membership/roles, ownership, invites and join requests |
| Messaging | Validation, per-conversation ordering, history, reply/edit/delete/read/typing |
| Media | Authenticated image validation/upload, with metadata stored alongside messages |
| Presence | Authenticated socket sessions, heartbeat, expiry and effective transitions |
| Frontend | Routing/auth bootstrap, server-state cache, shared transport and local preferences |

## Repository structure

| Path | Role | Repository |
| --- | --- | --- |
| `backend/` | Java 21, Spring Boot 4.0.6, Security/JPA, MySQL, Redis, Flyway, Cloudinary | [realtime-chat-server](https://github.com/tranverse/realtime-chat-server) |
| `frontend/` | React 19.2, TypeScript 6.0, Vite 8.2, Tailwind 4.3, TanStack Query, STOMP/SockJS | [realtime-chat-client](https://github.com/tranverse/realtime-chat-client) |
| `compose.e2e.yml` | Isolated MySQL/Redis/Mailpit/backend/frontend and k6 services | This repository |
| `e2e/`, `playwright.config.ts` | Real-browser user journeys | This repository |
| `performance/` | k6 API read-path regression smoke | This repository |
| `scripts/`, `.github/workflows/` | Cross-platform verification orchestration and CI | This repository |

Clone pinned child versions:

```sh
git clone --recurse-submodules https://github.com/tranverse/realtime-chat-application.git
cd realtime-chat-application
# For an existing clone:
git submodule update --init --recursive
```

The child entries link to their repositories on GitHub. Submodules intentionally pin exact commits rather than automatically following the newest main.

## Authentication flow

```text
Email registration -> OTP email -> verification -> MySQL account -> JWTs
Password login -> password check -> access JWT + refresh-family record
Refresh -> lock token row -> verify hash/state -> rotate -> replacement JWTs
Reused rotated token -> independently commit family revocation -> error response

Google OAuth2 -> backend callback -> Redis exchange code (60-second TTL)
             -> frontend callback -> one-time exchange -> application JWTs
```

Access tokens authenticate REST and STOMP CONNECT; refresh JWT hashes/families are stored in MySQL. Reuse revocation runs through a separate `REQUIRES_NEW` transaction so it survives the failing outer authentication request. Each login can have its own refresh family. Logout/logout-all/reset revoke refresh sessions, not already-issued access tokens immediately.

Redis OTP send limiting allows 5/email per 15 minutes, with additional IP limits and a 60-second resend cooldown. Verification attempts have separate limits. OAuth exchange uses `GETDEL`, not a reusable token URL. Google and SMTP are integrations, not services deployed by this repository.

The client currently persists access/refresh tokens in localStorage and coordinates concurrent HTTP refresh calls within one page. This is not HttpOnly-cookie authentication or a cross-tab refresh lock.

## REST request flow

```text
Browser -> bearer-token validation -> REST controller
        -> business service / resource authorization
        -> JPA repository -> MySQL
                          -> Redis / Cloudinary / SMTP where needed
```

REST supplies initial profile/conversation state, mutations, image uploads, history and presence snapshots. Authentication alone is insufficient: services validate membership and operation-specific roles. Controllers handle HTTP/validation/envelopes; services own business rules; repositories own persistence. The codebase is layered, not claimed as strict Clean Architecture.

## Realtime messaging flow

```text
REST POST or /app/conversations/{id}/messages
  -> authenticate -> payload validation
  -> conversation row lock (PESSIMISTIC_WRITE)
  -> membership validation -> sender/reply lookup
  -> next per-conversation sequence -> message/attachment insert
  -> MySQL commit -> after-commit publish
  -> /topic/conversations/{id} -> subscribed clients -> query cache/UI
```

`/ws` supports SockJS/native handshake with allowed origins. STOMP CONNECT uses the access JWT. Conversation SUBSCRIBE requires active membership; application message/read/typing SEND paths validate resource access. `/user/queue/errors` carries user-targeted application errors. `/topic` and `/queue` are handled by Spring's local simple broker.

The React transport is application/session scoped. Switching conversations changes conversation and peer-presence subscriptions, not the socket. Network reconnect restores subscriptions and refetches persisted state; it does not replay a durable event log. Normal local connectivity needs no Connected badge; actual interruptions show Reconnecting/Connection lost separately from peer presence.

## Presence flow

```text
Authenticated STOMP CONNECT -> register session
Heartbeat -> Redis expiry refresh
Clean disconnect -> remove only that session
Silent loss -> expiry sweep
Effective Online/Offline transition -> Redis Pub/Sub -> local STOMP broker
                                   -> authorized peer header
```

Presence is not a MySQL `is_online` field. One atomic Lua operation prunes/touches/removes sessions and publishes only OFFLINE -> ONLINE or ONLINE -> OFFLINE, not every heartbeat.

| Redis state | Purpose |
| --- | --- |
| `chat:presence:user:{userId}` sorted set | Session IDs scored by expiry in Redis server time |
| `chat:presence:deadlines` sorted set | Earliest session expiry per user |
| `chat:presence:online` set | Effective-transition detection |
| `chat:presence:events` Pub/Sub | `{userId, online}` transitions |

Defaults are configurable: heartbeat **25 s**, session expiry **75 s**, sweep **5 s**. A laptop disconnect does not mark a user Offline while a phone/tab session remains. Silent failures expire; throttled/sleeping browsers may appear offline until they heartbeat/reconnect. A sweeper pass processes up to 200 due users.

Authenticated `GET /api/v1/users/{userId}/presence` provides initial state; `/topic/presence/{userId}` supplies transitions. REST/subscription access allows self or active direct-conversation peers, not group membership alone. Client SEND to presence broker topics is rejected. `/app/presence/heartbeat` derives identity/session from authenticated Spring headers; `/api/v1/presence/config` exposes heartbeat timing only.

Direct headers show peer Online/Offline; group headers show member count. Unknown/unavailable presence is not fabricated Offline. Snapshot refetch on reconnect/every 30 seconds reconciles non-durable Pub/Sub gaps.

## Storage

```text
User --< ConversationMember >-- Conversation --< Message --< MessageAttachment
 |               |                                |
 +--< RefreshToken+-> lastReadMessage              +-> reply Message / sender User

Conversation --< InviteLink / JoinRequest >-- relevant users
PendingRegistration / PasswordResetToken = temporary authentication records
```

| Component | Stores / integrates |
| --- | --- |
| MySQL | Accounts, refresh hashes/families, verification/reset records, conversations/membership, messages/attachment metadata, invites/join requests |
| Redis | OTP counters/cooldowns, 60-second single-use OAuth codes, socket presence state/transitions |
| Cloudinary | Uploaded image bytes; secrets remain on the backend |
| SMTP / Google | Email verification/recovery and external identity login |

Redis is not the message database, HTTP session store, general cache, distributed lock, queue or durable notification infrastructure. Notifications is a frontend unread-conversation view. Flyway contains attachment foreign-key compatibility migrations; default Hibernate schema update still participates in schema creation/evolution.

## Concurrency and consistency

- **Message sequence:** a conversation-row pessimistic lock coordinates allocation; `UNIQUE(conversation_id,sequence)` prevents invalid duplicate committed sequences. Different conversations lock different rows.
- **MySQL snapshot ordering:** lock the conversation before database membership/latest-sequence reads. Under REPEATABLE READ, a normal SELECT before lock waiting could create an older snapshot and lead to a stale sequence lookup afterward.
- **Read receipts:** one conditional database update advances the watermark only for newer sequences; 100 -> 50 is ignored even with concurrent requests.
- **Transaction/event ordering:** message/read events publish after commit, so rollback does not broadcast nonexistent committed data. No outbox means a post-commit delivery failure can still lose an event; REST reconciliation is required.
- **Presence:** Redis Lua updates serialize session changes and deduplicate transitions; multiple sessions cannot overwrite each other's presence.

### History flow

```text
Frontend -> GET /api/v1/conversations/{id}/messages?beforeSequence=500&size=50
         -> membership check -> sequence < cursor, descending history
         -> messages -> infinite-query cache
```

Message history uses sequence-based keyset pagination; conversation lists use page/size offset pagination. The compound index supports cursor seeking. JPA reply/attachment hydration and count behavior are additional costs; dedicated benchmark-profile query timings are not a guarantee of identical production endpoint latency.

## Testing strategy

| Level | Tooling / scope |
| --- | --- |
| Backend | JUnit/Spring Boot Test: unit, API/security, transaction/read concurrency; real MySQL/Redis Testcontainers |
| Frontend | Vitest/Testing Library: components/helpers, mocked HTTP/realtime, cache, presence, preferences, keyboard/IME |
| System | Playwright: real browsers + backend/MySQL/Redis/Mailpit; seven main user journeys |
| Regression smoke | k6: authenticated profile, conversation list and message-history reads |

Verified local baseline: **56 backend tests**, **45 frontend tests across 16 files**, **7/7 browser journeys**. Frontend lint/build pass; lint has three non-blocking React warnings. Testcontainers require Docker and may skip when unavailable; skips must not be reported as successful container verification.

System journeys cover session restoration/invalid login, private reply/edit/delete/read tracking, groups/confirmed leave, multi-tab presence/logout/reconnect, stable transport navigation, Settings persistence and presence API authorization. External Google sign-in/Cloudinary uploads need real provider credentials and are not proven by E2E placeholder configuration.

## Performance validation

All values below are **local MySQL benchmarks or local regression smoke**, not production capacity, deployment claims or SLAs.

| Measurement | Recorded result / scope |
| --- | --- |
| History at 500K messages, 90% depth | Dedicated keyset endpoint HTTP p95 **17.23 ms** vs OFFSET **4,380.11 ms**; page size 50, 10 VUs, three repetitions |
| Same-conversation send | **100 concurrent sends, 100 successful, 0 failed/duplicate/missing sequences**; three repetitions, one sender account; p95 1,299.90 ms |
| System API smoke | 10 max VUs/20 seconds, **1,795 requests, 0 failures**, HTTP p95 **282.95 ms** in a recorded local run |

The smoke thresholds require request failure rate <1%, checks >99% and HTTP p95 <750 ms. Same-conversation locking intentionally trades contention latency for ordering. Retained benchmark data/harnesses are in `backend/performance/`; expensive benchmarks are independent of normal E2E/CI smoke.

## Running the full system

### Development

Use Java 21, Node.js 22, MySQL and Redis. Configure `backend/.env` from `backend/.env.example` with real SMTP/Google/Cloudinary/signing credentials; keep it untracked. Configure frontend public URLs from `frontend/.env.example` if necessary.

Windows (separate terminals):

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

```powershell
cd frontend
npm ci
npm run dev
```

Unix uses `./mvnw spring-boot:run` and the same npm commands. Default backend/frontend ports are 8080/5173; Vite proxies REST, SockJS and OAuth routes to the backend. Backend `docker compose up --build -d` runs its actual `mysql`, `redis`, `app` services instead of a host JVM. See the child READMEs for complete standalone configuration.

### Isolated system verification

Prerequisites: initialized submodules, Node.js 22, Docker with Compose, and **PowerShell Core 7 (`pwsh`) on PATH**. The same orchestration runs on Windows and Ubuntu; Windows PowerShell 5.1 is not the npm runner.

Windows:

```powershell
npm ci
npm run validate:ci
npx playwright install chrome
npm run e2e:system
```

Ubuntu CI:

```sh
npm ci
npm run validate:ci
npx playwright install --with-deps chromium
CI=true npm run e2e:system
```

`e2e:system` runs `pwsh -NoProfile -File ./scripts/run-e2e.ps1`. It creates/reset-builds only Compose project `luma-e2e`, waits for HTTP readiness, runs Playwright, runs k6, and tears down its test containers/volumes in `finally`. Every Docker/npm exit code is checked; a failed stage makes the command fail. Do not use this resettable environment as a persistent database.

Temporary frontend/backend/Mailpit URLs are `http://127.0.0.1:15173`, `http://127.0.0.1:18080`, and `http://127.0.0.1:18025`. Database/cache ports are internal. Mailpit captures OTP email; E2E provider/signing placeholders are test-only and not deployment secrets.

`npm run e2e` alone assumes a ready, clean, correctly configured environment. `E2E_FRONTEND_URL`/`E2E_BACKEND_URL` can override browser/API targets; the full orchestrator uses the Compose ports above. Generated `playwright-report/` and `test-results/` are local artifacts.

## CI

Child workflows run backend tests on Java 21 and frontend lint/test/build on Node.js 22. The parent Ubuntu workflow initializes pinned submodules, caches npm dependencies, validates npm/YAML configuration, installs Chromium and runs the real Compose -> Playwright -> k6 workflow. Pull requests/main pushes run regression; the cleanup branch also has a push trigger for pre-merge validation. No `continue-on-error` or substitute unit-only system job is used.

Current supported [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) and [setup-java](https://github.com/actions/setup-java) actions are used without changing the application Java/Node runtimes. This workflow verifies the system; it does not deploy it.
