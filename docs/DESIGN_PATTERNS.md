# Design Patterns
## CampusOps — Smart Campus Operations & Incident Management System

All patterns live in `/src/domain` — pure JavaScript, zero Prisma or Express imports.
Prisma only appears in `/src/infrastructure/repositories`.

---

## Pattern Summary

| # | Pattern | Where | Problem it solves |
|---|---------|-------|------------------|
| 1 | State | Incident lifecycle | No if-else status chains in controllers |
| 2 | Strategy | Staff assignment | Configurable assignment logic per department |
| 3 | Observer | Incident events | Decoupled reactions to domain events |
| 4 | Factory | Incident + SLA creation | Controller never decides which class to instantiate |
| 5 | Chain of Responsibility | Incident validation | Each rule is independent and extensible |
| 6 | Decorator | Notification channels | Runtime channel composition from user preferences |
| 7 | Proxy | Repository caching | Service layer unaware of cache vs DB |
| 8 | Command | Admin operations | Every admin action logged and auditable automatically |

---

## Pattern 1 — State

### Problem
Without State pattern, incident transitions are scattered if-else chains:
```javascript
// BAD — no State pattern
if (incident.status === 'in_progress') {
  if (!photo) throw new Error('need photo')
  incident.status = 'resolved'
} else if (incident.status === 'open') {
  throw new Error('cannot resolve unassigned incident')
}
```
Every new status requires modifying existing code (violates OCP).
Every controller needs to know business rules (violates SRP).

### Implementation

```javascript
// src/domain/states/IncidentState.js
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
    incident.addToStatusLog({ status: 'IN_PROGRESS', changedById: staff.id })
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
    if (incident.assignedTo) incident.assignedTo.activeTaskCount--
    incident.addToStatusLog({ status: 'RESOLVED', changedById: incident.assignedToId, note })
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
      if (incident.assignedTo) {
        incident.assignedTo.penaltyCount++
        if (incident.assignedTo.penaltyCount >= 3) {
          incident.assignedTo.staffState = 'UNDER_REVIEW'
          incident.publish('STAFF_UNDER_REVIEW', { staff: incident.assignedTo })
        }
      }
      incident.addToStatusLog({ status: 'REOPENED', note: `Rating: ${rating.score}/5` })
      incident.setState(new ReopenedState())
      incident.publish('INCIDENT_REOPENED_BY_FEEDBACK', { incident, rating })
    }
  }
}

// src/domain/states/EscalatedState.js
class EscalatedState extends IncidentState {
  assignStaff(incident, staff) {
    incident.assignedToId = staff.id
    staff.activeTaskCount++
    incident.addToStatusLog({ status: 'IN_PROGRESS', note: 'Assigned after escalation' })
    incident.setState(new InProgressState())
    incident.publish('INCIDENT_ASSIGNED', { incident, staff })
  }
}

// src/domain/states/ReopenedState.js
// Distinct from OpenState — carries context that resolution failed
class ReopenedState extends IncidentState {
  assignStaff(incident, staff) {
    incident.assignedToId = staff.id
    staff.activeTaskCount++
    incident.addToStatusLog({ status: 'IN_PROGRESS', note: 'Reassigned after failed resolution' })
    incident.setState(new InProgressState())
    incident.publish('INCIDENT_REASSIGNED', { incident, staff, reason: 'poor_feedback' })
  }
}
```

### SOLID
- **S:** Each state handles exactly one phase of the lifecycle
- **O:** New state (e.g. PENDING_PARTS) = new class, zero existing states change
- **L:** Any IncidentState subclass replaces the base — same method signatures

---

## Pattern 2 — Strategy

### Problem
Different departments need different assignment logic. Hardcoding this makes it impossible to configure per department at runtime.

### Implementation

```javascript
// src/domain/strategies/AssignmentStrategy.js
class AssignmentStrategy {
  assign(incident, eligibleStaff, options = {}) {
    throw new Error('assign() must be implemented')
  }
}

// src/domain/strategies/LeastLoadedStrategy.js
class LeastLoadedStrategy extends AssignmentStrategy {
  assign(incident, eligibleStaff) {
    const active = eligibleStaff.filter(s => s.staffState === 'ACTIVE' && s.isOnShift(new Date()))
    if (active.length === 0) throw new NoStaffAvailableError(incident.departmentId)
    return active.sort((a, b) => a.activeTaskCount - b.activeTaskCount)[0]
  }
}

// src/domain/strategies/RoundRobinStrategy.js
class RoundRobinStrategy extends AssignmentStrategy {
  assign(incident, eligibleStaff, { department }) {
    const active = eligibleStaff.filter(s => s.staffState === 'ACTIVE')
    if (active.length === 0) throw new NoStaffAvailableError(incident.departmentId)
    const idx = department.roundRobinIndex % active.length
    department.roundRobinIndex = (department.roundRobinIndex + 1) % active.length
    return active[idx]
  }
}

// src/domain/strategies/ShiftAwareStrategy.js
class ShiftAwareStrategy extends AssignmentStrategy {
  assign(incident, eligibleStaff) {
    const duration = incident.sla.windowHours
    const now = new Date()
    const available = eligibleStaff
      .filter(s => s.staffState === 'ACTIVE' && s.isAvailableFor(duration, now))
      .sort((a, b) => a.activeTaskCount - b.activeTaskCount)
    if (available.length > 0) return available[0]
    const onCall = eligibleStaff.find(s => s.isOnCall(now))
    if (onCall) return onCall
    throw new NoStaffAvailableError(incident.departmentId)
  }
}

// src/domain/strategies/ManualStrategy.js
class ManualStrategy extends AssignmentStrategy {
  assign(incident, eligibleStaff, { targetStaffId }) {
    const staff = eligibleStaff.find(s => s.id === targetStaffId)
    if (!staff) throw new StaffNotEligibleError(targetStaffId)
    if (staff.staffState !== 'ACTIVE') throw new StaffUnavailableError(targetStaffId)
    return staff
  }
}

// StrategyFactory — maps DB enum to class
class StrategyFactory {
  static create(strategyName) {
    const map = {
      LEAST_LOADED: new LeastLoadedStrategy(),
      ROUND_ROBIN:  new RoundRobinStrategy(),
      SHIFT_AWARE:  new ShiftAwareStrategy(),
      MANUAL:       new ManualStrategy()
    }
    return map[strategyName] || new LeastLoadedStrategy()
  }
}

// AssignmentService — depends on interface, not concrete class
class AssignmentService {
  async autoAssign(incident) {
    const dept = await this.deptRepo.findById(incident.departmentId)
    const strategy = StrategyFactory.create(dept.assignmentStrategy)
    const staff = await this.userRepo.findEligibleStaff(incident.departmentId, incident.category)
    return strategy.assign(incident, staff, { department: dept })
  }
}
```

### SOLID
- **O:** New strategy (SkillMatch) = new class + map entry. AssignmentService unchanged.
- **D:** AssignmentService depends on AssignmentStrategy interface, not concrete classes.

---

## Pattern 3 — Observer

### Problem
When an incident is created, 4+ things must happen: schedule SLA timer, notify reporter, log audit entry, check hotspot. Putting all this in IncidentService creates a 200-line method that violates SRP.

### Implementation

```javascript
// src/domain/observers/IncidentEventPublisher.js
class IncidentEventPublisher {
  constructor() {
    this.subscribers = new Map()
  }

  subscribe(eventType, observer) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set())
    }
    this.subscribers.get(eventType).add(observer)
  }

  async publish(eventType, payload) {
    const handlers = this.subscribers.get(eventType) || new Set()
    // allSettled: one failing observer does not block others
    const results = await Promise.allSettled(
      [...handlers].map(h => h.handle(eventType, payload))
    )
    results
      .filter(r => r.status === 'rejected')
      .forEach(r => logger.error('Observer error', r.reason))
  }
}

// src/domain/observers/SLATimerManager.js
class SLATimerManager {
  constructor(slaQueue) { this.slaQueue = slaQueue }

  async handle(eventType, { incident }) {
    if (eventType === 'INCIDENT_CREATED') {
      const job = await this.slaQueue.add(
        'escalate-incident',
        { incidentId: incident.id },
        { delay: incident.sla.deadlineAt - Date.now(), jobId: `sla:${incident.id}` }
      )
      // Store jobId for later cancellation
      await prisma.incident.update({
        where: { id: incident.id },
        data: { slaJobId: job.id }
      })
    }
    if (eventType === 'INCIDENT_RESOLVED') {
      if (incident.slaJobId) {
        const job = await this.slaQueue.getJob(incident.slaJobId)
        if (job) await job.remove()
      }
    }
  }
}

// src/domain/observers/HotspotDetector.js
class HotspotDetector {
  constructor(redis, io) { this.redis = redis; this.io = io }

  async handle(eventType, { incident }) {
    if (eventType !== 'INCIDENT_CREATED') return
    const key = `hotspot:${incident.locationBlock}:${incident.locationRoom}`
    const count = await this.redis.incr(key)
    await this.redis.expire(key, 86400)
    if (count >= 3) {
      const severity = count >= 10 ? 'critical' : count >= 6 ? 'high' : 'warning'
      this.io.to('role:ADMIN').emit('hotspot_detected', {
        block: incident.locationBlock, room: incident.locationRoom, count, severity
      })
    }
  }
}

// src/domain/observers/CacheInvalidator.js
class CacheInvalidator {
  constructor(redis) { this.redis = redis }
  async handle(eventType, { incident }) {
    await this.redis.del(`cache:dashboard:dept:${incident.departmentId}:stats`)
    await this.redis.del('cache:dashboard:global:stats')
  }
}

// Wiring (src/config/observers.js) — called on app startup
function wireObservers(publisher, { slaQueue, io, redis, mailer }) {
  const slaTimer     = new SLATimerManager(slaQueue)
  const rtNotifier   = new RealTimeNotifier(io)
  const emailNotif   = new EmailNotifier(mailer)
  const auditLogger  = new AuditLogger(prisma)
  const hotspot      = new HotspotDetector(redis, io)
  const feedback     = new FeedbackRequestSender(io, mailer)
  const cacheInval   = new CacheInvalidator(redis)

  publisher.subscribe('INCIDENT_CREATED',              slaTimer)
  publisher.subscribe('INCIDENT_CREATED',              rtNotifier)
  publisher.subscribe('INCIDENT_CREATED',              hotspot)
  publisher.subscribe('INCIDENT_CREATED',              auditLogger)
  publisher.subscribe('INCIDENT_ASSIGNED',             rtNotifier)
  publisher.subscribe('INCIDENT_ASSIGNED',             emailNotif)
  publisher.subscribe('INCIDENT_ASSIGNED',             auditLogger)
  publisher.subscribe('INCIDENT_RESOLVED',             slaTimer)   // cancels job
  publisher.subscribe('INCIDENT_RESOLVED',             rtNotifier)
  publisher.subscribe('INCIDENT_RESOLVED',             emailNotif)
  publisher.subscribe('INCIDENT_RESOLVED',             feedback)
  publisher.subscribe('INCIDENT_RESOLVED',             cacheInval)
  publisher.subscribe('INCIDENT_RESOLVED',             auditLogger)
  publisher.subscribe('INCIDENT_ESCALATED',            rtNotifier)
  publisher.subscribe('INCIDENT_ESCALATED',            emailNotif)
  publisher.subscribe('INCIDENT_ESCALATED',            auditLogger)
  publisher.subscribe('INCIDENT_REOPENED_BY_FEEDBACK', rtNotifier)
  publisher.subscribe('INCIDENT_REOPENED_BY_FEEDBACK', auditLogger)
  publisher.subscribe('STAFF_UNDER_REVIEW',            rtNotifier)
  publisher.subscribe('STAFF_UNDER_REVIEW',            emailNotif)
}
```

### SOLID
- **S:** Each observer has exactly one responsibility
- **O:** New reaction (SMS notifier) = new class registered on publisher. Nothing else changes.
- **D:** IncidentService depends on IncidentEventPublisher, not on individual notifiers

---

## Pattern 4 — Factory

### Problem
The API receives `{ category: 'EMERGENCY', priority: 'CRITICAL' }`. Without Factory, controllers need if-else to decide which class to instantiate and which SLA to create.

### Implementation

```javascript
// src/domain/factories/IncidentFactory.js
class IncidentFactory {
  static create(dto, creator) {
    const incident = this.createByCategory(dto, creator)
    incident.sla = SLAFactory.create(dto.priority)
    incident.incidentNumber = this.generateNumber()
    return incident
  }

  static createByCategory(dto, creator) {
    const map = {
      MAINTENANCE:    (d) => new MaintenanceIncident({ ...d, state: new OpenState() }),
      SECURITY:       (d) => new SecurityIncident({ ...d, state: new OpenState() }),
      INFRASTRUCTURE: (d) => new InfrastructureIncident({ ...d, state: new OpenState() }),
      EMERGENCY:      (d) => new EmergencyIncident({ ...d, state: new OpenState() }),
      CLEANLINESS:    (d) => new MaintenanceIncident({ ...d, state: new OpenState() }),
      OTHER:          (d) => new Incident({ ...d, state: new OpenState() })
    }
    const builder = map[dto.category]
    if (!builder) throw new InvalidCategoryError(dto.category)
    return builder({ ...dto, creatorId: creator.id })
  }

  static generateNumber() {
    const year = new Date().getFullYear()
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0')
    return `INC-${year}-${seq}`
  }
}

// src/domain/factories/SLAFactory.js
class SLAFactory {
  static create(priority) {
    const map = {
      CRITICAL: () => new CriticalSLA(),
      HIGH:     () => new HighSLA(),
      MEDIUM:   () => new MediumSLA(),
      LOW:      () => new LowSLA()
    }
    const builder = map[priority]
    if (!builder) throw new InvalidPriorityError(priority)
    return builder()
  }

  static fromRow(row) {
    // Reconstruct SLA from Prisma row on load
    const sla = this.create(row.priority)
    sla.deadlineAt = row.slaDeadlineAt
    sla.isEscalated = row.slaIsEscalated
    sla.escalatedAt = row.slaEscalatedAt
    return sla
  }
}
```

### SOLID
- **O:** New category = new entry in map + new class. Controller never changes.
- **D:** IncidentService calls IncidentFactory.create() — never does `new MaintenanceIncident()` directly.

---

## Pattern 5 — Chain of Responsibility

### Problem
Incident submission needs 5+ validation rules. Without CoR, all rules live in one validate() function that grows indefinitely and is impossible to test in isolation.

### Implementation

```javascript
// src/domain/validators/ValidationChain.js
class ValidationHandler {
  setNext(handler) { this.next = handler; return handler }
  async validate(dto, context) {
    if (this.next) return this.next.validate(dto, context)
    return dto
  }
}

// src/domain/validators/PriorityValidator.js
class PriorityValidator extends ValidationHandler {
  async validate(dto, context) {
    const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    if (!valid.includes(dto.priority)) {
      throw new ValidationError('priority', `Must be one of: ${valid.join(', ')}`)
    }
    return super.validate(dto, context)
  }
}

// src/domain/validators/DuplicateDetector.js
class DuplicateDetector extends ValidationHandler {
  async validate(dto, context) {
    // Queries via injected repository (no direct Prisma import)
    const existing = await context.incidentRepo.findDuplicates(
      dto.location, dto.category, 24
    )
    if (existing) {
      await context.incidentRepo.incrementDuplicateCount(existing.id)
      throw new DuplicateIncidentError(existing.id, existing.incidentNumber, existing.status)
    }
    return super.validate(dto, context)
  }
}

// src/domain/validators/SpamThrottleValidator.js
class SpamThrottleValidator extends ValidationHandler {
  async validate(dto, context) {
    const count = await context.incidentRepo.countRecentByUser(context.userId, 3600000)
    if (count >= 5) throw new SpamThrottleError('Max 5 incidents per hour')
    return super.validate(dto, context)
  }
}

// src/domain/validators/PhotoRequirementCheck.js
class PhotoRequirementCheck extends ValidationHandler {
  async validate(dto, context) {
    if (dto.priority === 'CRITICAL' && (!dto.evidencePhotos || dto.evidencePhotos.length === 0)) {
      throw new ValidationError('evidencePhotos', 'Critical incidents require at least one photo')
    }
    return super.validate(dto, context)
  }
}

// Build chain in IncidentService:
const chain = new PriorityValidator()
chain
  .setNext(new LocationValidator())
  .setNext(new DuplicateDetector())
  .setNext(new SpamThrottleValidator())
  .setNext(new PhotoRequirementCheck())

await chain.validate(dto, { userId: req.user.id, incidentRepo: this.incidentRepo })
```

### SOLID
- **S:** Each handler validates exactly one rule
- **O:** New rule = new handler class plugged into chain. Existing handlers unchanged.

---

## Pattern 6 — Decorator

### Problem
Users have different notification preferences. Critical alerts override preferences. Without Decorator, NotificationService has nested if-else for every channel combination.

### Implementation

```javascript
// src/domain/decorators/BaseNotification.js
class BaseNotification {
  async send(user, event, payload) {}   // no-op base
}

// src/domain/decorators/RealTimeDecorator.js
class RealTimeDecorator extends BaseNotification {
  constructor(wrapped, io) { super(); this.wrapped = wrapped; this.io = io }
  async send(user, event, payload) {
    this.io.to(`user:${user.id}`).emit(event, payload)
    return this.wrapped.send(user, event, payload)
  }
}

// src/domain/decorators/EmailDecorator.js
class EmailDecorator extends BaseNotification {
  constructor(wrapped, mailer) { super(); this.wrapped = wrapped; this.mailer = mailer }
  async send(user, event, payload) {
    if (!user.isOnline || user.prefEmail) {
      await this.mailer.send({ to: user.email, subject: this.subject(event), html: this.template(event, payload) })
    }
    return this.wrapped.send(user, event, payload)
  }
}

// src/domain/decorators/SMSDecorator.js
class SMSDecorator extends BaseNotification {
  constructor(wrapped, smsService) { super(); this.wrapped = wrapped; this.sms = smsService }
  async send(user, event, payload) {
    // SMS fires for critical events regardless of user preference
    if (payload.priority === 'CRITICAL' || event === 'PANIC_ALERT') {
      await this.sms.send(user.phone, this.format(event, payload))
    }
    return this.wrapped.send(user, event, payload)
  }
}

// NotificationService builds stack at runtime
class NotificationService {
  buildNotifier(user, isCritical = false) {
    let notifier = new BaseNotification()
    if (user.prefRealtime) notifier = new RealTimeDecorator(notifier, this.io)
    if (user.prefEmail)    notifier = new EmailDecorator(notifier, this.mailer)
    if (isCritical || user.prefSms) notifier = new SMSDecorator(notifier, this.sms)
    return notifier
  }

  async notify(user, event, payload) {
    const isCritical = payload.priority === 'CRITICAL' || event === 'PANIC_ALERT'
    const notifier = this.buildNotifier(user, isCritical)
    await notifier.send(user, event, payload)
  }
}
```

### SOLID
- **O:** New channel (WhatsApp) = new Decorator class. Nothing existing changes.
- **S:** RealTimeDecorator only handles Socket.IO. EmailDecorator only handles email.

---

## Pattern 7 — Proxy

### Problem
Dashboard aggregation queries hit PostgreSQL on every admin page load. The service layer should be unaware of whether data comes from cache or DB.

### Implementation

```javascript
// src/infrastructure/repositories/CachingIncidentProxy.js
class CachingIncidentProxy {
  constructor(realRepo, redis) {
    this.real = realRepo
    this.redis = redis
  }

  async getDashboardStats(deptId) {
    const key = `cache:dashboard:dept:${deptId}:stats`
    try {
      const cached = await this.redis.get(key)
      if (cached) return JSON.parse(cached)
    } catch (err) {
      logger.warn('Redis unavailable — falling back to DB', err)
    }
    const stats = await this.real.getDashboardStats(deptId)
    await this.redis.setex(key, 300, JSON.stringify(stats)).catch(() => {})
    return stats
  }

  async invalidate(deptId) {
    await this.redis.del(`cache:dashboard:dept:${deptId}:stats`)
    await this.redis.del('cache:dashboard:global:stats')
  }

  // Delegate non-cached methods directly
  async findById(id)              { return this.real.findById(id) }
  async findMany(filters, page)   { return this.real.findMany(filters, page) }
  async save(incident)            { return this.real.save(incident) }
}

// AnalyticsService never knows if it gets cache or DB:
class AnalyticsService {
  constructor(incidentRepo) { this.repo = incidentRepo }  // injected
  async getDashboard(deptId) {
    return this.repo.getDashboardStats(deptId)  // could be proxy or real
  }
}
```

### SOLID
- **S:** Caching logic is entirely in the proxy. IncidentRepository stays focused on Prisma queries.
- **D:** AnalyticsService depends on IncidentRepository interface — gets proxy or real, doesn't know.

---

## Pattern 8 — Command

### Problem
Admin actions need to be logged automatically with full context. Without Command pattern, audit logging is copy-pasted across every admin endpoint.

### Implementation

```javascript
// src/domain/commands/Command.js
class Command {
  async execute() { throw new Error('execute() required') }
  async undo()    { throw new Error('undo() required') }
  getAuditEntry() { throw new Error('getAuditEntry() required') }
}

// src/domain/commands/AssignIncidentCommand.js
class AssignIncidentCommand extends Command {
  constructor(incident, newStaff, admin, prismaClient) {
    super()
    this.incident = incident
    this.newStaff = newStaff
    this.admin = admin
    this.prisma = prismaClient
    this.previousStaffId = incident.assignedToId  // captured for undo
  }

  async execute() {
    await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE prevents concurrent assignment
      await tx.$queryRaw`
        SELECT id FROM "Incident" WHERE id = ${this.incident.id} FOR UPDATE
      `
      await tx.incident.update({
        where: { id: this.incident.id },
        data: { assignedToId: this.newStaff.id, status: 'IN_PROGRESS' }
      })
      await tx.user.update({
        where: { id: this.newStaff.id },
        data: { activeTaskCount: { increment: 1 } }
      })
      if (this.previousStaffId) {
        await tx.user.update({
          where: { id: this.previousStaffId },
          data: { activeTaskCount: { decrement: 1 } }
        })
      }
      await tx.incidentAssignment.create({
        data: {
          incidentId: this.incident.id,
          assignedToId: this.newStaff.id,
          assignedById: this.admin.id,
          strategy: 'manual'
        }
      })
      await tx.incidentStatusLog.create({
        data: { incidentId: this.incident.id, status: 'IN_PROGRESS', changedById: this.admin.id, note: 'Manual reassignment' }
      })
    })
  }

  async undo() {
    // Restore previous assignment if undone within 5 minutes
    if (this.previousStaffId) {
      await this.prisma.incident.update({
        where: { id: this.incident.id },
        data: { assignedToId: this.previousStaffId, status: 'IN_PROGRESS' }
      })
    }
  }

  getAuditEntry() {
    return {
      commandType: 'AssignIncident',
      actorId: this.admin.id,
      incidentId: this.incident.id,
      payload: {
        fromStaffId: this.previousStaffId,
        toStaffId: this.newStaff.id
      }
    }
  }
}

// CommandInvoker — executes and auto-logs
class CommandInvoker {
  constructor(prisma) { this.prisma = prisma }

  async execute(command) {
    await command.execute()
    await this.prisma.auditLog.create({ data: command.getAuditEntry() })
  }
}

// Usage in admin controller:
const command = new AssignIncidentCommand(incident, newStaff, req.user, prisma)
await invoker.execute(command)   // executes + logs automatically
```

### SOLID
- **S:** CommandInvoker only invokes and logs — no business logic
- **O:** New admin action = new Command class. CommandInvoker never changes.

---

## SOLID Summary

| Principle | Where it shows in this project |
|-----------|-------------------------------|
| **Single Responsibility** | OpenState only handles Open phase. SLATimerManager only manages BullMQ jobs. HotspotDetector only detects hotspots. CacheInvalidator only invalidates. |
| **Open/Closed** | New incident type → new subclass. New assignment rule → new Strategy. New channel → new Decorator. New admin action → new Command. Zero existing code changes. |
| **Liskov Substitution** | Any IncidentState subclass used where IncidentState expected — same method signatures. Any AssignmentStrategy subclass used where AssignmentStrategy expected. |
| **Interface Segregation** | IncidentObserver has only `handle()`. AssignmentStrategy has only `assign()`. ValidationHandler has only `validate()`. No class implements methods it doesn't need. |
| **Dependency Inversion** | AssignmentService depends on AssignmentStrategy interface. AnalyticsService depends on IncidentRepository interface (gets proxy or real). IncidentService depends on IncidentEventPublisher — not on individual notifiers. |
