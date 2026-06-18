// src/domain/states/EscalatedState.js
//
// Incident breached its SLA (or was manually escalated).
// Valid transition: assignStaff — typically to senior staff or after admin review.

const IncidentState = require('./IncidentState')

class EscalatedState extends IncidentState {
  assignStaff(incident, staff) {
    const InProgressState = require('./InProgressState')

    incident.assignedToId = staff.id
    staff.activeTaskCount++

    incident.addToStatusLog({
      status: 'IN_PROGRESS',
      changedById: staff.id,
      note: 'Assigned after escalation'
    })

    incident.setState(new InProgressState())
    incident.publish('INCIDENT_ASSIGNED', { incident, staff })
  }
}

module.exports = EscalatedState
