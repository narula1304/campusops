// src/domain/errors/index.js
//
// Typed domain errors. Zero framework imports.
// The Express error handler middleware maps these to HTTP status codes
// (see API_CONTRACT.md error code table).

class DomainError extends Error {
    constructor(message, code) {
        super(message)
        this.name = this.constructor.name
        this.code = code
    }
}

class InvalidTransitionError extends DomainError {
    constructor(stateName, action) {
        super(`Cannot perform "${action}" while incident is in state "${stateName}"`, 'INVALID_STATE_TRANSITION')
        this.stateName = stateName
        this.action = action
    }
}

class ResolutionPhotoRequiredError extends DomainError {
    constructor() {
        super('A resolution photo is required before marking this incident as resolved', 'RESOLUTION_PHOTO_REQUIRED')
    }
}

class ResolutionNoteTooShortError extends DomainError {
    constructor() {
        super('Resolution note must be at least 10 characters', 'RESOLUTION_NOTE_TOO_SHORT')
    }
}

class StaffUnavailableError extends DomainError {
    constructor(staffId) {
        super(`Staff member ${staffId} is not available for assignment`, 'STAFF_UNAVAILABLE')
        this.staffId = staffId
    }
}

class StaffNotEligibleError extends DomainError {
    constructor(staffId) {
        super(`Staff member ${staffId} is not eligible for this incident category`, 'STAFF_NOT_ELIGIBLE')
        this.staffId = staffId
    }
}

class NoStaffAvailableError extends DomainError {
    constructor(departmentId) {
        super(`No eligible staff available in department ${departmentId}`, 'NO_STAFF_AVAILABLE')
        this.departmentId = departmentId
    }
}

class InvalidCategoryError extends DomainError {
    constructor(category) {
        super(`Unknown incident category: ${category}`, 'INVALID_CATEGORY')
        this.category = category
    }
}

class InvalidPriorityError extends DomainError {
    constructor(priority) {
        super(`Unknown priority level: ${priority}`, 'INVALID_PRIORITY')
        this.priority = priority
    }
}

class ValidationError extends DomainError {
    constructor(field, message) {
        super(message, 'VALIDATION_ERROR')
        this.field = field
    }
}

class DuplicateIncidentError extends DomainError {
    constructor(existingId, existingNumber, existingStatus) {
        super('A similar incident is already being tracked', 'DUPLICATE_INCIDENT')
        this.existingId = existingId
        this.existingNumber = existingNumber
        this.existingStatus = existingStatus
    }
}

class SpamThrottleError extends DomainError {
    constructor(message) {
        super(message, 'SPAM_THROTTLE')
    }
}

class IncidentNotAssignableError extends DomainError {
    constructor(message) {
        super(message, 'INCIDENT_NOT_ASSIGNABLE')
    }
}

module.exports = {
    DomainError,
    InvalidTransitionError,
    ResolutionPhotoRequiredError,
    ResolutionNoteTooShortError,
    StaffUnavailableError,
    StaffNotEligibleError,
    NoStaffAvailableError,
    InvalidCategoryError,
    InvalidPriorityError,
    ValidationError,
    DuplicateIncidentError,
    SpamThrottleError,
    IncidentNotAssignableError
}
