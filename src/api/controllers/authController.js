// src/api/controllers/authController.js
//
// Handles authentication-related HTTP requests.
//
// Designed for constructor injection (no singletons, no process.env reads
// inside methods) so the controller is fully testable in isolation.
//
// Handlers:
//   login   — POST /api/auth/login  (public — no authenticate middleware)
//   getMe   — GET  /api/auth/me     (requires authenticate middleware)

const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')

class AuthController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     * @param {string} jwtSecret
     */
    constructor(prisma, jwtSecret) {
        this.prisma    = prisma
        this.jwtSecret = jwtSecret
    }

    // ── login ─────────────────────────────────────────────────────────────────

    /**
     * POST /api/auth/login
     *
     * Body: { email: string, password: string }
     *
     * Success 200: { token: string, user: { id, name, email, role, departmentId } }
     * Failure 401: { error: { code: 'INVALID_CREDENTIALS', message: string } }
     *
     * @type {import('express').RequestHandler}
     */
    login = async (req, res, next) => {
        try {
            const { email, password } = req.body

            // ── Fetch user (only the columns we need) ────────────────────────
            const user = await this.prisma.user.findUnique({
                where:  { email },
                select: {
                    id:           true,
                    name:         true,
                    email:        true,
                    role:         true,
                    departmentId: true,
                    passwordHash: true,
                    isActive:     true,
                },
            })

            // Unknown email or deactivated account — same generic error to
            // avoid leaking which emails are registered.
            if (!user || !user.isActive) {
                return res.status(401).json({
                    error: {
                        code:    'INVALID_CREDENTIALS',
                        message: 'Invalid email or password',
                    },
                })
            }

            // ── Password verification ─────────────────────────────────────────
            const passwordMatch = await bcrypt.compare(password, user.passwordHash)

            if (!passwordMatch) {
                return res.status(401).json({
                    error: {
                        code:    'INVALID_CREDENTIALS',
                        message: 'Invalid email or password',
                    },
                })
            }

            // ── Issue JWT ─────────────────────────────────────────────────────
            const payload = {
                id:           user.id,
                name:         user.name,
                email:        user.email,
                role:         user.role,
                departmentId: user.departmentId,
            }

            const token = jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' })

            return res.status(200).json({
                token,
                user: payload,
            })
        } catch (err) {
            next(err)
        }
    }

    // ── getMe ─────────────────────────────────────────────────────────────────

    /**
     * GET /api/auth/me
     *
     * Requires authenticate middleware — req.user is already populated.
     *
     * Success 200: { data: <full user record> }
     *
     * @type {import('express').RequestHandler}
     */
    getMe = async (req, res, next) => {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: req.user.id },
            })

            return res.status(200).json({ data: user })
        } catch (err) {
            next(err)
        }
    }
}

module.exports = AuthController
