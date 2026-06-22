// tests/unit/workers/slaWorker.test.js
//
// Tests the SLA worker's JOB PROCESSING LOGIC — not BullMQ itself.
// We extract the job processor function and test it directly with fake
// incidents, fake repos, and fake publishers. No real Redis or BullMQ needed.

// Mock BullMQ Worker so it doesn't try to connect to Redis
let capturedProcessor = null
jest.mock('bullmq', () => ({
    Worker: jest.fn().mockImplementation((queueName, processor, opts) => {
        capturedProcessor = processor
        return {
            on: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined)
        }
    })
}))

const { createSLAWorker } = require('../../../src/jobs/workers/slaWorker')
const { InvalidTransitionError } = require('../../../src/domain/errors')

// ── Fake builders ──────────────────────────────────────────────────────────

function makeIncidentRepo(overrides = {}) {
    return {
        findById: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

function makeEventPublisher() {
    return {
        publish: jest.fn().mockResolvedValue(undefined),
    }
}

function makeRedis() {
    return { disconnect: jest.fn() }
}

function makeIncident(overrides = {}) {
    return {
        id: 'incident-1',
        sla: { windowHours: 4, isEscalated: false },
        getCurrentStatus: jest.fn().mockReturnValue('OPEN'),
        escalate: jest.fn(),
        addToStatusLog: jest.fn(),
        publishedEvents: [],
        ...overrides,
    }
}

function makeJob(dataOverrides = {}) {
    return {
        id: 'job-1',
        data: {
            incidentId: 'incident-1',
            escalationLevel: 1,
            ...dataOverrides,
        },
        attemptsMade: 1,
    }
}

// Helper: get the captured processor and call it
async function processJob(job, deps) {
    capturedProcessor = null
    createSLAWorker(deps)
    return capturedProcessor(job)
}

describe('SLA Worker — job processing logic', () => {
    beforeEach(() => jest.clearAllMocks())

    test('loads the incident via incidentRepo.findById', async () => {
        const incident = makeIncident()
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        expect(repo.findById).toHaveBeenCalledWith('incident-1')
    })

    test('skips escalation and returns when incident is not found', async () => {
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(null) })
        const publisher = makeEventPublisher()

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: publisher,
            redis: makeRedis(),
        })

        expect(repo.save).not.toHaveBeenCalled()
        expect(publisher.publish).not.toHaveBeenCalled()
    })

    test('skips escalation when incident is already RESOLVED', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('RESOLVED') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })
        const publisher = makeEventPublisher()

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: publisher,
            redis: makeRedis(),
        })

        expect(incident.escalate).not.toHaveBeenCalled()
        expect(repo.save).not.toHaveBeenCalled()
        expect(publisher.publish).not.toHaveBeenCalled()
    })

    test('skips escalation when incident is already CLOSED', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('CLOSED') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })
        const publisher = makeEventPublisher()

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: publisher,
            redis: makeRedis(),
        })

        expect(incident.escalate).not.toHaveBeenCalled()
    })

    test('skips escalation when incident is already ESCALATED', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('ESCALATED') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })
        const publisher = makeEventPublisher()

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: publisher,
            redis: makeRedis(),
        })

        expect(incident.escalate).not.toHaveBeenCalled()
    })

    test('calls incident.escalate() with a reason string for OPEN incidents', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('OPEN') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        expect(incident.escalate).toHaveBeenCalledTimes(1)
        expect(incident.escalate).toHaveBeenCalledWith(expect.stringContaining('SLA breach'))
    })

    test('calls incident.escalate() for IN_PROGRESS incidents too', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('IN_PROGRESS') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        expect(incident.escalate).toHaveBeenCalledTimes(1)
    })

    test('escalation reason mentions the SLA window hours', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('OPEN'),
            sla: { windowHours: 2, isEscalated: false },
        })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        const reason = incident.escalate.mock.calls[0][0]
        expect(reason).toMatch(/2-hour/)
    })

    test('calls incidentRepo.save(incident) after escalation', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('OPEN') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        expect(repo.save).toHaveBeenCalledWith(incident)
    })

    test('save() is called AFTER escalate() — order matters', async () => {
        const callOrder = []
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('OPEN'),
            escalate: jest.fn(() => callOrder.push('escalate')),
        })
        const repo = makeIncidentRepo({
            findById: jest.fn().mockResolvedValue(incident),
            save: jest.fn(async () => callOrder.push('save')),
        })

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        expect(callOrder).toEqual(['escalate', 'save'])
    })

    test('publishes INCIDENT_ESCALATED after saving', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('OPEN') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })
        const publisher = makeEventPublisher()

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: publisher,
            redis: makeRedis(),
        })

        expect(publisher.publish).toHaveBeenCalledWith(
            'INCIDENT_ESCALATED',
            expect.objectContaining({ incident })
        )
    })

    test('publish() is called AFTER save() — order matters', async () => {
        const callOrder = []
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('OPEN') })
        const repo = makeIncidentRepo({
            findById: jest.fn().mockResolvedValue(incident),
            save: jest.fn(async () => callOrder.push('save')),
        })
        const publisher = {
            publish: jest.fn(async () => callOrder.push('publish')),
        }

        await processJob(makeJob(), {
            incidentRepo: repo,
            eventPublisher: publisher,
            redis: makeRedis(),
        })

        expect(callOrder).toEqual(['save', 'publish'])
    })

    test('catches InvalidTransitionError and returns without rethrowing (no BullMQ retry)', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('OPEN'),
            escalate: jest.fn(() => {
                throw new InvalidTransitionError('OPEN', 'escalate')
            }),
        })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        // Must not throw — returning cleanly tells BullMQ the job succeeded
        await expect(
            processJob(makeJob(), {
                incidentRepo: repo,
                eventPublisher: makeEventPublisher(),
                redis: makeRedis(),
            })
        ).resolves.toBeUndefined()

        // Also confirms we didn't try to save or publish after the transition error
        expect(repo.save).not.toHaveBeenCalled()
    })

    test('rethrows unexpected errors so BullMQ retries the job', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('OPEN'),
            escalate: jest.fn(() => {
                throw new Error('Unexpected DB crash')
            }),
        })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await expect(
            processJob(makeJob(), {
                incidentRepo: repo,
                eventPublisher: makeEventPublisher(),
                redis: makeRedis(),
            })
        ).rejects.toThrow('Unexpected DB crash')
    })

    test('escalation reason includes the escalation level from job data', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('IN_PROGRESS') })
        const repo = makeIncidentRepo({ findById: jest.fn().mockResolvedValue(incident) })

        await processJob(makeJob({ escalationLevel: 2 }), {
            incidentRepo: repo,
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })

        const reason = incident.escalate.mock.calls[0][0]
        expect(reason).toMatch(/level 2/)
    })
})

describe('createSLAWorker — worker setup', () => {
    test('creates a BullMQ Worker on the correct queue name', () => {
        const { Worker } = require('bullmq')
        createSLAWorker({
            incidentRepo: makeIncidentRepo(),
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })
        expect(Worker).toHaveBeenCalledWith(
            'sla-escalation',
            expect.any(Function),
            expect.any(Object)
        )
    })

    test('returns the worker instance', () => {
        const worker = createSLAWorker({
            incidentRepo: makeIncidentRepo(),
            eventPublisher: makeEventPublisher(),
            redis: makeRedis(),
        })
        expect(worker).toBeDefined()
        expect(typeof worker.close).toBe('function')
    })
})