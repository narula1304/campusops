// src/api/routes/userRoutes.js
//
// Express Router factory — mounts UserController handlers.

const { Router } = require('express')
const UserController = require('../controllers/userController')
const { authenticate, authorize } = require('../middleware/auth')

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {import('express').Router}
 */
module.exports = function userRoutes(prisma) {
    const router     = Router()
    const controller = new UserController(prisma)

    // ── GET /me ───────────────────────────────────────────────────────────────
    router.get('/me', authenticate, controller.getMe)

    // ── PATCH /me ─────────────────────────────────────────────────────────────
    router.patch('/me', authenticate, controller.updateMe)

    // ── GET / ─────────────────────────────────────────────────────────────────
    router.get('/', authenticate, authorize('ADMIN'), controller.listUsers)

    // ── PATCH /:id/staff-state ────────────────────────────────────────────────
    router.patch('/:id/staff-state', authenticate, authorize('ADMIN'), controller.updateStaffState)

    return router
}
