// src/domain/validators/ValidationChain.js
//
// Chain of Responsibility pattern (DESIGN_PATTERNS.md Pattern 5).
//
// Problem it solves:
// Before an incident is created, it must pass 5 independent validation rules:
// valid priority, valid location, not a duplicate, user not spamming, photo
// required for critical. Without CoR, all this logic lives in one giant
// validate() function that grows indefinitely and is impossible to test
// in isolation.
//
// With CoR:
//   - Each handler validates ONE concern and either throws or passes to next
//   - Adding a new rule = new handler class plugged into the chain
//   - Each handler is unit-testable in isolation
//   - Order of validation is explicit and controllable
//
// ZERO framework imports. Repositories are injected via context object
// so the validators never import Prisma directly.

const {
    ValidationError,
    DuplicateIncidentError,
    SpamThrottleError,
    InvalidPriorityError
} = require('../errors')

// ── Abstract base ──

class ValidationHandler {
    constructor() {
        this._next = null
    }

    /**
     * Sets the next handler in the chain.
     * Returns the handler so calls can be chained fluently:
     *   new PriorityValidator().setNext(new LocationValidator()).setNext(...)
     */
    setNext(handler) {
        this._next = handler
        return handler
    }

    /**
     * Validate the DTO. Subclasses call super.validate(dto, context)
     * to pass control to the next handler in the chain.
     * If this is the last handler, returns the dto unchanged.
     *
     * @param {object} dto      incident creation data
     * @param {object} context  { userId, incidentRepo }
     * @returns {Promise<object>} the validated (and possibly enriched) dto
     */
    async validate(dto, context) {
        if (this._next) return this._next.validate(dto, context)
        return dto
    }
}

// ── Handler 1: PriorityValidator ──
// Ensures priority is one of the known enum values.
// First in chain — cheapest check, no I/O.

const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

class PriorityValidator extends ValidationHandler {
    async validate(dto, context) {
        if (!dto.priority || !VALID_PRIORITIES.includes(dto.priority)) {
            throw new ValidationError(
                'priority',
                `Priority must be one of: ${VALID_PRIORITIES.join(', ')}. Got: "${dto.priority}"`
            )
        }
        return super.validate(dto, context)
    }
}

// ── Handler 2: CategoryValidator ──
// Ensures category is one of the known enum values.

const VALID_CATEGORIES = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']

class CategoryValidator extends ValidationHandler {
    async validate(dto, context) {
        if (!dto.category || !VALID_CATEGORIES.includes(dto.category)) {
            throw new ValidationError(
                'category',
                `Category must be one of: ${VALID_CATEGORIES.join(', ')}. Got: "${dto.category}"`
            )
        }
        return super.validate(dto, context)
    }
}

// ── Handler 3: LocationValidator ──
// Ensures block is provided (room is optional).
// In production this could also check against a campus block registry.

class LocationValidator extends ValidationHandler {
    async validate(dto, context) {
        if (!dto.location?.block || dto.location.block.trim() === '') {
            throw new ValidationError(
                'location.block',
                'Location block is required (e.g. "A", "B", "C")'
            )
        }
        return super.validate(dto, context)
    }
}

// ── Handler 4: DuplicateDetector ──
// Checks if a similar open incident already exists for this location + category
// within a 24-hour window. If a duplicate is found, increments its
// duplicateCount and throws DuplicateIncidentError — no new incident is created.
//
// Uses context.incidentRepo so it never imports Prisma directly.

const DUPLICATE_WINDOW_HOURS = 24

class DuplicateDetector extends ValidationHandler {
    async validate(dto, context) {
        const { incidentRepo } = context

        if (!incidentRepo?.findDuplicates) {
            // No repo provided (e.g. in unit tests without full DI) — skip check
            return super.validate(dto, context)
        }

        const existing = await incidentRepo.findDuplicates(
            dto.location,
            dto.category,
            DUPLICATE_WINDOW_HOURS
        )

        if (existing) {
            // Increment duplicate count on the existing incident
            if (incidentRepo.incrementDuplicateCount) {
                await incidentRepo.incrementDuplicateCount(existing.id)
            }
            throw new DuplicateIncidentError(
                existing.id,
                existing.incidentNumber,
                existing.status
            )
        }

        return super.validate(dto, context)
    }
}

// ── Handler 5: SpamThrottleValidator ──
// Prevents a single user from submitting more than MAX_PER_HOUR incidents
// in a rolling 1-hour window.
//
// Uses context.incidentRepo.countRecentByUser — no direct Prisma import.

const MAX_PER_HOUR = 5
const ONE_HOUR_MS = 60 * 60 * 1000

class SpamThrottleValidator extends ValidationHandler {
    async validate(dto, context) {
        const { userId, incidentRepo } = context

        if (!userId || !incidentRepo?.countRecentByUser) {
            return super.validate(dto, context)
        }

        const count = await incidentRepo.countRecentByUser(userId, ONE_HOUR_MS)

        if (count >= MAX_PER_HOUR) {
            throw new SpamThrottleError(
                `You can submit a maximum of ${MAX_PER_HOUR} incidents per hour. ` +
                `You have submitted ${count} in the last hour.`
            )
        }

        return super.validate(dto, context)
    }
}

// ── Handler 6: PhotoRequirementCheck ──
// Critical-priority incidents must include at least one evidence photo.
// Last in chain — runs only after all other validations pass.

class PhotoRequirementCheck extends ValidationHandler {
    async validate(dto, context) {
        if (
            dto.priority === 'CRITICAL' &&
            (!dto.evidencePhotos || dto.evidencePhotos.length === 0)
        ) {
            throw new ValidationError(
                'evidencePhotos',
                'Critical incidents require at least one evidence photo'
            )
        }
        return super.validate(dto, context)
    }
}

// ── buildValidationChain ──
// Assembles the default chain in the correct order and returns the head.
// IncidentService calls:
//   const chain = buildValidationChain()
//   await chain.validate(dto, { userId, incidentRepo })

function buildValidationChain() {
    const priority = new PriorityValidator()
    const category = new CategoryValidator()
    const location = new LocationValidator()
    const duplicate = new DuplicateDetector()
    const spam = new SpamThrottleValidator()
    const photo = new PhotoRequirementCheck()

    priority.setNext(category).setNext(location).setNext(duplicate).setNext(spam).setNext(photo)

    return priority  // head of the chain
}

module.exports = {
    ValidationHandler,
    PriorityValidator,
    CategoryValidator,
    LocationValidator,
    DuplicateDetector,
    SpamThrottleValidator,
    PhotoRequirementCheck,
    buildValidationChain,
    VALID_PRIORITIES,
    VALID_CATEGORIES,
    MAX_PER_HOUR,
    DUPLICATE_WINDOW_HOURS
}