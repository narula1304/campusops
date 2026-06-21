// src/domain/commands/Command.js
//
// Abstract base class for the Command pattern (DESIGN_PATTERNS.md Pattern 8).
// Zero imports from Express, Prisma, Socket.IO, or any framework.
//
// Enforces the abstract-class contract using new.target — the same pattern
// used by User.js and Incident.js in this codebase.
//
// Every concrete command MUST implement:
//   - async execute()      — apply the state mutation + persist
//   - async undo()         — reverse the mutation + persist
//   - getAuditEntry()      — return the plain-object audit record for AuditLog
//
// CommandInvoker calls getAuditEntry() AFTER execute() and AFTER undo() to
// write an AuditLog row automatically — no command class needs to do this itself.

class Command {
  constructor() {
    if (new.target === Command) {
      throw new TypeError('Command is abstract and cannot be instantiated directly')
    }
  }

  /**
   * Apply the command: mutate domain state and persist changes.
   * @returns {Promise<void>}
   */
  async execute() {
    throw new Error('execute() must be implemented')
  }

  /**
   * Reverse the command: restore prior state and persist changes.
   * @returns {Promise<void>}
   */
  async undo() {
    throw new Error('undo() must be implemented')
  }

  /**
   * Return a plain object matching the AuditLog Prisma model shape.
   * Called by CommandInvoker after execute() and after undo().
   * Must include: { commandType, actorId, incidentId, payload }
   * @returns {{ commandType: string, actorId: string, incidentId: string|null, payload: object }}
   */
  getAuditEntry() {
    throw new Error('getAuditEntry() must be implemented')
  }
}

module.exports = { Command }
