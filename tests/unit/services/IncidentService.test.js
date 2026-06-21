// tests/unit/services/IncidentService.test.js
//
// Pure unit tests — all dependencies (incidentRepo, validationChain,
// eventPublisher, strategyFactory, departmentRepo) are jest.fn() fakes.
// IncidentFactory is jest.mock()'d so the service never touches real domain
// entities and we can assert on the exact object it received.
//
// No real Prisma, no real validators, no real strategies, no DB.
//
// Style follows tests/unit/domain/observers/observers.test.js

const IncidentService = require('../../../src/services/IncidentService')
const {
    ValidationError,
    DuplicateIncidentError,
    IncidentNotAssignableError,
    NoStaffAvailableError,
    ResolutionPhotoRequiredError,
} = require('../../../src/domain/errors')

// ── Mock IncidentFactory ───────────────────────────────────────────────────────
// IncidentService imports IncidentFactory directly (it is not injected), so we
// must mock the module before the service is loaded.  jest.mock() is hoisted
// before require() calls by Jest's transform step.

jest.mock('../../../src/domain/factories/IncidentFactory')
const IncidentFactory = require('../../../src/domain/factories/IncidentFactory')

// ── Fake builders ─────────────────────────────────────────────────────────────

/**
 * Returns a minimal incident plain-object whose methods are all jest.fn().
 * Using a plain object (not a real domain class) keeps tests isolated from
 * state-machine logic — we test IncidentService's orchestration, not states.
 */
function makeIncident(overrides = {}) {
    return {
        id: null,                         // null until save() assigns it
        incidentNumber: 'INC-2026-000001',
        title: 'AC broken in lab',
        priority: 'HIGH',
        category: 'MAINTENANCE',
        creatorId: 'reporter-1',
        assignedToId: null,
        assignedTo: null,
        departmentId: 'dept-electrical',
        slaJobId: null,
        location: { block: 'C', room: 'C-304' },
        sla: { deadlineAt: new Date(Date.now() + 4 * 3_600_000), windowHours: 4 },
        getCurrentStatus: jest.fn().mockReturnValue('OPEN'),
        assignStaff: jest.fn(),
        resolve: jest.fn(),
        receiveFeedback: jest.fn(),
        ...overrides,
    }
}

function makeReporter(overrides = {}) {
    return { id: 'reporter-1', name: 'Arjun Sharma', role: 'STUDENT', ...overrides }
}

function makeStaff(overrides = {}) {
    return {
        id: 'staff-1',
        name: 'Ravi Kumar',
        role: 'MAINTENANCE',
        staffState: 'ACTIVE',
        activeTaskCount: 2,
        ...overrides,
    }
}

function makeDepartment(overrides = {}) {
    return {
        id: 'dept-electrical',
        name: 'Electrical',
        assignmentStrategy: 'LEAST_LOADED',
        roundRobinIndex: 0,
        ...overrides,
    }
}

/**
 * Builds an IncidentService with all dependencies replaced by jest.fn() fakes.
 * Individual tests override only what they care about.
 */
function makeService(overrides = {}) {
    const incidentRepo = {
        findById: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue({ incidents: [], total: 0 }),
        save: jest.fn().mockResolvedValue('saved-incident-id'),
        ...overrides.incidentRepo,
    }

    const validationChain = {
        validate: jest.fn().mockImplementation(async (dto) => dto),
        ...overrides.validationChain,
    }

    const eventPublisher = {
        publish: jest.fn().mockResolvedValue(undefined),
        ...overrides.eventPublisher,
    }

    const mockStrategy = {
        assign: jest.fn().mockReturnValue(makeStaff()),
    }

    const strategyFactory = {
        create: jest.fn().mockReturnValue(mockStrategy),
        ...overrides.strategyFactory,
    }

    const departmentRepo = {
        findById: jest.fn().mockResolvedValue(makeDepartment()),
        findEligibleStaff: jest.fn().mockResolvedValue([makeStaff()]),
        ...overrides.departmentRepo,
    }

    const service = new IncidentService({
        incidentRepo,
        validationChain,
        eventPublisher,
        strategyFactory,
        departmentRepo,
    })

    // Expose the individual fakes so tests can assert on them without going
    // through the service — matches the pattern in observers.test.js
    service._mocks = { incidentRepo, validationChain, eventPublisher, strategyFactory, departmentRepo, mockStrategy }

    return service
}

// ── createIncident ─────────────────────────────────────────────────────────────

describe('IncidentService.createIncident()', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('calls validationChain.validate() with the dto and correct context before anything else', async () => {
        const incident = makeIncident()
        IncidentFactory.create = jest.fn().mockReturnValue(incident)

        const service = makeService()
        const { validationChain, incidentRepo } = service._mocks
        const dto = { title: 'AC broken', category: 'MAINTENANCE', priority: 'HIGH', location: { block: 'C' } }
        const reporter = makeReporter()

        await service.createIncident(dto, reporter)

        // validate() must be called BEFORE save() — check order via mock call counts
        const validateOrder = validationChain.validate.mock.invocationCallOrder[0]
        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        expect(validateOrder).toBeLessThan(saveOrder)

        // validate() called with the dto and the correct context shape
        expect(validationChain.validate).toHaveBeenCalledWith(
            dto,
            expect.objectContaining({
                userId: reporter.id,
                incidentRepo,
            })
        )
    })

    test('calls incidentRepo.save() with the incident built by IncidentFactory', async () => {
        const incident = makeIncident()
        IncidentFactory.create = jest.fn().mockReturnValue(incident)

        const service = makeService()
        const dto = { title: 'Leak', category: 'MAINTENANCE', priority: 'HIGH', location: { block: 'A' } }

        await service.createIncident(dto, makeReporter())

        expect(service._mocks.incidentRepo.save).toHaveBeenCalledWith(incident)
    })

    test('sets incident.id to whatever incidentRepo.save() returned', async () => {
        const incident = makeIncident({ id: null })
        IncidentFactory.create = jest.fn().mockReturnValue(incident)

        const service = makeService({
            incidentRepo: { save: jest.fn().mockResolvedValue('generated-uuid-99') },
        })

        await service.createIncident({}, makeReporter())

        expect(incident.id).toBe('generated-uuid-99')
    })

    test('calls eventPublisher.publish("INCIDENT_CREATED", { incident }) after saving', async () => {
        const incident = makeIncident()
        IncidentFactory.create = jest.fn().mockReturnValue(incident)

        const service = makeService()
        const { eventPublisher, incidentRepo } = service._mocks

        await service.createIncident({}, makeReporter())

        // publish() must be called AFTER save()
        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        const publishOrder = eventPublisher.publish.mock.invocationCallOrder[0]
        expect(publishOrder).toBeGreaterThan(saveOrder)

        expect(eventPublisher.publish).toHaveBeenCalledWith(
            'INCIDENT_CREATED',
            expect.objectContaining({ incident })
        )
    })

    test('propagates ValidationError from validationChain without catching it', async () => {
        const error = new ValidationError('priority', 'Priority is required')

        const service = makeService({
            validationChain: { validate: jest.fn().mockRejectedValue(error) },
        })

        await expect(service.createIncident({}, makeReporter())).rejects.toThrow(ValidationError)
        // incidentRepo.save must NOT have been called
        expect(service._mocks.incidentRepo.save).not.toHaveBeenCalled()
    })

    test('propagates DuplicateIncidentError from validationChain without catching it', async () => {
        const error = new DuplicateIncidentError('existing-id', 'INC-2026-000010', 'IN_PROGRESS')

        const service = makeService({
            validationChain: { validate: jest.fn().mockRejectedValue(error) },
        })

        await expect(service.createIncident({}, makeReporter())).rejects.toThrow(DuplicateIncidentError)
        expect(service._mocks.incidentRepo.save).not.toHaveBeenCalled()
    })

    test('returns the created incident', async () => {
        const incident = makeIncident({ id: null })
        IncidentFactory.create = jest.fn().mockReturnValue(incident)

        const service = makeService({
            incidentRepo: { save: jest.fn().mockResolvedValue('returned-id') },
        })

        const result = await service.createIncident({}, makeReporter())

        // The returned object is the same incident with id written back
        expect(result).toBe(incident)
        expect(result.id).toBe('returned-id')
    })
})

// ── assignIncident ─────────────────────────────────────────────────────────────

describe('IncidentService.assignIncident()', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('throws IncidentNotAssignableError when incident is not found', async () => {
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(null) },
        })

        await expect(service.assignIncident('missing-id', {})).rejects.toThrow(
            IncidentNotAssignableError
        )
    })

    test('throws IncidentNotAssignableError when incident status is IN_PROGRESS', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('IN_PROGRESS') })
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(incident) },
        })

        await expect(service.assignIncident('some-id', {})).rejects.toThrow(IncidentNotAssignableError)
    })

    test('throws IncidentNotAssignableError when incident status is RESOLVED', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('RESOLVED') })
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(incident) },
        })

        await expect(service.assignIncident('some-id', {})).rejects.toThrow(IncidentNotAssignableError)
    })

    test('does NOT throw when status is OPEN', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('OPEN') })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await expect(service.assignIncident('some-id', {})).resolves.not.toThrow()
    })

    test('does NOT throw when status is ESCALATED', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('ESCALATED') })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await expect(service.assignIncident('some-id', {})).resolves.not.toThrow()
    })

    test('calls departmentRepo.findById with incident.departmentId', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await service.assignIncident('incident-1', {})

        expect(service._mocks.departmentRepo.findById).toHaveBeenCalledWith('dept-electrical')
    })

    test('calls departmentRepo.findEligibleStaff with incident.departmentId and incident.category', async () => {
        const incident = makeIncident({ departmentId: 'dept-civil', category: 'INFRASTRUCTURE' })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await service.assignIncident('incident-1', {})

        expect(service._mocks.departmentRepo.findEligibleStaff).toHaveBeenCalledWith(
            'dept-civil',
            'INFRASTRUCTURE'
        )
    })

    test('calls strategyFactory.create with department.assignmentStrategy', async () => {
        const incident = makeIncident()
        const department = makeDepartment({ assignmentStrategy: 'ROUND_ROBIN' })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
            departmentRepo: {
                findById: jest.fn().mockResolvedValue(department),
                findEligibleStaff: jest.fn().mockResolvedValue([makeStaff()]),
            },
        })

        await service.assignIncident('incident-1', {})

        expect(service._mocks.strategyFactory.create).toHaveBeenCalledWith('ROUND_ROBIN')
    })

    test('calls strategy.assign with the incident, eligible staff, and { department } in options', async () => {
        const incident = makeIncident()
        const department = makeDepartment()
        const eligibleStaff = [makeStaff(), makeStaff({ id: 'staff-2' })]
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
            departmentRepo: {
                findById: jest.fn().mockResolvedValue(department),
                findEligibleStaff: jest.fn().mockResolvedValue(eligibleStaff),
            },
        })

        await service.assignIncident('incident-1', {})

        expect(service._mocks.mockStrategy.assign).toHaveBeenCalledWith(
            incident,
            eligibleStaff,
            expect.objectContaining({ department })
        )
    })

    test('calls incident.assignStaff with whatever the strategy returned', async () => {
        const incident = makeIncident()
        const selectedStaff = makeStaff({ id: 'staff-chosen' })
        const mockStrategy = { assign: jest.fn().mockReturnValue(selectedStaff) }

        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
            strategyFactory: { create: jest.fn().mockReturnValue(mockStrategy) },
        })

        await service.assignIncident('incident-1', {})

        expect(incident.assignStaff).toHaveBeenCalledWith(selectedStaff)
    })

    test('calls incidentRepo.save after incident.assignStaff', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })
        const { incidentRepo } = service._mocks

        await service.assignIncident('incident-1', {})

        const assignOrder = incident.assignStaff.mock.invocationCallOrder[0]
        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        expect(saveOrder).toBeGreaterThan(assignOrder)
        expect(incidentRepo.save).toHaveBeenCalledWith(incident)
    })

    test('publishes INCIDENT_ASSIGNED with the incident and selected staff after saving', async () => {
        const incident = makeIncident()
        const selectedStaff = makeStaff({ id: 'staff-chosen' })
        const mockStrategy = { assign: jest.fn().mockReturnValue(selectedStaff) }

        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
            strategyFactory: { create: jest.fn().mockReturnValue(mockStrategy) },
        })
        const { eventPublisher, incidentRepo } = service._mocks

        await service.assignIncident('incident-1', {})

        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        const publishOrder = eventPublisher.publish.mock.invocationCallOrder[0]
        expect(publishOrder).toBeGreaterThan(saveOrder)

        expect(eventPublisher.publish).toHaveBeenCalledWith(
            'INCIDENT_ASSIGNED',
            expect.objectContaining({ incident, staff: selectedStaff })
        )
    })

    test('propagates NoStaffAvailableError from strategy.assign without catching it', async () => {
        const incident = makeIncident()
        const error = new NoStaffAvailableError('dept-electrical')
        const mockStrategy = { assign: jest.fn().mockImplementation(() => { throw error }) }

        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
            strategyFactory: { create: jest.fn().mockReturnValue(mockStrategy) },
        })

        await expect(service.assignIncident('incident-1', {})).rejects.toThrow(NoStaffAvailableError)
        expect(service._mocks.incidentRepo.save).not.toHaveBeenCalled()
    })

    test('returns the updated incident', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        const result = await service.assignIncident('incident-1', {})

        expect(result).toBe(incident)
    })
})

// ── resolveIncident ────────────────────────────────────────────────────────────

describe('IncidentService.resolveIncident()', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('calls incident.resolve with the note and photo', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await service.resolveIncident('incident-1', 'Replaced the pipe.', 'https://cdn.example.com/after.jpg', {})

        expect(incident.resolve).toHaveBeenCalledWith(
            'Replaced the pipe.',
            'https://cdn.example.com/after.jpg'
        )
    })

    test('calls incidentRepo.save after incident.resolve', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })
        const { incidentRepo } = service._mocks

        await service.resolveIncident('incident-1', 'Note here.', 'https://photo.url', {})

        const resolveOrder = incident.resolve.mock.invocationCallOrder[0]
        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        expect(saveOrder).toBeGreaterThan(resolveOrder)
        expect(incidentRepo.save).toHaveBeenCalledWith(incident)
    })

    test('publishes INCIDENT_RESOLVED with the incident after saving', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })
        const { eventPublisher, incidentRepo } = service._mocks

        await service.resolveIncident('incident-1', 'Note.', 'https://photo.url', {})

        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        const publishOrder = eventPublisher.publish.mock.invocationCallOrder[0]
        expect(publishOrder).toBeGreaterThan(saveOrder)

        expect(eventPublisher.publish).toHaveBeenCalledWith(
            'INCIDENT_RESOLVED',
            expect.objectContaining({ incident })
        )
    })

    test('propagates ResolutionPhotoRequiredError without catching it', async () => {
        const error = new ResolutionPhotoRequiredError()
        const incident = makeIncident({
            resolve: jest.fn().mockImplementation(() => { throw error }),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn(),
            },
        })

        await expect(
            service.resolveIncident('incident-1', 'Note.', null, {})
        ).rejects.toThrow(ResolutionPhotoRequiredError)

        expect(service._mocks.incidentRepo.save).not.toHaveBeenCalled()
    })

    test('returns null when incident is not found', async () => {
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(null) },
        })

        const result = await service.resolveIncident('missing-id', 'Note.', 'https://photo.url', {})

        expect(result).toBeNull()
    })

    test('returns the updated incident', async () => {
        const incident = makeIncident()
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        const result = await service.resolveIncident('incident-1', 'Note.', 'https://photo.url', {})

        expect(result).toBe(incident)
    })
})

// ── submitFeedback ─────────────────────────────────────────────────────────────

describe('IncidentService.submitFeedback()', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('calls incident.receiveFeedback with the rating', async () => {
        const incident = makeIncident({ getCurrentStatus: jest.fn().mockReturnValue('RESOLVED') })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })
        const rating = { score: 4, comment: 'Good job!' }

        await service.submitFeedback('incident-1', rating, makeReporter())

        expect(incident.receiveFeedback).toHaveBeenCalledWith(rating)
    })

    test('publishes INCIDENT_REOPENED_BY_FEEDBACK when status becomes REOPENED after feedback', async () => {
        // receiveFeedback transitions state; getCurrentStatus() returns REOPENED afterwards.
        // submitFeedback calls getCurrentStatus exactly once — after receiveFeedback — to
        // determine which event to publish. No prior call happens, so a plain
        // mockReturnValue('REOPENED') is sufficient.
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('REOPENED'),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await service.submitFeedback('incident-1', { score: 2, comment: 'Bad.' }, makeReporter())

        expect(service._mocks.eventPublisher.publish).toHaveBeenCalledWith(
            'INCIDENT_REOPENED_BY_FEEDBACK',
            expect.objectContaining({ incident })
        )
    })

    test('publishes FEEDBACK_RECEIVED when status stays RESOLVED after feedback', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('RESOLVED'),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await service.submitFeedback('incident-1', { score: 5, comment: 'Excellent!' }, makeReporter())

        expect(service._mocks.eventPublisher.publish).toHaveBeenCalledWith(
            'FEEDBACK_RECEIVED',
            expect.objectContaining({ incident })
        )
    })

    test('does NOT publish INCIDENT_REOPENED_BY_FEEDBACK for a high-score rating', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('RESOLVED'),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        await service.submitFeedback('incident-1', { score: 5 }, makeReporter())

        const publishCalls = service._mocks.eventPublisher.publish.mock.calls
        const reopenedCall = publishCalls.find(([event]) => event === 'INCIDENT_REOPENED_BY_FEEDBACK')
        expect(reopenedCall).toBeUndefined()
    })

    test('calls incidentRepo.save after receiveFeedback', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('RESOLVED'),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })
        const { incidentRepo } = service._mocks

        await service.submitFeedback('incident-1', { score: 3 }, makeReporter())

        const feedbackOrder = incident.receiveFeedback.mock.invocationCallOrder[0]
        const saveOrder = incidentRepo.save.mock.invocationCallOrder[0]
        expect(saveOrder).toBeGreaterThan(feedbackOrder)
        expect(incidentRepo.save).toHaveBeenCalledWith(incident)
    })

    test('returns null when incident is not found', async () => {
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(null) },
        })

        const result = await service.submitFeedback('missing-id', { score: 4 }, makeReporter())

        expect(result).toBeNull()
    })

    test('returns the updated incident', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('RESOLVED'),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })

        const result = await service.submitFeedback('incident-1', { score: 5 }, makeReporter())

        expect(result).toBe(incident)
    })

    test('passes rating through to the published event payload', async () => {
        const incident = makeIncident({
            getCurrentStatus: jest.fn().mockReturnValue('RESOLVED'),
        })
        const service = makeService({
            incidentRepo: {
                findById: jest.fn().mockResolvedValue(incident),
                save: jest.fn().mockResolvedValue(incident.id),
            },
        })
        const rating = { score: 5, comment: 'Superb.' }

        await service.submitFeedback('incident-1', rating, makeReporter())

        expect(service._mocks.eventPublisher.publish).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ rating })
        )
    })
})

// ── getIncidentById ────────────────────────────────────────────────────────────

describe('IncidentService.getIncidentById()', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('returns null when incidentRepo.findById returns null', async () => {
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(null) },
        })

        const result = await service.getIncidentById('nonexistent-id')

        expect(result).toBeNull()
    })

    test('returns the incident when found', async () => {
        const incident = makeIncident({ id: 'incident-42' })
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(incident) },
        })

        const result = await service.getIncidentById('incident-42')

        expect(result).toBe(incident)
    })

    test('calls incidentRepo.findById with the provided id', async () => {
        const service = makeService({
            incidentRepo: { findById: jest.fn().mockResolvedValue(null) },
        })

        await service.getIncidentById('target-uuid')

        expect(service._mocks.incidentRepo.findById).toHaveBeenCalledWith('target-uuid')
    })
})

// ── listIncidents ──────────────────────────────────────────────────────────────

describe('IncidentService.listIncidents()', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('passes filters and pagination straight through to incidentRepo.findMany', async () => {
        const service = makeService()
        const filters = { status: 'OPEN', priority: 'HIGH', block: 'C' }
        const pagination = { page: 2, limit: 10, sortBy: 'slaDeadlineAt', sortOrder: 'asc' }

        await service.listIncidents(filters, pagination)

        expect(service._mocks.incidentRepo.findMany).toHaveBeenCalledWith(filters, pagination)
    })

    test('returns whatever incidentRepo.findMany returns', async () => {
        const incident = makeIncident({ id: 'inc-1' })
        const repoResult = { incidents: [incident], total: 1 }
        const service = makeService({
            incidentRepo: { findMany: jest.fn().mockResolvedValue(repoResult) },
        })

        const result = await service.listIncidents({}, {})

        expect(result).toBe(repoResult)
    })

    test('returns an empty list when no incidents match', async () => {
        const service = makeService({
            incidentRepo: { findMany: jest.fn().mockResolvedValue({ incidents: [], total: 0 }) },
        })

        const result = await service.listIncidents({ status: 'RESOLVED' }, { page: 99 })

        expect(result).toEqual({ incidents: [], total: 0 })
    })
})
