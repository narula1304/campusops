const jwt = require('jsonwebtoken')
const { authenticate, authorize } = require('../../../../src/api/middleware/auth')

const JWT_SECRET = 'test-secret-key-for-verification'

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
})

function makeReq(overrides = {}) {
    return { headers: {}, ...overrides }
}

function makeRes() {
    return {}
}

function signToken(payload, options = {}) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', ...options })
}

describe('authenticate', () => {
    test('valid token sets req.user and calls next() with no error', () => {
        const token = signToken({ id: 'user-1', role: 'STUDENT', departmentId: 'dept-1' })
        const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        expect(next).toHaveBeenCalledWith() // called with no arguments = success
        expect(req.user.id).toBe('user-1')
        expect(req.user.role).toBe('STUDENT')
        expect(req.user.departmentId).toBe('dept-1')
    })

    test('missing Authorization header calls next() with 401 UNAUTHENTICATED', () => {
        const req = makeReq({ headers: {} })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        expect(next).toHaveBeenCalledTimes(1)
        const err = next.mock.calls[0][0]
        expect(err).toBeInstanceOf(Error)
        expect(err.statusCode).toBe(401)
        expect(err.code).toBe('UNAUTHENTICATED')
    })

    test('malformed header (no "Bearer " prefix) calls next() with 401 UNAUTHENTICATED', () => {
        const req = makeReq({ headers: { authorization: 'NotBearer sometoken' } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(401)
        expect(err.code).toBe('UNAUTHENTICATED')
    })

    test('empty bearer token calls next() with 401 UNAUTHENTICATED', () => {
        const req = makeReq({ headers: { authorization: 'Bearer ' } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(401)
    })

    test('invalid signature calls next() with 401 TOKEN_INVALID', () => {
        const tokenSignedWithWrongSecret = jwt.sign({ id: 'user-1', role: 'STUDENT' }, 'wrong-secret')
        const req = makeReq({ headers: { authorization: `Bearer ${tokenSignedWithWrongSecret}` } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(401)
        expect(err.code).toBe('TOKEN_INVALID')
    })

    test('expired token calls next() with 401 TOKEN_INVALID', () => {
        // Sign a token that already expired 1 hour ago
        const expiredToken = jwt.sign(
            { id: 'user-1', role: 'STUDENT' },
            JWT_SECRET,
            { expiresIn: '-1h' }
        )
        const req = makeReq({ headers: { authorization: `Bearer ${expiredToken}` } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(401)
        expect(err.code).toBe('TOKEN_INVALID')
    })

    test('malformed JWT string (not even valid JWT structure) calls next() with 401 TOKEN_INVALID', () => {
        const req = makeReq({ headers: { authorization: 'Bearer not.a.realtoken' } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(401)
        expect(err.code).toBe('TOKEN_INVALID')
    })

    test('req.user contains full JWT payload including custom fields', () => {
        const token = signToken({ id: 'user-2', role: 'ADMIN', departmentId: null, name: 'Test Admin' })
        const req = makeReq({ headers: { authorization: `Bearer ${token}` } })
        const next = jest.fn()

        authenticate(req, makeRes(), next)

        expect(req.user.name).toBe('Test Admin')
        expect(req.user.departmentId).toBeNull()
    })
})

describe('authorize', () => {
    test('matching role calls next() with no error', () => {
        const middleware = authorize('ADMIN', 'FACULTY')
        const req = { user: { id: 'user-1', role: 'ADMIN' } }
        const next = jest.fn()

        middleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledWith()
    })

    test('non-matching role calls next() with 403 FORBIDDEN', () => {
        const middleware = authorize('ADMIN')
        const req = { user: { id: 'user-1', role: 'STUDENT' } }
        const next = jest.fn()

        middleware(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(403)
        expect(err.code).toBe('FORBIDDEN')
    })

    test('403 message mentions the required roles', () => {
        const middleware = authorize('ADMIN', 'FACULTY')
        const req = { user: { id: 'user-1', role: 'STUDENT' } }
        const next = jest.fn()

        middleware(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.message).toMatch(/ADMIN/)
        expect(err.message).toMatch(/FACULTY/)
    })

    test('missing req.user (authorize called before authenticate) calls next() with 500', () => {
        const middleware = authorize('ADMIN')
        const req = {} // no req.user at all
        const next = jest.fn()

        middleware(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(500)
        expect(err.code).toBe('MIDDLEWARE_ORDER_ERROR')
    })

    test('authorize with a single allowed role works correctly', () => {
        const middleware = authorize('STUDENT')
        const req = { user: { id: 'user-1', role: 'STUDENT' } }
        const next = jest.fn()

        middleware(req, makeRes(), next)

        expect(next).toHaveBeenCalledWith()
    })

    test('authorize returns a NEW middleware function each call (no shared state across routes)', () => {
        const middlewareA = authorize('ADMIN')
        const middlewareB = authorize('STUDENT')

        expect(middlewareA).not.toBe(middlewareB)

        // Verify they don't interfere with each other
        const reqAdmin = { user: { role: 'ADMIN' } }
        const reqStudent = { user: { role: 'STUDENT' } }
        const nextA = jest.fn()
        const nextB = jest.fn()

        middlewareA(reqAdmin, makeRes(), nextA)
        middlewareB(reqStudent, makeRes(), nextB)

        expect(nextA).toHaveBeenCalledWith()
        expect(nextB).toHaveBeenCalledWith()
    })

    // ── Security-critical: make sure authorize is NOT accidentally permissive ──

    test('SECURITY: a role NOT explicitly listed is always rejected, never defaults to allowed', () => {
        const middleware = authorize('ADMIN')
        const roles = ['STUDENT', 'FACULTY', 'MAINTENANCE', 'SECURITY', undefined, null, '']

        roles.forEach((role) => {
            const req = { user: { id: 'user-x', role } }
            const next = jest.fn()
            middleware(req, makeRes(), next)
            const err = next.mock.calls[0][0]
            expect(err).toBeDefined()
            expect(err.statusCode).toBe(403)
        })
    })

    test('SECURITY: empty allowedRoles list rejects every role', () => {
        const middleware = authorize() // no roles passed at all
        const req = { user: { id: 'user-1', role: 'ADMIN' } }
        const next = jest.fn()

        middleware(req, makeRes(), next)

        const err = next.mock.calls[0][0]
        expect(err.statusCode).toBe(403)
    })
})