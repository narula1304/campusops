// src/domain/decorators/SMSDecorator.js
//
// Decorator — wraps another notifier and adds SMS delivery.
//
// SMS fires UNCONDITIONALLY (ignoring user.prefSms) when:
//   • payload.priority === 'CRITICAL'   OR
//   • event === 'PANIC_ALERT'
//
// The NotificationService adds this decorator when isCritical is true OR
// when the user has prefSms enabled — but the send() guard here ensures
// we never blast SMS for non-critical events when the decorator was added
// solely for user pref (payload.priority might be LOW/MEDIUM/HIGH).
//
// No framework imports — `smsService` is injected via constructor.

const BaseNotification = require('./BaseNotification')

class SMSDecorator extends BaseNotification {
  /**
   * @param {BaseNotification} wrapped      - The next notifier in the chain
   * @param {object}           smsService   - SMS service instance (injected)
   *                                          Expected interface: { send(phone, message): Promise }
   */
  constructor(wrapped, smsService) {
    super()
    this.wrapped = wrapped
    this.sms = smsService
  }

  /**
   * Sends an SMS when the event/payload meets the critical threshold,
   * then delegates to the wrapped notifier.
   *
   * @param {object} user
   * @param {string} event
   * @param {object} payload
   * @returns {Promise<void>}
   */
  async send(user, event, payload) {
    const isCritical =
      payload.priority === 'CRITICAL' || event === 'PANIC_ALERT'

    if (isCritical) {
      await this.sms.send(user.phone, this._format(event, payload))
    }

    return this.wrapped.send(user, event, payload)
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Produces a compact SMS message (160-char friendly).
   * @param {string} event
   * @param {object} payload
   * @returns {string}
   */
  _format(event, payload) {
    const incidentNumber = payload?.incident?.incidentNumber || ''

    if (event === 'PANIC_ALERT') {
      return `PANIC ALERT from CampusOps. ${payload?.message || 'Emergency reported on campus. Please respond immediately.'}`
    }

    if (incidentNumber) {
      return `CampusOps CRITICAL: Incident ${incidentNumber} — ${event.replace(/_/g, ' ')}. Immediate action required.`
    }

    return `CampusOps CRITICAL alert: ${event.replace(/_/g, ' ')}. Please check the app immediately.`
  }
}

module.exports = SMSDecorator
