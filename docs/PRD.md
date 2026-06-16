# Product Requirements Document (PRD)
## CampusOps — Smart Campus Operations & Incident Management System

**Version:** 2.0
**Stack:** Node.js + Express + PostgreSQL + Prisma ORM + React + Socket.IO + BullMQ + Redis
**Last Updated:** June 2025

---

## 1. Product Overview

### 1.1 Problem Statement

Campus infrastructure issues — broken equipment, security threats, maintenance failures — are currently reported via WhatsApp groups, emails, or physical complaint registers. This results in:

- No centralized visibility of what is broken and where
- No accountability for who is responsible for fixing what
- No SLA enforcement — tickets stay open for weeks with no escalation
- No data for identifying recurring problem areas
- Security emergencies have no fast broadcast mechanism

### 1.2 Product Vision

A centralized digital operations platform where any campus stakeholder can report an issue in under 60 seconds, the right person is automatically assigned, and admins have real-time visibility of campus health — with AI that makes the system smarter over time.

### 1.3 Target Users

| Role | Primary Need | Pain Point Today |
|------|-------------|-----------------|
| Student | Report issues quickly, track status | No feedback after reporting |
| Faculty | Report and escalate issues | Manually chasing maintenance staff |
| Maintenance Staff | Know what to fix, in what order | Assignments via WhatsApp, no priority clarity |
| Security Officer | Receive emergency alerts instantly | No real-time broadcast mechanism |
| Admin / HOD | Visibility, accountability, reporting | No dashboard, no SLA enforcement |

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Reduce average incident resolution time by 40% through auto-assignment and SLA enforcement
- Provide real-time status visibility to all stakeholders
- Eliminate zero-accountability incidents — every incident has an owner
- Enable data-driven campus operations through SQL analytics and hotspot detection
- Provide a panic mechanism for student emergencies with sub-200ms response

### 2.2 Non-Goals (v1.0)

- Mobile native apps (PWA is sufficient for v1.0)
- Integration with external ERP or HR systems
- Automated physical access control
- Financial processing or vendor payment workflows
- Multi-campus / multi-institution support

---

## 3. User Stories

### 3.1 Student

```
As a student, I want to report a broken AC in my classroom
so that maintenance staff can fix it without me chasing anyone.

Acceptance Criteria:
- Submit incident with title, description, photo, location in < 60 seconds
- AI suggests category and priority as I type (800ms debounce)
- Receive confirmation with incident number (INC-2025-XXXXXX)
- See live status updates as incident progresses via Socket.IO
- Notified when incident is resolved
- Rate resolution quality (1-5 stars + comment)

As a student, I want to trigger a panic alert in an emergency
so that security officers are notified of my location instantly.

Acceptance Criteria:
- Single tap triggers panic button
- GPS coordinates broadcast to all online security officers in < 200ms
- EmergencyIncident created automatically
- Confirmation that security has been notified
```

### 3.2 Faculty

```
As a faculty member, I want to report infrastructure issues
so they are routed to the right department automatically.

Acceptance Criteria:
- Department pre-filled from my profile
- Can mark issues as high priority if they affect teaching
- Receive escalation notifications if issue not resolved within SLA
```

### 3.3 Maintenance Staff

```
As maintenance staff, I want to see my assigned incidents ordered by SLA deadline
so that I work on the most critical issues first.

Acceptance Criteria:
- Dashboard shows assignments sorted by slaDeadlineAt ASC
- SLA countdown visible per incident
- Can update status and add progress notes
- Must upload resolution photo before marking resolved
- Can communicate with reporter via incident-specific chat
```

### 3.4 Security Officer

```
As a security officer, I want to receive panic alerts in real time
so that I can respond before the situation escalates.

Acceptance Criteria:
- Panic alerts show reporter GPS on a map within 200ms
- Can acknowledge alert to signal response
- Can broadcast campus-wide emergency alerts
```

### 3.5 Admin

```
As an admin, I want a real-time dashboard of campus health
so I can make operational decisions without manual investigation.

Acceptance Criteria:
- Dashboard shows incident count by department, status, priority
- SLA breach rate prominently displayed
- Hotspot locations auto-flagged
- AI-generated daily summary at 7AM
- Can configure assignment strategy per department
- SLA breaches auto-escalate to HOD / Dean
```

---

## 4. Functional Requirements

### 4.1 Authentication & Authorization

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | JWT access token (15 min) + refresh token (7 days) with rotation | P0 |
| AUTH-02 | Refresh token family invalidation on reuse (theft detection) | P0 |
| AUTH-03 | Role-based access control across all endpoints | P0 |
| AUTH-04 | Ownership-based authorization | P0 |
| AUTH-05 | Rate limiting: 5 failed logins → 15-minute lockout | P1 |
| AUTH-06 | bcrypt password hashing (cost factor 12) | P0 |

### 4.2 Incident Management

| ID | Requirement | Priority |
|----|-------------|----------|
| INC-01 | Create incident with title, description, category, priority, location, photos | P0 |
| INC-02 | AI auto-suggests category and priority from description (debounced 800ms) | P1 |
| INC-03 | Duplicate detection: same location + category + 24hr window | P1 |
| INC-04 | Incident lifecycle: OPEN → IN_PROGRESS → RESOLVED → ESCALATED | P0 |
| INC-05 | State transitions validated at domain level via State pattern | P0 |
| INC-06 | Resolution photo required before RESOLVED transition | P0 |
| INC-07 | Before/after photo comparison slider | P2 |
| INC-08 | Incident-specific chat room (reporter ↔ assigned staff) | P1 |
| INC-09 | Chat room auto-closes on incident resolution | P1 |
| INC-10 | Feedback (1-5 stars + comment) after resolution | P1 |
| INC-11 | Rating ≤ 2 stars auto-reopens incident + staff penalty | P1 |

### 4.3 Assignment System

| ID | Requirement | Priority |
|----|-------------|----------|
| ASSIGN-01 | Auto-assignment via configurable Strategy per department | P0 |
| ASSIGN-02 | LeastLoaded: assign to staff with fewest active tasks | P0 |
| ASSIGN-03 | RoundRobin: rotate assignments evenly | P1 |
| ASSIGN-04 | ShiftAware: check availability window before assigning | P1 |
| ASSIGN-05 | Manual assignment override by admin | P0 |
| ASSIGN-06 | Fallback to on-call roster when no staff available | P1 |
| ASSIGN-07 | Reassignment supported with mandatory justification | P0 |
| ASSIGN-08 | Full assignment history stored in IncidentAssignment table | P0 |

### 4.4 SLA & Escalation

| ID | Requirement | Priority |
|----|-------------|----------|
| SLA-01 | SLA window set on creation: Critical=2h, High=4h, Medium=8h, Low=24h | P0 |
| SLA-02 | BullMQ delayed job scheduled at SLA deadline | P0 |
| SLA-03 | Job cancelled automatically on resolution | P0 |
| SLA-04 | Escalation job is idempotent (crash-safe) | P0 |
| SLA-05 | Escalation notifies HOD via real-time + email | P0 |
| SLA-06 | Second escalation to Dean after 2 more hours | P1 |
| SLA-07 | SLA countdown visible on staff dashboard | P1 |

### 4.5 Real-Time Features

| ID | Requirement | Priority |
|----|-------------|----------|
| RT-01 | Incident status updates broadcast to reporter in real time | P0 |
| RT-02 | Assignment notifications to staff in real time | P0 |
| RT-03 | Role-based + dept-based + user-specific Socket.IO rooms | P0 |
| RT-04 | Room memberships persisted in Redis (survive restart) | P1 |
| RT-05 | Panic button broadcasts GPS to all security officers < 200ms | P0 |
| RT-06 | Security officer acknowledges panic in real time | P0 |

### 4.6 Analytics & AI

| ID | Requirement | Priority |
|----|-------------|----------|
| AI-01 | AI incident classifier: category + priority + department | P1 |
| AI-02 | Daily admin summary at 7AM via BullMQ cron | P1 |
| AI-03 | Hotspot detection: 3+ incidents same location in 24hrs | P1 |
| AI-04 | Hotspot prediction: day-of-week pattern analysis | P2 |
| AI-05 | Feedback sentiment analysis + issue tag extraction | P2 |
| AI-06 | Auto-priority escalation suggestion for stalled incidents | P2 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target |
|--------|--------|
| API response time (p95) | < 300ms |
| Panic button broadcast latency | < 200ms |
| Real-time notification delivery | < 500ms |
| Dashboard page load | < 2s (Redis cache hit) |

### 5.2 Database

| Concern | Approach |
|---------|---------|
| Concurrency | `SELECT FOR UPDATE` row locking in Prisma transactions |
| Consistency | Prisma `$transaction` wraps multi-step operations (ACID) |
| Audit trail | Append-only IncidentStatusLog — never UPDATE, only INSERT |
| Analytics | PostgreSQL window functions, CTEs for complex queries |
| Caching | Redis cache-aside for dashboard stats (5-min TTL) |

### 5.3 Security

- bcrypt (cost 12) for passwords
- Refresh tokens stored as bcrypt hash, never plaintext
- File uploads validated before Cloudinary
- Redis sliding window rate limiting on all endpoints
- CORS restricted to known frontend origins
- Input sanitization via Prisma parameterized queries (SQL injection impossible)

---

## 6. Release Phases

| Phase | Weeks | Scope |
|-------|-------|-------|
| 1 — Core | 1-3 | Auth, Prisma schema + migrations, incident CRUD, state machine, auto-assignment, SLA timers |
| 2 — Demo | 3-5 | Panic button, incident chat, before/after photos, timeline view, heatmap, staff dashboard |
| 3 — AI | 5-6 | Classifier, daily summary, hotspot detection, sentiment analysis |
| 4 — Polish | 6-8 | Redis caching, rate limiting, Socket.IO rooms, performance optimization, deployment |

---

## 7. Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js + Express | Familiar, async-first, large ecosystem |
| Database | PostgreSQL | ACID transactions, window functions, row locking, industry standard |
| ORM | Prisma | Type-safe, migration system, great DX, Prisma Studio for debugging |
| Frontend | React + Redux Toolkit + Tailwind | Industry standard SPA stack |
| Real-time | Socket.IO | WebSocket abstraction with room support |
| Queue | BullMQ + Redis | Reliable job scheduling, SLA timers, delayed jobs |
| Cache | Redis | Dashboard stats, rate limiting, Socket.IO room persistence |
| File Storage | Cloudinary | Managed image hosting with URL-based access |
| Email | Nodemailer | SMTP email delivery |
| AI | OpenAI API (gpt-4o-mini) | Incident classification, daily summaries, sentiment analysis |
| Auth | JWT + bcrypt | Stateless auth with refresh token rotation |
