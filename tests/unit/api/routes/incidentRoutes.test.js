// This test spins up a REAL Express app with the REAL router, REAL auth
// middleware, and REAL errorHandler — only IncidentService is faked. This
// is the most rigorous way to catch route-ordering bugs, role-mismatch
// bugs, or middleware-wiring mistakes that pure unit tests would miss.

const express = require('express')
const jwt = require('jsonwebtoken')
const request = require('supertest')

const incidentRoutes = require('../../../../src/api/routes/incidentRoutes')
const errorHandler = require('../../../../src/api/middleware/errorHandler')

const JWT_SECRET = 'test-secret-for-route-integration'

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
})

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
}

function makeService(overrides = {}) {
    return {
        createIncident: jest.fn().mockResolvedValue({ id: 'incident-1', title: 'Test' }),
        assignIncident: jest.fn().mockResolvedValue({ id: 'incident-1', status: 'IN_PROGRESS' }),
        resolveIncident: jest.fn().mockResolvedValue({ id: 'incident-1', status: 'RESOLVED' }),
        submitFeedback: jest.fn().mockResolvedValue({ id: 'incident-1', status: 'RESOLVED' }),
        getIncidentById: jest.fn().mockResolvedValue({ id: 'incident-1', title: 'Test' }),
        listIncidents: jest.fn().mockResolvedValue({ incidents: [], total: 0 }),
        ...overrides,
    }
}

function buildApp(service) {
    const app = express()
    app.use(express.json())
    app.use('/api/incidents', incidentRoutes(service))
    app.use(errorHandler)
    return app
}

describe('incidentRoutes — POST /api/incidents (createIncident)', () => {
    test('STUDENT role can create an incident — 201', async () => {
        const service = makeService()
        const app = buildApp(service)
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'AC broken', category: 'MAINTENANCE', priority: 'HIGH' })

        expect(res.status).toBe(201)
        expect(res.body.data).toBeDefined()
    })

    test('FACULTY role can create an incident — 201', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'faculty-1', role: 'FACULTY' })

        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(201)
    })

    test('MAINTENANCE role is FORBIDDEN from creating an incident — 403', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'staff-1', role: 'MAINTENANCE' })

        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
    })

    test('no Authorization header — 401', async () => {
        const app = buildApp(makeService())

        const res = await request(app).post('/api/incidents').send({})

        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    test('invalid token — 401', async () => {
        const app = buildApp(makeService())

        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', 'Bearer garbage.invalid.token')
            .send({})

        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('TOKEN_INVALID')
    })
})

describe('incidentRoutes — POST /api/incidents/:id/assign (assignIncident)', () => {
    test('ADMIN role can assign — 200', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'admin-1', role: 'ADMIN' })

        const res = await request(app)
            .post('/api/incidents/incident-5/assign')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
    })

    test('STUDENT role is FORBIDDEN from assigning — 403', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .post('/api/incidents/incident-5/assign')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(403)
    })

    test('MAINTENANCE role is FORBIDDEN from assigning — 403', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'staff-1', role: 'MAINTENANCE' })

        const res = await request(app)
            .post('/api/incidents/incident-5/assign')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(403)
    })

    // ── ROUTE ORDERING CRITICAL TEST ──
    // This is exactly the bug the code comment warns about: if /:id/assign
    // were registered AFTER /:id, Express would treat "assign" as the :id
    // value on a GET-style match, or some routers would misroute entirely.
    // Confirm the literal segment route actually wins over the param route.
    test('CRITICAL — /:id/assign route is matched correctly, not swallowed by /:id', async () => {
        const service = makeService()
        const app = buildApp(service)
        const token = signToken({ id: 'admin-1', role: 'ADMIN' })

        await request(app)
            .post('/api/incidents/incident-5/assign')
            .set('Authorization', `Bearer ${token}`)

        // If routing were broken, this would never be called (a GET handler
        // or 404 would fire instead since POST /:id doesn't exist)
        expect(service.assignIncident).toHaveBeenCalledWith('incident-5', expect.objectContaining({ id: 'admin-1' }))
    })
})

describe('incidentRoutes — POST /api/incidents/:id/resolve (resolveIncident)', () => {
    test('MAINTENANCE role can resolve — 200', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'staff-1', role: 'MAINTENANCE' })

        const res = await request(app)
            .post('/api/incidents/incident-5/resolve')
            .set('Authorization', `Bearer ${token}`)
            .send({ resolutionNote: 'Fixed it', resolutionPhoto: 'https://photo.url' })

        expect(res.status).toBe(200)
    })

    test('SECURITY role can resolve — 200', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'officer-1', role: 'SECURITY' })

        const res = await request(app)
            .post('/api/incidents/incident-5/resolve')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(200)
    })

    test('STUDENT role is FORBIDDEN from resolving — 403', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .post('/api/incidents/incident-5/resolve')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(403)
    })

    test('ADMIN role is FORBIDDEN from resolving (not in allowed list)', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'admin-1', role: 'ADMIN' })

        const res = await request(app)
            .post('/api/incidents/incident-5/resolve')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(403)
    })

    test('returns 404 when service returns null (incident not found)', async () => {
        const service = makeService({ resolveIncident: jest.fn().mockResolvedValue(null) })
        const app = buildApp(service)
        const token = signToken({ id: 'staff-1', role: 'MAINTENANCE' })

        const res = await request(app)
            .post('/api/incidents/missing-id/resolve')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(404)
        expect(res.body.error.code).toBe('NOT_FOUND')
    })
})

describe('incidentRoutes — POST /api/incidents/:id/feedback (submitFeedback)', () => {
    test('STUDENT role can submit feedback — 200', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .post('/api/incidents/incident-5/feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ score: 5 })

        expect(res.status).toBe(200)
    })

    test('MAINTENANCE role is FORBIDDEN from submitting feedback — 403', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'staff-1', role: 'MAINTENANCE' })

        const res = await request(app)
            .post('/api/incidents/incident-5/feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ score: 5 })

        expect(res.status).toBe(403)
    })
})

describe('incidentRoutes — GET /api/incidents/:id (getIncident)', () => {
    test('any authenticated role can view a single incident — 200', async () => {
        const app = buildApp(makeService())
        const roles = ['STUDENT', 'FACULTY', 'ADMIN', 'MAINTENANCE', 'SECURITY']

        for (const role of roles) {
            const token = signToken({ id: `user-${role}`, role })
            const res = await request(app)
                .get('/api/incidents/incident-5')
                .set('Authorization', `Bearer ${token}`)
            expect(res.status).toBe(200)
        }
    })

    test('returns 404 when incident not found', async () => {
        const service = makeService({ getIncidentById: jest.fn().mockResolvedValue(null) })
        const app = buildApp(service)
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .get('/api/incidents/missing-id')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(404)
    })

    test('unauthenticated request is rejected — 401', async () => {
        const app = buildApp(makeService())

        const res = await request(app).get('/api/incidents/incident-5')

        expect(res.status).toBe(401)
    })
})

describe('incidentRoutes — GET /api/incidents (listIncidents)', () => {
    test('any authenticated role can list incidents — 200', async () => {
        const app = buildApp(makeService())
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .get('/api/incidents')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.data).toEqual([])
        expect(res.body.meta).toBeDefined()
    })

    test('query filters reach the service correctly through real HTTP query parsing', async () => {
        const service = makeService()
        const app = buildApp(service)
        const token = signToken({ id: 'admin-1', role: 'ADMIN' })

        await request(app)
            .get('/api/incidents?status=OPEN&priority=HIGH&page=2&limit=10')
            .set('Authorization', `Bearer ${token}`)

        expect(service.listIncidents).toHaveBeenCalledWith(
            { status: 'OPEN', priority: 'HIGH' },
            expect.objectContaining({ page: 2, limit: 10 })
        )
    })

    // ── ROUTE ORDERING CRITICAL TEST ──
    // GET / and GET /:id must not collide. A request to GET /api/incidents
    // (no id) must hit listIncidents, not getIncident with id=undefined.
    test('CRITICAL — GET / (list) and GET /:id (single) do not collide', async () => {
        const service = makeService()
        const app = buildApp(service)
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        await request(app).get('/api/incidents').set('Authorization', `Bearer ${token}`)
        await request(app).get('/api/incidents/incident-5').set('Authorization', `Bearer ${token}`)

        expect(service.listIncidents).toHaveBeenCalledTimes(1)
        expect(service.getIncidentById).toHaveBeenCalledWith('incident-5')
    })
})

describe('incidentRoutes — error propagation through real errorHandler', () => {
    test('a thrown domain error from the service maps to the correct status code via errorHandler', async () => {
        const { NoStaffAvailableError } = require('../../../../src/domain/errors')
        const service = makeService({
            assignIncident: jest.fn().mockRejectedValue(new NoStaffAvailableError('dept-electrical')),
        })
        const app = buildApp(service)
        const token = signToken({ id: 'admin-1', role: 'ADMIN' })

        const res = await request(app)
            .post('/api/incidents/incident-5/assign')
            .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(503)
        expect(res.body.error.code).toBe('NO_STAFF_AVAILABLE')
    })

    test('an unexpected error from the service maps to 500 without leaking details', async () => {
        const service = makeService({
            createIncident: jest.fn().mockRejectedValue(new Error('connection string: postgres://secret')),
        })
        const app = buildApp(service)
        const token = signToken({ id: 'student-1', role: 'STUDENT' })

        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${token}`)
            .send({})

        expect(res.status).toBe(500)
        expect(res.body.error.message).not.toMatch(/postgres/)
    })
})