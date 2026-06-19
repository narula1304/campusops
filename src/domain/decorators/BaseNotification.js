// src/domain/decorators/BaseNotification.js
//
// The innermost, no-op component of the Decorator chain.
// Every decorator wraps an instance of this (or another decorator).
// No framework imports — pure JavaScript.

class BaseNotification {
  /**
   * Send a notification for the given event/payload to user.
   * Base implementation is intentionally a no-op so the chain
   * always has a valid leaf to delegate to.
   *
   * @param {object} user    - User entity (id, email, phone, prefs…)
   * @param {string} event   - Domain event name e.g. 'INCIDENT_ASSIGNED'
   * @param {object} payload - Arbitrary event payload
   * @returns {Promise<void>}
   */
  async send(user, event, payload) {
    // no-op — intentional base case
  }
}

module.exports = BaseNotification
