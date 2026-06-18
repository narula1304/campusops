// tests/unit/domain/entities/User.test.js
//
// Pure domain unit tests — NO database, NO server.

const {
  Student,
  Faculty,
  MaintenanceStaff,
  SecurityOfficer,
  Admin,
  UserRole,
  StaffState,
  AdminLevel,
  Shift
} = require('../../../../src/domain/entities/User')

function makeBaseUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@campus.edu',
    passwordHash: 'hashed-password',
    departmentId: 'dept-1',
    ...overrides
  }
}

function makeMaintenanceStaff(overrides = {}) {
  return new MaintenanceStaff({
    ...makeBaseUser(),
    employeeId: 'EMP-001',
    specialization: ['electrical'],
    activeTaskCount: 2,
    staffState: StaffState.ACTIVE,
    penaltyCount: 0,
    shiftDays: ['Monday'],
    shiftStart: '09:00',
    shiftEnd: '17:00',
    ...overrides
  })
}

// 2026-06-15 is a Monday; 2026-06-16 is a Tuesday
const MONDAY_10AM = new Date(2026, 5, 15, 10, 0, 0)
const MONDAY_8AM = new Date(2026, 5, 15, 8, 0, 0)
const MONDAY_6PM = new Date(2026, 5, 15, 18, 0, 0)
const TUESDAY_10AM = new Date(2026, 5, 16, 10, 0, 0)
const MONDAY_11PM = new Date(2026, 5, 15, 23, 0, 0)

describe('User subclasses — instantiation', () => {
  test('Student stores rollNo, year, and batch', () => {
    const student = new Student({
      ...makeBaseUser(),
      rollNo: 'CS2024001',
      year: 2,
      batch: '2024'
    })

    expect(student.role).toBe(UserRole.STUDENT)
    expect(student.rollNo).toBe('CS2024001')
    expect(student.year).toBe(2)
    expect(student.batch).toBe('2024')
  })

  test('Faculty stores employeeId and designation', () => {
    const faculty = new Faculty({
      ...makeBaseUser(),
      employeeId: 'FAC-101',
      designation: 'Assistant Professor'
    })

    expect(faculty.role).toBe(UserRole.FACULTY)
    expect(faculty.employeeId).toBe('FAC-101')
    expect(faculty.designation).toBe('Assistant Professor')
  })

  test('MaintenanceStaff stores shift and workload fields', () => {
    const staff = makeMaintenanceStaff({
      specialization: ['electrical', 'plumbing'],
      activeTaskCount: 3,
      staffState: StaffState.ACTIVE,
      penaltyCount: 1
    })

    expect(staff.role).toBe(UserRole.MAINTENANCE)
    expect(staff.employeeId).toBe('EMP-001')
    expect(staff.specialization).toEqual(['electrical', 'plumbing'])
    expect(staff.activeTaskCount).toBe(3)
    expect(staff.staffState).toBe(StaffState.ACTIVE)
    expect(staff.penaltyCount).toBe(1)
    expect(staff.shiftDays).toEqual(['Monday'])
    expect(staff.shiftStart).toBe('09:00')
    expect(staff.shiftEnd).toBe('17:00')
  })

  test('SecurityOfficer stores badgeNumber, zone, and shift', () => {
    const shift = new Shift({
      days: ['Monday', 'Tuesday'],
      start: '08:00',
      end: '20:00'
    })

    const officer = new SecurityOfficer({
      ...makeBaseUser(),
      employeeId: 'SEC-007',
      badgeNumber: 'BADGE-42',
      zone: 'North Campus',
      shift
    })

    expect(officer.role).toBe(UserRole.SECURITY)
    expect(officer.employeeId).toBe('SEC-007')
    expect(officer.badgeNumber).toBe('BADGE-42')
    expect(officer.zone).toBe('North Campus')
    expect(officer.shift).toBe(shift)
    expect(officer.shift.start).toBe('08:00')
  })

  test('Admin stores accessLevel and managedDepartmentIds', () => {
    const admin = new Admin({
      ...makeBaseUser(),
      employeeId: 'ADM-001',
      accessLevel: AdminLevel.HOD,
      managedDepartmentIds: ['dept-1', 'dept-2']
    })

    expect(admin.role).toBe(UserRole.ADMIN)
    expect(admin.employeeId).toBe('ADM-001')
    expect(admin.accessLevel).toBe(AdminLevel.HOD)
    expect(admin.managedDepartmentIds).toEqual(['dept-1', 'dept-2'])
  })
})

describe('Student', () => {
  test('canTriggerPanic() returns true', () => {
    const student = new Student({ ...makeBaseUser(), rollNo: 'CS1', year: 1, batch: '2025' })
    expect(student.canTriggerPanic()).toBe(true)
  })

  test('canAssignIncidents() returns false', () => {
    const student = new Student({ ...makeBaseUser(), rollNo: 'CS1', year: 1, batch: '2025' })
    expect(student.canAssignIncidents()).toBe(false)
  })
})

describe('Admin', () => {
  test('canConfigureStrategies() returns true', () => {
    const admin = new Admin({
      ...makeBaseUser(),
      employeeId: 'ADM-001',
      accessLevel: AdminLevel.SUPERADMIN,
      managedDepartmentIds: []
    })

    expect(admin.canConfigureStrategies()).toBe(true)
  })
})

describe('MaintenanceStaff.isOnShift', () => {
  test('returns true when day and time fall within the configured shift', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isOnShift(MONDAY_10AM)).toBe(true)
  })

  test('returns false when the day is not in shiftDays', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isOnShift(TUESDAY_10AM)).toBe(false)
  })

  test('returns false when the time is before shiftStart', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isOnShift(MONDAY_8AM)).toBe(false)
  })

  test('returns false when the time is at or after shiftEnd', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isOnShift(MONDAY_6PM)).toBe(false)
  })
})

describe('MaintenanceStaff.isAvailableFor', () => {
  test('returns true when the full duration stays within the shift window', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isAvailableFor(2, MONDAY_10AM)).toBe(true)
  })

  test('returns false when the duration would extend past shiftEnd', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isAvailableFor(8, MONDAY_10AM)).toBe(false)
  })

  test('returns false when fromTime is outside the shift', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isAvailableFor(1, MONDAY_8AM)).toBe(false)
  })

  test('returns false when fromTime is on a non-shift day', () => {
    const staff = makeMaintenanceStaff()
    expect(staff.isAvailableFor(1, TUESDAY_10AM)).toBe(false)
  })
})

describe('MaintenanceStaff.isOnCall', () => {
  test('returns true for an overnight 22:00–06:00 shift while on duty', () => {
    const staff = makeMaintenanceStaff({
      shiftDays: ['Monday', 'Tuesday'],
      shiftStart: '22:00',
      shiftEnd: '06:00'
    })

    expect(staff.isOnShift(MONDAY_11PM)).toBe(true)
    expect(staff.isOnCall(MONDAY_11PM)).toBe(true)
  })

  test('returns false for a standard 09:00–17:00 day shift', () => {
    const staff = makeMaintenanceStaff({
      shiftDays: ['Monday'],
      shiftStart: '09:00',
      shiftEnd: '17:00'
    })

    expect(staff.isOnShift(MONDAY_10AM)).toBe(true)
    expect(staff.isOnCall(MONDAY_10AM)).toBe(false)
  })
})
