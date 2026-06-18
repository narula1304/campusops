// src/domain/entities/User.js
//
// User hierarchy — pure domain, zero framework imports.
// See DOMAIN_MODEL.md Section 2.
//
// PostgreSQL stores all role fields in one User table (nullable per role).
// Domain layer instantiates the correct subclass so role fields are never null.

const UserRole = Object.freeze({
  STUDENT: 'STUDENT',
  FACULTY: 'FACULTY',
  MAINTENANCE: 'MAINTENANCE',
  SECURITY: 'SECURITY',
  ADMIN: 'ADMIN'
})

const StaffState = Object.freeze({
  ACTIVE: 'ACTIVE',
  UNDER_REVIEW: 'UNDER_REVIEW',
  SUSPENDED: 'SUSPENDED'
})

const AdminLevel = Object.freeze({
  HOD: 'HOD',
  DEAN: 'DEAN',
  SUPERADMIN: 'SUPERADMIN'
})

class NotificationPreferences {
  constructor({ realtime = true, email = true, sms = false } = {}) {
    this.realtime = realtime
    this.email = email
    this.sms = sms
  }
}

class Shift {
  constructor({ days = [], start = null, end = null } = {}) {
    this.days = days
    this.start = start
    this.end = end
  }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function parseHHMM(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes()
}

function dayMatches(date, shiftDays) {
  if (!shiftDays || shiftDays.length === 0) return false
  const dayName = DAY_NAMES[date.getDay()]
  const dayShort = DAY_SHORT[date.getDay()]
  return shiftDays.some(
    (d) => d === dayName || d === dayShort || d.toUpperCase() === dayShort
  )
}

function isWithinShiftWindow(time, shiftStart, shiftEnd) {
  const startMins = parseHHMM(shiftStart)
  const endMins = parseHHMM(shiftEnd)
  if (startMins === null || endMins === null) return false

  const nowMins = minutesSinceMidnight(time)

  if (startMins <= endMins) {
    return nowMins >= startMins && nowMins < endMins
  }

  return nowMins >= startMins || nowMins < endMins
}

class User {
  constructor({
    id,
    name,
    email,
    passwordHash,
    role,
    departmentId = null,
    isActive = true,
    notificationPrefs = new NotificationPreferences()
  }) {
    if (new.target === User) {
      throw new TypeError('User is abstract and cannot be instantiated directly')
    }

    this.id = id
    this.name = name
    this.email = email
    this.passwordHash = passwordHash
    this.role = role
    this.departmentId = departmentId
    this.isActive = isActive
    this.notificationPrefs =
      notificationPrefs instanceof NotificationPreferences
        ? notificationPrefs
        : new NotificationPreferences(notificationPrefs)
  }

  canReportIncident() {
    return [UserRole.STUDENT, UserRole.FACULTY, UserRole.ADMIN].includes(this.role)
  }

  canViewDashboard() {
    return [
      UserRole.FACULTY,
      UserRole.MAINTENANCE,
      UserRole.SECURITY,
      UserRole.ADMIN
    ].includes(this.role)
  }

  canAssignIncidents() {
    return this.role === UserRole.ADMIN
  }

  getSocketRooms() {
    const rooms = [`user:${this.id}`, `role:${this.role}`]
    if (this.departmentId) {
      rooms.push(`dept:${this.departmentId}`)
    }
    return rooms
  }
}

class Student extends User {
  constructor({ rollNo, year, batch, ...base }) {
    super({ ...base, role: UserRole.STUDENT })
    this.rollNo = rollNo
    this.year = year
    this.batch = batch
  }

  canTriggerPanic() {
    return true
  }
}

class Faculty extends User {
  constructor({ employeeId, designation, ...base }) {
    super({ ...base, role: UserRole.FACULTY })
    this.employeeId = employeeId
    this.designation = designation
  }

  canMarkHighPriority() {
    return true
  }
}

class MaintenanceStaff extends User {
  constructor({
    employeeId,
    specialization = [],
    activeTaskCount = 0,
    staffState = StaffState.ACTIVE,
    penaltyCount = 0,
    shiftDays = [],
    shiftStart = null,
    shiftEnd = null,
    ...base
  }) {
    super({ ...base, role: UserRole.MAINTENANCE })
    this.employeeId = employeeId
    this.specialization = specialization
    this.activeTaskCount = activeTaskCount
    this.staffState = staffState
    this.penaltyCount = penaltyCount
    this.shiftDays = shiftDays
    this.shiftStart = shiftStart
    this.shiftEnd = shiftEnd
  }

  isOnShift(time) {
    if (this.staffState === StaffState.SUSPENDED) return false
    if (!dayMatches(time, this.shiftDays)) return false
    return isWithinShiftWindow(time, this.shiftStart, this.shiftEnd)
  }

  isAvailableFor(durationHours, fromTime) {
    if (this.staffState !== StaffState.ACTIVE) return false
    if (durationHours <= 0) return this.isOnShift(fromTime)

    const endTime = new Date(fromTime.getTime() + durationHours * 60 * 60 * 1000)
    const CHECK_INTERVAL_MS = 30 * 60 * 1000

    for (let t = fromTime.getTime(); t <= endTime.getTime(); t += CHECK_INTERVAL_MS) {
      if (!this.isOnShift(new Date(t))) return false
    }
    return this.isOnShift(endTime)
  }

  isOnCall(time) {
    if (this.staffState !== StaffState.ACTIVE) return false
    if (!this.isOnShift(time)) return false

    const startMins = parseHHMM(this.shiftStart)
    const endMins = parseHHMM(this.shiftEnd)
    if (startMins === null || endMins === null) return false

    const businessStart = 9 * 60
    const businessEnd = 18 * 60

    const isOnCallShift =
      startMins >= businessEnd || endMins <= businessStart || startMins > endMins

    return isOnCallShift
  }
}

class SecurityOfficer extends User {
  constructor({ employeeId, badgeNumber, zone, shift = new Shift(), ...base }) {
    super({ ...base, role: UserRole.SECURITY })
    this.employeeId = employeeId
    this.badgeNumber = badgeNumber
    this.zone = zone
    this.shift = shift instanceof Shift ? shift : new Shift(shift)
  }

  canBroadcastAlert() {
    return true
  }
}

class Admin extends User {
  constructor({ employeeId, accessLevel, managedDepartmentIds = [], ...base }) {
    super({ ...base, role: UserRole.ADMIN })
    this.employeeId = employeeId
    this.accessLevel = accessLevel
    this.managedDepartmentIds = managedDepartmentIds
  }

  canConfigureStrategies() {
    return true
  }
}

module.exports = {
  User,
  Student,
  Faculty,
  MaintenanceStaff,
  SecurityOfficer,
  Admin,
  UserRole,
  StaffState,
  AdminLevel,
  NotificationPreferences,
  Shift
}
