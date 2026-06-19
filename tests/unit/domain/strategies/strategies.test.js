// tests/unit/domain/strategies/strategies.test.js
//
// Pure domain unit tests — no database, no framework.
// Strategies operate on plain objects that match the shape of
// MaintenanceStaff / SecurityOfficer — no real class instances needed
// for most tests (except ShiftAware, which calls isAvailableFor/isOnCall).

const {
    LeastLoadedStrategy,
    RoundRobinStrategy,
    ShiftAwareStrategy,
    ManualStrategy,
    StrategyFactory
} = require('../../../../src/domain/strategies/AssignmentStrategy')

const { MaintenanceStaff } = require('../../../../src/domain/entities/User')

const {
    NoStaffAvailableError,
    StaffNotEligibleError,
    StaffUnavailableError
} = require('../../../../src/domain/errors')

// ── Helpers ──

function makeIncident(overrides = {}) {
    return {
        departmentId: 'dept-electrical',
        sla: { windowHours: 4 },
        ...overrides
    }
}

// Plain object staff — fine for strategies that don't call isOnShift/isAvailableFor
function makeStaff(overrides = {}) {
    return {
        id: 'staff-1',
        staffState: 'ACTIVE',
        activeTaskCount: 2,
        departmentId: 'dept-electrical',
        isOnShift: () => true,
        isAvailableFor: () => true,
        isOnCall: () => false,
        ...overrides
    }
}

// Real MaintenanceStaff instance — needed for ShiftAware tests
function makeRealStaff(overrides = {}) {
    return new MaintenanceStaff({
        id: 'staff-real',
        name: 'Ravi Kumar',
        email: 'ravi@campus.edu',
        passwordHash: 'hash',
        departmentId: 'dept-electrical',
        employeeId: 'EMP-001',
        activeTaskCount: 2,
        staffState: 'ACTIVE',
        penaltyCount: 0,
        shiftDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        shiftStart: '00:00',
        shiftEnd: '23:59',
        ...overrides
    })
}

// ── LeastLoadedStrategy ──

describe('LeastLoadedStrategy', () => {
    const strategy = new LeastLoadedStrategy()
    const incident = makeIncident()

    test('picks the staff member with the lowest activeTaskCount', () => {
        const staff = [
            makeStaff({ id: 'a', activeTaskCount: 5 }),
            makeStaff({ id: 'b', activeTaskCount: 1 }),
            makeStaff({ id: 'c', activeTaskCount: 3 })
        ]
        expect(strategy.assign(incident, staff).id).toBe('b')
    })

    test('ignores UNDER_REVIEW staff even if they have the lowest task count', () => {
        const staff = [
            makeStaff({ id: 'under-review', activeTaskCount: 0, staffState: 'UNDER_REVIEW' }),
            makeStaff({ id: 'active', activeTaskCount: 3, staffState: 'ACTIVE' })
        ]
        expect(strategy.assign(incident, staff).id).toBe('active')
    })

    test('ignores SUSPENDED staff', () => {
        const staff = [
            makeStaff({ id: 'suspended', activeTaskCount: 0, staffState: 'SUSPENDED' }),
            makeStaff({ id: 'active', activeTaskCount: 5, staffState: 'ACTIVE' })
        ]
        expect(strategy.assign(incident, staff).id).toBe('active')
    })

    test('ignores off-shift staff', () => {
        const staff = [
            makeStaff({ id: 'off-shift', activeTaskCount: 0, isOnShift: () => false }),
            makeStaff({ id: 'on-shift', activeTaskCount: 3, isOnShift: () => true })
        ]
        expect(strategy.assign(incident, staff).id).toBe('on-shift')
    })

    test('throws NoStaffAvailableError when no eligible staff remain', () => {
        const staff = [
            makeStaff({ staffState: 'SUSPENDED' }),
            makeStaff({ staffState: 'UNDER_REVIEW' })
        ]
        expect(() => strategy.assign(incident, staff)).toThrow(NoStaffAvailableError)
    })

    test('throws NoStaffAvailableError when staff list is empty', () => {
        expect(() => strategy.assign(incident, [])).toThrow(NoStaffAvailableError)
    })

    test('when tied on task count, returns the first in the original order', () => {
        const staff = [
            makeStaff({ id: 'first', activeTaskCount: 2 }),
            makeStaff({ id: 'second', activeTaskCount: 2 })
        ]
        expect(strategy.assign(incident, staff).id).toBe('first')
    })
})

// ── RoundRobinStrategy ──

describe('RoundRobinStrategy', () => {
    const strategy = new RoundRobinStrategy()
    const incident = makeIncident()

    test('cycles through active staff in order', () => {
        const dept = { roundRobinIndex: 0 }
        const staff = [
            makeStaff({ id: 'a' }),
            makeStaff({ id: 'b' }),
            makeStaff({ id: 'c' })
        ]

        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('a')
        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('b')
        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('c')
        // Wraps back to start
        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('a')
    })

    test('advances roundRobinIndex on the department object after each call', () => {
        const dept = { roundRobinIndex: 0 }
        const staff = [makeStaff({ id: 'a' }), makeStaff({ id: 'b' })]
        strategy.assign(incident, staff, { department: dept })
        expect(dept.roundRobinIndex).toBe(1)
    })

    test('skips SUSPENDED and UNDER_REVIEW staff', () => {
        const dept = { roundRobinIndex: 0 }
        const staff = [
            makeStaff({ id: 'active-1', staffState: 'ACTIVE' }),
            makeStaff({ id: 'suspended', staffState: 'SUSPENDED' }),
            makeStaff({ id: 'active-2', staffState: 'ACTIVE' })
        ]
        // Only 2 active staff — should cycle between them
        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('active-1')
        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('active-2')
        expect(strategy.assign(incident, staff, { department: dept }).id).toBe('active-1')
    })

    test('throws NoStaffAvailableError with no active staff', () => {
        const dept = { roundRobinIndex: 0 }
        expect(() =>
            strategy.assign(incident, [makeStaff({ staffState: 'SUSPENDED' })], { department: dept })
        ).toThrow(NoStaffAvailableError)
    })

    test('throws if department option is missing', () => {
        expect(() => strategy.assign(incident, [makeStaff()])).toThrow(Error)
    })
})

// ── ShiftAwareStrategy ──

describe('ShiftAwareStrategy', () => {
    const strategy = new ShiftAwareStrategy()
    const incident = makeIncident()

    test('picks staff available for the full SLA window (uses real isAvailableFor)', () => {
        // Real MaintenanceStaff — shift covers all 7 days, 00:00-23:59
        const staff = makeRealStaff({ id: 'always-available', activeTaskCount: 3 })
        const result = strategy.assign(incident, [staff])
        expect(result.id).toBe('always-available')
    })

    test('skips staff whose shift does not cover the SLA window', () => {
        // Staff with shift that won't cover an SLA window (very narrow window trick)
        const unavailableStaff = makeStaff({
            id: 'unavailable',
            isAvailableFor: () => false,
            isOnCall: () => false
        })
        const availableStaff = makeStaff({
            id: 'available',
            isAvailableFor: () => true,
            activeTaskCount: 5
        })
        expect(strategy.assign(incident, [unavailableStaff, availableStaff]).id).toBe('available')
    })

    test('falls back to on-call staff when no shift-covering staff is found', () => {
        const unavailable = makeStaff({ id: 'off-shift', isAvailableFor: () => false, isOnCall: () => false })
        const onCall = makeStaff({ id: 'on-call', isAvailableFor: () => false, isOnCall: () => true })
        expect(strategy.assign(incident, [unavailable, onCall]).id).toBe('on-call')
    })

    test('throws NoStaffAvailableError when neither shift-covering nor on-call exist', () => {
        const staff = [makeStaff({ isAvailableFor: () => false, isOnCall: () => false })]
        expect(() => strategy.assign(incident, staff)).toThrow(NoStaffAvailableError)
    })

    test('among shift-covering staff, picks the one with lowest task count', () => {
        const staff = [
            makeStaff({ id: 'high-load', activeTaskCount: 8, isAvailableFor: () => true }),
            makeStaff({ id: 'low-load', activeTaskCount: 1, isAvailableFor: () => true })
        ]
        expect(strategy.assign(incident, staff).id).toBe('low-load')
    })
})

// ── ManualStrategy ──

describe('ManualStrategy', () => {
    const strategy = new ManualStrategy()
    const incident = makeIncident()

    test('returns the staff member matching targetStaffId', () => {
        const staff = [
            makeStaff({ id: 'staff-a' }),
            makeStaff({ id: 'staff-b' })
        ]
        expect(strategy.assign(incident, staff, { targetStaffId: 'staff-b' }).id).toBe('staff-b')
    })

    test('throws StaffNotEligibleError when targetStaffId is not in eligibleStaff', () => {
        const staff = [makeStaff({ id: 'staff-a' })]
        expect(() =>
            strategy.assign(incident, staff, { targetStaffId: 'non-existent' })
        ).toThrow(StaffNotEligibleError)
    })

    test('throws StaffUnavailableError when target staff is UNDER_REVIEW', () => {
        const staff = [makeStaff({ id: 'staff-a', staffState: 'UNDER_REVIEW' })]
        expect(() =>
            strategy.assign(incident, staff, { targetStaffId: 'staff-a' })
        ).toThrow(StaffUnavailableError)
    })

    test('throws StaffUnavailableError when target staff is SUSPENDED', () => {
        const staff = [makeStaff({ id: 'staff-a', staffState: 'SUSPENDED' })]
        expect(() =>
            strategy.assign(incident, staff, { targetStaffId: 'staff-a' })
        ).toThrow(StaffUnavailableError)
    })

    test('throws if targetStaffId option is missing', () => {
        expect(() => strategy.assign(incident, [makeStaff()])).toThrow(Error)
    })
})

// ── StrategyFactory ──

describe('StrategyFactory', () => {
    test('creates LeastLoadedStrategy for LEAST_LOADED', () => {
        expect(StrategyFactory.create('LEAST_LOADED')).toBeInstanceOf(LeastLoadedStrategy)
    })

    test('creates RoundRobinStrategy for ROUND_ROBIN', () => {
        expect(StrategyFactory.create('ROUND_ROBIN')).toBeInstanceOf(RoundRobinStrategy)
    })

    test('creates ShiftAwareStrategy for SHIFT_AWARE', () => {
        expect(StrategyFactory.create('SHIFT_AWARE')).toBeInstanceOf(ShiftAwareStrategy)
    })

    test('creates ManualStrategy for MANUAL', () => {
        expect(StrategyFactory.create('MANUAL')).toBeInstanceOf(ManualStrategy)
    })

    test('falls back to LeastLoadedStrategy for unknown strategy name', () => {
        expect(StrategyFactory.create('UNKNOWN')).toBeInstanceOf(LeastLoadedStrategy)
    })

    test('validStrategies() returns all 4 known strategy names', () => {
        const names = StrategyFactory.validStrategies()
        expect(names).toContain('LEAST_LOADED')
        expect(names).toContain('ROUND_ROBIN')
        expect(names).toContain('SHIFT_AWARE')
        expect(names).toContain('MANUAL')
        expect(names).toHaveLength(4)
    })
})