// src/api/controllers/userController.js
//
// Handles user-related HTTP requests.
//
// Designed for constructor injection (no singletons, no process.env reads
// inside methods) so the controller is fully testable in isolation.

class UserController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     */
    constructor(prisma) {
        this.prisma = prisma
    }

    /**
     * GET /api/users/me
     *
     * Fetches the full profile for the currently authenticated user.
     * Omit passwordHash, failedLoginCount, lockedUntil from response.
     *
     * @type {import('express').RequestHandler}
     */
    getMe = async (req, res, next) => {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: req.user.id },
            })

            if (!user) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'User not found' },
                })
            }

            const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = user

            return res.status(200).json({ data: safeUser })
        } catch (err) {
            next(err)
        }
    }

    /**
     * PATCH /api/users/me
     *
     * Updates the profile for the currently authenticated user.
     * Allows updating: name, phone, notificationPrefs (prefRealtime, prefEmail, prefSms).
     * Ignored fields: email, role, passwordHash, departmentId.
     *
     * @type {import('express').RequestHandler}
     */
    updateMe = async (req, res, next) => {
        try {
            const { name, phone, notificationPrefs } = req.body

            const data = {}
            if (name !== undefined) data.name = name
            if (phone !== undefined) data.phone = phone
            
            // Assuming notificationPrefs is JSON or individual boolean fields on the user model,
            // we will update them directly if present in the schema.
            // If they are specific boolean columns like prefRealtime, handle them here:
            if (notificationPrefs && typeof notificationPrefs === 'object') {
                if (notificationPrefs.prefRealtime !== undefined) data.prefRealtime = Boolean(notificationPrefs.prefRealtime)
                if (notificationPrefs.prefEmail !== undefined) data.prefEmail = Boolean(notificationPrefs.prefEmail)
                if (notificationPrefs.prefSms !== undefined) data.prefSms = Boolean(notificationPrefs.prefSms)
            } else {
                 if (req.body.prefRealtime !== undefined) data.prefRealtime = Boolean(req.body.prefRealtime)
                 if (req.body.prefEmail !== undefined) data.prefEmail = Boolean(req.body.prefEmail)
                 if (req.body.prefSms !== undefined) data.prefSms = Boolean(req.body.prefSms)
            }

            const user = await this.prisma.user.update({
                where: { id: req.user.id },
                data,
            })

            const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = user

            return res.status(200).json({ data: safeUser })
        } catch (err) {
            next(err)
        }
    }

    /**
     * GET /api/users
     *
     * Admin only route to list users.
     *
     * @type {import('express').RequestHandler}
     */
    listUsers = async (req, res, next) => {
        try {
            // Defense in depth
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({
                    error: { code: 'FORBIDDEN', message: 'Access denied. ADMIN role required.' }
                })
            }

            const { role, departmentId, staffState, search, page = 1, limit = 20 } = req.query

            const pageNum = Math.max(1, parseInt(page, 10)) || 1
            const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20))

            const where = {}
            if (role) where.role = role
            if (departmentId) where.departmentId = departmentId
            if (staffState) where.staffState = staffState
            
            if (search) {
                where.name = {
                    contains: search,
                    mode: 'insensitive' // ILIKE in PostgreSQL
                }
            }

            const [total, users] = await this.prisma.$transaction([
                this.prisma.user.count({ where }),
                this.prisma.user.findMany({
                    where,
                    skip: (pageNum - 1) * limitNum,
                    take: limitNum,
                    orderBy: { name: 'asc' }, // Default sorting
                })
            ])

            // Exclude sensitive fields from each user
            const safeUsers = users.map(user => {
                const { passwordHash, failedLoginCount, lockedUntil, ...safe } = user
                return safe
            })

            return res.status(200).json({
                data: safeUsers,
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
     * PATCH /api/users/:id/staff-state
     *
     * Admin only route to update a user's staffState.
     *
     * @type {import('express').RequestHandler}
     */
    updateStaffState = async (req, res, next) => {
        try {
            const { id } = req.params
            const { staffState } = req.body

            // Defense in depth
            if (req.user.role !== 'ADMIN') {
                return res.status(403).json({
                    error: { code: 'FORBIDDEN', message: 'Access denied. ADMIN role required.' }
                })
            }

            if (!['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED'].includes(staffState)) {
                 return res.status(422).json({
                     error: { code: 'VALIDATION_ERROR', message: 'Invalid staffState value' }
                 })
            }

            const userToUpdate = await this.prisma.user.findUnique({ where: { id } })

            if (!userToUpdate) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'User not found' }
                })
            }

            if (userToUpdate.role !== 'MAINTENANCE' && userToUpdate.role !== 'SECURITY') {
                return res.status(422).json({
                    error: {
                        code: 'INVALID_OPERATION',
                        message: 'staffState can only be set on MAINTENANCE or SECURITY users'
                    }
                })
            }

            const updatedUser = await this.prisma.user.update({
                where: { id },
                data: { staffState }
            })

            const { passwordHash, failedLoginCount, lockedUntil, ...safeUser } = updatedUser

            return res.status(200).json({ data: safeUser })
        } catch (err) {
            next(err)
        }
    }
}

module.exports = UserController
