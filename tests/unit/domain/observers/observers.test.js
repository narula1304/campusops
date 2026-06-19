// tests/unit/domain/observers/observers.test.js
//
// Pure unit tests — all external dependencies (Redis, Socket.IO, BullMQ,
// Prisma, Nodemailer) are replaced with lightweight fakes (jest.fn()).
// This tests the observer logic and routing, not the external services.

const IncidentEventPublisher = require('../../../../src/domain/observers/IncidentEventPublisher')
const SLATimerManager = require('../../../../src/domain/observers/SLATimerManager')
const HotspotDetector = require('../../../../src/domain/observers/HotspotDetector')
const {
    AuditLogger,
    CacheInvalidator,
    RealTimeNotifier,
    EmailNotifier,
    FeedbackRequestSender
} = require('../../../../src/domain/observers/observers')
const wireObservers = require('../../../../src/domain/observers/wireObservers')

// ── Fake infrastructure builders ──

function makeRedis(overrides = {}) {
    return {
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        del: jest.fn().mockResolvedValue(1),
        ...overrides
    }
}

function makeIo() {
    const emitFn = jest.fn()
    const toFn = jest.fn().mockReturnValue({ emit: emitFn })
    return { to: toFn, _emit: emitFn }
}

function makeQueue(overrides = {}) {
    return {
        add: jest.fn().mockResolvedValue({ id: 'job-123' }),
        getJob: jest.fn().mockResolvedValue({ remove: jest.fn().mockResolvedValue(true) }),
        ...overrides
    }
}

function makePrisma() {
    return {
        auditLog: {
            create: jest.fn().mockResolvedValue({ id: 'audit-1' })
        }
    }
}

function makeMailer() {
    return { sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) }
}

function makeIncident(overrides = {}) {
    return {
        id: 'incident-1',
        incidentNumber: 'INC-2025-000001',
        title: 'AC broken in lab',
        priority: 'HIGH',
        creatorId: 'student-1',
        assignedToId: 'staff-1',
        departmentId: 'dept-electrical',
        slaJobId: null,
        location: { block: 'C', room: 'C-304' },
        sla: { deadlineAt: new Date(Date.now() + 4 * 60 * 60 * 1000), windowHours: 4 },
        getCurrentStatus: () => 'IN_PROGRESS',
        ...overrides
    }
}

// ── IncidentEventPublisher ──

describe('IncidentEventPublisher', () => {
    test('calls registered observer when event is published', async () => {
        const publisher = new IncidentEventPublisher()
        const observer = { handle: jest.fn().mockResolvedValue(undefined) }

        publisher.subscribe('INCIDENT_CREATED', observer)
        await publisher.publish('INCIDENT_CREATED', { incident: makeIncident() })

        expect(observer.handle).toHaveBeenCalledWith(
            'INCIDENT_CREATED',
            expect.objectContaining({ incident: expect.any(Object) })
        )
    })

    test('does not call observer registered for a different event', async () => {
        const publisher = new IncidentEventPublisher()
        const observer = { handle: jest.fn() }

        publisher.subscribe('INCIDENT_RESOLVED', observer)
        await publisher.publish('INCIDENT_CREATED', { incident: makeIncident() })

        expect(observer.handle).not.toHaveBeenCalled()
    })

    test('calls all observers registered for the same event', async () => {
        const publisher = new IncidentEventPublisher()
        const obs1 = { handle: jest.fn().mockResolvedValue(undefined) }
        const obs2 = { handle: jest.fn().mockResolvedValue(undefined) }

        publisher.subscribe('INCIDENT_CREATED', obs1)
        publisher.subscribe('INCIDENT_CREATED', obs2)
        await publisher.publish('INCIDENT_CREATED', { incident: makeIncident() })

        expect(obs1.handle).toHaveBeenCalledTimes(1)
        expect(obs2.handle).toHaveBeenCalledTimes(1)
    })

    test('one failing observer does not prevent others from running', async () => {
        const publisher = new IncidentEventPublisher()
        const failing = { handle: jest.fn().mockRejectedValue(new Error('SMTP timeout')) }
        const succeeds = { handle: jest.fn().mockResolvedValue(undefined) }

        publisher.subscribe('INCIDENT_CREATED', failing)
        publisher.subscribe('INCIDENT_CREATED', succeeds)

        // Should not throw despite one observer failing
        await expect(
            publisher.publish('INCIDENT_CREATED', { incident: makeIncident() })
        ).resolves.toBeUndefined()

        expect(succeeds.handle).toHaveBeenCalledTimes(1)
    })

    test('subscriberCount returns correct count', () => {
        const publisher = new IncidentEventPublisher()
        publisher.subscribe('INCIDENT_CREATED', { handle: jest.fn() })
        publisher.subscribe('INCIDENT_CREATED', { handle: jest.fn() })
        expect(publisher.subscriberCount('INCIDENT_CREATED')).toBe(2)
        expect(publisher.subscriberCount('INCIDENT_RESOLVED')).toBe(0)
    })

    test('subscribe with array of event types registers for all', async () => {
        const publisher = new IncidentEventPublisher()
        const observer = { handle: jest.fn().mockResolvedValue(undefined) }

        publisher.subscribe(['INCIDENT_CREATED', 'INCIDENT_RESOLVED'], observer)
        await publisher.publish('INCIDENT_CREATED', { incident: makeIncident() })
        await publisher.publish('INCIDENT_RESOLVED', { incident: makeIncident() })

        expect(observer.handle).toHaveBeenCalledTimes(2)
    })

    test('unsubscribe removes the observer', async () => {
        const publisher = new IncidentEventPublisher()
        const observer = { handle: jest.fn() }

        publisher.subscribe('INCIDENT_CREATED', observer)
        publisher.unsubscribe('INCIDENT_CREATED', observer)
        await publisher.publish('INCIDENT_CREATED', { incident: makeIncident() })

        expect(observer.handle).not.toHaveBeenCalled()
    })
})

// ── SLATimerManager ──

describe('SLATimerManager', () => {
    test('schedules a BullMQ job on INCIDENT_CREATED', async () => {
        const queue = makeQueue()
        const manager = new SLATimerManager(queue)
        const incident = makeIncident()

        await manager.handle('INCIDENT_CREATED', { incident })

        expect(queue.add).toHaveBeenCalledWith(
            'escalate-incident',
            { incidentId: incident.id, escalationLevel: 1 },
            expect.objectContaining({ jobId: `sla:${incident.id}:1` })
        )
    })

    test('stores returned jobId on incident.slaJobId', async () => {
        const queue = makeQueue()
        const manager = new SLATimerManager(queue)
        const incident = makeIncident({ slaJobId: null })

        await manager.handle('INCIDENT_CREATED', { incident })

        expect(incident.slaJobId).toBe('job-123')
    })

    test('cancels existing BullMQ job on INCIDENT_RESOLVED', async () => {
        const removeFn = jest.fn().mockResolvedValue(true)
        const queue = makeQueue({
            getJob: jest.fn().mockResolvedValue({ remove: removeFn })
        })
        const manager = new SLATimerManager(queue)
        const incident = makeIncident({ slaJobId: 'job-123' })

        await manager.handle('INCIDENT_RESOLVED', { incident })

        expect(queue.getJob).toHaveBeenCalledWith('job-123')
        expect(removeFn).toHaveBeenCalled()
    })

    test('skips scheduling when incident has no SLA attached', async () => {
        const queue = makeQueue()
        const manager = new SLATimerManager(queue)
        const incident = makeIncident({ sla: null })

        await manager.handle('INCIDENT_CREATED', { incident })

        expect(queue.add).not.toHaveBeenCalled()
    })

    test('skips cancellation when incident has no slaJobId', async () => {
        const queue = makeQueue()
        const manager = new SLATimerManager(queue)
        const incident = makeIncident({ slaJobId: null })

        await manager.handle('INCIDENT_RESOLVED', { incident })

        expect(queue.getJob).not.toHaveBeenCalled()
    })

    test('ignores other event types silently', async () => {
        const queue = makeQueue()
        const manager = new SLATimerManager(queue)

        await manager.handle('INCIDENT_ASSIGNED', { incident: makeIncident() })

        expect(queue.add).not.toHaveBeenCalled()
        expect(queue.getJob).not.toHaveBeenCalled()
    })
})

// ── HotspotDetector ──

describe('HotspotDetector', () => {
    test('increments Redis counter on INCIDENT_CREATED', async () => {
        const redis = makeRedis({ incr: jest.fn().mockResolvedValue(1) })
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)

        await detector.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(redis.incr).toHaveBeenCalledWith('hotspot:C:C-304')
        expect(redis.expire).toHaveBeenCalledWith('hotspot:C:C-304', 86400)
    })

    test('does NOT emit hotspot_detected when count < threshold (3)', async () => {
        const redis = makeRedis({ incr: jest.fn().mockResolvedValue(2) })
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)

        await detector.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(io.to).not.toHaveBeenCalled()
    })

    test('emits hotspot_detected to role:ADMIN when count reaches threshold (3)', async () => {
        const redis = makeRedis({ incr: jest.fn().mockResolvedValue(3) })
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)

        await detector.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(io.to).toHaveBeenCalledWith('role:ADMIN')
        expect(io._emit).toHaveBeenCalledWith(
            'hotspot_detected',
            expect.objectContaining({ block: 'C', room: 'C-304', count: 3, severity: 'warning' })
        )
    })

    test('severity is "high" for count 6-9', async () => {
        const redis = makeRedis({ incr: jest.fn().mockResolvedValue(7) })
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)

        await detector.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(io._emit).toHaveBeenCalledWith(
            'hotspot_detected',
            expect.objectContaining({ severity: 'high' })
        )
    })

    test('severity is "critical" for count >= 10', async () => {
        const redis = makeRedis({ incr: jest.fn().mockResolvedValue(10) })
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)

        await detector.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(io._emit).toHaveBeenCalledWith(
            'hotspot_detected',
            expect.objectContaining({ severity: 'critical' })
        )
    })

    test('ignores events other than INCIDENT_CREATED', async () => {
        const redis = makeRedis()
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)

        await detector.handle('INCIDENT_RESOLVED', { incident: makeIncident() })

        expect(redis.incr).not.toHaveBeenCalled()
    })

    test('skips processing when incident has no location block', async () => {
        const redis = makeRedis()
        const io = makeIo()
        const detector = new HotspotDetector(redis, io)
        const incident = makeIncident({ location: {} })

        await detector.handle('INCIDENT_CREATED', { incident })

        expect(redis.incr).not.toHaveBeenCalled()
    })
})

// ── AuditLogger ──

describe('AuditLogger', () => {
    test('inserts an audit log entry for every event', async () => {
        const prisma = makePrisma()
        const logger = new AuditLogger(prisma)
        const incident = makeIncident()

        await logger.handle('INCIDENT_CREATED', { incident })

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    commandType: 'INCIDENT_CREATED',
                    incidentId: incident.id
                })
            })
        )
    })

    test('uses staff.id as actorId when staff is present', async () => {
        const prisma = makePrisma()
        const logger = new AuditLogger(prisma)
        const staff = { id: 'staff-99' }

        await logger.handle('INCIDENT_ASSIGNED', { incident: makeIncident(), staff })

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ actorId: 'staff-99' })
            })
        )
    })

    test('falls back to incident.creatorId as actorId when no staff', async () => {
        const prisma = makePrisma()
        const logger = new AuditLogger(prisma)

        await logger.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ actorId: 'student-1' })
            })
        )
    })
})

// ── CacheInvalidator ──

describe('CacheInvalidator', () => {
    test('deletes department and global dashboard cache keys', async () => {
        const redis = makeRedis()
        const invalidator = new CacheInvalidator(redis)

        await invalidator.handle('INCIDENT_RESOLVED', { incident: makeIncident() })

        expect(redis.del).toHaveBeenCalledWith('cache:dashboard:dept:dept-electrical:stats')
        expect(redis.del).toHaveBeenCalledWith('cache:dashboard:global:stats')
    })

    test('skips deletion when incident has no departmentId', async () => {
        const redis = makeRedis()
        const invalidator = new CacheInvalidator(redis)

        await invalidator.handle('INCIDENT_RESOLVED', { incident: makeIncident({ departmentId: null }) })

        expect(redis.del).not.toHaveBeenCalled()
    })
})

// ── RealTimeNotifier ──

describe('RealTimeNotifier', () => {
    test('emits incident_assigned to assigned staff room on INCIDENT_ASSIGNED', async () => {
        const io = makeIo()
        const notifier = new RealTimeNotifier(io)
        const staff = { id: 'staff-1', name: 'Ravi' }

        await notifier.handle('INCIDENT_ASSIGNED', { incident: makeIncident(), staff })

        expect(io.to).toHaveBeenCalledWith('user:staff-1')
        expect(io._emit).toHaveBeenCalledWith('incident_assigned', expect.any(Object))
    })

    test('emits incident_created to department room on INCIDENT_CREATED', async () => {
        const io = makeIo()
        const notifier = new RealTimeNotifier(io)

        await notifier.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(io.to).toHaveBeenCalledWith('dept:dept-electrical')
        expect(io._emit).toHaveBeenCalledWith('incident_created', expect.any(Object))
    })

    test('emits incident_updated to reporter and staff on INCIDENT_RESOLVED', async () => {
        const io = makeIo()
        const notifier = new RealTimeNotifier(io)

        await notifier.handle('INCIDENT_RESOLVED', { incident: makeIncident() })

        const roomsCalled = io.to.mock.calls.map((c) => c[0])
        expect(roomsCalled).toContain('user:student-1')
        expect(roomsCalled).toContain('user:staff-1')
    })

    test('emits incident_escalated to role:ADMIN room on INCIDENT_ESCALATED', async () => {
        const io = makeIo()
        const notifier = new RealTimeNotifier(io)

        await notifier.handle('INCIDENT_ESCALATED', { incident: makeIncident(), reason: 'SLA breach' })

        expect(io.to).toHaveBeenCalledWith('role:ADMIN')
        expect(io._emit).toHaveBeenCalledWith('incident_escalated', expect.any(Object))
    })

    test('ignores unknown event types gracefully', async () => {
        const io = makeIo()
        const notifier = new RealTimeNotifier(io)

        // Should not throw
        await expect(
            notifier.handle('SOME_UNKNOWN_EVENT', { incident: makeIncident() })
        ).resolves.toBeUndefined()
    })
})

// ── FeedbackRequestSender ──

describe('FeedbackRequestSender', () => {
    test('emits feedback_request to reporter room on INCIDENT_RESOLVED', async () => {
        const io = makeIo()
        const mailer = makeMailer()
        const sender = new FeedbackRequestSender(io, mailer)

        await sender.handle('INCIDENT_RESOLVED', { incident: makeIncident() })

        expect(io.to).toHaveBeenCalledWith('user:student-1')
        expect(io._emit).toHaveBeenCalledWith(
            'feedback_request',
            expect.objectContaining({ incidentId: 'incident-1' })
        )
    })

    test('ignores events other than INCIDENT_RESOLVED', async () => {
        const io = makeIo()
        const sender = new FeedbackRequestSender(io, makeMailer())

        await sender.handle('INCIDENT_CREATED', { incident: makeIncident() })

        expect(io.to).not.toHaveBeenCalled()
    })

    test('skips when incident has no creatorId', async () => {
        const io = makeIo()
        const sender = new FeedbackRequestSender(io, makeMailer())

        await sender.handle('INCIDENT_RESOLVED', { incident: makeIncident({ creatorId: null }) })

        expect(io.to).not.toHaveBeenCalled()
    })
})

// ── wireObservers integration ──

describe('wireObservers', () => {
    test('returns an IncidentEventPublisher', () => {
        const publisher = wireObservers({
            slaQueue: makeQueue(),
            redis: makeRedis(),
            io: makeIo(),
            mailer: makeMailer(),
            prisma: makePrisma()
        })
        expect(publisher).toBeInstanceOf(IncidentEventPublisher)
    })

    test('registers multiple observers for INCIDENT_CREATED', () => {
        const publisher = wireObservers({
            slaQueue: makeQueue(),
            redis: makeRedis(),
            io: makeIo(),
            mailer: makeMailer(),
            prisma: makePrisma()
        })
        // Should have SLATimerManager, RealTimeNotifier, HotspotDetector, AuditLogger = 4
        expect(publisher.subscriberCount('INCIDENT_CREATED')).toBe(4)
    })

    test('registers SLA cancellation observer for INCIDENT_RESOLVED', () => {
        const publisher = wireObservers({
            slaQueue: makeQueue(),
            redis: makeRedis(),
            io: makeIo(),
            mailer: makeMailer(),
            prisma: makePrisma()
        })
        // SLATimerManager, RealTimeNotifier, EmailNotifier, FeedbackRequestSender, CacheInvalidator, AuditLogger = 6
        expect(publisher.subscriberCount('INCIDENT_RESOLVED')).toBe(6)
    })
})