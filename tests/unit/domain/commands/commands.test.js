// tests/unit/domain/commands/commands.test.js
//
// Pure unit tests — all external dependencies (Prisma, Socket.IO, incidentRepo)
// are replaced with lightweight fakes (jest.fn()).
// No real database is touched; no server is started.
// Style mirrors tests/unit/domain/observers/observers.test.js.

const { Command } = require('../../../../src/domain/commands/Command')
const { AssignIncidentCommand } = require('../../../../src/domain/commands/AssignIncidentCommand')
const { BroadcastAlertCommand } = require('../../../../src/domain/commands/BroadcastAlertCommand')
const { CommandInvoker } = require('../../../../src/domain/commands/CommandInvoker')

// ── Fake infrastructure builders ─────────────────────────────────────────────

function makeIncidentRepo() {
    return {
        save: jest.fn().mockResolvedValue(undefined)
    }
}

function makeIo() {
    const emitFn = jest.fn()
    const toFn = jest.fn().mockReturnValue({ emit: emitFn })
    return { to: toFn, _emit: emitFn }
}

function makePrisma(overrides = {}) {
    return {
        auditLog: {
            create: jest.fn().mockResolvedValue({ id: 'audit-1' })
        },
        alert: {
            create: jest.fn().mockResolvedValue({
                id: 'alert-1',
                createdAt: new Date('2025-01-01T00:00:00Z')
            }),
            update: jest.fn().mockResolvedValue(undefined)
        },
        ...overrides
    }
}

// ── Domain object fakes ───────────────────────────────────────────────────────

function makeStaff(overrides = {}) {
    return {
        id: 'staff-new',
        activeTaskCount: 2,
        ...overrides
    }
}

function makePreviousStaff(overrides = {}) {
    return {
        id: 'staff-prev',
        activeTaskCount: 3,
        ...overrides
    }
}

function makeAdmin(overrides = {}) {
    return {
        id: 'admin-1',
        ...overrides
    }
}

function makeIncident(overrides = {}) {
    return {
        id: 'incident-1',
        assignedToId: null,
        assignedTo: null,
        statusLogEntries: [],
        addToStatusLog(entry) {
            this.statusLogEntries.push({ ...entry, changedAt: entry.changedAt ?? new Date() })
        },
        ...overrides
    }
}

function makeAlertData(overrides = {}) {
    return {
        title: 'Emergency Fire Drill',
        message: 'Evacuate building immediately',
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        scopeTarget: 'CAMPUS',
        scopeDepartmentId: null,
        scopeRole: null,
        deliveryChannels: ['REALTIME', 'EMAIL'],
        ...overrides
    }
}

// ── Command (abstract base) ───────────────────────────────────────────────────

describe('Command (abstract base)', () => {
    test('cannot be instantiated directly — throws TypeError', () => {
        expect(() => new Command()).toThrow(TypeError)
        expect(() => new Command()).toThrow('Command is abstract and cannot be instantiated directly')
    })

    test('subclass can be instantiated without error', () => {
        class ConcreteCommand extends Command {
            async execute() { }
            async undo() { }
            getAuditEntry() { return {} }
        }
        expect(() => new ConcreteCommand()).not.toThrow()
    })

    test('execute() throws if not overridden', async () => {
        class MinimalCommand extends Command { }
        const cmd = new MinimalCommand()
        await expect(cmd.execute()).rejects.toThrow('execute() must be implemented')
    })

    test('undo() throws if not overridden', async () => {
        class MinimalCommand extends Command { }
        const cmd = new MinimalCommand()
        await expect(cmd.undo()).rejects.toThrow('undo() must be implemented')
    })

    test('getAuditEntry() throws if not overridden', () => {
        class MinimalCommand extends Command { }
        const cmd = new MinimalCommand()
        expect(() => cmd.getAuditEntry()).toThrow('getAuditEntry() must be implemented')
    })
})

// ── AssignIncidentCommand ─────────────────────────────────────────────────────

describe('AssignIncidentCommand', () => {
    // ── execute() ────────────────────────────────────────────────────────────

    describe('execute()', () => {
        test('sets incident.assignedToId to newStaff.id', async () => {
            const incident = makeIncident()
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            expect(incident.assignedToId).toBe('staff-new')
        })

        test('sets incident.assignedTo to the newStaff object reference', async () => {
            const incident = makeIncident()
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            expect(incident.assignedTo).toBe(newStaff)
        })

        test('increments newStaff.activeTaskCount by 1', async () => {
            const incident = makeIncident()
            const newStaff = makeStaff({ activeTaskCount: 2 })
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            expect(newStaff.activeTaskCount).toBe(3)
        })

        test('decrements previousStaff.activeTaskCount when a prior assignment existed', async () => {
            const prevStaff = makePreviousStaff({ activeTaskCount: 3 })
            const incident = makeIncident({ assignedToId: 'staff-prev', assignedTo: prevStaff })
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            expect(prevStaff.activeTaskCount).toBe(2)
        })

        test('does NOT throw when incident was previously unassigned (no previousStaff)', async () => {
            const incident = makeIncident({ assignedToId: null, assignedTo: null })
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await expect(cmd.execute()).resolves.toBeUndefined()
        })

        test('does NOT decrement any counter when there was no previous staff', async () => {
            const incident = makeIncident({ assignedToId: null, assignedTo: null })
            const newStaff = makeStaff({ activeTaskCount: 2 })
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            // Only newStaff is touched — no phantom decrement
            expect(newStaff.activeTaskCount).toBe(3)
        })

        test('calls incidentRepo.save(incident) exactly once', async () => {
            const incident = makeIncident()
            const repo = makeIncidentRepo()
            const cmd = new AssignIncidentCommand(incident, makeStaff(), makeAdmin(), repo)

            await cmd.execute()

            expect(repo.save).toHaveBeenCalledTimes(1)
            expect(repo.save).toHaveBeenCalledWith(incident)
        })

        test('appends one entry to incident.statusLogEntries', async () => {
            const incident = makeIncident()
            const cmd = new AssignIncidentCommand(incident, makeStaff(), makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            expect(incident.statusLogEntries).toHaveLength(1)
        })

        test('status log entry includes a MANUAL_REASSIGN note', async () => {
            const incident = makeIncident()
            const cmd = new AssignIncidentCommand(incident, makeStaff(), makeAdmin(), makeIncidentRepo())

            await cmd.execute()

            const entry = incident.statusLogEntries[0]
            expect(entry.note).toMatch(/MANUAL_REASSIGN/)
        })

        test('status log entry records the admin id as changedById', async () => {
            const incident = makeIncident()
            const admin = makeAdmin({ id: 'admin-99' })
            const cmd = new AssignIncidentCommand(incident, makeStaff(), admin, makeIncidentRepo())

            await cmd.execute()

            expect(incident.statusLogEntries[0].changedById).toBe('admin-99')
        })
    })

    // ── undo() ───────────────────────────────────────────────────────────────

    describe('undo()', () => {
        test('restores incident.assignedToId to the value captured before execute()', async () => {
            const prevStaff = makePreviousStaff()
            const incident = makeIncident({ assignedToId: 'staff-prev', assignedTo: prevStaff })
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()
            await cmd.undo()

            expect(incident.assignedToId).toBe('staff-prev')
        })

        test('restores incident.assignedTo to the previous staff object reference', async () => {
            const prevStaff = makePreviousStaff()
            const incident = makeIncident({ assignedToId: 'staff-prev', assignedTo: prevStaff })
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()
            await cmd.undo()

            expect(incident.assignedTo).toBe(prevStaff)
        })

        test('restores incident.assignedToId to null when originally unassigned', async () => {
            const incident = makeIncident({ assignedToId: null, assignedTo: null })
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()
            await cmd.undo()

            expect(incident.assignedToId).toBeNull()
            expect(incident.assignedTo).toBeNull()
        })

        test('decrements newStaff.activeTaskCount (reverses the execute increment)', async () => {
            const incident = makeIncident()
            const newStaff = makeStaff({ activeTaskCount: 2 })
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()   // activeTaskCount -> 3
            await cmd.undo()      // activeTaskCount -> 2

            expect(newStaff.activeTaskCount).toBe(2)
        })

        test('increments previousStaff.activeTaskCount (reverses the execute decrement)', async () => {
            const prevStaff = makePreviousStaff({ activeTaskCount: 3 })
            const incident = makeIncident({ assignedToId: 'staff-prev', assignedTo: prevStaff })
            const newStaff = makeStaff()
            const cmd = new AssignIncidentCommand(incident, newStaff, makeAdmin(), makeIncidentRepo())

            await cmd.execute()   // prevStaff.activeTaskCount -> 2
            await cmd.undo()      // prevStaff.activeTaskCount -> 3

            expect(prevStaff.activeTaskCount).toBe(3)
        })

        test('calls incidentRepo.save(incident) again on undo', async () => {
            const incident = makeIncident()
            const repo = makeIncidentRepo()
            const cmd = new AssignIncidentCommand(incident, makeStaff(), makeAdmin(), repo)

            await cmd.execute()
            await cmd.undo()

            // execute() + undo() = 2 calls total
            expect(repo.save).toHaveBeenCalledTimes(2)
            expect(repo.save).toHaveBeenNthCalledWith(2, incident)
        })

        test('appends an ASSIGNMENT_UNDONE status log entry on undo', async () => {
            const incident = makeIncident()
            const cmd = new AssignIncidentCommand(incident, makeStaff(), makeAdmin(), makeIncidentRepo())

            await cmd.execute()
            await cmd.undo()

            // execute() added entry [0], undo() adds entry [1]
            expect(incident.statusLogEntries).toHaveLength(2)
            expect(incident.statusLogEntries[1].note).toMatch(/ASSIGNMENT_UNDONE/)
        })
    })

    // ── getAuditEntry() ──────────────────────────────────────────────────────

    describe('getAuditEntry()', () => {
        test('returns commandType AssignIncident', () => {
            const cmd = new AssignIncidentCommand(
                makeIncident(),
                makeStaff(),
                makeAdmin(),
                makeIncidentRepo()
            )
            expect(cmd.getAuditEntry().commandType).toBe('AssignIncident')
        })

        test('returns actorId equal to admin.id', () => {
            const admin = makeAdmin({ id: 'admin-42' })
            const cmd = new AssignIncidentCommand(
                makeIncident(),
                makeStaff(),
                admin,
                makeIncidentRepo()
            )
            expect(cmd.getAuditEntry().actorId).toBe('admin-42')
        })

        test('returns incidentId equal to incident.id', () => {
            const incident = makeIncident({ id: 'incident-99' })
            const cmd = new AssignIncidentCommand(
                incident,
                makeStaff(),
                makeAdmin(),
                makeIncidentRepo()
            )
            expect(cmd.getAuditEntry().incidentId).toBe('incident-99')
        })

        test('payload.fromStaffId captures the previousStaffId at construction time', () => {
            const incident = makeIncident({ assignedToId: 'staff-prev', assignedTo: makePreviousStaff() })
            const cmd = new AssignIncidentCommand(
                incident,
                makeStaff(),
                makeAdmin(),
                makeIncidentRepo()
            )
            expect(cmd.getAuditEntry().payload.fromStaffId).toBe('staff-prev')
        })

        test('payload.fromStaffId is null when incident was unassigned', () => {
            const cmd = new AssignIncidentCommand(
                makeIncident({ assignedToId: null, assignedTo: null }),
                makeStaff(),
                makeAdmin(),
                makeIncidentRepo()
            )
            expect(cmd.getAuditEntry().payload.fromStaffId).toBeNull()
        })

        test('payload.toStaffId equals newStaff.id', () => {
            const newStaff = makeStaff({ id: 'staff-new-77' })
            const cmd = new AssignIncidentCommand(
                makeIncident(),
                newStaff,
                makeAdmin(),
                makeIncidentRepo()
            )
            expect(cmd.getAuditEntry().payload.toStaffId).toBe('staff-new-77')
        })
    })
})

// ── BroadcastAlertCommand ─────────────────────────────────────────────────────

describe('BroadcastAlertCommand', () => {
    // ── execute() ────────────────────────────────────────────────────────────

    describe('execute()', () => {
        test('calls prisma.alert.create() with alertData fields and createdById', async () => {
            const alertData = makeAlertData()
            const admin = makeAdmin({ id: 'admin-1' })
            const prisma = makePrisma()
            const io = makeIo()
            const cmd = new BroadcastAlertCommand(alertData, admin, io, prisma)

            await cmd.execute()

            expect(prisma.alert.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: alertData.title,
                        message: alertData.message,
                        type: alertData.type,
                        severity: alertData.severity,
                        scopeTarget: alertData.scopeTarget,
                        createdById: 'admin-1'
                    })
                })
            )
        })

        test('stores created alert id on this.alertId for later use', async () => {
            const prisma = makePrisma()   // alert.create resolves with { id: 'alert-1' }
            const cmd = new BroadcastAlertCommand(makeAlertData(), makeAdmin(), makeIo(), prisma)

            await cmd.execute()

            expect(cmd.alertId).toBe('alert-1')
        })

        test('emits campus_alert to "campus" room when scopeTarget is CAMPUS', async () => {
            const io = makeIo()
            const cmd = new BroadcastAlertCommand(
                makeAlertData({ scopeTarget: 'CAMPUS' }),
                makeAdmin(),
                io,
                makePrisma()
            )

            await cmd.execute()

            expect(io.to).toHaveBeenCalledWith('campus')
            expect(io._emit).toHaveBeenCalledWith('campus_alert', expect.any(Object))
        })

        test('emits campus_alert to dept:{deptId} room when scopeTarget is DEPARTMENT', async () => {
            const io = makeIo()
            const cmd = new BroadcastAlertCommand(
                makeAlertData({ scopeTarget: 'DEPARTMENT', scopeDepartmentId: 'dept-cs' }),
                makeAdmin(),
                io,
                makePrisma()
            )

            await cmd.execute()

            expect(io.to).toHaveBeenCalledWith('dept:dept-cs')
            expect(io._emit).toHaveBeenCalledWith('campus_alert', expect.any(Object))
        })

        test('emits campus_alert to role:{role} room when scopeTarget is ROLE', async () => {
            const io = makeIo()
            const cmd = new BroadcastAlertCommand(
                makeAlertData({ scopeTarget: 'ROLE', scopeRole: 'STUDENT' }),
                makeAdmin(),
                io,
                makePrisma()
            )

            await cmd.execute()

            expect(io.to).toHaveBeenCalledWith('role:STUDENT')
            expect(io._emit).toHaveBeenCalledWith('campus_alert', expect.any(Object))
        })

        test('emitted campus_alert payload includes title, severity, and createdById', async () => {
            const io = makeIo()
            const admin = makeAdmin({ id: 'admin-7' })
            const alertData = makeAlertData({ title: 'Water Outage', severity: 'WARNING' })
            const cmd = new BroadcastAlertCommand(alertData, admin, io, makePrisma())

            await cmd.execute()

            expect(io._emit).toHaveBeenCalledWith(
                'campus_alert',
                expect.objectContaining({
                    title: 'Water Outage',
                    severity: 'WARNING',
                    createdById: 'admin-7'
                })
            )
        })
    })

    // ── undo() ───────────────────────────────────────────────────────────────

    describe('undo()', () => {
        test('updates the alert row with isRetracted: true', async () => {
            const prisma = makePrisma()
            const cmd = new BroadcastAlertCommand(makeAlertData(), makeAdmin(), makeIo(), prisma)

            await cmd.execute()
            await cmd.undo()

            expect(prisma.alert.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'alert-1' },
                    data: expect.objectContaining({ isRetracted: true })
                })
            )
        })

        test('sets retractedAt to a Date on undo', async () => {
            const prisma = makePrisma()
            const cmd = new BroadcastAlertCommand(makeAlertData(), makeAdmin(), makeIo(), prisma)

            await cmd.execute()
            await cmd.undo()

            const updateCall = prisma.alert.update.mock.calls[0][0]
            expect(updateCall.data.retractedAt).toBeInstanceOf(Date)
        })

        test('emits alert_retracted to the same room used in execute()', async () => {
            const io = makeIo()
            const cmd = new BroadcastAlertCommand(
                makeAlertData({ scopeTarget: 'CAMPUS' }),
                makeAdmin(),
                io,
                makePrisma()
            )

            await cmd.execute()
            await cmd.undo()

            // to() is called twice: once during execute(), once during undo()
            const rooms = io.to.mock.calls.map(c => c[0])
            expect(rooms).toContain('campus')

            expect(io._emit).toHaveBeenCalledWith(
                'alert_retracted',
                expect.objectContaining({ alertId: 'alert-1' })
            )
        })

        test('emits alert_retracted to the DEPARTMENT room when that was the original scope', async () => {
            const io = makeIo()
            const cmd = new BroadcastAlertCommand(
                makeAlertData({ scopeTarget: 'DEPARTMENT', scopeDepartmentId: 'dept-mech' }),
                makeAdmin(),
                io,
                makePrisma()
            )

            await cmd.execute()
            await cmd.undo()

            const rooms = io.to.mock.calls.map(c => c[0])
            expect(rooms).toContain('dept:dept-mech')
            expect(io._emit).toHaveBeenCalledWith('alert_retracted', expect.objectContaining({ alertId: 'alert-1' }))
        })

        test('throws when undo() is called before execute() (no alertId)', async () => {
            const cmd = new BroadcastAlertCommand(makeAlertData(), makeAdmin(), makeIo(), makePrisma())

            await expect(cmd.undo()).rejects.toThrow(/alertId not set/)
        })
    })

    // ── getAuditEntry() ──────────────────────────────────────────────────────

    describe('getAuditEntry()', () => {
        test('returns commandType BroadcastAlert', async () => {
            const prisma = makePrisma()
            const cmd = new BroadcastAlertCommand(makeAlertData(), makeAdmin(), makeIo(), prisma)

            await cmd.execute()

            expect(cmd.getAuditEntry().commandType).toBe('BroadcastAlert')
        })

        test('returns actorId equal to admin.id', async () => {
            const admin = makeAdmin({ id: 'admin-55' })
            const prisma = makePrisma()
            const cmd = new BroadcastAlertCommand(makeAlertData(), admin, makeIo(), prisma)

            await cmd.execute()

            expect(cmd.getAuditEntry().actorId).toBe('admin-55')
        })

        test('returns incidentId as null (alerts are not tied to an incident)', async () => {
            const prisma = makePrisma()
            const cmd = new BroadcastAlertCommand(makeAlertData(), makeAdmin(), makeIo(), prisma)

            await cmd.execute()

            expect(cmd.getAuditEntry().incidentId).toBeNull()
        })

        test('payload contains alertId, title, and scopeTarget', async () => {
            const prisma = makePrisma()
            const alertData = makeAlertData({ title: 'Lab Closure', scopeTarget: 'DEPARTMENT' })
            const cmd = new BroadcastAlertCommand(alertData, makeAdmin(), makeIo(), prisma)

            await cmd.execute()

            expect(cmd.getAuditEntry().payload).toEqual(
                expect.objectContaining({
                    alertId: 'alert-1',
                    title: 'Lab Closure',
                    scopeTarget: 'DEPARTMENT'
                })
            )
        })
    })
})

// ── CommandInvoker ────────────────────────────────────────────────────────────

describe('CommandInvoker', () => {
    // Helper: build a fake concrete command with controllable behavior
    function makeFakeCommand(overrides = {}) {
        return {
            execute: jest.fn().mockResolvedValue(undefined),
            undo: jest.fn().mockResolvedValue(undefined),
            getAuditEntry: jest.fn().mockReturnValue({
                commandType: 'AssignIncident',
                actorId: 'admin-1',
                incidentId: 'incident-1',
                payload: { fromStaffId: null, toStaffId: 'staff-new' }
            }),
            ...overrides
        }
    }

    // ── execute() ────────────────────────────────────────────────────────────

    describe('execute(command)', () => {
        test('calls command.execute()', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand()

            await invoker.execute(cmd)

            expect(cmd.execute).toHaveBeenCalledTimes(1)
        })

        test('calls prisma.auditLog.create() after command.execute()', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand()

            await invoker.execute(cmd)

            expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
        })

        test('passes exactly what getAuditEntry() returns to prisma.auditLog.create()', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const auditEntry = {
                commandType: 'AssignIncident',
                actorId: 'admin-42',
                incidentId: 'incident-7',
                payload: { fromStaffId: 'staff-old', toStaffId: 'staff-new' }
            }
            const cmd = makeFakeCommand({ getAuditEntry: jest.fn().mockReturnValue(auditEntry) })

            await invoker.execute(cmd)

            expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: auditEntry })
        })

        test('command.execute() is called before prisma.auditLog.create()', async () => {
            const callOrder = []
            const prisma = makePrisma()

            // Track call order via side effects
            const cmd = makeFakeCommand({
                execute: jest.fn().mockImplementation(async () => {
                    callOrder.push('execute')
                })
            })
            prisma.auditLog.create.mockImplementation(async () => {
                callOrder.push('auditLog.create')
                return { id: 'audit-1' }
            })

            const invoker = new CommandInvoker(prisma)
            await invoker.execute(cmd)

            expect(callOrder).toEqual(['execute', 'auditLog.create'])
        })

        test('does NOT call prisma.auditLog.create() if command.execute() throws', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand({
                execute: jest.fn().mockRejectedValue(new Error('assignment conflict'))
            })

            await expect(invoker.execute(cmd)).rejects.toThrow('assignment conflict')
            expect(prisma.auditLog.create).not.toHaveBeenCalled()
        })
    })

    // ── undo() ───────────────────────────────────────────────────────────────

    describe('undo(command)', () => {
        test('calls command.undo()', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand()

            await invoker.undo(cmd)

            expect(cmd.undo).toHaveBeenCalledTimes(1)
        })

        test('calls prisma.auditLog.create() after command.undo()', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand()

            await invoker.undo(cmd)

            expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
        })

        test('prefixes commandType with UNDO_ in the audit log entry', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand({
                getAuditEntry: jest.fn().mockReturnValue({
                    commandType: 'AssignIncident',
                    actorId: 'admin-1',
                    incidentId: 'incident-1',
                    payload: {}
                })
            })

            await invoker.undo(cmd)

            expect(prisma.auditLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        commandType: 'UNDO_AssignIncident'
                    })
                })
            )
        })

        test('preserves all other fields from getAuditEntry() in the undo audit log', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand({
                getAuditEntry: jest.fn().mockReturnValue({
                    commandType: 'BroadcastAlert',
                    actorId: 'admin-99',
                    incidentId: null,
                    payload: { alertId: 'alert-5', title: 'Test', scopeTarget: 'CAMPUS' }
                })
            })

            await invoker.undo(cmd)

            expect(prisma.auditLog.create).toHaveBeenCalledWith({
                data: {
                    commandType: 'UNDO_BroadcastAlert',
                    actorId: 'admin-99',
                    incidentId: null,
                    payload: { alertId: 'alert-5', title: 'Test', scopeTarget: 'CAMPUS' }
                }
            })
        })

        test('does NOT call prisma.auditLog.create() if command.undo() throws', async () => {
            const prisma = makePrisma()
            const invoker = new CommandInvoker(prisma)
            const cmd = makeFakeCommand({
                undo: jest.fn().mockRejectedValue(new Error('undo failed'))
            })

            await expect(invoker.undo(cmd)).rejects.toThrow('undo failed')
            expect(prisma.auditLog.create).not.toHaveBeenCalled()
        })
    })
})
