# Domain Model
## CampusOps — Smart Campus Operations & Incident Management System

**Important:** The domain model is completely independent of PostgreSQL and Prisma.
All classes in `/src/domain` are pure JavaScript with zero ORM imports.
Prisma is only used in `/src/infrastructure/repositories` to persist and hydrate domain objects.

---

## 1. Bounded Contexts

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Identity &    │  │    Incident     │  │   Assignment    │
│   Access        │  │   Management   │  │   & SLA         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
┌─────────────────┐  ┌─────────────────┐
│  Notification   │  │   Analytics     │
│  & Alerts       │  │   & AI          │
└─────────────────┘  └─────────────────┘
```

---

## 2. User Hierarchy

```javascript
// src/domain/entities/User.js

class User {
  // Shared properties
  id            // UUID
  name          // string
  email         // string
  passwordHash  // string (bcrypt)
  role          // UserRole enum
  departmentId  // string (FK — stored as plain value in domain)
  isActive      // boolean
  notificationPrefs  // NotificationPreferences value object

  // Shared methods
  canReportIncident()    // boolean
  canViewDashboard()     // boolean
  canAssignIncidents()   // boolean
  getSocketRooms()       // string[] — ['user:{id}', 'dept:{deptId}', 'role:{role}']
}

class Student extends User {
  rollNo        // string
  year          // number
  batch         // string
  canTriggerPanic()  // always true
}

class Faculty extends User {
  employeeId    // string
  designation   // string
  canMarkHighPriority()  // always true
}

class MaintenanceStaff extends User {
  employeeId       // string
  specialization   // string[]  e.g. ['electrical', 'plumbing']
  activeTaskCount  // number  — denormalized for fast assignment queries
  staffState       // StaffState enum: ACTIVE | UNDER_REVIEW | SUSPENDED
  penaltyCount     // number
  shiftDays        // string[]
  shiftStart       // string '09:00'
  shiftEnd         // string '18:00'

  isAvailableFor(durationHours, fromTime)  // boolean
  isOnShift(time)                          // boolean
  isOnCall(time)                           // boolean
}

class SecurityOfficer extends User {
  employeeId    // string
  badgeNumber   // string
  zone          // string
  shift         // Shift value object
  canBroadcastAlert()  // always true
}

class Admin extends User {
  employeeId          // string
  accessLevel         // AdminLevel enum: HOD | DEAN | SUPERADMIN
  managedDepartmentIds  // string[]
  canConfigureStrategies()  // always true
}
```

**Why subclass User instead of one flat table?**
Each subclass has attributes and behaviors unique to that role.
`MaintenanceStaff.isAvailableFor()` drives ShiftAware assignment.
`MaintenanceStaff.activeTaskCount` drives LeastLoaded assignment.
`MaintenanceStaff.penaltyCount` drives the feedback loop and staff state machine.
These cannot live on a base User without bloating it with fields that are null for most roles.
In PostgreSQL, all these fields live in a single `User` table — nullable columns per role.
In the domain, they live in the right subclass and are never null.

---

## 3. Incident Hierarchy

```javascript
// src/domain/entities/Incident.js

class Incident {
  // Shared properties
  id               // UUID
  incidentNumber   // string 'INC-2025-004521'
  title            // string
  description      // string
  category         // IncidentCategory enum
  priority         // Priority enum
  location         // Location value object
  evidencePhotos   // string[]
  resolutionPhoto  // string | null
  creatorId        // string
  assignedToId     // string | null
  departmentId     // string
  sla              // SLAPolicy instance
  slaJobId         // string | null (BullMQ job ID)
  state            // IncidentState instance (NOT persisted — reconstructed on load)
  resolutionNote   // string | null
  resolvedAt       // Date | null
  isDuplicate      // boolean
  duplicateOfId    // string | null
  duplicateCount   // number

  // Shared methods — all delegate to this.state
  assignStaff(staff)             // delegates to state
  startProgress()                // delegates to state
  resolve(note, photo)           // delegates to state
  escalate(reason)               // delegates to state
  reopen(reason)                 // delegates to state
  receiveFeedback(rating)        // delegates to state

  // Internal
  setState(state)                // replaces current state
  publish(eventType, payload)    // fires IncidentEventPublisher
  addToStatusLog(entry)          // appended — never mutates existing entries
  getEligibleAssignees()         // abstract — overridden by subclasses
}

class MaintenanceIncident extends Incident {
  estimatedDurationHours  // number
  getEligibleAssignees()  // returns MaintenanceStaff[] filtered by dept + specialization
  // InProgressState.resolve() enforces resolutionPhoto for this type
}

class SecurityIncident extends Incident {
  reportNumber        // string (required before resolution)
  alertsBroadcast     // boolean
  getEligibleAssignees()  // returns SecurityOfficer[]
}

class InfrastructureIncident extends Incident {
  requiresDeptHeadApproval  // boolean
  estimatedCost             // number
  getEligibleAssignees()    // returns MaintenanceStaff[]
}

class EmergencyIncident extends Incident {
  panicLat          // number
  panicLng          // number
  broadcastedAt     // Date
  acknowledgedByIds // string[]
  getEligibleAssignees()  // returns SecurityOfficer[]
  // Created AFTER broadcast — see panic flow in USER_FLOWS.md
}
```

---

## 4. SLA Policy Hierarchy

```javascript
// src/domain/entities/SLAPolicy.js

class SLAPolicy {
  priority        // Priority enum
  windowHours     // number
  deadlineAt      // Date (set on incident creation)
  isEscalated     // boolean
  escalatedAt     // Date | null

  getDeadline(createdAt)        // Date — createdAt + windowHours
  isBreached(now)               // boolean
  getRemainingMs(now)           // number
  getEscalationTarget()         // AdminLevel — abstract
}

class CriticalSLA extends SLAPolicy {
  windowHours = 2
  getEscalationTarget()  // AdminLevel.DEAN
}

class HighSLA extends SLAPolicy {
  windowHours = 4
  getEscalationTarget()  // AdminLevel.HOD
}

class MediumSLA extends SLAPolicy {
  windowHours = 8
  getEscalationTarget()  // AdminLevel.HOD
}

class LowSLA extends SLAPolicy {
  windowHours = 24
  getEscalationTarget()  // AdminLevel.HOD
}
```

---

## 5. State Machines

### 5.1 Incident State Machine

```
                    ┌──────────────┐
                    │    OPEN      │ ← initial
                    └──────┬───────┘
                           │ assignStaff(staff)
                           ▼
                    ┌──────────────┐
                    │ IN_PROGRESS  │
                    └──────┬───────┘
                           │ resolve(note, photo) [photo REQUIRED]
                           ▼
                    ┌──────────────┐ ←──────────────────────────┐
                    │  RESOLVED    │                             │
                    └──────┬───────┘                             │
                           │ receiveFeedback(score ≤ 2)          │
                           ▼                                     │
                    ┌──────────────┐                             │
                    │  REOPENED    │ ── assignStaff → IN_PROGRESS ┘
                    └──────────────┘

  From OPEN or IN_PROGRESS:
           │ SLA breach / manual
           ▼
    ┌─────────────┐
    │  ESCALATED  │ ── assignStaff → IN_PROGRESS
    └─────────────┘
```

```javascript
// src/domain/states/IncidentState.js — abstract base
class IncidentState {
  assignStaff(incident, staff) {
    throw new InvalidTransitionError(this.constructor.name, 'assignStaff')
  }
  resolve(incident, note, photo) {
    throw new InvalidTransitionError(this.constructor.name, 'resolve')
  }
  escalate(incident, reason) {
    throw new InvalidTransitionError(this.constructor.name, 'escalate')
  }
  reopen(incident, reason) {
    throw new InvalidTransitionError(this.constructor.name, 'reopen')
  }
  receiveFeedback(incident, rating) {
    throw new InvalidTransitionError(this.constructor.name, 'receiveFeedback')
  }
  getName() { return this.constructor.name }
}

// src/domain/states/OpenState.js
class OpenState extends IncidentState {
  assignStaff(incident, staff) {
    if (staff.staffState !== 'ACTIVE') throw new StaffUnavailableError(staff.id)
    incident.assignedToId = staff.id
    staff.activeTaskCount++
    incident.addToStatusLog({ status: 'IN_PROGRESS', changedById: staff.id, note: 'Assigned' })
    incident.setState(new InProgressState())
    incident.publish('INCIDENT_ASSIGNED', { incident, staff })
  }
  escalate(incident, reason) {
    incident.sla.isEscalated = true
    incident.addToStatusLog({ status: 'ESCALATED', note: reason })
    incident.setState(new EscalatedState())
    incident.publish('INCIDENT_ESCALATED', { incident, reason })
  }
}

// src/domain/states/InProgressState.js
class InProgressState extends IncidentState {
  resolve(incident, note, photo) {
    if (!photo) throw new ResolutionPhotoRequiredError()
    if (!note || note.trim().length < 10) throw new ResolutionNoteTooShortError()
    incident.resolutionNote = note.trim()
    incident.resolutionPhoto = photo
    incident.resolvedAt = new Date()
    const staff = incident.assignedTo
    if (staff) staff.activeTaskCount--
    incident.addToStatusLog({ status: 'RESOLVED', changedById: staff?.id, note })
    incident.setState(new ResolvedState())
    incident.publish('INCIDENT_RESOLVED', { incident })
  }
  escalate(incident, reason) {
    incident.sla.isEscalated = true
    incident.addToStatusLog({ status: 'ESCALATED', note: reason })
    incident.setState(new EscalatedState())
    incident.publish('INCIDENT_ESCALATED', { incident, reason })
  }
}

// src/domain/states/ResolvedState.js
class ResolvedState extends IncidentState {
  receiveFeedback(incident, rating) {
    incident.feedback = { score: rating.score, comment: rating.comment, submittedAt: new Date() }
    if (rating.score <= 2) {
      const staff = incident.assignedTo
      if (staff) {
        staff.penaltyCount++
        if (staff.penaltyCount >= 3) {
          staff.setState(new StaffUnderReviewState())
          incident.publish('STAFF_UNDER_REVIEW', { staff })
        }
      }
      incident.addToStatusLog({ status: 'REOPENED', note: `Reopened: poor rating (${rating.score}/5)` })
      incident.setState(new ReopenedState())
      incident.publish('INCIDENT_REOPENED_BY_FEEDBACK', { incident, rating })
    } else {
      incident.publish('FEEDBACK_RECEIVED', { incident, rating })
    }
  }
}

// src/domain/states/EscalatedState.js
class EscalatedState extends IncidentState {
  assignStaff(incident, staff) {
    incident.assignedToId = staff.id
    staff.activeTaskCount++
    incident.addToStatusLog({ status: 'IN_PROGRESS', changedById: staff.id, note: 'Assigned after escalation' })
    incident.setState(new InProgressState())
    incident.publish('INCIDENT_ASSIGNED', { incident, staff })
  }
}

// src/domain/states/ReopenedState.js
// Distinct from OpenState — carries context of failed resolution
class ReopenedState extends IncidentState {
  assignStaff(incident, staff) {
    incident.assignedToId = staff.id
    staff.activeTaskCount++
    incident.addToStatusLog({ status: 'IN_PROGRESS', changedById: staff.id, note: 'Reassigned after reopen' })
    incident.setState(new InProgressState())
    incident.publish('INCIDENT_REASSIGNED', { incident, staff, reason: 'poor_feedback' })
  }
}
```

### 5.2 Staff State Machine

```
┌────────────────┐
│     ACTIVE     │ ← default
└───────┬────────┘
        │ penaltyCount >= 3
        ▼
┌────────────────┐
│  UNDER_REVIEW  │ ← cannot receive new assignments
└───────┬────────┘
        │ HOD clears review
        ▼
┌────────────────┐
│     ACTIVE     │ (restored)
└────────────────┘
        │ admin suspends
        ▼
┌────────────────┐
│   SUSPENDED    │ ← no login, no assignments
└────────────────┘
```

---

## 6. Value Objects

```javascript
// Defined by attributes — no identity, immutable

class Location {
  block        // string 'C'
  room         // string 'C-304'
  floor        // number
  lat          // number
  lng          // number
  description  // string (optional)
}

class NotificationPreferences {
  realtime  // boolean
  email     // boolean
  sms       // boolean
}

class FeedbackRating {
  score      // number 1-5
  comment    // string
  sentiment  // string (AI classified)
  issueTags  // string[]
  submittedAt // Date
}

class StatusLogEntry {
  status      // IncidentStatus
  changedById // string
  note        // string
  changedAt   // Date
}
```

---

## 7. Domain Services

```javascript
// Services hold logic that spans multiple entities

class IncidentService {
  async createIncident(dto, creator)
    // runs validation chain → factory → auto-assign → schedule SLA → persist
  async updateStatus(incidentId, action, actor, data)
    // loads incident → hydrates state → delegates to state object → persists
  async findDuplicates(location, category, windowHours)
    // queries IncidentRepository
}

class AssignmentService {
  async autoAssign(incident)
    // fetches dept strategy → calls strategy.assign() → returns User
  async manualAssign(incident, staffId, adminId)
  async getEligibleStaff(incident)
}

class SLAService {
  async scheduleEscalation(incident)  // returns BullMQ jobId
  async cancelEscalation(jobId)
  async processEscalation(incidentId) // called by BullMQ worker
}

class HotspotService {
  async checkHotspot(location)           // returns HotspotAlert | null
  async predictNextOccurrence(block, room) // statistical model
  async getHotspotMap()
}

class NotificationService {
  async notify(user, event, payload)     // builds decorator stack → sends
  async broadcast(scope, event, payload) // emits to correct Socket.IO rooms
}

class AIService {
  async classifyIncident(description)
  async generateDailySummary(date)
  async analyzeFeedbackSentiment(text)
  async suggestEscalation(incident)
}
```

---

## 8. Domain Events

| Event | Published By | Observers |
|-------|-------------|-----------|
| `INCIDENT_CREATED` | IncidentService | SLATimerManager, RealTimeNotifier, AuditLogger, HotspotDetector |
| `INCIDENT_ASSIGNED` | OpenState / EscalatedState | RealTimeNotifier, EmailNotifier, AuditLogger |
| `INCIDENT_RESOLVED` | InProgressState | RealTimeNotifier, EmailNotifier, FeedbackRequestSender, SLATimerManager (cancel), AuditLogger, CacheInvalidator |
| `INCIDENT_ESCALATED` | SLAService | RealTimeNotifier, EmailNotifier, AuditLogger |
| `INCIDENT_REOPENED_BY_FEEDBACK` | ResolvedState | RealTimeNotifier, AuditLogger |
| `PANIC_TRIGGERED` | PanicHandler | PanicBroadcaster, IncidentService, AuditLogger |
| `HOTSPOT_DETECTED` | HotspotDetector | RealTimeNotifier (admin room), EmailNotifier |
| `STAFF_UNDER_REVIEW` | ResolvedState | RealTimeNotifier (HOD), EmailNotifier |
| `FEEDBACK_RECEIVED` | ResolvedState | AuditLogger, AIService (sentiment job) |

---

## 9. Repository Interfaces (Domain contracts — implemented by Prisma layer)

```javascript
// These interfaces live in /src/domain — Prisma implements them in /src/infrastructure

class IncidentRepository {
  async findById(id)                          // returns Incident domain object
  async findMany(filters, pagination)         // returns Incident[]
  async save(incident)                        // INSERT or UPDATE via Prisma
  async findDuplicates(location, category)    // returns Incident[]
  async getDashboardStats(deptId)             // returns analytics object
}

class UserRepository {
  async findById(id)          // returns User subclass instance
  async findByEmail(email)    // returns User subclass instance
  async save(user)
  async findEligibleStaff(departmentId, category)
}

class StatusLogRepository {
  async append(entry)   // INSERT only — never UPDATE
  async findByIncidentId(incidentId)
}
```

**Critical rule:** Domain services depend on these interfaces.
Prisma implementations are injected at startup (Dependency Inversion).
Unit tests inject mock repositories — no database needed.
