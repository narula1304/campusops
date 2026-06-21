// src/domain/commands/AssignIncidentCommand.js
//
// Command pattern (DESIGN_PATTERNS.md Pattern 8) — manual admin reassignment.
//
// THIS IS NOT AUTO-ASSIGNMENT. The Strategy classes (LeastLoadedStrategy,
// RoundRobinStrategy, etc.) are for automated assignment logic. This command
// is a MANUAL OVERRIDE by an admin, bypassing strategy selection entirely.
// It operates directly on the incident + staff domain objects.
//
// WHAT THIS COMMAND DOES:
//   execute() — reassigns the incident to newStaff, adjusts activeTaskCount on
//               both staff members, appends a status log entry, and persists via
//               the injected incidentRepo.
//   undo()    — restores the previous assignment, reverses the activeTaskCount
//               changes, appends a status log entry noting the undo, and persists.
//
// WHAT THIS COMMAND DELIBERATELY DOES NOT DO:
//   It does NOT call incident.publish() — event publishing (notifying observers,
//   triggering Socket.IO broadcasts, etc.) is a service-layer concern. The service
//   that invokes this command is responsible for publishing events after the command
//   executes successfully. Keeping event publishing out of the command keeps it
//   purely responsible for state mutation + persistence (SRP).
//
// NOTE ON PRISMA:
//   incidentRepo is injected (IncidentRepository or CachingIncidentProxy). This
//   command never imports Prisma directly — persistence is delegated to the repo.
//   This is the correct domain-layer pattern; the deliberate Prisma exception
//   documented in DESIGN_PATTERNS.md Pattern 8 applies only to BroadcastAlertCommand
//   and CommandInvoker (where no repository exists yet or audit logging is required).

const { Command } = require('./Command')

class AssignIncidentCommand extends Command {
  /**
   * @param {import('../entities/Incident').Incident}    incident     - The aggregate root being reassigned
   * @param {import('../entities/User').MaintenanceStaff} newStaff    - The staff member to assign
   * @param {import('../entities/User').Admin}            admin        - The admin performing the action
   * @param {object}                                      incidentRepo - IncidentRepository or CachingIncidentProxy
   */
  constructor(incident, newStaff, admin, incidentRepo) {
    super()
    this.incident = incident
    this.newStaff = newStaff
    this.admin = admin
    this.incidentRepo = incidentRepo

    // Capture BEFORE any mutation — needed to reverse the change on undo()
    this.previousStaffId = incident.assignedToId          // may be null if unassigned
    this.previousStaff = incident.assignedTo ?? null    // object reference, if hydrated
  }

  /**
   * Apply the manual reassignment:
   *   1. Update incident's assignment fields on the domain object
   *   2. Adjust activeTaskCount on both the new and previous staff
   *   3. Append a MANUAL_REASSIGN status log entry
   *   4. Persist via incidentRepo.save()
   *
   * Event publishing intentionally omitted — that is the invoking service's job.
   */
  async execute() {
    const { incident, newStaff, previousStaff, admin } = this

    // ── 1. Reassign on the domain object ────────────────────────────────────
    incident.assignedToId = newStaff.id
    incident.assignedTo = newStaff

    // ── 2. Adjust task load counters ─────────────────────────────────────────
    newStaff.activeTaskCount++
    if (previousStaff) {
      previousStaff.activeTaskCount--
    }

    // ── 3. Append status log entry ───────────────────────────────────────────
    incident.addToStatusLog({
      status: 'IN_PROGRESS',
      changedById: admin.id,
      note: `MANUAL_REASSIGN: admin ${admin.id} reassigned to staff ${newStaff.id}`
    })

    // ── 4. Persist ───────────────────────────────────────────────────────────
    // NOTE: incident.publish() is NOT called here. Event publishing (real-time
    // notifications, observer chain) is the responsibility of the service layer
    // that invokes this command via CommandInvoker. This command only handles
    // state mutation + persistence, keeping it Single-Responsibility.
    await this.incidentRepo.save(incident)
  }

  /**
   * Reverse the assignment:
   *   1. Restore incident assignment fields to captured pre-execute values
   *   2. Reverse the activeTaskCount adjustments (newStaff--, previousStaff++)
   *   3. Append an ASSIGNMENT_UNDONE status log entry
   *   4. Persist via incidentRepo.save()
   */
  async undo() {
    const { incident, newStaff, previousStaff, previousStaffId, admin } = this

    // ── 1. Restore assignment ────────────────────────────────────────────────
    incident.assignedToId = previousStaffId
    incident.assignedTo = previousStaff   // may be null if originally unassigned

    // ── 2. Reverse task load counters ────────────────────────────────────────
    newStaff.activeTaskCount--
    if (previousStaff) {
      previousStaff.activeTaskCount++
    }

    // ── 3. Append status log entry ───────────────────────────────────────────
    incident.addToStatusLog({
      status: 'IN_PROGRESS',
      changedById: admin.id,
      note: `ASSIGNMENT_UNDONE: reverted to staff ${previousStaffId ?? 'none'}`
    })

    // ── 4. Persist ───────────────────────────────────────────────────────────
    await this.incidentRepo.save(incident)
  }

  /**
   * Return a plain object matching the AuditLog Prisma model shape.
   * CommandInvoker calls this after execute() and after undo().
   *
   * @returns {{ commandType: string, actorId: string, incidentId: string, payload: object }}
   */
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

module.exports = { AssignIncidentCommand }
