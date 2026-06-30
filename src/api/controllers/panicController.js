// src/api/controllers/panicController.js
//
// Handles emergency panic trigger and acknowledgement.

class PanicController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     * @param {import('socket.io').Server} io
     */
    constructor(prisma, io) {
        this.prisma = prisma
        this.io = io
    }

    /**
     * POST /api/panic
     * STUDENT and FACULTY roles only.
     * Triggers a campus-wide panic alert for security officers and admins.
     *
     * @type {import('express').RequestHandler}
     */
    triggerPanic = async (req, res, next) => {
        try {
            const { lat, lng, message } = req.body

            // 1. Validation
            if (lat === undefined || lng === undefined || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
                return res.status(422).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'lat and lng are required and must be valid numbers'
                    }
                })
            }

            // 2. Create Emergency Incident
            // We use a predefined SLA window for panic incidents (e.g., 1 hour).
            const incident = await this.prisma.incident.create({
                data: {
                    title: `PANIC: Emergency reported by ${req.user.name}`,
                    description: message || 'Emergency panic button triggered - immediate response required',
                    category: 'EMERGENCY',
                    priority: 'CRITICAL',
                    status: 'OPEN',
                    locationBlock: 'PANIC',
                    locationLat: parseFloat(lat),
                    locationLng: parseFloat(lng),
                    creatorId: req.user.id,
                    departmentId: req.user.departmentId || null, // Ensure valid relation if required, user.departmentId might be missing.
                    slaWindowHours: 1,
                    slaDeadlineAt: new Date(Date.now() + 60 * 60 * 1000),
                    incidentNumber: `PANIC-${Date.now()}`,
                    evidencePhotos: [],
                }
            })

            // 3. Emit real-time panic alerts
            const emitPayload = {
                incidentId: incident.id,
                incidentNumber: incident.incidentNumber,
                reporterId: req.user.id,
                reporterName: req.user.name,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                message: message || null,
                triggeredAt: new Date().toISOString()
            }

            if (this.io) {
                this.io.to('role:SECURITY').emit('panic_alert', emitPayload)
                this.io.to('role:ADMIN').emit('panic_alert', emitPayload)
            }

            // 4. Response
            return res.status(201).json({
                data: {
                    incidentId: incident.id,
                    message: 'Emergency services have been notified'
                }
            })
        } catch (err) {
            // Note: If departmentId constraints fail (e.g., student without a department), 
            // the database schema dictates if departmentId is required. 
            // We assume Prisma handles errors to the centralized error handler via next().
            next(err)
        }
    }

    /**
     * POST /api/panic/:incidentId/acknowledge
     * SECURITY role only.
     * Acknowledges that a security officer is responding to the panic.
     *
     * @type {import('express').RequestHandler}
     */
    acknowledgePanic = async (req, res, next) => {
        try {
            const { incidentId } = req.params

            // 1. Find incident
            const incident = await this.prisma.incident.findUnique({
                where: { id: incidentId }
            })

            if (!incident) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Incident not found' }
                })
            }

            // 2. Record Acknowledgement
            const ack = await this.prisma.panicAcknowledgement.create({
                data: {
                    incidentId,
                    officerId: req.user.id,
                    acknowledgedAt: new Date()
                }
            })

            // 3. Inform the creator that help is acknowledging
            if (this.io) {
                this.io.to(`user:${incident.creatorId}`).emit('panic_acknowledged', {
                    incidentId,
                    officerName: req.user.name,
                    acknowledgedAt: ack.acknowledgedAt
                })

                // Inform all security and admin that it was acknowledged, so they can dismiss their alert
                const globalAckPayload = { incidentId, officerName: req.user.name, acknowledgedAt: ack.acknowledgedAt }
                this.io.to('role:SECURITY').emit('panic_acknowledged_global', globalAckPayload)
                this.io.to('role:ADMIN').emit('panic_acknowledged_global', globalAckPayload)
            }

            // 4. Response
            return res.status(200).json({
                data: { message: 'Panic acknowledged' }
            })
        } catch (err) {
            next(err)
        }
    }

    /**
     * GET /api/panic
     * ADMIN and SECURITY roles only.
     * Returns the last 20 EMERGENCY incidents ordered by createdAt DESC.
     *
     * @type {import('express').RequestHandler}
     */
    getPanicHistory = async (req, res, next) => {
        try {
            const incidents = await this.prisma.incident.findMany({
                where: { category: 'EMERGENCY' },
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: {
                    creator: { select: { name: true } },
                    _count: { select: { panicAcks: true } }
                }
            })

            return res.status(200).json({ data: incidents })
        } catch (err) {
            next(err)
        }
    }
}

module.exports = PanicController
