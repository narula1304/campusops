// src/domain/states/IncidentState.js
//
// Abstract base for the State pattern (see DESIGN_PATTERNS.md Pattern 1).
// Every concrete state extends this and overrides only the transitions
// that are valid from that state. All other methods throw InvalidTransitionError.
//
// ZERO imports from Prisma, Express, Socket.IO, or any framework.
//
// NOTE on circular requires: OpenState -> InProgressState -> ResolvedState ->
// ReopenedState -> InProgressState forms a cycle. Each concrete state file
// requires its target state(s) LAZILY (inside the method body, not at the
// top of the file) to avoid Node returning a partial module during the cycle.

const { InvalidTransitionError } = require('../errors')

class IncidentState {
  assignStaff(incident, staff) {
    throw new InvalidTransitionError(this.constructor.name, 'assignStaff')
  }

  resolve(incident, note, photo) {
    throw new InvalidTransitionError(this.constructor.name, 'resolve')
  }

  escalate(incident, reason) {
    throw new InvalidTransitionError(this.constructor.name, 'escalate')
  }

  reopen(incident, reason) {
    throw new InvalidTransitionError(this.constructor.name, 'reopen')
  }

  receiveFeedback(incident, rating) {
    throw new InvalidTransitionError(this.constructor.name, 'receiveFeedback')
  }

  getName() {
    // Maps to the IncidentStatus enum value in Prisma schema, e.g. 'OPEN', 'IN_PROGRESS'
    return this.constructor.name
      .replace('State', '')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase()
  }
}

module.exports = IncidentState
