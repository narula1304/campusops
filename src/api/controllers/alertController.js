// src/api/controllers/alertController.js
//
// Handles alert broadcasting and management.

class AlertController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     * @param {import('socket.io').Server} io
     */
    constructor(prisma, io) {
        this.prisma = prisma
        this.io = io
    }

    /**
     * POST /api/alerts
     * Admin only. Broadcasts a new alert and persists it to the database.
     *
     * @type {import('express').RequestHandler}
     */
    broadcastAlert = async (req, res, next) => {
        try {
            const {
                title,
                message,
                type,
                severity,
                scopeTarget,
                scopeDepartmentId,
                scopeRole,
                deliveryChannels
            } = req.body

            // ── Validation ────────────────────────────────────────────────────
            if (!title || !message || !type || !severity || !scopeTarget) {
                return res.status(422).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Missing required fields: title, message, type, severity, scopeTarget'
                    }
                })
            }

            // Note: Validating against Prisma schema enums to prevent 500 errors.
            const validTypes = ['EMERGENCY', 'ANNOUNCEMENT', 'MAINTENANCE_SHUTDOWN']
            const validSeverities = ['INFO', 'WARNING', 'CRITICAL']
            const validScopeTargets = ['CAMPUS', 'DEPARTMENT', 'ROLE']

            if (!validTypes.includes(type)) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: `Invalid type. Allowed: ${validTypes.join(', ')}` }
                })
            }
            if (!validSeverities.includes(severity)) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: `Invalid severity. Allowed: ${validSeverities.join(', ')}` }
                })
            }
            if (!validScopeTargets.includes(scopeTarget)) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: `Invalid scopeTarget. Allowed: ${validScopeTargets.join(', ')}` }
                })
            }

            if (scopeTarget === 'DEPARTMENT' && !scopeDepartmentId) {
                 return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: 'scopeDepartmentId is required when scopeTarget is DEPARTMENT' }
                 })
            }

            if (scopeTarget === 'ROLE' && !scopeRole) {
                 return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: 'scopeRole is required when scopeTarget is ROLE' }
                 })
            }

            // ── DB Persistence ────────────────────────────────────────────────
            const alert = await this.prisma.alert.create({
                data: {
                    title,
                    message,
                    type,
                    severity,
                    scopeTarget,
                    scopeDepartmentId,
                    scopeRole,
                    deliveryChannels: deliveryChannels || [],
                    createdById: req.user.id
                }
            })

            // ── Real-Time Broadcast ───────────────────────────────────────────
            let socketRoom = 'campus'
            if (scopeTarget === 'DEPARTMENT') {
                socketRoom = `dept:${scopeDepartmentId}`
            } else if (scopeTarget === 'ROLE') {
                socketRoom = `role:${scopeRole}`
            }

            if (this.io) {
                this.io.to(socketRoom).emit('campus_alert', alert)
            }

            return res.status(201).json({ data: alert })
        } catch (err) {
            next(err)
        }
    }

    /**
     * GET /api/alerts
     * Any authenticated role. Lists alerts with optional filters and pagination.
     *
     * @type {import('express').RequestHandler}
     */
    listAlerts = async (req, res, next) => {
        try {
            const { type, severity, scopeTarget, page = 1, limit = 20 } = req.query

            const pageNum = Math.max(1, parseInt(page, 10)) || 1
            const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20))

            const where = {}
            if (type) where.type = type
            if (severity) where.severity = severity
            if (scopeTarget) where.scopeTarget = scopeTarget

            // Note: In a real system, you might filter alerts by the user's role/dept here as well,
            // but the prompt specifies a generic paginated list.

            const [total, alerts] = await this.prisma.$transaction([
                this.prisma.alert.count({ where }),
                this.prisma.alert.findMany({
                    where,
                    skip: (pageNum - 1) * limitNum,
                    take: limitNum,
                    orderBy: { createdAt: 'desc' }
                })
            ])

            return res.status(200).json({
                data: alerts,
                meta: {
                    total,
                    page: pageNum,
                    limit: limitNum
                }
            })
        } catch (err) {
            next(err)
        }
    }

    /**
     * PATCH /api/alerts/:id/retract
     * Admin only. Retracts an alert and notifies clients.
     *
     * @type {import('express').RequestHandler}
     */
    retractAlert = async (req, res, next) => {
        try {
            const { id } = req.params

            const existingAlert = await this.prisma.alert.findUnique({ where: { id } })
            if (!existingAlert) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Alert not found' }
                })
            }

            const updatedAlert = await this.prisma.alert.update({
                where: { id },
                data: {
                    isRetracted: true,
                    retractedAt: new Date()
                }
            })

            // ── Real-Time Retract Broadcast ───────────────────────────────────
            let socketRoom = 'campus'
            if (updatedAlert.scopeTarget === 'DEPARTMENT') {
                socketRoom = `dept:${updatedAlert.scopeDepartmentId}`
            } else if (updatedAlert.scopeTarget === 'ROLE') {
                socketRoom = `role:${updatedAlert.scopeRole}`
            }

            if (this.io) {
                this.io.to(socketRoom).emit('alert_retracted', { alertId: updatedAlert.id })
            }

            return res.status(200).json({ data: updatedAlert })
        } catch (err) {
            next(err)
        }
    }
}

module.exports = AlertController
