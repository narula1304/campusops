// src/domain/states/OpenState.js
//
// Initial state of every incident. Valid transitions: assignStaff, escalate.

const IncidentState = require('./IncidentState')
const { StaffUnavailableError } = require('../errors')

class OpenState extends IncidentState {
  assignStaff(incident, staff) {
    const InProgressState = require('./InProgressState')

    if (staff.staffState !== 'ACTIVE') {
      throw new StaffUnavailableError(staff.id)
    }

    incident.assignedToId = staff.id
    staff.activeTaskCount++

    incident.addToStatusLog({
      status: 'IN_PROGRESS',
      changedById: staff.id,
      note: 'Assigned'
    })

    incident.setState(new InProgressState())
    incident.publish('INCIDENT_ASSIGNED', { incident, staff })
  }

  escalate(incident, reason) {
    const EscalatedState = require('./EscalatedState')

    incident.sla.isEscalated = true

    incident.addToStatusLog({
      status: 'ESCALATED',
      note: reason
    })

    incident.setState(new EscalatedState())
    incident.publish('INCIDENT_ESCALATED', { incident, reason })
  }
}

module.exports = OpenState
