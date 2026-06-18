// src/domain/entities/SLAPolicy.js
//
// SLA policy hierarchy — pure domain, zero framework imports.
// See DOMAIN_MODEL.md Section 4.

const { InvalidPriorityError } = require('../errors')

const Priority = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
})

class SLAPolicy {
  constructor({
    priority,
    windowHours,
    deadlineAt = null,
    isEscalated = false,
    escalatedAt = null
  } = {}) {
    if (new.target === SLAPolicy) {
      throw new TypeError('SLAPolicy is abstract and cannot be instantiated directly')
    }

    this.priority = priority
    this.windowHours = windowHours
    this.deadlineAt = deadlineAt
    this.isEscalated = isEscalated
    this.escalatedAt = escalatedAt
  }

  getDeadline(createdAt) {
    return new Date(createdAt.getTime() + this.windowHours * 60 * 60 * 1000)
  }

  // Computes the deadline from createdAt AND stores it on this.deadlineAt.
  // Without this, getDeadline() alone leaves deadlineAt as null forever —
  // isBreached() and getRemainingMs() would silently misbehave.
  // Returns `this` so it can be chained: new CriticalSLA().attachTo(new Date())
  attachTo(createdAt) {
    this.deadlineAt = this.getDeadline(createdAt)
    return this
  }

  isBreached(now) {
    if (!this.deadlineAt) return false
    return now >= this.deadlineAt
  }

  getRemainingMs(now) {
    if (!this.deadlineAt) {
      return this.windowHours * 60 * 60 * 1000
    }
    return Math.max(0, this.deadlineAt.getTime() - now.getTime())
  }

  getEscalationTarget() {
    throw new Error('getEscalationTarget() must be implemented by subclass')
  }
}

class CriticalSLA extends SLAPolicy {
  constructor(options = {}) {
    super({ priority: Priority.CRITICAL, windowHours: 2, ...options })
  }

  getEscalationTarget() {
    return 'DEAN'
  }
}

class HighSLA extends SLAPolicy {
  constructor(options = {}) {
    super({ priority: Priority.HIGH, windowHours: 4, ...options })
  }

  getEscalationTarget() {
    return 'HOD'
  }
}

class MediumSLA extends SLAPolicy {
  constructor(options = {}) {
    super({ priority: Priority.MEDIUM, windowHours: 8, ...options })
  }

  getEscalationTarget() {
    return 'HOD'
  }
}

class LowSLA extends SLAPolicy {
  constructor(options = {}) {
    super({ priority: Priority.LOW, windowHours: 24, ...options })
  }

  getEscalationTarget() {
    return 'HOD'
  }
}

// Maps a Priority string to its concrete SLAPolicy subclass.
// Kept outside SLAFactory so both create() and fromRow() can reuse it
// without duplicating the if/else chain.
const PRIORITY_CLASS_MAP = {
  CRITICAL: CriticalSLA,
  HIGH: HighSLA,
  MEDIUM: MediumSLA,
  LOW: LowSLA
}

class SLAFactory {
  // create(priority, createdAt?)
  //   - priority is required: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  //   - createdAt is optional. If provided, the deadline is computed and
  //     attached immediately. If omitted, the caller can attach it later
  //     via sla.attachTo(someDate).
  static create(priority, createdAt = null) {
    const SLAClass = PRIORITY_CLASS_MAP[priority]
    if (!SLAClass) throw new InvalidPriorityError(priority)

    const sla = new SLAClass()
    if (createdAt) {
      sla.attachTo(createdAt)
    }
    return sla
  }

  // fromRow(row) — reconstructs an SLAPolicy instance from a Prisma Incident row.
  // Used by IncidentRepository.toEntity() when hydrating an Incident loaded
  // from PostgreSQL back into its domain object (SYSTEM_DESIGN.md Section 5).
  //
  // Expects row to have: priority, slaDeadlineAt, slaIsEscalated, slaEscalatedAt
  // (the flattened SLA fields stored directly on the Incident table —
  // see DATABASE_DESIGN.md, Incident model).
  static fromRow(row) {
    const SLAClass = PRIORITY_CLASS_MAP[row.priority]
    if (!SLAClass) throw new InvalidPriorityError(row.priority)

    return new SLAClass({
      deadlineAt: row.slaDeadlineAt ?? null,
      isEscalated: row.slaIsEscalated ?? false,
      escalatedAt: row.slaEscalatedAt ?? null
    })
  }
}

module.exports = {
  SLAPolicy,
  CriticalSLA,
  HighSLA,
  MediumSLA,
  LowSLA,
  SLAFactory,
  Priority
}
