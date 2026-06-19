// src/domain/decorators/NotificationService.js
//
// Assembles the notification decorator stack at runtime based on each user's
// channel preferences and the criticality of the event.
//
// Decorator stacking order (innermost → outermost):
//   BaseNotification  ← always present (no-op leaf)
//     ↑ RealTimeDecorator  (if user.prefRealtime)
//       ↑ EmailDecorator   (if user.prefEmail !== false)
//         ↑ SMSDecorator   (if user.prefSms OR isCritical override)
//
// Outermost decorator's send() runs first, so SMSDecorator fires before
// EmailDecorator fires before RealTimeDecorator fires before the base no-op.
//
// ZERO framework imports — io, mailer, smsService all injected via constructor.

const BaseNotification = require('./BaseNotification')
const RealTimeDecorator = require('./RealTimeDecorator')
const EmailDecorator = require('./EmailDecorator')
const SMSDecorator = require('./SMSDecorator')

class NotificationService {
  /**
   * @param {object} io         - Socket.IO Server instance
   * @param {object} mailer     - Nodemailer transporter instance
   * @param {object} smsService - SMS service instance ({ send(phone, msg): Promise })
   */
  constructor(io, mailer, smsService) {
    this.io = io
    this.mailer = mailer
    this.smsService = smsService
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Builds the decorator stack for a specific user.
   *
   * Rules:
   *   • RealTimeDecorator added when user.prefRealtime is truthy
   *   • EmailDecorator    added when user.prefEmail !== false
   *     (note: EmailDecorator also internally filters by EMAIL_WORTHY_EVENTS)
   *   • SMSDecorator      added when user.prefSms is truthy OR isCritical is true
   *     (note: SMSDecorator also internally guards — only fires for CRITICAL/PANIC_ALERT)
   *
   * @param {object}  user
   * @param {boolean} isCritical  - True forces the SMS layer regardless of user.prefSms
   * @returns {BaseNotification}
   */
  buildNotifier(user, isCritical = false) {
    // Start with the no-op base (innermost of the chain)
    let notifier = new BaseNotification()

    // Layer real-time Socket.IO on top
    if (user.prefRealtime) {
      notifier = new RealTimeDecorator(notifier, this.io)
    }

    // Layer email on top of real-time (or base)
    if (user.prefEmail !== false) {
      notifier = new EmailDecorator(notifier, this.mailer)
    }

    // Layer SMS on top of everything — added for preference OR critical override
    if (isCritical || user.prefSms) {
      notifier = new SMSDecorator(notifier, this.smsService)
    }

    return notifier
  }

  /**
   * Determines criticality, builds the stack, and fires it.
   *
   * An event/payload is considered critical when:
   *   • payload.priority === 'CRITICAL'  OR
   *   • event === 'PANIC_ALERT'
   *
   * @param {object} user
   * @param {string} event
   * @param {object} payload
   * @returns {Promise<void>}
   */
  async notify(user, event, payload) {
    const isCritical =
      payload.priority === 'CRITICAL' || event === 'PANIC_ALERT'

    const notifier = this.buildNotifier(user, isCritical)
    await notifier.send(user, event, payload)
  }
}

module.exports = NotificationService
