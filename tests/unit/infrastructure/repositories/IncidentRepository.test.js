// Verification script — NOT the final test file, just for catching bugs
// in toEntity()/toDocument() before committing to a real test suite.
// Mocks prisma module entirely so we can test hydration logic in isolation.

jest.mock('../../../../src/infrastructure/db/prisma', () => ({
    incident: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn()
    },
    $transaction: jest.fn()
}))

const IncidentRepository = require('../../../../src/infrastructure/repositories/IncidentRepository')
const { MaintenanceIncident, EmergencyIncident, SecurityIncident, GeneralIncident } = require('../../../../src/domain/entities/Incident')
const OpenState = require('../../../../src/domain/states/OpenState')
const InProgressState = require('../../../../src/domain/states/InProgressState')
const ResolvedState = require('../../../../src/domain/states/ResolvedState')
const { CriticalSLA, HighSLA } = require('../../../../src/domain/entities/SLAPolicy')

const repo = new IncidentRepository()

function makeRow(overrides = {}) {
    return {
        id: 'incident-1',
        incidentNumber: 'INC-2025-000001',
        title: 'AC broken',
        description: 'AC not cooling',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        locationBlock: 'C',
        locationRoom: 'C-304',
        locationFloor: 3,
        locationLat: 23.25,
        locationLng: 77.41,
        locationDesc: null,
        evidencePhotos: ['photo1.jpg'],
        resolutionPhoto: null,
        creatorId: 'student-1',
        assignedToId: 'staff-1',
        departmentId: 'dept-electrical',
        slaWindowHours: 4,
        slaDeadlineAt: new Date('2025-06-07T14:00:00.000Z'),
        slaIsEscalated: false,
        slaEscalatedAt: null,
        slaJobId: 'job-123',
        resolutionNote: null,
        resolvedAt: null,
        isDuplicate: false,
        duplicateOfId: null,
        duplicateCount: 0,
        panicLat: null,
        panicLng: null,
        panicBroadcastedAt: null,
        estimatedDurationHours: 2,
        requiresDeptHeadApproval: false,
        estimatedCost: null,
        reportNumber: null,
        alertsBroadcast: false,
        assignedTo: {
            id: 'staff-1',
            name: 'Ravi Kumar',
            email: 'ravi@campus.edu',
            role: 'MAINTENANCE',
            activeTaskCount: 3,
            staffState: 'ACTIVE',
            penaltyCount: 0
        },
        ...overrides
    }
}

describe('IncidentRepository.toEntity', () => {
    test('maps category MAINTENANCE to MaintenanceIncident', () => {
        const incident = repo.toEntity(makeRow({ category: 'MAINTENANCE' }))
        expect(incident).toBeInstanceOf(MaintenanceIncident)
    })

    test('maps category CLEANLINESS to MaintenanceIncident (per Factory spec)', () => {
        const incident = repo.toEntity(makeRow({ category: 'CLEANLINESS' }))
        expect(incident).toBeInstanceOf(MaintenanceIncident)
    })

    test('maps category EMERGENCY to EmergencyIncident', () => {
        const incident = repo.toEntity(makeRow({ category: 'EMERGENCY' }))
        expect(incident).toBeInstanceOf(EmergencyIncident)
    })

    test('maps status IN_PROGRESS to InProgressState', () => {
        const incident = repo.toEntity(makeRow({ status: 'IN_PROGRESS' }))
        expect(incident.state).toBeInstanceOf(InProgressState)
    })

    test('maps status OPEN to OpenState', () => {
        const incident = repo.toEntity(makeRow({ status: 'OPEN' }))
        expect(incident.state).toBeInstanceOf(OpenState)
    })

    test('maps status RESOLVED to ResolvedState', () => {
        const incident = repo.toEntity(makeRow({ status: 'RESOLVED' }))
        expect(incident.state).toBeInstanceOf(ResolvedState)
    })

    test('reconstructs SLA with correct class and deadline from row', () => {
        const incident = repo.toEntity(makeRow({ priority: 'HIGH', slaDeadlineAt: new Date('2025-06-07T14:00:00.000Z') }))
        expect(incident.sla).toBeInstanceOf(HighSLA)
        expect(incident.sla.deadlineAt.toISOString()).toBe('2025-06-07T14:00:00.000Z')
    })

    test('reconstructs CriticalSLA for CRITICAL priority', () => {
        const incident = repo.toEntity(makeRow({ priority: 'CRITICAL' }))
        expect(incident.sla).toBeInstanceOf(CriticalSLA)
    })

    test('Location value object is correctly populated', () => {
        const incident = repo.toEntity(makeRow())
        expect(incident.location.block).toBe('C')
        expect(incident.location.room).toBe('C-304')
        expect(incident.location.floor).toBe(3)
    })

    test('assignedTo is hydrated as a plain object with required fields', () => {
        const incident = repo.toEntity(makeRow())
        expect(incident.assignedTo.id).toBe('staff-1')
        expect(incident.assignedTo.activeTaskCount).toBe(3)
        expect(incident.assignedTo.staffState).toBe('ACTIVE')
    })

    test('assignedTo is null when row.assignedTo relation was not included', () => {
        const incident = repo.toEntity(makeRow({ assignedTo: null, assignedToId: null }))
        expect(incident.assignedTo).toBeNull()
    })

    // ── THE CRITICAL TEST — does hydrated incident actually WORK with state methods? ──
    test('CRITICAL: hydrated incident.resolve() correctly decrements assignedTo.activeTaskCount', () => {
        const row = makeRow({
            status: 'IN_PROGRESS',
            assignedTo: { id: 'staff-1', activeTaskCount: 3, staffState: 'ACTIVE', penaltyCount: 0 }
        })
        const incident = repo.toEntity(row)

        expect(incident.assignedTo.activeTaskCount).toBe(3)

        incident.resolve('Fixed the AC unit successfully', 'after-photo.jpg')

        // This only works if assignedTo was hydrated as a real object reference
        // that incident.assignedTo points to — proving toEntity() wired it correctly
        expect(incident.assignedTo.activeTaskCount).toBe(2)
        expect(incident.state.constructor.name).toBe('ResolvedState')
    })
})

describe('IncidentRepository.toDocument', () => {
    test('flattens location object into locationBlock/Room/Floor/Lat/Lng/Desc', () => {
        const row = makeRow()
        const incident = repo.toEntity(row)
        const doc = repo.toDocument(incident)

        expect(doc.locationBlock).toBe('C')
        expect(doc.locationRoom).toBe('C-304')
        expect(doc.locationFloor).toBe(3)
    })

    test('flattens sla object into slaWindowHours/DeadlineAt/IsEscalated/EscalatedAt', () => {
        const row = makeRow()
        const incident = repo.toEntity(row)
        const doc = repo.toDocument(incident)

        expect(doc.slaWindowHours).toBe(4)
        expect(doc.slaDeadlineAt.toISOString()).toBe('2025-06-07T14:00:00.000Z')
        expect(doc.slaIsEscalated).toBe(false)
    })

    test('status comes from incident.state.getName(), not a stored field', () => {
        const row = makeRow({ status: 'OPEN' })
        const incident = repo.toEntity(row)

        // Manually transition state in memory (simulating service-layer logic)
        incident.assignStaff({ id: 'staff-2', activeTaskCount: 0, staffState: 'ACTIVE' })

        const doc = repo.toDocument(incident)
        expect(doc.status).toBe('IN_PROGRESS')  // reflects the NEW state, not the original row
    })

    test('round-trip: toEntity -> toDocument preserves core fields', () => {
        const row = makeRow()
        const incident = repo.toEntity(row)
        const doc = repo.toDocument(incident)

        expect(doc.title).toBe(row.title)
        expect(doc.category).toBe(row.category)
        expect(doc.priority).toBe(row.priority)
        expect(doc.creatorId).toBe(row.creatorId)
        expect(doc.departmentId).toBe(row.departmentId)
    })

    test('CREATE path: incident with no id omits id field entirely', () => {
        const incident = new MaintenanceIncident({
            title: 'New issue',
            description: 'desc',
            priority: 'LOW',
            location: { block: 'A' },
            creatorId: 'student-1',
            departmentId: 'dept-1'
        })
        const doc = repo.toDocument(incident)

        expect(doc.id).toBeUndefined()
    })
})
