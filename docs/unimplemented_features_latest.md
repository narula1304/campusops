# Unimplemented Features — Gap Analysis
**Last updated:** 2026-06-29 | Reflects codebase state after commit `44e64a0`

Compared against: `PRD.md`, `API_CONTRACT.md`, `SYSTEM_DESIGN.md`, `USER_FLOWS.md`

Only ❌ (not implemented) and 🟡 (partial / unconfirmed) items are listed here.

---

## Status Legend
| Symbol | Meaning |
|--------|---------|
| 🟡 | Partially implemented / stub present |
| ❌ | Not yet implemented |

---

## 1. Authentication & Authorization

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AUTH-01 | JWT access token (15 min) + refresh token (7 days) with rotation | 🟡 | Access token issued on login/register (`expiresIn: '7d'` — **expiry is 7 days not 15 min**). No refresh token issued. `POST /auth/refresh` route does not exist. |
| AUTH-02 | Refresh token family invalidation on reuse (theft detection) | ❌ | No `refreshTokenHash` stored in DB. No `TOKEN_REUSE_DETECTED` error path. |

---

## 2. Incident Management

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| INC-09 | Chat room auto-closes on incident resolution | 🟡 | `chatController` exists but auto-close is not wired to the state transition on resolution. |

---

## 3. Assignment System

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| ASSIGN-04 | ShiftAware strategy | 🟡 | Directory exists; actual shift-window checking unconfirmed. |
| ASSIGN-06 | Fallback to on-call roster when no staff available | ❌ | No on-call roster model or fallback logic found. |
| ASSIGN-07 | Reassignment with mandatory justification | 🟡 | Reassignment may be possible via admin assign; justification field not verified. |

---

## 4. SLA & Escalation

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| SLA-03 | SLA job cancelled automatically on resolution | 🟡 | `slaWorker.js` exists; cancellation on resolution needs confirmation. |
| SLA-04 | Escalation job is idempotent (crash-safe) | 🟡 | `slaWorker.js` in place; idempotency guard unconfirmed. |
| SLA-05 | Escalation notifies HOD via real-time + email | 🟡 | `email.worker.js` + `analytics.worker.js` exist; HOD notification wire-up unconfirmed. |
| SLA-06 | Second escalation to Dean after 2 more hours | ❌ | No second escalation tier found in workers or service. |

---

## 5. Real-Time Features

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| RT-04 | Room memberships persisted in Redis (survive restart) | ❌ | `src/realtime/rooms/` directory is **completely empty**. No `roomManager.js`. Room memberships are lost on server restart. |
| Missing socket events | `sla_warning`, `hotspot_detected`, `daily_summary_ready`, `staff_under_review`, `feedback_request`, `chat_read` | ❌ | Defined in `API_CONTRACT.md §8` but not emitted anywhere in backend handlers or workers. |

---

## 6. Analytics & AI

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AI-02 | Daily admin summary at 7AM via BullMQ cron | 🟡 | `dailySummary.scheduler.js` + `analytics.worker.js` exist. Wire-up to actual OpenAI call and `daily_summary_ready` socket event unconfirmed. |
| AI-03 | Hotspot detection: 3+ incidents same location in 24hrs | 🟡 | `GET /analytics/heatmap` exists in `analyticsController`. Auto-trigger and `hotspot_detected` socket event not implemented. |
| AI-04 | Hotspot prediction: day-of-week pattern analysis | ❌ | Not implemented. |
| AI-05 | Feedback sentiment analysis + issue tag extraction | 🟡 | `sentiment-analysis` job is implemented in `ai.worker.js`, but the trigger (adding to queue) is missing from the feedback submission flow. |
| AI-06 | Auto-priority escalation suggestion for stalled incidents | ❌ | Not implemented. |

---

## 7. Frontend — Missing UI

| Feature | Status | Notes |
|---------|--------|-------|
| PWA manifest / service worker | ❌ | No `manifest.json` or service worker configured. PRD §2.2 targets PWA for v1.0. |

---

## 8. Backend — Missing API Routes

| Route | Source | Notes |
|-------|--------|-------|
| `POST /auth/refresh` | `API_CONTRACT.md §1` | No route in `authRoutes.js`. Frontend has TODO stub ready. |
| `PATCH /users/:id/status` | `API_CONTRACT.md §7` | Only `/staff-state` PATCH exists; general `isActive` toggle is absent. |

---

## 9. Infrastructure Gaps

| Area | Status | Notes |
|------|--------|-------|
| Redis sliding window rate limiting (all endpoints) | 🟡 | `rateLimiter.js` wired to `POST /incidents` and `POST /panic` only. Auth and analytics routes are unprotected. |
| Redis room persistence for Socket.IO | ❌ | `src/realtime/rooms/` is empty. |
| JWT short-lived access token (15 min) | ❌ | Token signed with `expiresIn: '7d'`. No separation of short-lived access + long-lived refresh tokens. |
| PWA / service worker | ❌ | Not set up. |

---

## Priority Order for Remaining Work

> Ordered by impact × effort ratio, highest first.

1. **`POST /auth/refresh` + refresh token rotation** — Security-critical. Frontend stub already in place. (AUTH-01, AUTH-02)
2. **Redis room persistence** (`roomManager.js`) — Required for RT-04 production reliability.
3. **Missing socket events** (`sla_warning`, `hotspot_detected`, etc.) — Wire up in workers/service layer.
4. **`SPAM_THROTTLE` (5/hr per user)** — Add to rate limiter config.
5. **PWA manifest + service worker** — Required per PRD §2.2.
