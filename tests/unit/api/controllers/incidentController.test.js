const IncidentController = require('../../../../src/api/controllers/incidentController')

function makeReq(overrides = {}) {
    return { body: {}, params: {}, query: {}, user: {}, ...overrides }
}

function makeRes() {
    const res = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    return res
}

function makeService(overrides = {}) {
    return {
        createIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
        assignIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
        resolveIncident: jest.fn().mockResolvedValue({ id: 'incident-1' }),
        submitFeedback: jest.fn().mockResolvedValue({ id: 'incident-1' }),
        getIncidentById: jest.fn().mockResolvedValue({ id: 'incident-1' }),
        listIncidents: jest.fn().mockResolvedValue({ incidents: [], total: 0 }),
        ...overrides,
    }
}

describe('IncidentController.createIncident', () => {
    test('calls incidentService.createIncident with req.body and req.user', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const reporter = { id: 'reporter-1', role: 'STUDENT' }
        const body = { title: 'AC broken', category: 'MAINTENANCE' }
        const req = makeReq({ body, user: reporter })
        const res = makeRes()
        const next = jest.fn()

        await controller.createIncident(req, res, next)

        expect(service.createIncident).toHaveBeenCalledWith(body, reporter)
    })

    test('responds 201 with { data: incident } on success', async () => {
        const incident = { id: 'incident-99' }
        const service = makeService({ createIncident: jest.fn().mockResolvedValue(incident) })
        const controller = new IncidentController(service)
        const req = makeReq()
        const res = makeRes()

        await controller.createIncident(req, res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(201)
        expect(res.json).toHaveBeenCalledWith({ data: incident })
    })

    test('passes thrown errors to next(), does not throw', async () => {
        const error = new Error('Validation failed')
        const service = makeService({ createIncident: jest.fn().mockRejectedValue(error) })
        const controller = new IncidentController(service)
        const next = jest.fn()

        await controller.createIncident(makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledWith(error)
    })

    test('works when called as a bare function reference (arrow fn class property)', async () => {
        // This is exactly how Express invokes it: router.post('/', controller.createIncident)
        const service = makeService()
        const controller = new IncidentController(service)
        const bareHandler = controller.createIncident // detach from instance
        const req = makeReq()
        const res = makeRes()

        // Should NOT throw "Cannot read property 'incidentService' of undefined"
        await expect(bareHandler(req, res, jest.fn())).resolves.not.toThrow()
        expect(service.createIncident).toHaveBeenCalled()
    })
})

describe('IncidentController.assignIncident', () => {
    test('calls incidentService.assignIncident with params.id and req.user', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const admin = { id: 'admin-1', role: 'ADMIN' }
        const req = makeReq({ params: { id: 'incident-42' }, user: admin })

        await controller.assignIncident(req, makeRes(), jest.fn())

        expect(service.assignIncident).toHaveBeenCalledWith('incident-42', admin)
    })

    test('responds 200 with { data: incident } on success', async () => {
        const incident = { id: 'incident-42' }
        const service = makeService({ assignIncident: jest.fn().mockResolvedValue(incident) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.assignIncident(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ data: incident })
    })

    test('passes thrown errors to next()', async () => {
        const error = new Error('No staff available')
        const service = makeService({ assignIncident: jest.fn().mockRejectedValue(error) })
        const controller = new IncidentController(service)
        const next = jest.fn()

        await controller.assignIncident(makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledWith(error)
    })
})

describe('IncidentController.resolveIncident', () => {
    test('calls incidentService.resolveIncident with correctly extracted arguments', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const staff = { id: 'staff-1', role: 'MAINTENANCE' }
        const req = makeReq({
            params: { id: 'incident-5' },
            body: { resolutionNote: 'Fixed it', resolutionPhoto: 'https://photo.url' },
            user: staff,
        })

        await controller.resolveIncident(req, makeRes(), jest.fn())

        expect(service.resolveIncident).toHaveBeenCalledWith(
            'incident-5', 'Fixed it', 'https://photo.url', staff
        )
    })

    test('responds 404 with NOT_FOUND envelope when service returns null', async () => {
        const service = makeService({ resolveIncident: jest.fn().mockResolvedValue(null) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.resolveIncident(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(404)
        expect(res.json).toHaveBeenCalledWith({
            error: { code: 'NOT_FOUND', message: 'Incident not found' },
        })
    })

    test('does NOT call next() when responding 404 (handled directly, not propagated)', async () => {
        const service = makeService({ resolveIncident: jest.fn().mockResolvedValue(null) })
        const controller = new IncidentController(service)
        const next = jest.fn()

        await controller.resolveIncident(makeReq(), makeRes(), next)

        expect(next).not.toHaveBeenCalled()
    })

    test('responds 200 with { data: incident } when found', async () => {
        const incident = { id: 'incident-5' }
        const service = makeService({ resolveIncident: jest.fn().mockResolvedValue(incident) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.resolveIncident(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ data: incident })
    })

    test('propagates thrown domain errors (e.g. ResolutionPhotoRequiredError) to next()', async () => {
        const error = new Error('Photo required')
        const service = makeService({ resolveIncident: jest.fn().mockRejectedValue(error) })
        const controller = new IncidentController(service)
        const next = jest.fn()

        await controller.resolveIncident(makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledWith(error)
    })
})

describe('IncidentController.submitFeedback', () => {
    test('calls incidentService.submitFeedback with id, rating object, and reporter', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const reporter = { id: 'reporter-1', role: 'STUDENT' }
        const req = makeReq({
            params: { id: 'incident-7' },
            body: { score: 5, comment: 'Great job' },
            user: reporter,
        })

        await controller.submitFeedback(req, makeRes(), jest.fn())

        expect(service.submitFeedback).toHaveBeenCalledWith(
            'incident-7', { score: 5, comment: 'Great job' }, reporter
        )
    })

    test('responds 404 when service returns null', async () => {
        const service = makeService({ submitFeedback: jest.fn().mockResolvedValue(null) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.submitFeedback(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(404)
    })

    test('responds 200 with { data: incident } when found', async () => {
        const incident = { id: 'incident-7' }
        const service = makeService({ submitFeedback: jest.fn().mockResolvedValue(incident) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.submitFeedback(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ data: incident })
    })
})

describe('IncidentController.getIncident', () => {
    test('calls incidentService.getIncidentById with params.id', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const req = makeReq({ params: { id: 'incident-9' } })

        await controller.getIncident(req, makeRes(), jest.fn())

        expect(service.getIncidentById).toHaveBeenCalledWith('incident-9')
    })

    test('responds 404 when service returns null', async () => {
        const service = makeService({ getIncidentById: jest.fn().mockResolvedValue(null) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.getIncident(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(404)
        expect(res.json).toHaveBeenCalledWith({
            error: { code: 'NOT_FOUND', message: 'Incident not found' },
        })
    })

    test('responds 200 with { data: incident } when found', async () => {
        const incident = { id: 'incident-9' }
        const service = makeService({ getIncidentById: jest.fn().mockResolvedValue(incident) })
        const controller = new IncidentController(service)
        const res = makeRes()

        await controller.getIncident(makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ data: incident })
    })
})

describe('IncidentController.listIncidents', () => {
    test('only includes filter keys actually present in req.query', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const req = makeReq({ query: { status: 'OPEN', priority: 'HIGH' } })

        await controller.listIncidents(req, makeRes(), jest.fn())

        const [filters] = service.listIncidents.mock.calls[0]
        expect(filters).toEqual({ status: 'OPEN', priority: 'HIGH' })
        expect(filters).not.toHaveProperty('category')
        expect(filters).not.toHaveProperty('departmentId')
    })

    test('does not pass undefined values for absent filters', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const req = makeReq({ query: {} })

        await controller.listIncidents(req, makeRes(), jest.fn())

        const [filters] = service.listIncidents.mock.calls[0]
        expect(Object.keys(filters)).toHaveLength(0)
    })

    test('parses page and limit as numbers', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const req = makeReq({ query: { page: '3', limit: '50' } })

        await controller.listIncidents(req, makeRes(), jest.fn())

        const [, pagination] = service.listIncidents.mock.calls[0]
        expect(pagination.page).toBe(3)
        expect(pagination.limit).toBe(50)
        expect(typeof pagination.page).toBe('number')
        expect(typeof pagination.limit).toBe('number')
    })

    test('defaults page=1 and limit=20 when absent from query', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const req = makeReq({ query: {} })

        await controller.listIncidents(req, makeRes(), jest.fn())

        const [, pagination] = service.listIncidents.mock.calls[0]
        expect(pagination.page).toBe(1)
        expect(pagination.limit).toBe(20)
    })

    test('includes sortBy and sortOrder only when present', async () => {
        const service = makeService()
        const controller = new IncidentController(service)
        const req = makeReq({ query: { sortBy: 'createdAt', sortOrder: 'desc' } })

        await controller.listIncidents(req, makeRes(), jest.fn())

        const [, pagination] = service.listIncidents.mock.calls[0]
        expect(pagination.sortBy).toBe('createdAt')
        expect(pagination.sortOrder).toBe('desc')
    })

    test('responds 200 with data array and meta envelope', async () => {
        const incidents = [{ id: 'inc-1' }, { id: 'inc-2' }]
        const service = makeService({
            listIncidents: jest.fn().mockResolvedValue({ incidents, total: 2 }),
        })
        const controller = new IncidentController(service)
        const req = makeReq({ query: { page: '1', limit: '20' } })
        const res = makeRes()

        await controller.listIncidents(req, res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({
            data: incidents,
            meta: { total: 2, page: 1, limit: 20 },
        })
    })

    test('propagates service errors to next()', async () => {
        const error = new Error('Database unreachable')
        const service = makeService({ listIncidents: jest.fn().mockRejectedValue(error) })
        const controller = new IncidentController(service)
        const next = jest.fn()

        await controller.listIncidents(makeReq(), makeRes(), next)

        expect(next).toHaveBeenCalledWith(error)
    })
})