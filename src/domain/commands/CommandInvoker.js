// src/domain/commands/CommandInvoker.js
//
// Command pattern (DESIGN_PATTERNS.md Pattern 8) — executes commands and
// automatically writes an AuditLog row for every admin action.
//
// SOLID:
//   S — CommandInvoker only invokes commands and logs; zero business logic.
//   O — New admin actions = new Command subclass. CommandInvoker never changes.
//
// DELIBERATE PRISMA EXCEPTION:
//   CommandInvoker receives prisma directly for audit logging because AuditLog
//   is a cross-cutting concern shared by all commands, and there is no
//   AuditLogRepository yet. This is the same deliberate exception noted for
//   BroadcastAlertCommand in DESIGN_PATTERNS.md Pattern 8.
//
// USAGE:
//   const invoker = new CommandInvoker(prisma)
//
//   // Execute and auto-log:
//   const cmd = new AssignIncidentCommand(incident, newStaff, admin, incidentRepo)
//   await invoker.execute(cmd)
//
//   // Undo and auto-log (commandType prefixed 'UNDO_'):
//   await invoker.undo(cmd)

class CommandInvoker {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   */
  constructor(prisma) {
    this.prisma = prisma
  }

  /**
   * Execute the command, then write an AuditLog row automatically.
   *
   * Every admin action executed through the invoker is logged — no command
   * class needs to remember to call prisma.auditLog.create() itself.
   *
   * @param {import('./Command').Command} command
   * @returns {Promise<void>}
   */
  async execute(command) {
    await command.execute()
    await this.prisma.auditLog.create({
      data: command.getAuditEntry()
    })
  }

  /**
   * Undo the command, then write an AuditLog row for the undo action.
   *
   * The audit entry reuses getAuditEntry()'s payload shape but prefixes
   * commandType with 'UNDO_' so the log is self-describing:
   *   e.g. 'UNDO_AssignIncident', 'UNDO_BroadcastAlert'
   *
   * @param {import('./Command').Command} command
   * @returns {Promise<void>}
   */
  async undo(command) {
    await command.undo()
    const entry = command.getAuditEntry()
    await this.prisma.auditLog.create({
      data: {
        ...entry,
        commandType: `UNDO_${entry.commandType}`
      }
    })
  }
}

module.exports = { CommandInvoker }
