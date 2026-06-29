# Unimplemented Features — Gap Analysis
**Last updated:** 2026-06-29 | Reflects codebase state after commit `35d0404`

Compared against: `PRD.md`, `API_CONTRACT.md`, `SYSTEM_DESIGN.md`, `USER_FLOWS.md`

---

## Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented |
| 🟡 | Partially implemented / stub present |
| ❌ | Not yet implemented |

---

## 1. Authentication & Authorization

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AUTH-01 | JWT access token (15 min) + refresh token (7 days) with rotation | 🟡 | Access token issued on login/register (`expiresIn: '7d'` — **expiry is 7 days not 15 min**). No refresh token issued. `POST /auth/refresh` route does not exist. |
| AUTH-02 | Refresh token family invalidation on reuse (theft detection) | ❌ | No `refreshTokenHash` stored in DB. No `TOKEN_REUSE_DETECTED` error path. |
| AUTH-03 | Role-based access control across all endpoints | ✅ | `authorize()` middleware applied on all protected routes. |
| AUTH-04 | Ownership-based authorization | ✅ | Controllers check `creatorId === req.user.id` before allowing student/faculty actions. |
| AUTH-05 | Rate limiting: 5 failed logins → 15-minute lockout | ✅ | Implemented in `authController.login` via `failedLoginCount` + `lockedUntil` Prisma fields. |
| AUTH-06 | bcrypt password hashing (cost factor 12) | 🟡 | bcrypt used but **cost factor is 10**, not 12 as specified. |

---

## 2. Incident Management

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| INC-01 | Create incident (title, description, category, priority, location, photos) | ✅ | `CreateIncidentPage.jsx` + `POST /incidents` controller fully implemented. |
| INC-02 | AI auto-suggests category and priority from description (800ms debounce) | ❌ | `POST /incidents/ai-classify` route does not exist. `CreateIncidentPage.jsx` has no debounce call to an AI endpoint. `ai.worker.js` exists but handles different tasks. |
| INC-03 | Duplicate detection: same location + category + 24hr window | ❌ | No duplicate check in `incidentController.createIncident`. `DUPLICATE_INCIDENT` error code is defined in docs but never returned. |
| INC-04 | Incident lifecycle: OPEN → IN_PROGRESS → RESOLVED → ESCALATED | ✅ | State machine implemented in `src/domain/states/`. |
| INC-05 | State transitions validated at domain level via State pattern | ✅ | `src/domain/states/` directory implements the pattern. |
| INC-06 | Resolution photo required before RESOLVED transition | ✅ | Enforced in `resolveIncident` controller and `ResolveModal` on frontend. |
| INC-07 | Before/after photo comparison slider | ❌ | No `BeforeAfterSlider` component anywhere in `client/src/`. `IncidentDetailPage` shows the resolution photo as a plain `<img>` with no comparison UI. |
| INC-08 | Incident-specific chat room (reporter ↔ assigned staff) | ✅ | `ChatPage.jsx`, `chatController.js`, `chatRoutes.js`, Socket.IO `chat.handler.js` all implemented. |
| INC-09 | Chat room auto-closes on incident resolution | 🟡 | `chatController` exists but auto-close on resolution is not wired to the state transition. |
| INC-10 | Feedback (1-5 stars + comment) after resolution | ✅ | `submitFeedback` route + UI in `IncidentDetailPage.jsx`. |
| INC-11 | Rating ≤ 2 stars auto-reopens incident + staff penalty | 🟡 | Backend `submitFeedback` creates a feedback record; auto-reopen and penalty logic needs verification — not confirmed in `incidentController.js`. |

---

## 3. Assignment System

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| ASSIGN-01 | Auto-assignment via configurable Strategy per department | ✅ | `StrategyFactory` + strategies in `src/domain/strategies/`. |
| ASSIGN-02 | LeastLoaded strategy | ✅ | Implemented. |
| ASSIGN-03 | RoundRobin strategy | ✅ | Implemented in strategies directory. |
| ASSIGN-04 | ShiftAware strategy | 🟡 | Directory exists; actual shift-window checking unconfirmed. |
| ASSIGN-05 | Manual assignment override by admin | ✅ | `POST /incidents/:id/assign` → `assignIncident` controller. |
| ASSIGN-06 | Fallback to on-call roster when no staff available | ❌ | No on-call roster model or fallback logic found. |
| ASSIGN-07 | Reassignment with mandatory justification | 🟡 | Reassignment may be possible via admin assign; justification field not verified. |
| ASSIGN-08 | Full assignment history in IncidentAssignment table | ✅ | `IncidentRepository` writes assignment history rows. |

---

## 4. SLA & Escalation

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| SLA-01 | SLA window set on creation: Critical=2h, High=4h, Medium=8h, Low=24h | ✅ | Enforced in incident creation service. |
| SLA-02 | BullMQ delayed job scheduled at SLA deadline | ✅ | `slaWorker.js` exists and processes SLA jobs. |
| SLA-03 | SLA job cancelled automatically on resolution | 🟡 | `slaWorker.js` exists; cancellation on resolution needs confirmation. |
| SLA-04 | Escalation job is idempotent (crash-safe) | 🟡 | `slaWorker.js` in place; idempotency guard unconfirmed. |
| SLA-05 | Escalation notifies HOD via real-time + email | 🟡 | `email.worker.js` + `analytics.worker.js` exist; HOD notification wire-up unconfirmed. |
| SLA-06 | Second escalation to Dean after 2 more hours | ❌ | No second escalation tier found in workers or service. |
| SLA-07 | SLA countdown visible on staff dashboard | ✅ | `SLACountdown.jsx` shared component used in `StaffDashboardPage` and `IncidentDetailPage`. |

---

## 5. Real-Time Features

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| RT-01 | Incident status updates broadcast to reporter in real time | ✅ | `incident.handler.js` emits `incident_updated`. |
| RT-02 | Assignment notifications to staff in real time | ✅ | `incident_assigned` event emitted. |
| RT-03 | Role-based + dept-based + user-specific Socket.IO rooms | ✅ | `index.js` sets up `role:*`, `dept:*`, `user:*` rooms on connection. |
| RT-04 | Room memberships persisted in Redis (survive restart) | ❌ | `src/realtime/rooms/` directory is **completely empty**. No `roomManager.js`. Room memberships are lost on server restart. |
| RT-05 | Panic button broadcasts GPS to all security officers < 200ms | ✅ | `panicController` + `panic.handler.js` emit `panic_alert` to `role:SECURITY` room. |
| RT-06 | Security officer acknowledges panic in real time | ✅ | `panic.handler.js` handles `panic_acknowledge` socket event. |
| **Missing socket events** | `sla_warning`, `hotspot_detected`, `daily_summary_ready`, `staff_under_review`, `feedback_request`, `chat_read` | ❌ | Defined in `API_CONTRACT.md §8` but not emitted anywhere in backend handlers or workers. |

---

## 6. Analytics & AI

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| AI-01 | AI incident classifier: category + priority + department | ❌ | `ai.worker.js` exists but handles generic AI tasks. No `POST /incidents/ai-classify` route. Frontend `CreateIncidentPage.jsx` has no debounced classification call. |
| AI-02 | Daily admin summary at 7AM via BullMQ cron | 🟡 | `dailySummary.scheduler.js` + `analytics.worker.js` exist. Wire-up to actual OpenAI call and `daily_summary_ready` socket event unconfirmed. |
| AI-03 | Hotspot detection: 3+ incidents same location in 24hrs | 🟡 | `GET /analytics/heatmap` exists in `analyticsController`. Auto-trigger and `hotspot_detected` socket event not implemented. |
| AI-04 | Hotspot prediction: day-of-week pattern analysis | ❌ | Not implemented. |
| AI-05 | Feedback sentiment analysis + issue tag extraction | ❌ | No sentiment analysis in `ai.worker.js` or feedback flow. |
| AI-06 | Auto-priority escalation suggestion for stalled incidents | ❌ | Not implemented. |

---

## 7. Frontend — Pages & UI

| Feature | Status | Notes |
|---------|--------|-------|
| Login page | ✅ | `LoginPage.jsx` |
| Dashboard (role-aware) | ✅ | `DashboardPage.jsx` |
| Incident list (filterable, paginated) | ✅ | `IncidentListPage.jsx` |
| Create incident form | ✅ | `CreateIncidentPage.jsx` |
| Incident detail (timeline, photos, actions) | ✅ | `IncidentDetailPage.jsx` with live SLA countdown |
| Staff dashboard (SLA timers, queue) | ✅ | `StaffDashboardPage.jsx` |
| Admin analytics dashboard | ✅ | `AdminAnalyticsPage.jsx` |
| Broadcast alert page | ✅ | `BroadcastAlertPage.jsx` |
| Chat page | ✅ | `ChatPage.jsx` with socket, typing indicators, attachments |
| Heatmap page | ✅ | `HeatmapPage.jsx` — table-based, filterable |
| User profile page | ✅ | `UserProfilePage.jsx` — editable name/phone/notifications |
| Staff management page | ✅ | `StaffManagementPage.jsx` — state transitions, ADMIN only |
| Panic button (floating, all authenticated pages) | ✅ | `PanicButton.jsx` — GPS, 30s cooldown, confirmation modal |
| **AI auto-suggest in Create Incident** | ❌ | No 800ms debounce call to `/incidents/ai-classify` wired in `CreateIncidentPage.jsx`. |
| **Before/after photo comparison slider** | ❌ | `IncidentDetailPage` shows resolution photo as plain `<img>` — no drag slider component. |
| **PWA manifest / service worker** | ❌ | No `manifest.json` or service worker configured. PRD §2.2 targets PWA for v1.0. |

---

## 8. Backend — Missing API Routes

| Route | Defined in API Contract | Status |
|-------|------------------------|--------|
| `POST /auth/refresh` | `API_CONTRACT.md §1` | ❌ Missing — no route in `authRoutes.js`. Frontend has TODO stub ready. |
| `POST /incidents/ai-classify` | `API_CONTRACT.md §2` | ❌ Missing — no route in `incidentRoutes.js`. |
| `GET /analytics/staff/:staffId/performance` | `API_CONTRACT.md §6` | ❌ Missing — `analyticsController` has no `getStaffPerformance` handler. |
| `PATCH /users/:id/status` | `API_CONTRACT.md §7` | ❌ Missing — only `/staff-state` PATCH exists; general `isActive` toggle is absent. |
| Spam throttle: max 5 incidents/hour | `API_CONTRACT.md §2, PRD INC spam` | ❌ General `incidentCreateLimiter` is 10/min; no per-hour cap returning `SPAM_THROTTLE`. |

---

## 9. Infrastructure / Config Gaps

| Area | Status | Notes |
|------|--------|-------|
| Redis sliding window rate limiting (all endpoints) | 🟡 | `rateLimiter.js` created and wired to `POST /incidents` and `POST /panic` only. Auth, analytics, and other routes are unprotected. |
| bcrypt cost factor 12 | 🟡 | Currently `bcrypt.hash(password, 10)` — should be `12` per PRD §5.3. |
| Redis room persistence for Socket.IO | ❌ | `src/realtime/rooms/` is empty. |
| CORS restricted to known frontend origins | 🟡 | `app.use(cors())` with no `origin` config — accepts all origins in dev. Production origin whitelist not configured. |
| JWT short-lived access token (15 min) | ❌ | Token is signed with `expiresIn: '7d'`. No separation of short-lived access + long-lived refresh. |
| PWA / service worker | ❌ | Not set up. |
| Environment validation on startup | ❌ | Missing required env vars (e.g. `OPENAI_API_KEY`, `CLOUDINARY_*`) fail silently at runtime rather than crashing at boot. |

---

## Priority Order for Remaining Work

> Ordered by impact × effort ratio, highest first.

1. **`POST /auth/refresh` + refresh token rotation** — Security-critical. Frontend stub is already in place. (AUTH-01, AUTH-02)
2. **AI auto-classify in `CreateIncidentPage`** — High UX impact, backend just needs one new route + controller method. (INC-02, AI-01)
3. **Before/after photo slider** — Demo impact, self-contained UI component. (INC-07)
4. **Duplicate incident detection** — Prevents noisy data. One DB query added to `createIncident`. (INC-03)
5. **`GET /analytics/staff/:staffId/performance`** — Needed to make `AdminAnalyticsPage` fully useful.
6. **Redis room persistence** (`roomManager.js`) — Required for RT-04 production reliability.
7. **Missing socket events** (`sla_warning`, `hotspot_detected`, etc.) — Wire up in workers/service layer.
8. **`SPAM_THROTTLE` (5/hr per user)** — Add to rate limiter config.
9. **PWA manifest + service worker** — Required per PRD §2.2.
10. **bcrypt cost factor 12** — One-line fix; backwards compatible for new registrations.
