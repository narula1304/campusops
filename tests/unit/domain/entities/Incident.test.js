// tests/unit/domain/entities/Incident.test.js

const {
  Incident,
  MaintenanceIncident,
  SecurityIncident,
  InfrastructureIncident,
  EmergencyIncident,
  GeneralIncident,
  Location
} = require('../../../../src/domain/entities/Incident')

const IncidentFactory = require('../../../../src/domain/factories/IncidentFactory')

const OpenState = require('../../../../src/domain/states/OpenState')
const InProgressState = require('../../../../src/domain/states/InProgressState')
const ResolvedState = require('../../../../src/domain/states/ResolvedState')
const ReopenedState = require('../../../../src/domain/states/ReopenedState')

const { MaintenanceStaff, Student } = require('../../../../src/domain/entities/User')
const { CriticalSLA } = require('../../../../src/domain/entities/SLAPolicy')
const { InvalidCategoryError, InvalidTransitionError } = require('../../../../src/domain/errors')

function makeStaff(overrides = {}) {
  return new MaintenanceStaff({
    id: 'staff-1',
    name: 'Ravi Kumar',
    email: 'ravi@campus.edu',
    passwordHash: 'hash',
    departmentId: 'dept-electrical',
    employeeId: 'EMP-001',
    activeTaskCount: 2,
    staffState: 'ACTIVE',
    penaltyCount: 0,
    shiftDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    shiftStart: '09:00',
    shiftEnd: '18:00',
    ...overrides
  })
}

function makeStudent(overrides = {}) {
  return new Student({
    id: 'student-1',
    name: 'Arjun Sharma',
    email: 'arjun@college.edu',
    passwordHash: 'hash',
    rollNo: '21CS045',
    year: 3,
    batch: '2021-2025',
    ...overrides
  })
}

describe('Incident abstract base', () => {
  test('cannot be instantiated directly', () => {
    expect(() => new Incident({ title: 'x', description: 'y', priority: 'LOW' }))
      .toThrow(TypeError)
  })

  test('defaults to OpenState when no state is provided', () => {
    const incident = new MaintenanceIncident({
      title: 'AC broken',
      description: 'AC not cooling in lab',
      priority: 'HIGH',
      location: new Location({ block: 'C', room: 'C-304' }),
      creatorId: 'student-1',
      departmentId: 'dept-electrical'
    })
    expect(incident.state).toBeInstanceOf(OpenState)
    expect(incident.getCurrentStatus()).toBe('OPEN')
  })
})

describe('Incident subclasses', () => {
  const baseFields = {
    title: 'Issue',
    description: 'Something is wrong',
    priority: 'MEDIUM',
    location: new Location({ block: 'A', room: 'A-101' }),
    creatorId: 'student-1',
    departmentId: 'dept-1'
  }

  test('MaintenanceIncident is instanceof Incident', () => {
    expect(new MaintenanceIncident(baseFields)).toBeInstanceOf(Incident)
  })

  test('SecurityIncident is instanceof Incident', () => {
    expect(new SecurityIncident(baseFields)).toBeInstanceOf(Incident)
  })

  test('InfrastructureIncident is instanceof Incident', () => {
    expect(new InfrastructureIncident(baseFields)).toBeInstanceOf(Incident)
  })

  test('EmergencyIncident is instanceof Incident', () => {
    expect(new EmergencyIncident(baseFields)).toBeInstanceOf(Incident)
  })

  test('GeneralIncident is instanceof Incident', () => {
    expect(new GeneralIncident(baseFields)).toBeInstanceOf(Incident)
  })

  test('MaintenanceIncident.getEligibleAssignees filters by dept + role + ACTIVE', () => {
    const incident = new MaintenanceIncident({ ...baseFields, departmentId: 'dept-electrical' })
    const eligible = makeStaff({ id: 'staff-ok', departmentId: 'dept-electrical' })
    const wrongDept = makeStaff({ id: 'staff-wrong', departmentId: 'dept-civil' })
    const suspended = makeStaff({ id: 'staff-sus', departmentId: 'dept-electrical', staffState: 'SUSPENDED' })

    const result = incident.getEligibleAssignees([eligible, wrongDept, suspended])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('staff-ok')
  })
})

describe('addToStatusLog and publish', () => {
  test('addToStatusLog appends entries in order with a changedAt timestamp', () => {
    const incident = new MaintenanceIncident({
      title: 'x', description: 'y', priority: 'LOW',
      location: new Location({ block: 'A' }), creatorId: 'student-1', departmentId: 'dept-1'
    })
    incident.addToStatusLog({ status: 'OPEN', note: 'created' })
    incident.addToStatusLog({ status: 'IN_PROGRESS', note: 'assigned' })
    expect(incident.statusLogEntries).toHaveLength(2)
    expect(incident.statusLogEntries[0].status).toBe('OPEN')
    expect(incident.statusLogEntries[1].status).toBe('IN_PROGRESS')
    expect(incident.statusLogEntries[0].changedAt).toBeInstanceOf(Date)
  })

  test('publish records event locally even with no publisher attached', () => {
    const incident = new MaintenanceIncident({
      title: 'x', description: 'y', priority: 'LOW',
      location: new Location({ block: 'A' }), creatorId: 'student-1', departmentId: 'dept-1'
    })
    incident.publish('TEST_EVENT', { foo: 'bar' })
    expect(incident.publishedEvents).toHaveLength(1)
    expect(incident.publishedEvents[0].eventType).toBe('TEST_EVENT')
  })

  test('publish forwards to injected publisher when present', () => {
    const fakePublisher = { publish: jest.fn() }
    const incident = new MaintenanceIncident({
      title: 'x', description: 'y', priority: 'LOW',
      location: new Location({ block: 'A' }), creatorId: 'student-1', departmentId: 'dept-1',
      publisher: fakePublisher
    })
    incident.publish('TEST_EVENT', { foo: 'bar' })
    expect(fakePublisher.publish).toHaveBeenCalledWith('TEST_EVENT', { foo: 'bar' })
  })
})

describe('Full lifecycle — real state classes', () => {
  test('create -> assignStaff -> resolve -> receiveFeedback(2) -> ReopenedState', () => {
    const staff = makeStaff({ activeTaskCount: 2 })
    const incident = new MaintenanceIncident({
      title: 'AC not working',
      description: 'AC has been off for 2 days',
      priority: 'HIGH',
      location: new Location({ block: 'C', room: 'C-304' }),
      creatorId: 'student-1',
      departmentId: 'dept-electrical',
      sla: new CriticalSLA().attachTo(new Date())
    })

    expect(incident.state).toBeInstanceOf(OpenState)

    incident.assignStaff(staff)
    expect(incident.state).toBeInstanceOf(InProgressState)
    expect(incident.assignedToId).toBe(staff.id)
    expect(staff.activeTaskCount).toBe(3)

    incident.resolve('Replaced the faulty capacitor and tested it', 'https://cloudinary/photo.jpg')
    expect(incident.state).toBeInstanceOf(ResolvedState)
    expect(staff.activeTaskCount).toBe(2)

    incident.receiveFeedback({ score: 2, comment: 'Left a mess behind' })
    expect(incident.state).toBeInstanceOf(ReopenedState)
    expect(staff.penaltyCount).toBe(1)

    const statuses = incident.statusLogEntries.map((e) => e.status)
    expect(statuses).toEqual(['IN_PROGRESS', 'RESOLVED', 'REOPENED'])

    const events = incident.publishedEvents.map((e) => e.eventType)
    expect(events).toEqual(['INCIDENT_ASSIGNED', 'INCIDENT_RESOLVED', 'INCIDENT_REOPENED_BY_FEEDBACK'])
  })

  test('invalid transition throws typed error', () => {
    const incident = new MaintenanceIncident({
      title: 'x', description: 'y', priority: 'LOW',
      location: new Location({ block: 'A' }), creatorId: 'student-1', departmentId: 'dept-1'
    })
    expect(() => incident.resolve('a valid resolution note', 'photo.jpg'))
      .toThrow(InvalidTransitionError)
  })
})

describe('IncidentFactory', () => {
  const dto = {
    title: 'AC not working in CS Lab 3',
    description: 'The air conditioner has been off for 2 days',
    category: 'MAINTENANCE',
    priority: 'HIGH',
    location: { block: 'C', room: 'C-304', floor: 3 },
    evidencePhotos: ['https://cloudinary/evidence.jpg'],
    departmentId: 'dept-electrical'
  }

  test('creates correct subclass based on category', () => {
    expect(IncidentFactory.create(dto, makeStudent())).toBeInstanceOf(MaintenanceIncident)
  })

  test('attaches SLA with deadline already computed', () => {
    const createdAt = new Date('2025-06-07T10:00:00.000Z')
    const incident = IncidentFactory.create(dto, makeStudent(), createdAt)
    expect(incident.sla.deadlineAt.toISOString()).toBe('2025-06-07T14:00:00.000Z')
  })

  test('starts in OpenState', () => {
    expect(IncidentFactory.create(dto, makeStudent()).state).toBeInstanceOf(OpenState)
  })

  test('generates incident number in correct format', () => {
    const incident = IncidentFactory.create(dto, makeStudent(), new Date('2025-06-07'))
    expect(incident.incidentNumber).toMatch(/^INC-2025-\d{6}$/)
  })

  test('throws InvalidCategoryError for unknown category', () => {
    expect(() => IncidentFactory.create({ ...dto, category: 'NOT_REAL' }, makeStudent()))
      .toThrow(InvalidCategoryError)
  })

  test('EMERGENCY creates EmergencyIncident', () => {
    expect(IncidentFactory.create({ ...dto, category: 'EMERGENCY' }, makeStudent()))
      .toBeInstanceOf(EmergencyIncident)
  })

  test('CLEANLINESS reuses MaintenanceIncident', () => {
    expect(IncidentFactory.create({ ...dto, category: 'CLEANLINESS' }, makeStudent()))
      .toBeInstanceOf(MaintenanceIncident)
  })
})