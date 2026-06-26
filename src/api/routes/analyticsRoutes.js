// src/api/routes/analyticsRoutes.js
//
// Express Router factory — mounts AnalyticsController handlers.

const { Router } = require('express')
const AnalyticsController = require('../controllers/analyticsController')
const { authenticate, authorize } = require('../middleware/auth')

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('ioredis')} redis
 * @returns {import('express').Router}
 */
module.exports = function analyticsRoutes(prisma, redis) {
    const router     = Router()
    const controller = new AnalyticsController(prisma, redis)

    // ── GET /dashboard ────────────────────────────────────────────────────────
    // Admin only. Returns aggregated statistics.
    router.get('/dashboard', authenticate, authorize('ADMIN'), controller.getDashboard)

    // ── GET /heatmap ──────────────────────────────────────────────────────────
    // Authenticated users. Returns location hotspots.
    router.get('/heatmap', authenticate, controller.getHeatmap)

    // ── GET /staff/:id/performance ────────────────────────────────────────────
    // Admin only. Returns performance metrics for a specific staff member.
    router.get('/staff/:id/performance', authenticate, authorize('ADMIN'), controller.getStaffPerformance)

    return router
}
