// src/domain/decorators/EmailDecorator.js
//
// Decorator — wraps another notifier and adds email delivery via Nodemailer.
//
// Email is sent ONLY when:
//   1. user.prefEmail !== false   (explicit opt-out respected)
//   2. The event is in the email-worthy list below
//
// No framework imports — `mailer` is injected via constructor (Dependency Inversion).

const BaseNotification = require('./BaseNotification')

/** Events that are important enough to warrant an email. */
const EMAIL_WORTHY_EVENTS = new Set([
  'INCIDENT_ASSIGNED',
  'INCIDENT_RESOLVED',
  'INCIDENT_ESCALATED',
  'INCIDENT_REOPENED_BY_FEEDBACK',
  'STAFF_UNDER_REVIEW',
])

class EmailDecorator extends BaseNotification {
  /**
   * @param {BaseNotification} wrapped  - The next notifier in the chain
   * @param {object}           mailer   - Nodemailer transporter instance (injected)
   */
  constructor(wrapped, mailer) {
    super()
    this.wrapped = wrapped
    this.mailer = mailer
  }

  /**
   * Sends an email if the user has not opted out AND the event is email-worthy,
   * then delegates to the wrapped notifier.
   *
   * @param {object} user
   * @param {string} event
   * @param {object} payload
   * @returns {Promise<void>}
   */
  async send(user, event, payload) {
    if (user.prefEmail !== false && EMAIL_WORTHY_EVENTS.has(event)) {
      await this.mailer.sendMail({
        to: user.email,
        subject: this._subject(event, payload),
        html: this._template(event, payload),
      })
    }
    return this.wrapped.send(user, event, payload)
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Generates a human-readable subject line for the event.
   * @param {string} event
   * @param {object} payload
   * @returns {string}
   */
  _subject(event, payload) {
    const incidentNumber = payload?.incident?.incidentNumber || ''
    const subjects = {
      INCIDENT_ASSIGNED: `[CampusOps] Incident ${incidentNumber} has been assigned to you`,
      INCIDENT_RESOLVED: `[CampusOps] Incident ${incidentNumber} has been resolved`,
      INCIDENT_ESCALATED: `[CampusOps] Incident ${incidentNumber} has been escalated`,
      INCIDENT_REOPENED_BY_FEEDBACK: `[CampusOps] Incident ${incidentNumber} reopened due to low feedback`,
      STAFF_UNDER_REVIEW: `[CampusOps] Staff member placed under review`,
    }
    return subjects[event] || `[CampusOps] Notification: ${event}`
  }

  /**
   * Generates a minimal HTML email body for the event.
   * @param {string} event
   * @param {object} payload
   * @returns {string}
   */
  _template(event, payload) {
    const incidentNumber = payload?.incident?.incidentNumber || 'N/A'
    const priority = payload?.incident?.priority || payload?.priority || 'N/A'
    const note = payload?.incident?.resolutionNote || ''

    const rows = {
      INCIDENT_ASSIGNED: `
        <p>An incident has been assigned to you.</p>
        <ul>
          <li><strong>Incident #:</strong> ${incidentNumber}</li>
          <li><strong>Priority:</strong> ${priority}</li>
        </ul>
        <p>Please log in to CampusOps to view the full details.</p>`,

      INCIDENT_RESOLVED: `
        <p>The following incident has been resolved.</p>
        <ul>
          <li><strong>Incident #:</strong> ${incidentNumber}</li>
          <li><strong>Resolution note:</strong> ${note || '—'}</li>
        </ul>`,

      INCIDENT_ESCALATED: `
        <p>An incident has been escalated and requires immediate attention.</p>
        <ul>
          <li><strong>Incident #:</strong> ${incidentNumber}</li>
          <li><strong>Priority:</strong> ${priority}</li>
          <li><strong>Reason:</strong> ${payload?.reason || '—'}</li>
        </ul>`,

      INCIDENT_REOPENED_BY_FEEDBACK: `
        <p>An incident has been reopened because the reporter gave a low satisfaction score.</p>
        <ul>
          <li><strong>Incident #:</strong> ${incidentNumber}</li>
          <li><strong>Rating:</strong> ${payload?.rating?.score ?? '—'}/5</li>
        </ul>`,

      STAFF_UNDER_REVIEW: `
        <p>A staff member has accumulated too many low-rating incidents and is now under review.</p>
        <ul>
          <li><strong>Staff ID:</strong> ${payload?.staff?.id || '—'}</li>
          <li><strong>Name:</strong> ${payload?.staff?.name || '—'}</li>
        </ul>`,
    }

    const body = rows[event] || `<p>Event: <strong>${event}</strong></p>`

    return `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto;">
          <h2 style="color: #1a73e8;">CampusOps Notification</h2>
          ${body}
          <hr />
          <p style="font-size: 12px; color: #888;">
            You are receiving this email because of your CampusOps notification preferences.
          </p>
        </body>
      </html>`
  }
}

module.exports = EmailDecorator
