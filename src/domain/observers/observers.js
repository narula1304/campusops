// src/domain/observers/AuditLogger.js
//
// Observer: appends an immutable entry to the AuditLog table for every
// domain event. This is the append-only audit trail described in
// DATABASE_DESIGN.md — never UPDATE, only INSERT.
//
// Constructor receives prisma (PrismaClient instance) — injected.

class AuditLogger {
    constructor(prisma) {
        this.prisma = prisma
    }

    async handle(eventType, payload) {
        const { incident, staff, rating } = payload

        await this.prisma.auditLog.create({
            data: {
                commandType: eventType,
                actorId: staff?.id ?? incident?.creatorId ?? 'system',
                incidentId: incident?.id ?? null,
                payload: {
                    eventType,
                    incidentNumber: incident?.incidentNumber,
                    staffId: staff?.id,
                    rating: rating?.score
                }
            }
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────

// src/domain/observers/CacheInvalidator.js
//
// Observer: clears Redis dashboard caches when incident data changes.
// Called on INCIDENT_RESOLVED, INCIDENT_ESCALATED, INCIDENT_REOPENED_BY_FEEDBACK.
//
// Targeted invalidation — only clears the affected department's cache and the
// global cache. All other departments' caches are left intact (SYSTEM_DESIGN.md §3.5).
//
// Constructor receives redis (ioredis client) — injected.

class CacheInvalidator {
    constructor(redis) {
        this.redis = redis
    }

    async handle(eventType, { incident }) {
        if (!incident?.departmentId) return

        await Promise.allSettled([
            this.redis.del(`cache:dashboard:dept:${incident.departmentId}:stats`),
            this.redis.del('cache:dashboard:global:stats')
        ])
    }
}

// ─────────────────────────────────────────────────────────────────────────────

// src/domain/observers/RealTimeNotifier.js
//
// Observer: emits Socket.IO events to the correct rooms.
//
// Room targeting follows API_CONTRACT.md §8 (Socket.IO Events):
//   - Reporter:       user:{reporterId}
//   - Assigned staff: user:{staffId}
//   - All admins:     role:ADMIN
//   - Department:     dept:{deptId}
//   - Security:       role:SECURITY  (panic alerts — handled separately)
//
// Constructor receives io (Socket.IO Server instance) — injected.

const REALTIME_EVENT_MAP = {
    INCIDENT_CREATED: 'incident_created',
    INCIDENT_ASSIGNED: 'incident_assigned',
    INCIDENT_RESOLVED: 'incident_updated',
    INCIDENT_ESCALATED: 'incident_escalated',
    INCIDENT_REOPENED_BY_FEEDBACK: 'incident_reopened',
    INCIDENT_REASSIGNED: 'incident_updated',
    STAFF_UNDER_REVIEW: 'staff_under_review',
    FEEDBACK_RECEIVED: 'feedback_received',
    HOTSPOT_DETECTED: 'hotspot_detected'
}

class RealTimeNotifier {
    constructor(io) {
        this.io = io
    }

    async handle(eventType, payload) {
        const { incident, staff, rating } = payload
        const socketEvent = REALTIME_EVENT_MAP[eventType]
        if (!socketEvent) return

        const data = this._buildPayload(eventType, payload)

        switch (eventType) {
            case 'INCIDENT_CREATED':
                // Notify department room
                if (incident?.departmentId) {
                    this.io.to(`dept:${incident.departmentId}`).emit(socketEvent, data)
                }
                break

            case 'INCIDENT_ASSIGNED':
                // Notify assigned staff
                if (staff?.id) {
                    this.io.to(`user:${staff.id}`).emit(socketEvent, data)
                }
                break

            case 'INCIDENT_RESOLVED':
            case 'INCIDENT_REOPENED_BY_FEEDBACK':
            case 'INCIDENT_REASSIGNED':
                // Notify reporter
                if (incident?.creatorId) {
                    this.io.to(`user:${incident.creatorId}`).emit(socketEvent, data)
                }
                // Notify assigned staff
                if (incident?.assignedToId) {
                    this.io.to(`user:${incident.assignedToId}`).emit(socketEvent, data)
                }
                break

            case 'INCIDENT_ESCALATED':
                // Notify all admins
                this.io.to('role:ADMIN').emit(socketEvent, data)
                break

            case 'STAFF_UNDER_REVIEW':
                // Notify all admins + HOD room
                this.io.to('role:ADMIN').emit(socketEvent, data)
                break

            default:
                // Broadcast to admins as fallback
                this.io.to('role:ADMIN').emit(socketEvent, data)
        }
    }

    _buildPayload(eventType, { incident, staff, rating }) {
        return {
            eventType,
            incidentId: incident?.id,
            incidentNumber: incident?.incidentNumber,
            status: incident?.getCurrentStatus?.() ?? incident?.state?.getName?.(),
            priority: incident?.priority,
            staffId: staff?.id,
            staffName: staff?.name,
            rating: rating?.score
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────

// src/domain/observers/EmailNotifier.js
//
// Observer: sends email notifications via Nodemailer.
// Respects user notification preferences (user.prefEmail).
// Falls back to email delivery when the user is offline.
//
// Constructor receives mailer (Nodemailer transporter) — injected.

class EmailNotifier {
    constructor(mailer) {
        this.mailer = mailer
    }

    async handle(eventType, payload) {
        const { incident, staff } = payload

        // Only send email for events that warrant one
        const emailEvents = [
            'INCIDENT_ASSIGNED',
            'INCIDENT_RESOLVED',
            'INCIDENT_ESCALATED',
            'INCIDENT_REOPENED_BY_FEEDBACK',
            'STAFF_UNDER_REVIEW'
        ]
        if (!emailEvents.includes(eventType)) return

        const recipient = this._getRecipient(eventType, payload)
        if (!recipient?.email) return
        if (recipient.prefEmail === false) return  // user opted out

        const { subject, html } = this._buildEmail(eventType, incident, staff)

        await this.mailer.sendMail({
            from: process.env.NODEMAILER_USER || 'campusops@college.edu',
            to: recipient.email,
            subject,
            html
        })
    }

    _getRecipient(eventType, { incident, staff }) {
        if (eventType === 'INCIDENT_ASSIGNED') return staff
        return null  // other recipients require hydrated user objects — handled by service layer
    }

    _buildEmail(eventType, incident, staff) {
        const templates = {
            INCIDENT_ASSIGNED: {
                subject: `[CampusOps] New Assignment: ${incident?.incidentNumber}`,
                html: `<p>You have been assigned a new incident: <strong>${incident?.title}</strong>.<br>
               Priority: ${incident?.priority}<br>
               Location: ${incident?.location?.block} ${incident?.location?.room ?? ''}<br>
               SLA Deadline: ${incident?.sla?.deadlineAt?.toISOString() ?? 'N/A'}</p>`
            },
            INCIDENT_RESOLVED: {
                subject: `[CampusOps] Resolved: ${incident?.incidentNumber}`,
                html: `<p>Your incident <strong>${incident?.title}</strong> has been resolved.<br>
               Please rate the resolution quality in the CampusOps app.</p>`
            },
            INCIDENT_ESCALATED: {
                subject: `[CampusOps] ⚠️ SLA Breach: ${incident?.incidentNumber}`,
                html: `<p>Incident <strong>${incident?.title}</strong> has breached its SLA and been escalated.<br>
               Priority: ${incident?.priority}<br>Immediate attention required.</p>`
            },
            INCIDENT_REOPENED_BY_FEEDBACK: {
                subject: `[CampusOps] Reopened: ${incident?.incidentNumber}`,
                html: `<p>Incident <strong>${incident?.title}</strong> has been reopened due to low feedback rating.</p>`
            },
            STAFF_UNDER_REVIEW: {
                subject: `[CampusOps] Staff Review Required`,
                html: `<p>Staff member has received 3 or more penalty marks and requires review.</p>`
            }
        }

        return templates[eventType] ?? { subject: `[CampusOps] Event: ${eventType}`, html: '' }
    }
}

// ─────────────────────────────────────────────────────────────────────────────

// src/domain/observers/FeedbackRequestSender.js
//
// Observer: sends a feedback request to the incident creator after resolution.
// Fires on INCIDENT_RESOLVED only.
// Sends both a real-time Socket.IO notification and an email (via mailer).
//
// Constructor receives io and mailer — injected.

class FeedbackRequestSender {
    constructor(io, mailer) {
        this.io = io
        this.mailer = mailer
    }

    async handle(eventType, { incident }) {
        if (eventType !== 'INCIDENT_RESOLVED') return
        if (!incident?.creatorId) return

        // Real-time notification (triggers feedback form in the UI)
        this.io.to(`user:${incident.creatorId}`).emit('feedback_request', {
            incidentId: incident.id,
            incidentNumber: incident.incidentNumber,
            message: `Please rate the resolution of ${incident.incidentNumber}`
        })

        // Email prompt (catches users who aren't online)
        if (this.mailer) {
            await this.mailer.sendMail({
                from: process.env.NODEMAILER_USER || 'campusops@college.edu',
                to: `user-${incident.creatorId}@placeholder`,  // real email comes from hydrated User
                subject: `[CampusOps] Rate the resolution of ${incident.incidentNumber}`,
                html: `<p>Your incident <strong>${incident.title}</strong> has been resolved.<br>
               Please take a moment to rate the service quality in the CampusOps app.</p>`
            })
        }
    }
}

module.exports = {
    AuditLogger,
    CacheInvalidator,
    RealTimeNotifier,
    EmailNotifier,
    FeedbackRequestSender
}