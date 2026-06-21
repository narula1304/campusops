// src/domain/commands/BroadcastAlertCommand.js
//
// Command pattern (DESIGN_PATTERNS.md Pattern 8) — admin campus-wide alert broadcast.
//
// DELIBERATE PRISMA EXCEPTION:
//   Unlike AssignIncidentCommand (which uses an injected repository), this command
//   imports Prisma directly because there is no AlertRepository yet. This is an
//   explicitly noted exception in DESIGN_PATTERNS.md Pattern 8 — acceptable when
//   no repository abstraction exists for the aggregate. AlertRepository can be added
//   later without changing any other code (OCP).
//
// WHAT THIS COMMAND DOES:
//   execute() — persists the alert to the Alert table via prisma.alert.create(),
//               determines the target Socket.IO room from alertData.scopeTarget,
//               and emits 'campus_alert' to that room.
//   undo()    — alerts cannot be unbroadcast (recipients already saw it). Instead,
//               the row is retracted (isRetracted=true, retractedAt=now) and
//               'alert_retracted' is emitted to the same room.
//
// alertData shape:
//   { title, message, type, severity, scopeTarget, scopeDepartmentId,
//     scopeRole, deliveryChannels }
// scopeTarget values: 'CAMPUS' | 'DEPARTMENT' | 'ROLE'

const { Command } = require('./Command')

class BroadcastAlertCommand extends Command {
  /**
   * @param {{ title: string, message: string, type: string, severity: string,
   *           scopeTarget: string, scopeDepartmentId?: string, scopeRole?: string,
   *           deliveryChannels: string[] }} alertData
   * @param {import('../entities/User').Admin} admin  - Admin who is broadcasting
   * @param {import('socket.io').Server}       io     - Socket.IO server instance
   * @param {import('@prisma/client').PrismaClient} prisma - Direct Prisma access (no AlertRepository yet)
   */
  constructor(alertData, admin, io, prisma) {
    super()
    this.alertData = alertData
    this.admin = admin
    this.io = io
    this.prisma = prisma

    // Set after execute() — used by undo() and getAuditEntry()
    this.alertId = null
  }

  /**
   * Resolve the Socket.IO target room from scopeTarget.
   * 'CAMPUS'     → 'campus'               (everyone connected)
   * 'DEPARTMENT' → 'dept:{deptId}'        (members of that department)
   * 'ROLE'       → 'role:{roleString}'    (e.g. 'role:ADMIN', 'role:STUDENT')
   *
   * @private
   * @returns {string}
   */
  _resolveRoom() {
    const { scopeTarget, scopeDepartmentId, scopeRole } = this.alertData
    switch (scopeTarget) {
      case 'CAMPUS': return 'campus'
      case 'DEPARTMENT': return `dept:${scopeDepartmentId}`
      case 'ROLE': return `role:${scopeRole}`
      default: return 'campus'
    }
  }

  /**
   * Persist the alert and broadcast to the target Socket.IO room.
   */
  async execute() {
    const { alertData, admin, io, prisma } = this

    // ── 1. Persist to Alert table ────────────────────────────────────────────
    const created = await prisma.alert.create({
      data: {
        ...alertData,
        createdById: admin.id
      }
    })

    // Store for undo() and getAuditEntry()
    this.alertId = created.id

    // ── 2. Determine target room ─────────────────────────────────────────────
    const room = this._resolveRoom()

    // ── 3. Emit to the target room ───────────────────────────────────────────
    io.to(room).emit('campus_alert', {
      id: created.id,
      title: alertData.title,
      message: alertData.message,
      type: alertData.type,
      severity: alertData.severity,
      scopeTarget: alertData.scopeTarget,
      createdById: admin.id,
      createdAt: created.createdAt
    })
  }

  /**
   * Retract the alert.
   *
   * An alert cannot be un-broadcast — recipients already saw it. Instead:
   *   - Mark the Alert row as retracted in the database
   *   - Emit 'alert_retracted' to the same room so clients can dismiss it
   */
  async undo() {
    const { prisma, io } = this

    if (!this.alertId) {
      throw new Error('BroadcastAlertCommand: cannot undo — alertId not set (execute() not called?)')
    }

    // ── 1. Mark as retracted in the database ────────────────────────────────
    await prisma.alert.update({
      where: { id: this.alertId },
      data: {
        isRetracted: true,
        retractedAt: new Date()
      }
    })

    // ── 2. Notify the same room so clients can remove the alert ─────────────
    const room = this._resolveRoom()
    io.to(room).emit('alert_retracted', { alertId: this.alertId })
  }

  /**
   * Return a plain object matching the AuditLog Prisma model shape.
   * CommandInvoker calls this after execute() and after undo().
   *
   * @returns {{ commandType: string, actorId: string, incidentId: null, payload: object }}
   */
  getAuditEntry() {
    return {
      commandType: 'BroadcastAlert',
      actorId: this.admin.id,
      incidentId: null,               // alerts are not tied to a specific incident
      payload: {
        alertId: this.alertId,
        title: this.alertData.title,
        scopeTarget: this.alertData.scopeTarget
      }
    }
  }
}

module.exports = { BroadcastAlertCommand }
