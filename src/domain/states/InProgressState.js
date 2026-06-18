// src/domain/states/InProgressState.js
//
// Incident is actively being worked on. Valid transitions: resolve, escalate.
// resolve() enforces the resolution photo requirement at the domain level —
// not in a controller — this is the core LLD talking point for the State pattern.

const IncidentState = require('./IncidentState')
const { ResolutionPhotoRequiredError, ResolutionNoteTooShortError } = require('../errors')

class InProgressState extends IncidentState {
  resolve(incident, note, photo) {
    const ResolvedState = require('./ResolvedState')

    if (!photo) {
      throw new ResolutionPhotoRequiredError()
    }
    if (!note || note.trim().length < 10) {
      throw new ResolutionNoteTooShortError()
    }

    incident.resolutionNote = note.trim()
    incident.resolutionPhoto = photo
    incident.resolvedAt = new Date()

    if (incident.assignedTo) {
      incident.assignedTo.activeTaskCount = Math.max(0, incident.assignedTo.activeTaskCount - 1)
    }

    incident.addToStatusLog({
      status: 'RESOLVED',
      changedById: incident.assignedToId,
      note
    })

    incident.setState(new ResolvedState())
    incident.publish('INCIDENT_RESOLVED', { incident })
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

module.exports = InProgressState
