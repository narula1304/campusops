// src/api/routes/alertRoutes.js
//
// Express Router factory — mounts AlertController handlers.

const { Router } = require('express')
const AlertController = require('../controllers/alertController')
const { authenticate, authorize } = require('../middleware/auth')

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('socket.io').Server} io
 * @returns {import('express').Router}
 */
module.exports = function alertRoutes(prisma, io) {
    const router     = Router()
    const controller = new AlertController(prisma, io)

    // ── POST / ────────────────────────────────────────────────────────────────
    // Admin only. Broadcasts an alert.
    router.post('/', authenticate, authorize('ADMIN'), controller.broadcastAlert)

    // ── GET / ─────────────────────────────────────────────────────────────────
    // Authenticated users. Lists alerts.
    router.get('/', authenticate, controller.listAlerts)

    // ── PATCH /:id/retract ────────────────────────────────────────────────────
    // Admin only. Retracts an alert.
    router.patch('/:id/retract', authenticate, authorize('ADMIN'), controller.retractAlert)

    return router
}
