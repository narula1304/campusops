// tests/unit/infrastructure/repositories/DepartmentRepository.test.js
//
// Unit tests for DepartmentRepository.
// Mocks the Prisma module entirely — no real database connection.
//
// Style follows tests/unit/infrastructure/repositories/IncidentRepository.test.js

jest.mock('../../../../src/infrastructure/db/prisma', () => ({
    department: {
        findUnique: jest.fn(),
    },
    user: {
        findMany: jest.fn(),
    },
}))

const DepartmentRepository = require('../../../../src/infrastructure/repositories/DepartmentRepository')
const { MaintenanceStaff, SecurityOfficer } = require('../../../../src/domain/entities/User')
const { LeastLoadedStrategy } = require('../../../../src/domain/strategies/AssignmentStrategy')

// Pull the mocked Prisma instance so tests can control its return values
const prisma = require('../../../../src/infrastructure/db/prisma')

const repo = new DepartmentRepository()

// ── Fake row builders ──────────────────────────────────────────────────────────

function makeDeptRow(overrides = {}) {
    return {
        id:                 'dept-electrical',
        name:               'Electrical',
        code:               'ELEC',
        assignmentStrategy: 'LEAST_LOADED',
        roundRobinIndex:    0,
        headFacultyId:      null,
        createdAt:          new Date('2025-01-01T00:00:00.000Z'),
        updatedAt:          new Date('2025-06-01T00:00:00.000Z'),
        ...overrides,
    }
}

/**
 * Minimal Prisma User row for a MAINTENANCE staff member.
 * All columns that DepartmentRepository._toEntity() reads must be present.
 */
function makeMaintenanceRow(overrides = {}) {
    return {
        id:             'staff-1',
        name:           'Ravi Kumar',
        email:          'ravi@campus.edu',
        passwordHash:   '$2b$10$hashedpassword',
        role:           'MAINTENANCE',
        departmentId:   'dept-electrical',
        isActive:       true,
        employeeId:     'EMP-001',
        specialization: ['Electrical', 'HVAC'],
        activeTaskCount:2,
        staffState:     'ACTIVE',
        penaltyCount:   0,
        shiftDays:      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        shiftStart:     '09:00',
        shiftEnd:       '18:00',
        badgeNumber:    null,
        zone:           null,
        prefRealtime:   true,
        prefEmail:      true,
        prefSms:        false,
        ...overrides,
    }
}

/**
 * Minimal Prisma User row for a SECURITY officer.
 */
function makeSecurityRow(overrides = {}) {
    return {
        id:             'officer-1',
        name:           'Suresh Kumar',
        email:          'suresh@campus.edu',
        passwordHash:   '$2b$10$hashedpassword',
        role:           'SECURITY',
        departmentId:   null,    // security officers are campus-wide
        isActive:       true,
        employeeId:     'SEC-001',
        specialization: [],
        activeTaskCount:1,
        staffState:     'ACTIVE',
        penaltyCount:   0,
        shiftDays:      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        shiftStart:     '08:00',
        shiftEnd:       '20:00',
        badgeNumber:    'B-404',
        zone:           'Block-D',
        prefRealtime:   true,
        prefEmail:      false,
        prefSms:        true,
        ...overrides,
    }
}

// ── findById ───────────────────────────────────────────────────────────────────

describe('DepartmentRepository.findById()', () => {
    beforeEach(() => jest.clearAllMocks())

    test('returns the department row when found', async () => {
        const deptRow = makeDeptRow()
        prisma.department.findUnique.mockResolvedValue(deptRow)

        const result = await repo.findById('dept-electrical')

        expect(result).toEqual(deptRow)
    })

    test('returns null when not found', async () => {
        prisma.department.findUnique.mockResolvedValue(null)

        const result = await repo.findById('nonexistent-id')

        expect(result).toBeNull()
    })

    test('calls prisma.department.findUnique with the correct id', async () => {
        prisma.department.findUnique.mockResolvedValue(makeDeptRow())

        await repo.findById('dept-civil')

        expect(prisma.department.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'dept-civil' } })
        )
    })

    test('returned object includes all required department fields', async () => {
        prisma.department.findUnique.mockResolvedValue(makeDeptRow())

        const result = await repo.findById('dept-electrical')

        expect(result).toMatchObject({
            id:                 expect.any(String),
            name:               expect.any(String),
            code:               expect.any(String),
            assignmentStrategy: expect.any(String),
            roundRobinIndex:    expect.any(Number),
        })
    })
})

// ── findEligibleStaff — query filter behaviour ─────────────────────────────────

describe('DepartmentRepository.findEligibleStaff() — query filters', () => {
    beforeEach(() => jest.clearAllMocks())

    test('MAINTENANCE category: queries with role MAINTENANCE and filters by departmentId', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        expect(prisma.user.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    role:         'MAINTENANCE',
                    departmentId: 'dept-electrical',
                }),
            })
        )
    })

    test('CLEANLINESS category: queries with role MAINTENANCE (same as MAINTENANCE category)', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-housekeeping', 'CLEANLINESS')

        expect(prisma.user.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ role: 'MAINTENANCE' }),
            })
        )
    })

    test('INFRASTRUCTURE category: queries with role MAINTENANCE and filters by departmentId', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-civil', 'INFRASTRUCTURE')

        expect(prisma.user.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    role:         'MAINTENANCE',
                    departmentId: 'dept-civil',
                }),
            })
        )
    })

    test('SECURITY category: queries with role SECURITY', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-security', 'SECURITY')

        expect(prisma.user.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ role: 'SECURITY' }),
            })
        )
    })

    test('SECURITY category: does NOT filter by departmentId (campus-wide)', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-security', 'SECURITY')

        const whereUsed = prisma.user.findMany.mock.calls[0][0].where
        expect(whereUsed).not.toHaveProperty('departmentId')
    })

    test('EMERGENCY category: queries with role SECURITY (same mapping as SECURITY)', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-any', 'EMERGENCY')

        expect(prisma.user.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ role: 'SECURITY' }),
            })
        )
    })

    test('EMERGENCY category: does NOT filter by departmentId', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-any', 'EMERGENCY')

        const whereUsed = prisma.user.findMany.mock.calls[0][0].where
        expect(whereUsed).not.toHaveProperty('departmentId')
    })

    test('OTHER category: issues two separate queries (MAINTENANCE + SECURITY)', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-any', 'OTHER')

        // Two parallel queries are fired — one per role cohort
        expect(prisma.user.findMany).toHaveBeenCalledTimes(2)
        const roles = prisma.user.findMany.mock.calls.map((call) => call[0].where.role)
        expect(roles).toContain('MAINTENANCE')
        expect(roles).toContain('SECURITY')
    })

    test('OTHER category: MAINTENANCE sub-query is scoped to departmentId', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-civil', 'OTHER')

        const maintenanceCall = prisma.user.findMany.mock.calls.find(
            (call) => call[0].where.role === 'MAINTENANCE'
        )
        expect(maintenanceCall[0].where.departmentId).toBe('dept-civil')
    })

    test('OTHER category: SECURITY sub-query does NOT filter by departmentId', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-any', 'OTHER')

        const securityCall = prisma.user.findMany.mock.calls.find(
            (call) => call[0].where.role === 'SECURITY'
        )
        expect(securityCall[0].where).not.toHaveProperty('departmentId')
    })

    test('excludes staffState SUSPENDED from the query filter', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        const whereUsed = prisma.user.findMany.mock.calls[0][0].where
        expect(whereUsed.staffState).toEqual({ not: 'SUSPENDED' })
    })

    test('does NOT exclude staffState UNDER_REVIEW from the query filter', async () => {
        prisma.user.findMany.mockResolvedValue([])

        await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        const whereUsed = prisma.user.findMany.mock.calls[0][0].where
        // The filter must be { not: 'SUSPENDED' } — not { in: ['ACTIVE'] } or similar
        expect(whereUsed.staffState).not.toEqual({ in: ['ACTIVE'] })
        expect(whereUsed.staffState).not.toBe('ACTIVE')
        // Explicitly confirm UNDER_REVIEW is NOT excluded
        // staffState: { not: 'SUSPENDED' } passes ACTIVE and UNDER_REVIEW through
        expect(whereUsed.staffState).toEqual(expect.objectContaining({ not: 'SUSPENDED' }))
    })

    test('returns an empty array when no rows match', async () => {
        prisma.user.findMany.mockResolvedValue([])

        const result = await repo.findEligibleStaff('dept-empty', 'MAINTENANCE')

        expect(result).toEqual([])
    })
})

// ── findEligibleStaff — domain hydration ──────────────────────────────────────

describe('DepartmentRepository.findEligibleStaff() — domain hydration', () => {
    beforeEach(() => jest.clearAllMocks())

    test('maps a MAINTENANCE row to a real MaintenanceStaff instance', async () => {
        prisma.user.findMany.mockResolvedValue([makeMaintenanceRow()])

        const results = await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        expect(results[0]).toBeInstanceOf(MaintenanceStaff)
    })

    test('maps a SECURITY row to a real SecurityOfficer instance', async () => {
        prisma.user.findMany.mockResolvedValue([makeSecurityRow()])

        const results = await repo.findEligibleStaff('dept-any', 'SECURITY')

        expect(results[0]).toBeInstanceOf(SecurityOfficer)
    })

    test('MaintenanceStaff has correct scalar fields populated from the row', async () => {
        const row = makeMaintenanceRow({
            id:             'staff-42',
            name:           'Ankit Sharma',
            activeTaskCount: 5,
            staffState:     'UNDER_REVIEW',
            penaltyCount:   2,
            specialization: ['Plumbing'],
            shiftStart:     '07:00',
            shiftEnd:       '15:00',
        })
        prisma.user.findMany.mockResolvedValue([row])

        const [staff] = await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        expect(staff.id).toBe('staff-42')
        expect(staff.name).toBe('Ankit Sharma')
        expect(staff.activeTaskCount).toBe(5)
        expect(staff.staffState).toBe('UNDER_REVIEW')
        expect(staff.penaltyCount).toBe(2)
        expect(staff.specialization).toEqual(['Plumbing'])
        expect(staff.shiftStart).toBe('07:00')
        expect(staff.shiftEnd).toBe('15:00')
        expect(staff.employeeId).toBe('EMP-001')
    })

    test('MaintenanceStaff.shiftDays is populated so shift-checking methods work', async () => {
        const row = makeMaintenanceRow({
            shiftDays: ['Monday', 'Wednesday', 'Friday'],
            shiftStart: '09:00',
            shiftEnd:   '17:00',
        })
        prisma.user.findMany.mockResolvedValue([row])

        const [staff] = await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        expect(staff.shiftDays).toEqual(['Monday', 'Wednesday', 'Friday'])
        // isOnShift is callable — proves the method was correctly inherited
        expect(typeof staff.isOnShift).toBe('function')
    })

    test('SecurityOfficer has correct fields including activeTaskCount attached post-construction', async () => {
        const row = makeSecurityRow({
            id:             'officer-99',
            name:           'Raj Singh',
            activeTaskCount: 3,
            staffState:     'ACTIVE',
            penaltyCount:   1,
            badgeNumber:    'B-777',
            zone:           'Block-A',
        })
        prisma.user.findMany.mockResolvedValue([row])

        const [officer] = await repo.findEligibleStaff('dept-any', 'SECURITY')

        expect(officer).toBeInstanceOf(SecurityOfficer)
        expect(officer.id).toBe('officer-99')
        expect(officer.name).toBe('Raj Singh')
        expect(officer.activeTaskCount).toBe(3)  // attached after construction
        expect(officer.staffState).toBe('ACTIVE')
        expect(officer.penaltyCount).toBe(1)
        expect(officer.badgeNumber).toBe('B-777')
        expect(officer.zone).toBe('Block-A')
    })

    test('SecurityOfficer.shift value object is reconstructed from flat DB columns', async () => {
        const row = makeSecurityRow({
            shiftDays:  ['Saturday', 'Sunday'],
            shiftStart: '22:00',
            shiftEnd:   '06:00',
        })
        prisma.user.findMany.mockResolvedValue([row])

        const [officer] = await repo.findEligibleStaff('dept-any', 'SECURITY')

        expect(officer.shift.days).toEqual(['Saturday', 'Sunday'])
        expect(officer.shift.start).toBe('22:00')
        expect(officer.shift.end).toBe('06:00')
    })

    test('MaintenanceStaff notification preferences are mapped from prefRealtime/Email/Sms', async () => {
        const row = makeMaintenanceRow({ prefRealtime: false, prefEmail: true, prefSms: true })
        prisma.user.findMany.mockResolvedValue([row])

        const [staff] = await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        expect(staff.notificationPrefs.realtime).toBe(false)
        expect(staff.notificationPrefs.email).toBe(true)
        expect(staff.notificationPrefs.sms).toBe(true)
    })

    test('null shift fields default to empty array / null on MaintenanceStaff', async () => {
        const row = makeMaintenanceRow({ shiftDays: null, shiftStart: null, shiftEnd: null })
        prisma.user.findMany.mockResolvedValue([row])

        const [staff] = await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        expect(staff.shiftDays).toEqual([])
        expect(staff.shiftStart).toBeNull()
        expect(staff.shiftEnd).toBeNull()
    })

    test('null shift fields on SecurityOfficer produce an empty Shift object', async () => {
        const row = makeSecurityRow({ shiftDays: null, shiftStart: null, shiftEnd: null })
        prisma.user.findMany.mockResolvedValue([row])

        const [officer] = await repo.findEligibleStaff('dept-any', 'SECURITY')

        expect(officer.shift.days).toEqual([])
        expect(officer.shift.start).toBeNull()
        expect(officer.shift.end).toBeNull()
    })

    test('OTHER category: merges MAINTENANCE and SECURITY rows into one array', async () => {
        const mainRow = makeMaintenanceRow({ id: 'staff-1' })
        const secRow  = makeSecurityRow({ id: 'officer-1' })

        // findMany called twice — first call returns maintenance, second returns security
        prisma.user.findMany
            .mockResolvedValueOnce([mainRow])
            .mockResolvedValueOnce([secRow])

        const results = await repo.findEligibleStaff('dept-any', 'OTHER')

        expect(results).toHaveLength(2)
        expect(results.some((s) => s instanceof MaintenanceStaff)).toBe(true)
        expect(results.some((s) => s instanceof SecurityOfficer)).toBe(true)
    })

    // ── CRITICAL integration test ──────────────────────────────────────────────
    // Proves that the hydrated MaintenanceStaff instances are genuinely usable
    // domain objects — not just shapes that "look right" — by passing them
    // directly into LeastLoadedStrategy.assign() without any transformation.
    //
    // LeastLoadedStrategy.assign():
    //   1. Filters: s.staffState === 'ACTIVE' && this._isOnShiftNow(s)
    //   2. _isOnShiftNow calls staff.isOnShift(new Date()) — a real method on
    //      MaintenanceStaff that reads shiftDays/shiftStart/shiftEnd.
    //   3. Sorts by activeTaskCount ascending and returns the first.
    //
    // For this test we use shiftDays = all 7 days and shiftStart/shiftEnd = '00:00'/'23:59'
    // so isOnShift(now) always returns true regardless of when the test runs.

    test('CRITICAL: hydrated MaintenanceStaff works directly with LeastLoadedStrategy.assign()', async () => {
        const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

        const rows = [
            makeMaintenanceRow({ id: 'staff-high-load', activeTaskCount: 8,  shiftDays: ALL_DAYS, shiftStart: '00:00', shiftEnd: '23:59', staffState: 'ACTIVE' }),
            makeMaintenanceRow({ id: 'staff-low-load',  activeTaskCount: 2,  shiftDays: ALL_DAYS, shiftStart: '00:00', shiftEnd: '23:59', staffState: 'ACTIVE' }),
            makeMaintenanceRow({ id: 'staff-mid-load',  activeTaskCount: 5,  shiftDays: ALL_DAYS, shiftStart: '00:00', shiftEnd: '23:59', staffState: 'ACTIVE' }),
        ]
        prisma.user.findMany.mockResolvedValue(rows)

        const staffPool = await repo.findEligibleStaff('dept-electrical', 'MAINTENANCE')

        // All three must be real MaintenanceStaff instances
        staffPool.forEach((s) => expect(s).toBeInstanceOf(MaintenanceStaff))

        const strategy = new LeastLoadedStrategy()
        const fakeIncident = { departmentId: 'dept-electrical' }

        // strategy.assign must not throw — it calls staff.isOnShift(new Date())
        // which is a real method that needs shiftDays/shiftStart/shiftEnd to work
        const selected = strategy.assign(fakeIncident, staffPool)

        // LeastLoadedStrategy picks the staff member with the lowest activeTaskCount
        expect(selected.id).toBe('staff-low-load')
        expect(selected.activeTaskCount).toBe(2)
    })
})
