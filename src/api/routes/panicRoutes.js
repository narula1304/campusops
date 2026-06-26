// src/api/routes/panicRoutes.js
//
// Express Router factory — mounts PanicController handlers.

const { Router } = require('express')
const PanicController = require('../controllers/panicController')
const { authenticate, authorize } = require('../middleware/auth')

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('socket.io').Server} io
 * @returns {import('express').Router}
 */
module.exports = function panicRoutes(prisma, io) {
    const router     = Router()
    const controller = new PanicController(prisma, io)

    // ── POST / ────────────────────────────────────────────────────────────────
    // STUDENT and FACULTY only. Triggers a panic alert.
    router.post('/', authenticate, authorize('STUDENT', 'FACULTY'), controller.triggerPanic)

    // ── POST /:incidentId/acknowledge ─────────────────────────────────────────
    // SECURITY only. Acknowledges a panic alert.
    router.post('/:incidentId/acknowledge', authenticate, authorize('SECURITY'), controller.acknowledgePanic)

    // ── GET / ─────────────────────────────────────────────────────────────────
    // ADMIN and SECURITY only. Returns panic history.
    router.get('/', authenticate, authorize('ADMIN', 'SECURITY'), controller.getPanicHistory)

    return router
}
