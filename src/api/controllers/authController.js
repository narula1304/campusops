// src/api/controllers/authController.js
//
// Handles authentication-related HTTP requests.
//
// Designed for constructor injection (no singletons, no process.env reads
// inside methods) so the controller is fully testable in isolation.
//
// Handlers:
//   login    — POST /api/auth/login    (public)
//   register — POST /api/auth/register (public)
//   logout   — POST /api/auth/logout   (requires authenticate)
//   getMe    — GET  /api/auth/me       (requires authenticate)

const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')

// Fields selected for every auth response — never exposes passwordHash
const PUBLIC_USER_SELECT = {
    id:           true,
    name:         true,
    email:        true,
    role:         true,
    departmentId: true,
}

class AuthController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     * @param {string} jwtSecret
     */
    constructor(prisma, jwtSecret) {
        this.prisma    = prisma
        this.jwtSecret = jwtSecret
    }

    // ── Shared helpers ─────────────────────────────────────────────────────────

    /** Build and sign a JWT for a user payload object */
    #signToken(user) {
        const payload = {
            id:           user.id,
            name:         user.name,
            email:        user.email,
            role:         user.role,
            departmentId: user.departmentId,
        }
        return {
            token: jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' }),
            user:  payload,
        }
    }

    // ── register ───────────────────────────────────────────────────────────────

    /**
     * POST /api/auth/register
     *
     * Body: { name, email, password, role, departmentId?,
     *         rollNo?, year?, batch?,              ← STUDENT
     *         employeeId?, designation? }          ← FACULTY / MAINTENANCE / SECURITY / ADMIN
     *
     * Success 201: { token, user: { id, name, email, role, departmentId } }
     * Failure 409: { error: { code: 'EMAIL_TAKEN' } }
     *
     * @type {import('express').RequestHandler}
     */
    register = async (req, res, next) => {
        try {
            const {
                name, email, password, role, departmentId,
                // STUDENT fields
                rollNo, year, batch,
                // FACULTY / MAINTENANCE / SECURITY / ADMIN fields
                employeeId, designation,
            } = req.body

            // ── Uniqueness check ──────────────────────────────────────────────
            const existing = await this.prisma.user.findUnique({ where: { email } })
            if (existing) {
                return res.status(409).json({
                    error: {
                        code:    'EMAIL_TAKEN',
                        message: 'Email already registered',
                    },
                })
            }

            // ── Hash password ─────────────────────────────────────────────────
            const passwordHash = await bcrypt.hash(password, 10)

            // ── Build role-specific fields ────────────────────────────────────
            const roleFields = {}
            if (role === 'STUDENT') {
                if (rollNo !== undefined) roleFields.rollNo = rollNo
                if (year   !== undefined) roleFields.year   = Number(year)
                if (batch  !== undefined) roleFields.batch  = batch
            } else {
                // FACULTY, MAINTENANCE, SECURITY, ADMIN
                if (employeeId   !== undefined) roleFields.employeeId   = employeeId
                if (designation  !== undefined) roleFields.designation  = designation
            }

            // ── Persist ───────────────────────────────────────────────────────
            const created = await this.prisma.user.create({
                data: {
                    name,
                    email,
                    passwordHash,
                    role,
                    departmentId: departmentId ?? null,
                    isActive:     true,
                    ...roleFields,
                },
                select: PUBLIC_USER_SELECT,
            })

            // ── Issue token ───────────────────────────────────────────────────
            const { token, user } = this.#signToken(created)
            return res.status(201).json({ token, user })
        } catch (err) {
            next(err)
        }
    }

    // ── login ──────────────────────────────────────────────────────────────────

    /**
     * POST /api/auth/login
     *
     * Body: { email: string, password: string }
     *
     * Success 200: { token, user: { id, name, email, role, departmentId } }
     * Failure 401: { error: { code: 'INVALID_CREDENTIALS' } }
     * Failure 423: { error: { code: 'ACCOUNT_LOCKED', details: { lockedUntil } } }
     *
     * @type {import('express').RequestHandler}
     */
    login = async (req, res, next) => {
        try {
            const { email, password } = req.body

            // ── Fetch user (only what we need) ────────────────────────────────
            const user = await this.prisma.user.findUnique({
                where:  { email },
                select: {
                    id:               true,
                    name:             true,
                    email:            true,
                    role:             true,
                    departmentId:     true,
                    passwordHash:     true,
                    isActive:         true,
                    failedLoginCount: true,
                    lockedUntil:      true,
                },
            })

            // Unknown email or deactivated account — same error to avoid
            // leaking which emails are registered.
            if (!user || !user.isActive) {
                return res.status(401).json({
                    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
                })
            }

            // ── Account lockout check ─────────────────────────────────────────
            if (user.lockedUntil && user.lockedUntil > new Date()) {
                return res.status(423).json({
                    error: {
                        code:    'ACCOUNT_LOCKED',
                        message: `Account locked. Try again after ${user.lockedUntil.toISOString()}`,
                        details: { lockedUntil: user.lockedUntil.toISOString() },
                    },
                })
            }

            // ── Password verification ─────────────────────────────────────────
            const passwordMatch = await bcrypt.compare(password, user.passwordHash)

            if (!passwordMatch) {
                // Increment failed attempt counter; lock after 5 failures
                const newCount     = (user.failedLoginCount ?? 0) + 1
                const shouldLock   = newCount >= 5
                const lockedUntil  = shouldLock
                    ? new Date(Date.now() + 15 * 60 * 1000)   // 15-minute lockout
                    : null

                await this.prisma.user.update({
                    where: { id: user.id },
                    data:  {
                        failedLoginCount: newCount,
                        ...(shouldLock ? { lockedUntil } : {}),
                    },
                })

                return res.status(401).json({
                    error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
                })
            }

            // ── Success — reset counters, issue token ─────────────────────────
            await this.prisma.user.update({
                where: { id: user.id },
                data:  { failedLoginCount: 0, lockedUntil: null },
            })

            const { token, user: payload } = this.#signToken(user)
            return res.status(200).json({ token, user: payload })
        } catch (err) {
            next(err)
        }
    }

    // ── logout ─────────────────────────────────────────────────────────────────

    /**
     * POST /api/auth/logout
     *
     * Requires authenticate middleware. The client is responsible for clearing
     * its localStorage token. No server-side token blacklist is maintained
     * (stateless JWT design). A future refresh-token rotation scheme would
     * also invalidate the DB-stored hash here.
     *
     * Success 200: { message: 'Logged out successfully' }
     *
     * @type {import('express').RequestHandler}
     */
    logout = async (req, res, next) => {
        try {
            return res.status(200).json({ message: 'Logged out successfully' })
        } catch (err) {
            next(err)
        }
    }

    // ── getMe ──────────────────────────────────────────────────────────────────

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
