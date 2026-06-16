# Database Design
## CampusOps — Smart Campus Operations & Incident Management System

**Database:** PostgreSQL
**ORM:** Prisma
**Cache:** Redis (BullMQ + Socket.IO rooms + dashboard cache + rate limiting)

---

## 1. Why PostgreSQL over MongoDB for this project

| Concern | MongoDB approach | PostgreSQL approach | Interview impact |
|---------|-----------------|--------------------|--------------------|
| Multi-step operations | Manual session transactions | Native ACID `$transaction` | "Database guarantees consistency" |
| Concurrent assignment | Application-level check | `SELECT FOR UPDATE` row lock | "Database prevents race condition" |
| Audit trail | Embedded array in document | Append-only table | "Tamper-proof relational design" |
| Analytics | Aggregation pipeline | Window functions + CTEs | "Pure SQL craft, single query" |
| Schema visibility | JSON documents | Normalized tables + FK constraints | "Clear relational model" |
| SQL injection | N/A | Prisma parameterized queries | "Immune by construction" |

---

## 2. Complete Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────

enum Role {
  STUDENT
  FACULTY
  MAINTENANCE
  SECURITY
  ADMIN
}

enum StaffState {
  ACTIVE
  UNDER_REVIEW
  SUSPENDED
}

enum AdminLevel {
  HOD
  DEAN
  SUPERADMIN
}

enum IncidentCategory {
  MAINTENANCE
  SECURITY
  INFRASTRUCTURE
  CLEANLINESS
  EMERGENCY
  OTHER
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum IncidentStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  ESCALATED
  REOPENED
  CLOSED
}

enum AssignmentStrategy {
  LEAST_LOADED
  ROUND_ROBIN
  SHIFT_AWARE
  MANUAL
}

enum AlertType {
  EMERGENCY
  ANNOUNCEMENT
  MAINTENANCE_SHUTDOWN
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}

enum AlertTarget {
  CAMPUS
  DEPARTMENT
  ROLE
}

enum NotificationType {
  INCIDENT_UPDATE
  ASSIGNMENT
  ALERT
  FEEDBACK_REQUEST
  ESCALATION
  PANIC
  HOTSPOT
  STAFF_REVIEW
}

enum Sentiment {
  POSITIVE
  NEGATIVE
  NEUTRAL
}

// ─────────────────────────────────────────
// USER & DEPARTMENT
// ─────────────────────────────────────────

model User {
  id               String      @id @default(uuid())
  name             String
  email            String      @unique
  passwordHash     String
  role             Role
  isActive         Boolean     @default(true)
  refreshTokenHash String?
  failedLoginCount Int         @default(0)
  lockedUntil      DateTime?

  // Notification preferences
  prefRealtime     Boolean     @default(true)
  prefEmail        Boolean     @default(true)
  prefSms          Boolean     @default(false)

  // Student fields
  rollNo           String?
  year             Int?
  batch            String?

  // Faculty + Staff shared
  employeeId       String?
  designation      String?

  // MaintenanceStaff fields
  specialization   String[]    @default([])
  activeTaskCount  Int         @default(0)
  staffState       StaffState  @default(ACTIVE)
  penaltyCount     Int         @default(0)
  shiftDays        String[]    @default([])
  shiftStart       String?
  shiftEnd         String?

  // SecurityOfficer fields
  badgeNumber      String?
  zone             String?

  // Admin fields
  accessLevel      AdminLevel?

  // Relations
  departmentId             String?
  department               Department?          @relation("UserDepartment", fields: [departmentId], references: [id])
  managedDepartments       DepartmentAdmin[]
  createdIncidents         Incident[]           @relation("IncidentCreator")
  assignedIncidents        Incident[]           @relation("IncidentAssignee")
  escalatedIncidents       Incident[]           @relation("IncidentEscalatedTo")
  statusLogsAuthored       IncidentStatusLog[]
  assignmentsMade          IncidentAssignment[] @relation("AssignedBy")
  assignmentsReceived      IncidentAssignment[] @relation("AssignedTo")
  notifications            Notification[]
  sentMessages             Message[]
  chatRooms                ChatParticipant[]
  panicAcknowledgements    PanicAcknowledgement[]
  createdAlerts            Alert[]
  auditLogsActed           AuditLog[]

  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  @@index([role, departmentId])
  @@index([role, staffState])
  @@index([email])
}

model Department {
  id                 String             @id @default(uuid())
  name               String             @unique
  code               String             @unique
  assignmentStrategy AssignmentStrategy @default(LEAST_LOADED)
  roundRobinIndex    Int                @default(0)
  headFacultyId      String?

  users              User[]             @relation("UserDepartment")
  incidents          Incident[]
  adminAccess        DepartmentAdmin[]

  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
}

model DepartmentAdmin {
  userId       String
  departmentId String
  user         User       @relation(fields: [userId], references: [id])
  department   Department @relation(fields: [departmentId], references: [id])

  @@id([userId, departmentId])
}

// ─────────────────────────────────────────
// INCIDENT
// ─────────────────────────────────────────

model Incident {
  id              String           @id @default(uuid())
  incidentNumber  String           @unique

  title           String
  description     String
  category        IncidentCategory
  priority        Priority
  status          IncidentStatus   @default(OPEN)

  // Location (denormalized — always queried with incident)
  locationBlock   String
  locationRoom    String?
  locationFloor   Int?
  locationLat     Float?
  locationLng     Float?
  locationDesc    String?

  // Photos (PostgreSQL native array)
  evidencePhotos  String[]         @default([])
  resolutionPhoto String?

  // Foreign keys
  creatorId       String
  creator         User             @relation("IncidentCreator", fields: [creatorId], references: [id])
  assignedToId    String?
  assignedTo      User?            @relation("IncidentAssignee", fields: [assignedToId], references: [id])
  departmentId    String
  department      Department       @relation(fields: [departmentId], references: [id])

  // SLA
  slaWindowHours  Int
  slaDeadlineAt   DateTime
  slaIsEscalated  Boolean          @default(false)
  slaEscalatedAt  DateTime?
  slaEscalatedToId String?
  slaEscalatedTo  User?            @relation("IncidentEscalatedTo", fields: [slaEscalatedToId], references: [id])
  slaJobId        String?

  // Resolution
  resolutionNote  String?
  resolvedAt      DateTime?

  // Duplicate tracking
  isDuplicate     Boolean          @default(false)
  duplicateOfId   String?
  duplicateOf     Incident?        @relation("Duplicates", fields: [duplicateOfId], references: [id])
  duplicates      Incident[]       @relation("Duplicates")
  duplicateCount  Int              @default(0)

  // Panic-specific
  panicLat        Float?
  panicLng        Float?
  panicBroadcastedAt DateTime?

  // AI metadata
  aiSuggestedCategory  String?
  aiSuggestedPriority  String?
  aiSuggestedDept      String?
  aiConfidence         Float?
  aiSuggestionAccepted Boolean?

  // AI escalation suggestion
  aiEscSuggestion      String?
  aiEscReason          String?
  aiEscUrgency         String?
  aiEscSuggestedAt     DateTime?
  aiEscReviewedByAdmin Boolean     @default(false)

  // Relations
  statusLogs        IncidentStatusLog[]
  assignmentHistory IncidentAssignment[]
  feedback          IncidentFeedback?
  chatRoom          ChatRoom?
  notifications     Notification[]
  panicAcks         PanicAcknowledgement[]
  auditLogs         AuditLog[]

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  // Indexes — designed for the most common query patterns
  @@index([status, departmentId])                              // dashboard by dept
  @@index([status, assignedToId])                             // staff dashboard
  @@index([slaDeadlineAt, status])                            // SLA monitoring
  @@index([locationBlock, locationRoom, category, createdAt]) // duplicate detection + hotspot
  @@index([creatorId, createdAt(sort: Desc)])                 // my incidents
  @@index([priority, status])                                 // priority filter
  @@index([createdAt(sort: Desc)])                            // latest first
}

// APPEND-ONLY — never UPDATE rows, only INSERT
// This is the tamper-proof audit trail
model IncidentStatusLog {
  id          String         @id @default(uuid())
  incidentId  String
  incident    Incident       @relation(fields: [incidentId], references: [id])
  status      IncidentStatus
  changedById String?
  changedBy   User?          @relation(fields: [changedById], references: [id])
  note        String?
  changedAt   DateTime       @default(now())

  @@index([incidentId, changedAt])
}

model IncidentAssignment {
  id           String   @id @default(uuid())
  incidentId   String
  incident     Incident @relation(fields: [incidentId], references: [id])
  assignedToId String
  assignedTo   User     @relation("AssignedTo", fields: [assignedToId], references: [id])
  assignedById String
  assignedBy   User     @relation("AssignedBy", fields: [assignedById], references: [id])
  strategy     String
  reason       String?
  assignedAt   DateTime @default(now())

  @@index([incidentId])
  @@index([assignedToId])
}

model IncidentFeedback {
  id              String    @id @default(uuid())
  incidentId      String    @unique
  incident        Incident  @relation(fields: [incidentId], references: [id])
  score           Int
  comment         String?
  sentiment       Sentiment?
  issueTags       String[]  @default([])
  aiSummary       String?
  reopenTriggered Boolean   @default(false)
  submittedAt     DateTime  @default(now())
}

// ─────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────

model ChatRoom {
  id         String           @id @default(uuid())
  incidentId String           @unique
  incident   Incident         @relation(fields: [incidentId], references: [id])
  isActive   Boolean          @default(true)
  closedAt   DateTime?
  createdAt  DateTime         @default(now())

  participants ChatParticipant[]
  messages     Message[]
}

model ChatParticipant {
  userId   String
  roomId   String
  user     User     @relation(fields: [userId], references: [id])
  room     ChatRoom @relation(fields: [roomId], references: [id])
  joinedAt DateTime @default(now())

  @@id([userId, roomId])
}

model Message {
  id            String   @id @default(uuid())
  roomId        String
  room          ChatRoom @relation(fields: [roomId], references: [id])
  senderId      String
  sender        User     @relation(fields: [senderId], references: [id])
  text          String?
  attachmentUrl String?
  createdAt     DateTime @default(now())

  readReceipts  MessageReadReceipt[]

  @@index([roomId, createdAt])
}

model MessageReadReceipt {
  messageId String
  userId    String
  readAt    DateTime @default(now())
  message   Message  @relation(fields: [messageId], references: [id])

  @@id([messageId, userId])
}

// ─────────────────────────────────────────
// ALERTS & NOTIFICATIONS
// ─────────────────────────────────────────

model Alert {
  id                String        @id @default(uuid())
  title             String
  message           String
  type              AlertType
  severity          AlertSeverity
  createdById       String
  createdBy         User          @relation(fields: [createdById], references: [id])
  scopeTarget       AlertTarget
  scopeDepartmentId String?
  scopeRole         String?
  deliveryChannels  String[]      @default([])
  isRetracted       Boolean       @default(false)
  retractedAt       DateTime?
  createdAt         DateTime      @default(now())
}

model Notification {
  id          String           @id @default(uuid())
  recipientId String
  recipient   User             @relation(fields: [recipientId], references: [id])
  type        NotificationType
  title       String
  body        String
  incidentId  String?
  incident    Incident?        @relation(fields: [incidentId], references: [id])
  alertId     String?
  isRead      Boolean          @default(false)
  deliveredVia String[]        @default([])
  createdAt   DateTime         @default(now())

  @@index([recipientId, isRead, createdAt(sort: Desc)])
}

model PanicAcknowledgement {
  incidentId     String
  officerId      String
  incident       Incident @relation(fields: [incidentId], references: [id])
  officer        User     @relation(fields: [officerId], references: [id])
  acknowledgedAt DateTime @default(now())

  @@id([incidentId, officerId])
}

// ─────────────────────────────────────────
// ANALYTICS & AI
// ─────────────────────────────────────────

model DailySummary {
  id            String   @id @default(uuid())
  date          String   @unique
  totalNew      Int
  totalResolved Int
  slaBreaches   Int
  criticalOpen  Int
  hotspots      Json
  summary       String
  generatedAt   DateTime @default(now())
}

// APPEND-ONLY audit log — Command pattern logging lands here
model AuditLog {
  id          String    @id @default(uuid())
  commandType String
  actorId     String
  actor       User      @relation(fields: [actorId], references: [id])
  incidentId  String?
  incident    Incident? @relation(fields: [incidentId], references: [id])
  payload     Json
  createdAt   DateTime  @default(now())

  @@index([actorId, createdAt(sort: Desc)])
  @@index([incidentId])
}
```

---

## 3. Key Design Decisions

### 3.1 Why single User table with nullable role-specific columns?

PostgreSQL supports nullable columns efficiently — null values take very little storage.
The alternative (separate tables per role joined to User) requires a JOIN on every user fetch.
Since role-specific fields are always read with the user, single-table is faster and simpler.

In Prisma, nullable fields map to `String?`, `Int?` etc.
In the domain layer, the right subclass is always instantiated — nulls are never exposed.

### 3.2 Why append-only IncidentStatusLog?

```sql
-- WRONG — updating status in incident table loses history
UPDATE "Incident" SET status = 'IN_PROGRESS' WHERE id = ?

-- RIGHT — status in Incident table = current state (fast reads)
--         IncidentStatusLog = full history (append-only, tamper-proof)
INSERT INTO "IncidentStatusLog" (incidentId, status, changedById, note) VALUES (?, ?, ?, ?)
UPDATE "Incident" SET status = 'IN_PROGRESS' WHERE id = ?
```

Both happen inside a Prisma `$transaction` — atomically.
The log is the source of truth for "what happened and when."
The `status` column on Incident is a denormalization for fast current-state reads.

### 3.3 Why denormalize activeTaskCount on User?

The assignment query runs on every incident creation:
```sql
SELECT * FROM "User"
WHERE role = 'MAINTENANCE'
  AND "departmentId" = ?
  AND "staffState" = 'ACTIVE'
ORDER BY "activeTaskCount" ASC
LIMIT 1
```

Without denormalization, this requires a subquery counting open incidents per staff member — a slow aggregation on every assignment. With `activeTaskCount` on the User row, the query is O(1) per row with an index. Tradeoff: must increment/decrement atomically on assignment/resolution — handled inside Prisma transactions.

### 3.4 Why store slaJobId on Incident?

BullMQ jobs must be cancelled when an incident resolves before its SLA deadline. The only way to cancel a specific job is by its ID. Storing `slaJobId` on the incident enables:

```javascript
// On resolution:
if (incident.slaJobId) {
  const job = await slaQueue.getJob(incident.slaJobId)
  if (job) await job.remove()
}
```

### 3.5 Index strategy

```sql
-- Composite index for the most common dashboard query
CREATE INDEX idx_incident_status_dept ON "Incident"(status, "departmentId");

-- Staff dashboard: my open assignments
CREATE INDEX idx_incident_status_assignee ON "Incident"(status, "assignedToId");

-- SLA monitoring: find incidents approaching deadline
-- Partial index: only indexes non-resolved incidents (smaller, faster)
CREATE INDEX idx_incident_sla ON "Incident"("slaDeadlineAt")
  WHERE status NOT IN ('RESOLVED', 'CLOSED');

-- Duplicate detection + hotspot: location + category + time
CREATE INDEX idx_incident_location ON "Incident"("locationBlock", "locationRoom", category, "createdAt");

-- Notification inbox: unread first, recent first
CREATE INDEX idx_notification_inbox ON "Notification"("recipientId", "isRead", "createdAt" DESC);
```

Prisma `@@index` directives in schema.prisma generate these automatically on `prisma migrate`.

---

## 4. Key SQL Queries (interview-ready)

### 4.1 Staff performance — window functions

```sql
SELECT
  u.id,
  u.name,
  COUNT(i.id)                                                    AS total_assigned,
  COUNT(CASE WHEN i.status = 'RESOLVED' THEN 1 END)             AS resolved,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (i."resolvedAt" - i."createdAt")) / 3600
  )::numeric, 2)                                                 AS avg_resolution_hours,
  ROUND(AVG(f.score)::numeric, 2)                               AS avg_rating,
  COUNT(CASE WHEN i."slaIsEscalated" = true THEN 1 END)        AS sla_breaches,

  -- Rank within department by resolution speed
  RANK() OVER (
    PARTITION BY i."departmentId"
    ORDER BY AVG(EXTRACT(EPOCH FROM (i."resolvedAt" - i."createdAt"))) ASC NULLS LAST
  ) AS speed_rank_in_dept

FROM "User" u
LEFT JOIN "Incident" i
  ON i."assignedToId" = u.id
  AND i."createdAt" >= NOW() - INTERVAL '30 days'
LEFT JOIN "IncidentFeedback" f ON f."incidentId" = i.id
WHERE u.role = 'MAINTENANCE'
GROUP BY u.id, u.name, i."departmentId"
ORDER BY avg_resolution_hours ASC NULLS LAST;
```

### 4.2 Hotspot detection — location clustering

```sql
SELECT
  "locationBlock",
  "locationRoom",
  COUNT(*)           AS incident_count,
  MAX("createdAt")   AS last_incident_at,
  CASE
    WHEN COUNT(*) >= 10 THEN 'critical'
    WHEN COUNT(*) >= 6  THEN 'high'
    ELSE 'warning'
  END AS severity
FROM "Incident"
WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
  AND status != 'CLOSED'
GROUP BY "locationBlock", "locationRoom"
HAVING COUNT(*) >= 3
ORDER BY incident_count DESC;
```

### 4.3 SLA breach rate by department — CTE

```sql
WITH dept_stats AS (
  SELECT
    d.name AS department,
    COUNT(i.id)                                              AS total,
    COUNT(CASE WHEN i."slaIsEscalated" = true THEN 1 END)  AS breached
  FROM "Department" d
  LEFT JOIN "Incident" i
    ON i."departmentId" = d.id
    AND i."createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY d.id, d.name
)
SELECT
  department,
  total,
  breached,
  ROUND((breached::numeric / NULLIF(total, 0)) * 100, 1) AS breach_rate_pct
FROM dept_stats
ORDER BY breach_rate_pct DESC;
```

### 4.4 Concurrent assignment with row locking

```sql
-- Inside Prisma $transaction:
SELECT * FROM "Incident"
WHERE id = $1
  AND status = 'OPEN'
FOR UPDATE;
-- If another transaction holds the lock, this waits
-- Prevents two admins from assigning the same incident simultaneously
```

---

## 5. Redis Data Structures

### Dashboard cache
```
Key:   cache:dashboard:{deptId}:stats
Type:  String (JSON)
TTL:   300 seconds
Invalidated: on incident status change in that department
```

### Rate limiting (sliding window)
```
Key:   ratelimit:{userId}:{endpoint}
Type:  Sorted Set (score = timestamp, member = timestamp+random)
TTL:   window duration
```

### Socket.IO room memberships
```
Key:   socket:rooms:{userId}
Type:  Set { 'user:{id}', 'dept:{deptId}', 'role:{role}' }
TTL:   86400 seconds (refreshed on connect)
```

### Hotspot counters
```
Key:   hotspot:{block}:{room}
Type:  String (integer)
TTL:   86400 seconds
```

### Staff task count (read cache)
```
Key:   staff:taskcount:{staffId}
Type:  String (integer)
TTL:   none (invalidated on assign/resolve)
```

---

## 6. BullMQ Queues

### sla-escalation
```javascript
{
  name: 'escalate-incident',
  data: { incidentId, escalationLevel },
  opts: {
    delay: msUntilDeadline,
    jobId: `sla:${incidentId}`,   // deterministic ID enables cancellation
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  }
}
// Idempotency: worker checks slaIsEscalated before processing
```

### notifications
```javascript
{ name: 'send-email',  data: { to, subject, html } }
{ name: 'send-sms',    data: { phone, message } }
```

### ai-tasks
```javascript
{ name: 'generate-daily-summary', cron: '0 7 * * *' }
{ name: 'analyze-feedback-sentiment', data: { incidentId, comment } }
{ name: 'check-escalation-suggestion', data: { incidentId } }
```

### analytics
```javascript
{ name: 'check-hotspot', data: { block, room, category } }
```

---

## 7. Prisma Client Setup

```javascript
// src/infrastructure/db/prisma.js
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error']
})

module.exports = prisma
```

```javascript
// Migrations workflow:
// npx prisma migrate dev --name init          (first time)
// npx prisma migrate dev --name add_hotspot   (schema change)
// npx prisma migrate deploy                   (production)
// npx prisma studio                           (visual DB browser)
// npx prisma db seed                          (seed data)
```
