const errorHandler = require('../../../../src/api/middleware/errorHandler')
const {
    ValidationError,
    DuplicateIncidentError,
    SpamThrottleError,
    InvalidCategoryError,
    InvalidPriorityError,
    InvalidTransitionError,
    ResolutionPhotoRequiredError,
    ResolutionNoteTooShortError,
    StaffUnavailableError,
    StaffNotEligibleError,
    NoStaffAvailableError,
    IncidentNotAssignableError,
} = require('../../../../src/domain/errors')

function makeReq(overrides = {}) {
    return { method: 'POST', path: '/api/incidents', ...overrides }
}

function makeRes() {
    const res = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    return res
}

let consoleErrorSpy
let consoleWarnSpy

beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { })
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })
})

afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
})

describe('errorHandler — status code mapping', () => {
    test('ValidationError maps to 422', () => {
        const err = new ValidationError('priority', 'Priority is required')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(422)
    })

    test('DuplicateIncidentError maps to 409', () => {
        const err = new DuplicateIncidentError('inc-1', 'INC-2025-000001', 'OPEN')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(409)
    })

    test('SpamThrottleError maps to 429', () => {
        const err = new SpamThrottleError('Too many incidents')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(429)
    })

    test('NoStaffAvailableError maps to 503', () => {
        const err = new NoStaffAvailableError('dept-electrical')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(503)
    })

    test('InvalidCategoryError maps to 422', () => {
        const err = new InvalidCategoryError('BOGUS')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(422)
    })

    test('InvalidPriorityError maps to 422', () => {
        const err = new InvalidPriorityError('BOGUS')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(422)
    })

    test('InvalidTransitionError maps to 422', () => {
        const err = new InvalidTransitionError('OPEN', 'resolve')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(422)
    })

    test('ResolutionPhotoRequiredError maps to 422', () => {
        const err = new ResolutionPhotoRequiredError()
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(422)
    })

    test('StaffUnavailableError maps to 409', () => {
        const err = new StaffUnavailableError('staff-1')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(409)
    })

    test('StaffNotEligibleError maps to 409', () => {
        const err = new StaffNotEligibleError('staff-1')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(409)
    })

    test('IncidentNotAssignableError maps to 422', () => {
        const err = new IncidentNotAssignableError('Incident already assigned')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(422)
    })

    test('generic Error maps to 500', () => {
        const err = new Error('Something broke unexpectedly')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(500)
    })

    test('err.statusCode takes precedence over instanceof lookup (auth.js errors)', () => {
        const err = new Error('Authorization header missing')
        err.statusCode = 401
        err.code = 'UNAUTHENTICATED'
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        expect(res.status).toHaveBeenCalledWith(401)
    })
})

describe('errorHandler — response body shape', () => {
    test('5xx errors do NOT leak err.message in the response', () => {
        const err = new Error('Database connection string: postgres://user:secret@host/db')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body.error.message).not.toMatch(/postgres/)
        expect(body.error.message).toBe('An unexpected error occurred. Please try again later.')
    })

    test('4xx errors DO include err.message', () => {
        const err = new ValidationError('priority', 'Priority must be one of: LOW, MEDIUM, HIGH, CRITICAL')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body.error.message).toBe('Priority must be one of: LOW, MEDIUM, HIGH, CRITICAL')
    })

    test('ValidationError field property appears in the response when present', () => {
        const err = new ValidationError('location.block', 'Location block is required')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body.error.field).toBe('location.block')
    })

    test('field property is omitted entirely when absent (not field: undefined)', () => {
        const err = new DuplicateIncidentError('inc-1', 'INC-2025-000001', 'OPEN')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect('field' in body.error).toBe(false)
    })

    test('code uses err.code set by DomainError subclasses', () => {
        const err = new SpamThrottleError('Too many submissions')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body.error.code).toBe('SPAM_THROTTLE')
    })

    test('code falls back to constructor.name when err.code is absent', () => {
        class CustomError extends Error { }
        const err = new CustomError('Some custom failure')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body.error.code).toBe('CustomError')
    })

    test('code falls back to INTERNAL_ERROR for plain Error with no code', () => {
        const err = new Error('Unexpected failure')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body.error.code).toBe('INTERNAL_ERROR')
    })

    test('response envelope always has the shape { error: { code, message } }', () => {
        const err = new ValidationError('priority', 'Required')
        const res = makeRes()

        errorHandler(err, makeReq(), res, jest.fn())

        const body = res.json.mock.calls[0][0]
        expect(body).toHaveProperty('error')
        expect(body.error).toHaveProperty('code')
        expect(body.error).toHaveProperty('message')
    })
})

describe('errorHandler — logging behaviour', () => {
    test('5xx errors are logged via console.error with full error object', () => {
        const err = new Error('Unexpected crash')
        errorHandler(err, makeReq(), makeRes(), jest.fn())

        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    test('4xx errors are logged via console.warn, not console.error', () => {
        const err = new ValidationError('priority', 'Required')
        errorHandler(err, makeReq(), makeRes(), jest.fn())

        expect(consoleWarnSpy).toHaveBeenCalled()
        expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
})