# Unimplemented Features (Gap Analysis)

Based on a review of the `@docs` folder (`PRD.md`, `SYSTEM_DESIGN.md`, `API_CONTRACT.md`, `USER_FLOWS.md`) compared to the current codebase state, here are the features that are currently **not implemented**.

---

## 1. Backend & Architecture Gaps

| Feature | Source | Details |
|---------|--------|---------|
| **Pure Domain Layer (Clean Architecture)** | `SYSTEM_DESIGN.md §2, §5` | The intricate domain layer (`entities/`, `states/`, `strategies/`, `validators/`) is not implemented. The current system relies on simplified Express controllers (`src/api/controllers/`) that directly interact with Prisma. |
| **Refresh Token Rotation & Theft Detection** | `PRD.md AUTH-01, AUTH-02`, `USER_FLOWS.md §8` | Token invalidation on reuse (`refreshTokenHash`) and proper rolling refresh tokens are missing. |
| **Redis Sliding Window Rate Limiting** | `SYSTEM_DESIGN.md §3.6` | The Lua-script-based Redis rate limiter for endpoints like `/incidents` and `/auth` is not implemented. |
| **Duplicate Incident Detection** | `PRD.md INC-03`, `USER_FLOWS.md §1` | System does not currently detect or block duplicate incidents (same location + category within 24 hours). |
| **Spam Throttle** | `API_CONTRACT.md` | Max 5 incidents per hour limit is not enforced. |
| **Role-Based Access Control (RBAC) Middleware** | `SYSTEM_DESIGN.md §2` | RBAC is done inline within controllers rather than through a dedicated `rbac.middleware.js` as designed. |

---

## 2. Frontend Gaps (Pages & UI)

| Feature | Source | Details |
|---------|--------|---------|
| **Staff Dashboard Page** | `PRD.md §3.3`, `USER_FLOWS.md §2` | Missing the specialized view for maintenance staff showing SLA countdowns and a sorted list of assigned tasks. |
| **Admin Analytics Page** | `PRD.md §3.5`, `USER_FLOWS.md §5` | The dashboard to view SLA breach rates, total incidents, AI daily summaries, and staff performance is not built on the frontend. |
| **Panic Button Component** | `PRD.md §3.1`, `USER_FLOWS.md §4` | The always-visible red panic button in the bottom navigation for students is missing. |
| **Incident-Specific Chat Panel** | `PRD.md INC-08`, `USER_FLOWS.md §2` | The UI to interface with the implemented `chatController.js` and Socket.IO chat rooms is not built. |
| **Heatmap Page** | `PRD.md AI-03`, `USER_FLOWS.md §7` | GPS visualization of campus hotspots is missing. |
| **AI Auto-Suggest (Create Incident)** | `PRD.md INC-02`, `USER_FLOWS.md §1` | The 800ms debounced call to `/incidents/ai-classify` to auto-fill category and priority is not wired in `CreateIncidentPage.jsx`. |
| **Before/After Photo Comparison Slider** | `PRD.md INC-07` | The UI component for comparing the reported photo with the resolution photo is missing. |
| **Broadcast Alert Page** | `API_CONTRACT.md §5` | Admin UI to trigger campus-wide emergency/maintenance alerts is missing. |
| **Staff Management Page** | `API_CONTRACT.md §7` | UI for admins/HODs to manage staff states (`ACTIVE`, `UNDER_REVIEW`, etc.) is missing. |
| **User Profile Page** | `API_CONTRACT.md §7` | Page for users to view and update their notification preferences is missing. |

---

## 3. Real-Time & Event Gaps

| Feature | Source | Details |
|---------|--------|---------|
| **Socket.IO Room Persistence** | `PRD.md RT-04`, `SYSTEM_DESIGN.md §2` | Room memberships are not persisted in Redis (`src/realtime/rooms/roomManager.js` is missing). |
| **Token Expiry Auto-Refresh** | `SYSTEM_DESIGN.md §4` | Frontend Axios interceptors do not automatically attempt a silent refresh before redirecting to login. |
