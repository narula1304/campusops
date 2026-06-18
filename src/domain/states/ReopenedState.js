// src/domain/states/ReopenedState.js
//
// Distinct from OpenState — carries the context that resolution FAILED
// quality review (poor feedback). Reassignment publishes a different
// event ('INCIDENT_REASSIGNED' with reason 'poor_feedback') so the
// admin dashboard can surface "incidents that bounced back" separately
// from fresh incidents.

const IncidentState = require('./IncidentState')

class ReopenedState extends IncidentState {
  assignStaff(incident, staff) {
    const InProgressState = require('./InProgressState')

    incident.assignedToId = staff.id
    staff.activeTaskCount++

    incident.addToStatusLog({
      status: 'IN_PROGRESS',
      changedById: staff.id,
      note: 'Reassigned after failed resolution'
    })

    incident.setState(new InProgressState())
    incident.publish('INCIDENT_REASSIGNED', { incident, staff, reason: 'poor_feedback' })
  }
}

module.exports = ReopenedState
