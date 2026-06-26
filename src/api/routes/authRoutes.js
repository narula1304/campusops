// src/api/routes/authRoutes.js
//
// Express Router factory — mounts AuthController handlers.
//
// Exported as a factory function that accepts (prisma, jwtSecret) and returns
// a configured router. This keeps the route module free of singleton state
// and makes it straightforward to test in isolation.
//
// Usage in app entrypoint:
//   const authRoutes = require('./api/routes/authRoutes')
//   app.use('/api/auth', authRoutes(prismaClient, process.env.JWT_SECRET))
//
// Route table (all paths relative to the /api/auth mount point):
//   POST /register  — public (no authenticate)  → authController.register
//   POST /login     — public (no authenticate)  → authController.login
//   POST /logout    — authenticate required     → authController.logout
//   GET  /me        — authenticate required     → authController.getMe

const { Router } = require('express')
const AuthController = require('../controllers/authController')
const { authenticate } = require('../middleware/auth')

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} jwtSecret
 * @returns {import('express').Router}
 */
module.exports = function authRoutes(prisma, jwtSecret) {
    const router     = Router()
    const controller = new AuthController(prisma, jwtSecret)

    // ── POST /register ────────────────────────────────────────────────────────
    // Public — no authenticate middleware.
    // Creates a new user account and returns a JWT on success.
    router.post('/register', controller.register)

    // ── POST /login ───────────────────────────────────────────────────────────
    // Public — no authenticate middleware.
    // Verifies credentials; enforces lockout after 5 failed attempts.
    router.post('/login', controller.login)

    // ── POST /logout ──────────────────────────────────────────────────────────
    // Requires a valid JWT. Stateless — client clears its own localStorage token.
    router.post('/logout', authenticate, controller.logout)

    // ── GET /me ───────────────────────────────────────────────────────────────
    // Requires a valid JWT; authenticate populates req.user before the handler.
    router.get('/me', authenticate, controller.getMe)

    return router
}
