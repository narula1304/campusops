<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-v5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/React-v19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.IO" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/License-ISC-blue?style=for-the-badge" alt="License" />
</p>

# 🏫 CampusOps

**🚀 Live Demo:** [https://campusops-six.vercel.app](https://campusops-six.vercel.app)

### Smart Campus Operations & Incident Management System

> A centralized, real-time campus operations platform where any stakeholder can report an infrastructure issue in under 60 seconds, the right person is automatically assigned, SLA enforcement ensures accountability, and admins have real-time visibility of campus health — powered by AI that makes the system smarter over time.

---

## 📋 Table of Contents

- [Problem Statement](#-problem-statement)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Design Patterns](#-design-patterns)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Setup](#-database-setup)
- [Running the Application](#-running-the-application)
- [API Reference](#-api-reference)
- [Real-Time Events](#-real-time-events)
- [Role-Based Access](#-role-based-access)
- [Testing](#-testing)
- [Documentation](#-documentation)
- [License](#-license)

---

## 🔍 Problem Statement

Campus infrastructure issues — broken equipment, security threats, maintenance failures — are currently reported via WhatsApp groups, emails, or physical complaint registers. This causes:

| Pain Point | Impact |
|---|---|
| 🚫 No centralized visibility | Nobody knows what's broken and where |
| 🚫 No accountability | Tickets stay open for weeks with no owner |
| 🚫 No SLA enforcement | No escalation, no deadlines |
| 🚫 No data-driven decisions | Recurring problem areas go unnoticed |
| 🚫 No emergency broadcast | Security threats have no fast response mechanism |

**CampusOps** solves all of this with a modern, real-time, AI-powered platform.

---

## ✨ Key Features

### 🎫 Incident Management
- **Full lifecycle tracking** — `OPEN → IN_PROGRESS → RESOLVED → ESCALATED → REOPENED → CLOSED`
- **AI-powered classification** — Automatic category, priority & department suggestions via LLM
- **Duplicate detection** — Same location + category within 24hr window
- **Evidence management** — Photo uploads with Cloudinary integration
- **Resolution validation** — Resolution photo required before closing
- **Feedback loop** — 1–5 star ratings with automatic reopening on poor scores (≤2 stars)

### ⚡ Real-Time Updates
- **Socket.IO powered** — Live status updates, assignment notifications, chat messages
- **Role-based rooms** — Users, departments, and roles each get dedicated channels
- **JWT-authenticated WebSockets** — Secure real-time connections
- **Sub-200ms panic broadcasts** — Emergency GPS alerts to all security officers

### 🤖 AI & Analytics
- **Incident classifier** — AI suggests category + priority + department from description (Groq LLM)
- **Daily summary** — Automated 7AM admin briefing via BullMQ cron
- **Hotspot detection** — Flags locations with 3+ incidents in 24 hours
- **Feedback sentiment analysis** — Extracts issue tags and sentiment from user comments
- **AI escalation suggestions** — Identifies stalled incidents needing attention

### ⏱️ SLA Enforcement
- **Priority-based deadlines** — Critical: 2h, High: 4h, Medium: 8h, Low: 24h
- **BullMQ delayed jobs** — Scheduled at SLA deadline, auto-cancelled on resolution
- **Automatic escalation** — Breaches notify HOD, then Dean after +2 hours
- **Crash-safe** — Idempotent job processing survives server restarts

### 🚨 Panic Button
- **One-tap emergency** — Broadcasts GPS coordinates to all online security officers
- **Real-time acknowledgement** — Officers confirm response in real time
- **Auto-incident creation** — Emergency incident record created automatically
- **Rate-limited** — 3 triggers per 5 minutes to prevent misuse

### 💬 Incident Chat
- **Per-incident chat rooms** — Reporter ↔ assigned staff communication
- **Read receipts** — Track message delivery
- **Auto-close** — Chat room deactivated on incident resolution

### 🔔 Smart Notifications
- **Multi-channel delivery** — Real-time (Socket.IO) + Email (Nodemailer)
- **Decorator pattern** — Composable notification pipeline (Base → Email → Real-time → SMS)
- **User preferences** — Toggle real-time, email, and SMS per user

### 📊 Admin Dashboard
- **Live campus health** — Incident counts by department, status, priority
- **SLA breach tracking** — Real-time breach rates and overdue incidents
- **Heatmap view** — Visual hotspot identification across campus blocks
- **Staff management** — Performance reviews, penalty tracking, state management
- **Department configuration** — Assignment strategy per department

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js + Express 5 | Async-first API server |
| **Frontend** | React 19 + Vite 8 | Modern SPA with lazy-loaded routes |
| **Styling** | Tailwind CSS 4 | Utility-first responsive design |
| **Animations** | Framer Motion | Page transitions & micro-interactions |
| **Database** | PostgreSQL | ACID transactions, window functions, row locking |
| **ORM** | Prisma 6 | Type-safe queries, migrations, seeding |
| **Real-time** | Socket.IO 4 | WebSocket rooms, JWT auth, bi-directional events |
| **Queue** | BullMQ + Redis | SLA timers, email delivery, AI tasks, analytics |
| **Cache** | Redis (ioredis) | Dashboard stats (5-min TTL), rate limiting |
| **File Storage** | Cloudinary | Managed image hosting for evidence photos |
| **Email** | Nodemailer | SMTP email delivery (Gmail, etc.) |
| **AI** | Groq API (LLaMA) | Incident classification, summaries, sentiment |
| **Auth** | JWT + bcryptjs | Access/refresh token rotation, role-based access |
| **Security** | Helmet + CORS + Rate Limiting | HTTP hardening, origin restrictions, abuse prevention |
| **Testing** | Jest + Supertest | Unit & integration test suites |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (React + Vite)                        │
│  ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │  Auth    │ │ Dashboard │ │  Incidents   │ │  Staff/Admin     │  │
│  │  Context │ │  Pages    │ │  CRUD + Chat │ │  Management      │  │
│  └────┬─────┘ └─────┬─────┘ └──────┬───────┘ └────────┬─────────┘  │
│       └─────────────┼──────────────┼──────────────────┘            │
│                     │     Axios + Socket.IO Client                  │
└─────────────────────┼──────────────────────────────────────────────┘
                      │ HTTP + WebSocket
┌─────────────────────┼──────────────────────────────────────────────┐
│                     ▼   SERVER (Node.js + Express)                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    API LAYER                                  │  │
│  │  Routes → Middleware (Auth, Rate Limiter) → Controllers       │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                    SERVICE LAYER                               │  │
│  │  IncidentService (orchestrates domain logic)                  │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                    DOMAIN LAYER                                │  │
│  │  Entities │ States │ Strategies │ Commands │ Observers │ etc  │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                 INFRASTRUCTURE LAYER                           │  │
│  │  Prisma ORM │ Redis Cache │ Cloudinary │ Repositories         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 BACKGROUND JOBS (BullMQ)                      │  │
│  │  SLA Worker │ Email Worker │ AI Worker │ Analytics Worker     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 REALTIME LAYER (Socket.IO)                    │  │
│  │  Incident Handlers │ Panic Handlers │ Chat Handlers          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────▼────┐         ┌────▼────┐          ┌────▼────┐
    │ Postgres│         │  Redis  │          │  Groq   │
    │   DB    │         │ Cache + │          │   AI    │
    │         │         │ Queues  │          │   API   │
    └─────────┘         └─────────┘          └─────────┘
```

The server follows a **clean layered architecture** with strict dependency injection:

- **API Layer** — Routes, middleware (auth, rate limiting, validation), controllers
- **Service Layer** — Business logic orchestration
- **Domain Layer** — Pure business rules (entities, state machines, strategies, observers)
- **Infrastructure Layer** — External integrations (DB, cache, file storage, repositories)
- **Jobs Layer** — Background workers (SLA, email, AI, analytics)
- **Realtime Layer** — Socket.IO event handlers

> Every dependency is injected via constructor — no file imports infrastructure directly. The entry point (`src/index.js`) is the sole composition root.



## 📁 Project Structure

```
campusops/
├── prisma/
│   ├── schema.prisma            # Database schema (20+ models, 12 enums)
│   ├── migrations/              # Version-controlled DB migrations
│   └── seed.js                  # Dev seed data (1 dept, 5 users)
│
├── src/
│   ├── index.js                 # Composition root — DI wiring + server startup
│   ├── config/
│   │   └── validateEnv.js       # Environment variable validation
│   │
│   ├── api/
│   │   ├── controllers/         # Request handlers
│   │   │   ├── authController.js
│   │   │   ├── incidentController.js
│   │   │   ├── alertController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── chatController.js
│   │   │   ├── departmentController.js
│   │   │   ├── panicController.js
│   │   │   └── userController.js
│   │   ├── routes/              # Express route definitions
│   │   │   ├── authRoutes.js
│   │   │   ├── incidentRoutes.js
│   │   │   ├── alertRoutes.js
│   │   │   ├── analyticsRoutes.js
│   │   │   ├── chatRoutes.js
│   │   │   ├── departmentRoutes.js
│   │   │   ├── panicRoutes.js
│   │   │   └── userRoutes.js
│   │   └── middleware/
│   │       ├── auth.js          # JWT verification + RBAC
│   │       ├── errorHandler.js  # Centralized error handling
│   │       └── rateLimiter.js   # Redis sliding window rate limiter
│   │
│   ├── domain/
│   │   ├── entities/            # Rich domain models
│   │   │   ├── Incident.js
│   │   │   ├── User.js
│   │   │   └── SLAPolicy.js
│   │   ├── states/              # State pattern (incident lifecycle)
│   │   │   ├── IncidentState.js
│   │   │   ├── OpenState.js
│   │   │   ├── InProgressState.js
│   │   │   ├── ResolvedState.js
│   │   │   ├── EscalatedState.js
│   │   │   └── ReopenedState.js
│   │   ├── strategies/          # Strategy pattern (auto-assignment)
│   │   │   └── AssignmentStrategy.js
│   │   ├── commands/            # Command pattern (auditable ops)
│   │   │   ├── Command.js
│   │   │   ├── CommandInvoker.js
│   │   │   ├── AssignIncidentCommand.js
│   │   │   └── BroadcastAlertCommand.js
│   │   ├── observers/           # Observer pattern (event fan-out)
│   │   │   ├── IncidentEventPublisher.js
│   │   │   ├── observers.js
│   │   │   ├── wireObservers.js
│   │   │   ├── SLATimerManager.js
│   │   │   └── HotspotDetector.js
│   │   ├── factories/           # Factory pattern
│   │   │   └── IncidentFactory.js
│   │   ├── decorators/          # Decorator pattern (notifications)
│   │   │   ├── BaseNotification.js
│   │   │   ├── EmailDecorator.js
│   │   │   ├── RealTimeDecorator.js
│   │   │   ├── SMSDecorator.js
│   │   │   └── NotificationService.js
│   │   ├── validators/          # Chain of Responsibility
│   │   │   └── ValidationChain.js
│   │   └── errors/              # Custom domain errors
│   │
│   ├── services/
│   │   └── IncidentService.js   # Core business logic orchestrator
│   │
│   ├── infrastructure/
│   │   ├── db/prisma.js         # Prisma client singleton
│   │   ├── repositories/        # Data access layer
│   │   │   ├── IncidentRepository.js
│   │   │   ├── CachingIncidentProxy.js  # Proxy pattern
│   │   │   └── DepartmentRepository.js
│   │   ├── cache/               # Redis caching utilities
│   │   ├── storage/             # Cloudinary integration
│   │   └── ai/                  # AI provider configuration
│   │
│   ├── jobs/
│   │   ├── workers/
│   │   │   ├── slaWorker.js     # SLA breach escalation
│   │   │   ├── email.worker.js  # Async email delivery
│   │   │   ├── ai.worker.js     # AI classification & analysis
│   │   │   └── analytics.worker.js  # Stats aggregation
│   │   └── schedulers/
│   │       └── dailySummary.scheduler.js  # 7AM daily cron
│   │
│   └── realtime/
│       ├── handlers/
│       │   ├── incident.handler.js  # Live incident updates
│       │   ├── panic.handler.js     # Emergency broadcasts
│       │   └── chat.handler.js      # Real-time messaging
│       └── rooms/                   # Room management logic
│
├── client/                      # React SPA (Vite)
│   └── src/
│       ├── App.jsx              # Root component + routing
│       ├── main.jsx             # Vite entry point
│       ├── index.css            # Design system + Tailwind config
│       ├── api/                 # Axios HTTP client
│       ├── context/
│       │   └── AuthContext.jsx  # JWT auth state management
│       ├── hooks/
│       │   └── useSocket.js     # Socket.IO hook with auto-reconnect
│       ├── components/
│       │   ├── Sidebar.jsx      # Navigation sidebar
│       │   ├── PanicButton.jsx  # Emergency trigger
│       │   ├── SLACountdown.jsx # Live SLA timer
│       │   ├── GlobalSocketListener.jsx  # App-wide socket events
│       │   ├── ProtectedRoute.jsx        # RBAC route guard
│       │   ├── PageTransition.jsx        # Framer Motion wrapper
│       │   └── ui/              # Reusable UI primitives
│       │       ├── Button.jsx
│       │       ├── Card.jsx
│       │       ├── Input.jsx
│       │       └── Badge.jsx
│       └── pages/
│           ├── LoginPage.jsx
│           ├── RegisterPage.jsx
│           ├── DashboardPage.jsx
│           ├── CreateIncidentPage.jsx
│           ├── IncidentDetailPage.jsx
│           ├── IncidentListPage.jsx
│           ├── StaffDashboardPage.jsx
│           ├── AdminAnalyticsPage.jsx
│           ├── BroadcastAlertPage.jsx
│           ├── ChatPage.jsx
│           ├── HeatmapPage.jsx
│           ├── UserProfilePage.jsx
│           ├── StaffManagementPage.jsx
│           ├── CreateDepartmentPage.jsx
│           └── UnauthorizedPage.jsx
│
├── tests/
│   ├── unit/                    # Unit tests (domain, services, etc.)
│   └── integration/
│       └── app.test.js          # Full HTTP stack integration tests
│
├── docs/                        # Comprehensive documentation
│   ├── PRD.md                   # Product Requirements Document
│   ├── SYSTEM_DESIGN.md         # System architecture
│   ├── DATABASE_DESIGN.md       # Schema design decisions
│   ├── API_CONTRACT.md          # Full API specification
│   ├── DOMAIN_MODEL.md          # Domain model documentation
│   ├── DESIGN_PATTERNS.md       # Pattern implementations
│   ├── USER_FLOWS.md            # User journey maps
│   └── AI_CONTEXT.md            # AI integration details
│
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Node.js** | v18+ | [nodejs.org](https://nodejs.org) |
| **PostgreSQL** | v14+ | [postgresql.org](https://www.postgresql.org/download/) |
| **Redis** | v7+ | [redis.io](https://redis.io/download/) or Docker |
| **npm** | v9+ | Comes with Node.js |

### 1. Clone the Repository

```bash
git clone https://github.com/narula1304/campusops.git
cd campusops
```

### 2. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

---

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="postgresql://campusops_user:campus123@localhost:5432/campusops"

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Server ────────────────────────────────────────────────
PORT=5000

# ── Authentication ────────────────────────────────────────
JWT_SECRET="your-secure-random-secret-here"

# ── AI (Groq) ────────────────────────────────────────────
GROQ_API_KEY="your-groq-api-key"

# ── Email (SMTP) ──────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
NODEMAILER_USER=your-email@gmail.com
```

Create a `.env` file in `client/`:

```env
VITE_API_URL=http://localhost:5000
```

> **Note:** For Gmail SMTP, use an [App Password](https://support.google.com/accounts/answer/185833) — not your regular password.

---

## 🗄️ Database Setup

### 1. Create the PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create user and database
CREATE USER campusops_user WITH PASSWORD 'campus123';
CREATE DATABASE campusops OWNER campusops_user;
GRANT ALL PRIVILEGES ON DATABASE campusops TO campusops_user;
\q
```

### 2. Run Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# (Optional) For development — create + apply migrations
npx prisma migrate dev
```

### 3. Seed the Database

```bash
node prisma/seed.js
```

This creates 1 department and 5 users with the following credentials:

| Role | Email | Password |
|---|---|---|
| 🎓 Student | `student@campus.edu` | `campusops123` |
| 👨‍🏫 Faculty | `faculty@campus.edu` | `campusops123` |
| 🔧 Maintenance | `maintenance@campus.edu` | `campusops123` |
| 🛡️ Security | `security@campus.edu` | `campusops123` |
| ⚙️ Admin | `admin@campus.edu` | `campusops123` |

### 4. Explore the Database (Optional)

```bash
npx prisma studio
```

Opens a visual database browser at `http://localhost:5555`.

---

## ▶️ Running the Application

### Development Mode

Open **two terminals**:

```bash
# Terminal 1: Start the API server (port 5000)
npm start
# or with auto-reload:
npm run dev

# Terminal 2: Start the React client (port 5173)
cd client
npm run dev
```

| Service | URL |
|---|---|
| 🌐 Frontend | http://localhost:5173 |
| 🔌 API Server | http://localhost:5000 |
| 💚 Health Check | http://localhost:5000/health |

> **Important:** Ensure PostgreSQL and Redis are running before starting the server.

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new user | ❌ |
| `POST` | `/api/auth/login` | Login & receive tokens | ❌ |
| `POST` | `/api/auth/refresh` | Refresh access token | 🔄 Refresh Token |
| `POST` | `/api/auth/logout` | Invalidate refresh token | ✅ |

### Incidents

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/incidents` | Create a new incident | ✅ |
| `GET` | `/api/incidents` | List incidents (with filters) | ✅ |
| `GET` | `/api/incidents/:id` | Get incident details | ✅ |
| `PATCH` | `/api/incidents/:id/status` | Update incident status | ✅ |
| `POST` | `/api/incidents/:id/assign` | Assign incident to staff | ✅ Admin |
| `POST` | `/api/incidents/:id/feedback` | Submit resolution feedback | ✅ |

### Panic

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/panic` | Trigger emergency panic | ✅ |
| `POST` | `/api/panic/:id/acknowledge` | Acknowledge panic alert | ✅ Security |

### Chat

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/incidents/:id/chat` | Get chat room & messages | ✅ |
| `POST` | `/api/incidents/:id/chat/messages` | Send a message | ✅ |

### Alerts

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/alerts` | Broadcast campus alert | ✅ Admin |
| `GET` | `/api/alerts` | List all alerts | ✅ |
| `PATCH` | `/api/alerts/:id/retract` | Retract an alert | ✅ Admin |

### Analytics

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/analytics/dashboard` | Dashboard statistics | ✅ Admin |
| `GET` | `/api/analytics/trends` | Incident trends data | ✅ Admin |
| `GET` | `/api/analytics/hotspots` | Hotspot locations | ✅ Admin |
| `GET` | `/api/analytics/daily-summary` | AI daily summary | ✅ Admin |

### Users & Departments

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/users/me` | Get current user profile | ✅ |
| `GET` | `/api/users` | List all users | ✅ Admin |
| `PATCH` | `/api/users/:id` | Update user | ✅ Admin |
| `GET` | `/api/departments` | List departments | ✅ |
| `POST` | `/api/departments` | Create department | ✅ Admin |

> 📄 For the complete API specification with request/response schemas, see [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

---

## 📡 Real-Time Events

### Socket.IO Rooms

```
user:{userId}     → Personal notifications
role:{ROLE}       → Role-wide broadcasts (e.g., role:SECURITY for panic)
dept:{deptId}     → Department-scoped updates
incident:{id}     → Incident-specific live feed
chat:{roomId}     → Chat room messages
```

### Key Events

| Event | Direction | Description |
|---|---|---|
| `incident:created` | Server → Client | New incident created |
| `incident:statusUpdate` | Server → Client | Status transition |
| `incident:assigned` | Server → Client | Staff assignment |
| `panic:alert` | Server → Security | Emergency GPS broadcast |
| `panic:acknowledged` | Server → Client | Officer responded |
| `chat:message` | Bidirectional | Chat message sent/received |
| `notification:new` | Server → Client | New notification |
| `alert:broadcast` | Server → Client | Campus-wide alert |

---

## 🔒 Role-Based Access

| Feature | Student | Faculty | Maintenance | Security | Admin |
|---|---|---|---|---|---|
| Report incident | ✅ | ✅ | ❌ | ❌ | ✅ |
| View own incidents | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all incidents | ❌ | ❌ | ❌ | ❌ | ✅ |
| Update status | ❌ | ❌ | ✅ | ✅ | ✅ |
| Assign staff | ❌ | ❌ | ❌ | ❌ | ✅ |
| Trigger panic | ✅ | ✅ | ✅ | ✅ | ✅ |
| Acknowledge panic | ❌ | ❌ | ❌ | ✅ | ✅ |
| Broadcast alerts | ❌ | ❌ | ❌ | ❌ | ✅ |
| View analytics | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage staff | ❌ | ❌ | ❌ | ❌ | ✅ |
| Staff dashboard | ❌ | ❌ | ✅ | ✅ | ❌ |
| Incident chat | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit feedback | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run all tests
npm run test:all
```

### Test Architecture

- **Unit tests** (`tests/unit/`) — Domain entities, state machines, strategies, services
- **Integration tests** (`tests/integration/`) — Full HTTP stack with Express, middleware, and controllers

The server exports `buildApp()` separately from `startServer()`, enabling integration tests to construct the Express app with faked infrastructure (no real DB/Redis required).

---

## 📚 Documentation

Comprehensive documentation is available in the `docs/` directory:

| Document | Description |
|---|---|
| [`PRD.md`](docs/PRD.md) | Product Requirements Document — user stories, functional & non-functional requirements |
| [`SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) | System architecture, component interactions, deployment topology |
| [`DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) | Schema design, indexing strategy, query patterns |
| [`API_CONTRACT.md`](docs/API_CONTRACT.md) | Full API specification with request/response schemas |
| [`DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) | Domain entities, aggregates, invariants |
| [`DESIGN_PATTERNS.md`](docs/DESIGN_PATTERNS.md) | Detailed pattern implementations with code examples |
| [`USER_FLOWS.md`](docs/USER_FLOWS.md) | Step-by-step user journey maps for each role |
| [`AI_CONTEXT.md`](docs/AI_CONTEXT.md) | AI integration details, prompt engineering, model selection |

---

## 📈 Performance Targets

| Metric | Target |
|---|---|
| API response time (p95) | < 300ms |
| Panic broadcast latency | < 200ms |
| Real-time notification delivery | < 500ms |
| Dashboard page load (cache hit) | < 2s |

---

## 🔧 Available Scripts

### Server

| Command | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with nodemon |
| `npm run build` | Generate Prisma client |
| `npm run migrate` | Deploy pending migrations |
| `npm run migrate:dev` | Create and apply dev migrations |
| `npm run studio` | Open Prisma Studio |
| `npm test` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run test:all` | Run all tests |

### Client

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **ISC License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for smarter campus operations
</p>