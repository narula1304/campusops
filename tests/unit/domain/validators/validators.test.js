// tests/unit/domain/validators/validators.test.js
//
// Pure unit tests — each validator tested in isolation first,
// then the full chain tested as an integrated sequence.
// No database, no framework — repositories are faked with jest.fn().

const {
    PriorityValidator,
    CategoryValidator,
    LocationValidator,
    DuplicateDetector,
    SpamThrottleValidator,
    PhotoRequirementCheck,
    buildValidationChain
} = require('../../../../src/domain/validators/ValidationChain')

const {
    ValidationError,
    DuplicateIncidentError,
    SpamThrottleError
} = require('../../../../src/domain/errors')

// ── Helpers ──

function makeDto(overrides = {}) {
    return {
        title: 'AC broken in lab',
        description: 'The air conditioner has been off for 2 days',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        location: { block: 'C', room: 'C-304' },
        evidencePhotos: [],
        departmentId: 'dept-electrical',
        ...overrides
    }
}

function makeContext(overrides = {}) {
    return {
        userId: 'student-1',
        incidentRepo: null,  // most tests don't need DB-touching validators
        ...overrides
    }
}

function makeRepo(overrides = {}) {
    return {
        findDuplicates: jest.fn().mockResolvedValue(null),
        incrementDuplicateCount: jest.fn().mockResolvedValue(undefined),
        countRecentByUser: jest.fn().mockResolvedValue(0),
        ...overrides
    }
}

// ── PriorityValidator ──

describe('PriorityValidator', () => {
    test('passes valid priorities through', async () => {
        const validator = new PriorityValidator()
        for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
            const dto = makeDto({ priority })
            await expect(validator.validate(dto, makeContext())).resolves.toMatchObject({ priority })
        }
    })

    test('throws ValidationError for unknown priority', async () => {
        const validator = new PriorityValidator()
        await expect(validator.validate(makeDto({ priority: 'SUPER' }), makeContext()))
            .rejects.toThrow(ValidationError)
    })

    test('throws ValidationError for missing priority', async () => {
        const validator = new PriorityValidator()
        await expect(validator.validate(makeDto({ priority: undefined }), makeContext()))
            .rejects.toThrow(ValidationError)
    })

    test('thrown ValidationError has field = "priority"', async () => {
        const validator = new PriorityValidator()
        try {
            await validator.validate(makeDto({ priority: 'WRONG' }), makeContext())
        } catch (e) {
            expect(e.field).toBe('priority')
        }
    })
})

// ── CategoryValidator ──

describe('CategoryValidator', () => {
    test('passes valid categories through', async () => {
        const validator = new CategoryValidator()
        for (const category of ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']) {
            await expect(validator.validate(makeDto({ category }), makeContext())).resolves.toBeDefined()
        }
    })

    test('throws ValidationError for unknown category', async () => {
        const validator = new CategoryValidator()
        await expect(validator.validate(makeDto({ category: 'UNKNOWN' }), makeContext()))
            .rejects.toThrow(ValidationError)
    })

    test('thrown ValidationError has field = "category"', async () => {
        const validator = new CategoryValidator()
        try {
            await validator.validate(makeDto({ category: 'WRONG' }), makeContext())
        } catch (e) {
            expect(e.field).toBe('category')
        }
    })
})

// ── LocationValidator ──

describe('LocationValidator', () => {
    test('passes when block is present', async () => {
        const validator = new LocationValidator()
        await expect(
            validator.validate(makeDto({ location: { block: 'A', room: '101' } }), makeContext())
        ).resolves.toBeDefined()
    })

    test('throws ValidationError when location.block is missing', async () => {
        const validator = new LocationValidator()
        await expect(
            validator.validate(makeDto({ location: { room: '101' } }), makeContext())
        ).rejects.toThrow(ValidationError)
    })

    test('throws ValidationError when location.block is empty string', async () => {
        const validator = new LocationValidator()
        await expect(
            validator.validate(makeDto({ location: { block: '   ' } }), makeContext())
        ).rejects.toThrow(ValidationError)
    })

    test('throws ValidationError when location is missing entirely', async () => {
        const validator = new LocationValidator()
        await expect(
            validator.validate(makeDto({ location: null }), makeContext())
        ).rejects.toThrow(ValidationError)
    })

    test('thrown error has field = "location.block"', async () => {
        const validator = new LocationValidator()
        try {
            await validator.validate(makeDto({ location: {} }), makeContext())
        } catch (e) {
            expect(e.field).toBe('location.block')
        }
    })
})

// ── DuplicateDetector ──

describe('DuplicateDetector', () => {
    test('passes when no duplicate exists', async () => {
        const repo = makeRepo({ findDuplicates: jest.fn().mockResolvedValue(null) })
        const validator = new DuplicateDetector()
        await expect(
            validator.validate(makeDto(), makeContext({ incidentRepo: repo }))
        ).resolves.toBeDefined()
    })

    test('throws DuplicateIncidentError when a similar open incident exists', async () => {
        const existing = { id: 'inc-existing', incidentNumber: 'INC-2025-000001', status: 'IN_PROGRESS' }
        const repo = makeRepo({ findDuplicates: jest.fn().mockResolvedValue(existing) })
        const validator = new DuplicateDetector()
        await expect(
            validator.validate(makeDto(), makeContext({ incidentRepo: repo }))
        ).rejects.toThrow(DuplicateIncidentError)
    })

    test('increments duplicateCount on existing incident when duplicate found', async () => {
        const existing = { id: 'inc-existing', incidentNumber: 'INC-2025-000001', status: 'OPEN' }
        const repo = makeRepo({ findDuplicates: jest.fn().mockResolvedValue(existing) })
        const validator = new DuplicateDetector()

        try {
            await validator.validate(makeDto(), makeContext({ incidentRepo: repo }))
        } catch (e) {
            // expected
        }

        expect(repo.incrementDuplicateCount).toHaveBeenCalledWith('inc-existing')
    })

    test('thrown DuplicateIncidentError carries existing incident info', async () => {
        const existing = { id: 'inc-existing', incidentNumber: 'INC-2025-000001', status: 'OPEN' }
        const repo = makeRepo({ findDuplicates: jest.fn().mockResolvedValue(existing) })
        const validator = new DuplicateDetector()

        try {
            await validator.validate(makeDto(), makeContext({ incidentRepo: repo }))
        } catch (e) {
            expect(e).toBeInstanceOf(DuplicateIncidentError)
            expect(e.existingId).toBe('inc-existing')
            expect(e.existingNumber).toBe('INC-2025-000001')
        }
    })

    test('skips duplicate check when no incidentRepo is provided', async () => {
        const validator = new DuplicateDetector()
        await expect(
            validator.validate(makeDto(), makeContext({ incidentRepo: null }))
        ).resolves.toBeDefined()
    })
})

// ── SpamThrottleValidator ──

describe('SpamThrottleValidator', () => {
    test('passes when user has submitted fewer than 5 incidents this hour', async () => {
        const repo = makeRepo({ countRecentByUser: jest.fn().mockResolvedValue(3) })
        const validator = new SpamThrottleValidator()
        await expect(
            validator.validate(makeDto(), makeContext({ incidentRepo: repo, userId: 'student-1' }))
        ).resolves.toBeDefined()
    })

    test('throws SpamThrottleError when user has submitted 5 or more this hour', async () => {
        const repo = makeRepo({ countRecentByUser: jest.fn().mockResolvedValue(5) })
        const validator = new SpamThrottleValidator()
        await expect(
            validator.validate(makeDto(), makeContext({ incidentRepo: repo, userId: 'student-1' }))
        ).rejects.toThrow(SpamThrottleError)
    })

    test('passes when countRecentByUser returns exactly 4 (boundary)', async () => {
        const repo = makeRepo({ countRecentByUser: jest.fn().mockResolvedValue(4) })
        const validator = new SpamThrottleValidator()
        await expect(
            validator.validate(makeDto(), makeContext({ incidentRepo: repo, userId: 'student-1' }))
        ).resolves.toBeDefined()
    })

    test('thrown SpamThrottleError has code SPAM_THROTTLE', async () => {
        const repo = makeRepo({ countRecentByUser: jest.fn().mockResolvedValue(10) })
        const validator = new SpamThrottleValidator()
        try {
            await validator.validate(makeDto(), makeContext({ incidentRepo: repo }))
        } catch (e) {
            expect(e.code).toBe('SPAM_THROTTLE')
        }
    })

    test('skips check when no userId in context', async () => {
        const validator = new SpamThrottleValidator()
        await expect(
            validator.validate(makeDto(), makeContext({ userId: null, incidentRepo: makeRepo() }))
        ).resolves.toBeDefined()
    })
})

// ── PhotoRequirementCheck ──

describe('PhotoRequirementCheck', () => {
    test('passes CRITICAL with at least one photo', async () => {
        const validator = new PhotoRequirementCheck()
        const dto = makeDto({ priority: 'CRITICAL', evidencePhotos: ['https://cloudinary/photo.jpg'] })
        await expect(validator.validate(dto, makeContext())).resolves.toBeDefined()
    })

    test('throws ValidationError for CRITICAL with no photos', async () => {
        const validator = new PhotoRequirementCheck()
        const dto = makeDto({ priority: 'CRITICAL', evidencePhotos: [] })
        await expect(validator.validate(dto, makeContext())).rejects.toThrow(ValidationError)
    })

    test('throws ValidationError for CRITICAL with null evidencePhotos', async () => {
        const validator = new PhotoRequirementCheck()
        const dto = makeDto({ priority: 'CRITICAL', evidencePhotos: null })
        await expect(validator.validate(dto, makeContext())).rejects.toThrow(ValidationError)
    })

    test('does NOT require photo for HIGH priority', async () => {
        const validator = new PhotoRequirementCheck()
        const dto = makeDto({ priority: 'HIGH', evidencePhotos: [] })
        await expect(validator.validate(dto, makeContext())).resolves.toBeDefined()
    })

    test('thrown error has field = "evidencePhotos"', async () => {
        const validator = new PhotoRequirementCheck()
        try {
            await validator.validate(makeDto({ priority: 'CRITICAL', evidencePhotos: [] }), makeContext())
        } catch (e) {
            expect(e.field).toBe('evidencePhotos')
        }
    })
})

// ── Chain integration ──

describe('buildValidationChain — full chain', () => {
    test('valid dto passes through the entire chain without throwing', async () => {
        const repo = makeRepo()
        const chain = buildValidationChain()
        const dto = makeDto({ priority: 'HIGH', evidencePhotos: [] })

        await expect(
            chain.validate(dto, makeContext({ incidentRepo: repo }))
        ).resolves.toMatchObject({ priority: 'HIGH' })
    })

    test('invalid priority is caught at the first handler (PriorityValidator)', async () => {
        const chain = buildValidationChain()
        await expect(
            chain.validate(makeDto({ priority: 'ULTRA' }), makeContext())
        ).rejects.toThrow(ValidationError)
    })

    test('invalid category is caught at the second handler (CategoryValidator)', async () => {
        const chain = buildValidationChain()
        await expect(
            chain.validate(makeDto({ category: 'WEIRD' }), makeContext())
        ).rejects.toThrow(ValidationError)
    })

    test('missing block is caught at the third handler (LocationValidator)', async () => {
        const chain = buildValidationChain()
        await expect(
            chain.validate(makeDto({ location: {} }), makeContext())
        ).rejects.toThrow(ValidationError)
    })

    test('duplicate is caught at the fourth handler (DuplicateDetector)', async () => {
        const existing = { id: 'inc-1', incidentNumber: 'INC-2025-000001', status: 'OPEN' }
        const repo = makeRepo({ findDuplicates: jest.fn().mockResolvedValue(existing) })
        const chain = buildValidationChain()
        await expect(
            chain.validate(makeDto(), makeContext({ incidentRepo: repo }))
        ).rejects.toThrow(DuplicateIncidentError)
    })

    test('spam is caught at the fifth handler (SpamThrottleValidator)', async () => {
        const repo = makeRepo({ countRecentByUser: jest.fn().mockResolvedValue(5) })
        const chain = buildValidationChain()
        await expect(
            chain.validate(makeDto(), makeContext({ userId: 'student-1', incidentRepo: repo }))
        ).rejects.toThrow(SpamThrottleError)
    })

    test('missing CRITICAL photo caught at sixth handler (PhotoRequirementCheck)', async () => {
        const repo = makeRepo()  // no duplicate, no spam
        const chain = buildValidationChain()
        await expect(
            chain.validate(
                makeDto({ priority: 'CRITICAL', evidencePhotos: [] }),
                makeContext({ incidentRepo: repo })
            )
        ).rejects.toThrow(ValidationError)
    })

    test('CRITICAL with photo passes the entire chain', async () => {
        const repo = makeRepo()
        const chain = buildValidationChain()
        const dto = makeDto({ priority: 'CRITICAL', evidencePhotos: ['https://photo.jpg'] })

        await expect(
            chain.validate(dto, makeContext({ incidentRepo: repo }))
        ).resolves.toMatchObject({ priority: 'CRITICAL' })
    })

    test('each error is typed — wrong priority does not throw SpamThrottleError', async () => {
        const chain = buildValidationChain()
        try {
            await chain.validate(makeDto({ priority: 'ULTRA' }), makeContext())
        } catch (e) {
            expect(e).toBeInstanceOf(ValidationError)
            expect(e).not.toBeInstanceOf(SpamThrottleError)
        }
    })
})