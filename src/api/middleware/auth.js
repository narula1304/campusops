// src/api/middleware/auth.js
//
// Two Express middleware functions:
//
//   authenticate(req, res, next)
//     Reads the Bearer JWT from the Authorization header, verifies it with
//     jsonwebtoken, and attaches the decoded payload to req.user.
//     All failures call next(err) — the error-handling middleware (built later)
//     maps .statusCode and .code to the HTTP response.
//
//   authorize(...allowedRoles)
//     Higher-order function — returns a middleware that gate-keeps a route by
//     checking req.user.role against the caller-supplied list of allowed roles.
//
// Architecture rules enforced here:
//   • ZERO Prisma imports — role is already embedded in the JWT payload.
//   • ZERO business logic — identity is asserted by the token; roles are
//     asserted by the payload field. No DB round-trips needed.
//
// Error shape expected by the error-handler middleware:
//   const err = new Error('Human-readable message')
//   err.statusCode = 401 | 403 | 500
//   err.code       = 'UNAUTHENTICATED' | 'TOKEN_INVALID' | 'FORBIDDEN' | ...
//
// References:
//   API_CONTRACT.md   — Error Codes Reference table (UNAUTHORIZED, FORBIDDEN)
//   SYSTEM_DESIGN.md  — Section 4 (Authentication Flow), Section 2 (middleware stack)

const jwt = require('jsonwebtoken')

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Constructs a plain Error with .statusCode and .code attached.
 * The error-handling middleware reads these to build the HTTP response.
 *
 * @param {string} message      - Human-readable message sent to the client
 * @param {number} statusCode   - HTTP status code
 * @param {string} code         - Machine-readable error code (API_CONTRACT.md)
 * @returns {Error}
 */
function makeError(message, statusCode, code) {
    const err = new Error(message)
    err.statusCode = statusCode
    err.code = code
    return err
}

// ── authenticate ──────────────────────────────────────────────────────────────

/**
 * Verifies the JWT in the Authorization header and attaches the decoded
 * payload to req.user.
 *
 * Expected header format:
 *   Authorization: Bearer <token>
 *
 * On success:
 *   req.user = { id, role, departmentId, ...rest of JWT payload }
 *   calls next()
 *
 * On failure:
 *   calls next(err) with statusCode 401 and appropriate code
 *
 * @type {import('express').RequestHandler}
 */
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'] ?? req.headers['Authorization']

    // ── Header presence + format check ────────────────────────────────────────
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(
            makeError(
                'Authorization header is missing or malformed. Expected: Bearer <token>',
                401,
                'UNAUTHENTICATED'
            )
        )
    }

    const token = authHeader.slice(7) // strip "Bearer "

    if (!token) {
        return next(
            makeError('Bearer token is empty', 401, 'UNAUTHENTICATED')
        )
    }

    // ── Token verification ────────────────────────────────────────────────────
    // jwt.verify throws synchronously on invalid tokens, so we wrap in try/catch.
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded  // { id, role, departmentId, iat, exp, ... }
        return next()
    } catch (err) {
        // JsonWebTokenError     → invalid signature / malformed token
        // TokenExpiredError     → token past its exp claim
        // NotBeforeError        → token used before its nbf claim
        return next(
            makeError(
                err.message ?? 'Token verification failed',
                401,
                'TOKEN_INVALID'
            )
        )
    }
}

// ── authorize ─────────────────────────────────────────────────────────────────

/**
 * Higher-order function — call it at route-definition time with the roles
 * that may access the route:
 *
 *   router.get('/dashboard', authenticate, authorize('ADMIN', 'FACULTY'), handler)
 *
 * The returned middleware reads req.user (set by authenticate) and allows the
 * request through only if req.user.role is in allowedRoles.
 *
 * @param {...string} allowedRoles  - One or more role strings ('ADMIN', 'STUDENT', …)
 * @returns {import('express').RequestHandler}
 */
function authorize(...allowedRoles) {
    return function authorizeMiddleware(req, res, next) {
        // Guard: authorize() must run after authenticate()
        if (!req.user) {
            return next(
                makeError(
                    'authorize() middleware ran before authenticate(). ' +
                    'Ensure authenticate is listed first in the middleware chain.',
                    500,
                    'MIDDLEWARE_ORDER_ERROR'
                )
            )
        }

        if (!allowedRoles.includes(req.user.role)) {
            return next(
                makeError(
                    `Access denied. This route requires one of the following roles: ${allowedRoles.join(', ')}. ` +
                    `Your role: ${req.user.role}`,
                    403,
                    'FORBIDDEN'
                )
            )
        }

        return next()
    }
}

// ── exports ───────────────────────────────────────────────────────────────────

module.exports = { authenticate, authorize }
