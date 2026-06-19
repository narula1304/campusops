// src/domain/observers/wireObservers.js
//
// Wires all observers to the IncidentEventPublisher.
// Called ONCE on application startup (in src/index.js or src/config/app.js).
//
// Every event→observer relationship is declared here in one place.
// Adding a new reaction = add one subscribe() call here + new observer class.
// No other file needs to change (Open/Closed Principle).

const IncidentEventPublisher = require('./IncidentEventPublisher')
const SLATimerManager = require('./SLATimerManager')
const HotspotDetector = require('./HotspotDetector')
const {
    AuditLogger,
    CacheInvalidator,
    RealTimeNotifier,
    EmailNotifier,
    FeedbackRequestSender
} = require('./observers')

/**
 * @param {object} deps
 * @param {object} deps.slaQueue   BullMQ Queue instance
 * @param {object} deps.redis      ioredis client
 * @param {object} deps.io         Socket.IO Server
 * @param {object} deps.mailer     Nodemailer transporter
 * @param {object} deps.prisma     PrismaClient instance
 * @returns {IncidentEventPublisher}
 */
function wireObservers({ slaQueue, redis, io, mailer, prisma }) {
    const publisher = new IncidentEventPublisher()

    const slaTimer = new SLATimerManager(slaQueue)
    const hotspot = new HotspotDetector(redis, io)
    const rtNotifier = new RealTimeNotifier(io)
    const emailNotifier = new EmailNotifier(mailer)
    const auditLogger = new AuditLogger(prisma)
    const cacheInval = new CacheInvalidator(redis)
    const feedbackReq = new FeedbackRequestSender(io, mailer)

    // ── INCIDENT_CREATED ──
    publisher.subscribe('INCIDENT_CREATED', slaTimer)       // schedule SLA escalation job
    publisher.subscribe('INCIDENT_CREATED', rtNotifier)     // notify department room
    publisher.subscribe('INCIDENT_CREATED', hotspot)        // check hotspot threshold
    publisher.subscribe('INCIDENT_CREATED', auditLogger)    // audit log

    // ── INCIDENT_ASSIGNED ──
    publisher.subscribe('INCIDENT_ASSIGNED', rtNotifier)    // notify assigned staff
    publisher.subscribe('INCIDENT_ASSIGNED', emailNotifier) // email assigned staff
    publisher.subscribe('INCIDENT_ASSIGNED', auditLogger)

    // ── INCIDENT_RESOLVED ──
    publisher.subscribe('INCIDENT_RESOLVED', slaTimer)      // cancel pending SLA job
    publisher.subscribe('INCIDENT_RESOLVED', rtNotifier)    // notify reporter + staff
    publisher.subscribe('INCIDENT_RESOLVED', emailNotifier) // email reporter
    publisher.subscribe('INCIDENT_RESOLVED', feedbackReq)   // send feedback request
    publisher.subscribe('INCIDENT_RESOLVED', cacheInval)    // clear dashboard cache
    publisher.subscribe('INCIDENT_RESOLVED', auditLogger)

    // ── INCIDENT_ESCALATED ──
    publisher.subscribe('INCIDENT_ESCALATED', rtNotifier)   // notify admins
    publisher.subscribe('INCIDENT_ESCALATED', emailNotifier)// email HOD/Dean
    publisher.subscribe('INCIDENT_ESCALATED', auditLogger)

    // ── INCIDENT_REOPENED_BY_FEEDBACK ──
    publisher.subscribe('INCIDENT_REOPENED_BY_FEEDBACK', rtNotifier)
    publisher.subscribe('INCIDENT_REOPENED_BY_FEEDBACK', cacheInval)
    publisher.subscribe('INCIDENT_REOPENED_BY_FEEDBACK', auditLogger)

    // ── INCIDENT_REASSIGNED ──
    publisher.subscribe('INCIDENT_REASSIGNED', rtNotifier)
    publisher.subscribe('INCIDENT_REASSIGNED', auditLogger)

    // ── STAFF_UNDER_REVIEW ──
    publisher.subscribe('STAFF_UNDER_REVIEW', rtNotifier)   // notify admins
    publisher.subscribe('STAFF_UNDER_REVIEW', emailNotifier)// email HOD

    // ── FEEDBACK_RECEIVED (good rating — no reopen) ──
    publisher.subscribe('FEEDBACK_RECEIVED', auditLogger)

    return publisher
}

module.exports = wireObservers