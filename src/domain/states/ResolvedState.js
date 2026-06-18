// src/domain/states/ResolvedState.js
//
// Terminal happy-path state. Only valid action: receiveFeedback.
// A score <= 2 triggers the feedback loop: staff penalty + ReopenedState.
// Three penalties in a month moves the staff member into UNDER_REVIEW —
// this is the "two interacting state machines" talking point
// (incident state machine + staff state machine).

const IncidentState = require('./IncidentState')

class ResolvedState extends IncidentState {
  receiveFeedback(incident, rating) {
    const ReopenedState = require('./ReopenedState')

    incident.feedback = {
      score: rating.score,
      comment: rating.comment,
      submittedAt: new Date()
    }

    if (rating.score <= 2) {
      if (incident.assignedTo) {
        incident.assignedTo.penaltyCount = (incident.assignedTo.penaltyCount || 0) + 1

        if (incident.assignedTo.penaltyCount >= 3) {
          incident.assignedTo.staffState = 'UNDER_REVIEW'
          incident.publish('STAFF_UNDER_REVIEW', { staff: incident.assignedTo })
        }
      }

      incident.addToStatusLog({
        status: 'REOPENED',
        note: `Reopened: rating ${rating.score}/5`
      })

      incident.setState(new ReopenedState())
      incident.publish('INCIDENT_REOPENED_BY_FEEDBACK', { incident, rating })
    } else {
      incident.publish('FEEDBACK_RECEIVED', { incident, rating })
    }
  }
}

module.exports = ResolvedState
