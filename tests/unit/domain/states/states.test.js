// tests/unit/domain/states/states.test.js
//
// Pure domain unit tests — NO database, NO server.
// This is what "the domain layer has zero framework dependency" looks like
// in practice: these tests run in milliseconds with `npm test`.

const OpenState = require('../../../../src/domain/states/OpenState')
const InProgressState = require('../../../../src/domain/states/InProgressState')
const ResolvedState = require('../../../../src/domain/states/ResolvedState')
const ReopenedState = require('../../../../src/domain/states/ReopenedState')
const EscalatedState = require('../../../../src/domain/states/EscalatedState')
const {
  InvalidTransitionError,
  StaffUnavailableError,
  ResolutionPhotoRequiredError,
  ResolutionNoteTooShortError
} = require('../../../../src/domain/errors')

// Minimal fake incident — just enough surface area for the state classes
function makeIncident(overrides = {}) {
  const incident = {
    assignedToId: null,
    assignedTo: null,
    sla: { isEscalated: false },
    feedback: null,
    statusLogEntries: [],
    publishedEvents: [],
    addToStatusLog(entry) { this.statusLogEntries.push(entry) },
    setState(state) { this.state = state },
    publish(eventType, payload) { this.publishedEvents.push({ eventType, payload }) },
    ...overrides
  }
  return incident
}

function makeStaff(overrides = {}) {
  return { id: 'staff-1', staffState: 'ACTIVE', activeTaskCount: 2, penaltyCount: 0, ...overrides }
}

describe('OpenState', () => {
  test('assignStaff transitions to InProgressState and increments task count', () => {
    const incident = makeIncident()
    const staff = makeStaff()

    new OpenState().assignStaff(incident, staff)

    expect(incident.state).toBeInstanceOf(InProgressState)
    expect(incident.assignedToId).toBe('staff-1')
    expect(staff.activeTaskCount).toBe(3)
    expect(incident.publishedEvents[0].eventType).toBe('INCIDENT_ASSIGNED')
  })

  test('assignStaff throws StaffUnavailableError if staff is UNDER_REVIEW', () => {
    const incident = makeIncident()
    const staff = makeStaff({ staffState: 'UNDER_REVIEW' })

    expect(() => new OpenState().assignStaff(incident, staff))
      .toThrow(StaffUnavailableError)
  })

  test('resolve is not a valid transition from OpenState', () => {
    const incident = makeIncident()
    expect(() => new OpenState().resolve(incident, 'note', 'photo'))
      .toThrow(InvalidTransitionError)
  })
})

describe('InProgressState', () => {
  test('resolve requires a photo', () => {
    const incident = makeIncident({ assignedTo: makeStaff() })
    expect(() => new InProgressState().resolve(incident, 'a valid note here', null))
      .toThrow(ResolutionPhotoRequiredError)
  })

  test('resolve requires a note of at least 10 characters', () => {
    const incident = makeIncident({ assignedTo: makeStaff() })
    expect(() => new InProgressState().resolve(incident, 'short', 'photo-url'))
      .toThrow(ResolutionNoteTooShortError)
  })

  test('resolve transitions to ResolvedState and decrements staff task count', () => {
    const staff = makeStaff({ activeTaskCount: 3 })
    const incident = makeIncident({ assignedTo: staff, assignedToId: staff.id })

    new InProgressState().resolve(incident, 'Replaced the faulty capacitor', 'photo-url')

    expect(incident.state).toBeInstanceOf(ResolvedState)
    expect(incident.resolutionNote).toBe('Replaced the faulty capacitor')
    expect(staff.activeTaskCount).toBe(2)
    expect(incident.publishedEvents[0].eventType).toBe('INCIDENT_RESOLVED')
  })

  test('escalate transitions to EscalatedState', () => {
    const incident = makeIncident()
    new InProgressState().escalate(incident, 'SLA breached')
    expect(incident.state).toBeInstanceOf(EscalatedState)
    expect(incident.sla.isEscalated).toBe(true)
  })
})

describe('ResolvedState — feedback loop', () => {
  test('rating > 2 does not reopen the incident', () => {
    const staff = makeStaff({ penaltyCount: 0 })
    const incident = makeIncident({ assignedTo: staff })

    new ResolvedState().receiveFeedback(incident, { score: 4, comment: 'Great job' })

    expect(incident.state).toBeUndefined()  // no transition
    expect(staff.penaltyCount).toBe(0)
    expect(incident.publishedEvents[0].eventType).toBe('FEEDBACK_RECEIVED')
  })

  test('rating <= 2 reopens incident and applies staff penalty', () => {
    const staff = makeStaff({ penaltyCount: 0 })
    const incident = makeIncident({ assignedTo: staff })

    new ResolvedState().receiveFeedback(incident, { score: 2, comment: 'Left a mess' })

    expect(incident.state).toBeInstanceOf(ReopenedState)
    expect(staff.penaltyCount).toBe(1)
    expect(staff.staffState).toBe('ACTIVE')  // only 1 penalty — not yet under review
    expect(incident.publishedEvents.map(e => e.eventType)).toContain('INCIDENT_REOPENED_BY_FEEDBACK')
  })

  test('3rd penalty in a month moves staff to UNDER_REVIEW', () => {
    const staff = makeStaff({ penaltyCount: 2 })
    const incident = makeIncident({ assignedTo: staff })

    new ResolvedState().receiveFeedback(incident, { score: 1, comment: 'Never showed up' })

    expect(staff.penaltyCount).toBe(3)
    expect(staff.staffState).toBe('UNDER_REVIEW')
    expect(incident.publishedEvents.map(e => e.eventType)).toContain('STAFF_UNDER_REVIEW')
  })
})

describe('ReopenedState', () => {
  test('assignStaff publishes INCIDENT_REASSIGNED with poor_feedback reason', () => {
    const incident = makeIncident()
    const staff = makeStaff({ id: 'senior-1' })

    new ReopenedState().assignStaff(incident, staff)

    expect(incident.state).toBeInstanceOf(InProgressState)
    const event = incident.publishedEvents.find(e => e.eventType === 'INCIDENT_REASSIGNED')
    expect(event.payload.reason).toBe('poor_feedback')
  })
})
