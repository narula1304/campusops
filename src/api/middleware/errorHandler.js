// src/api/middleware/errorHandler.js
//
// Express error-handling middleware — 4-argument signature required by Express.
// Must be registered LAST in the app, after all routes and other middleware.
//
// Responsibilities:
//   1. Determine the HTTP status code from the error.
//   2. Determine the machine-readable code from the error.
//   3. Build the API_CONTRACT.md error envelope: { error: { code, message, field? } }
//   4. Log appropriately: full stack trace for 5xx (unexpected bugs),
//      single-line message for 4xx (expected, user-facing domain errors).
//   5. Hide implementation details from 5xx responses — never leak stack traces
//      or internal messages to the client.
//
// Error shape contract (produced by auth.js, domain errors, etc.):
//   err.statusCode  — optional, takes precedence over class-based lookup
//   err.code        — optional, falls back to err.constructor.name
//   err.field       — optional, only present on ValidationError; included in
//                     response only when it exists
//
// Reference: API_CONTRACT.md — Error Codes Reference table
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
} = require('../../domain/errors')
// ── Status code lookup table ───────────────────────────────────────────────────
//
// Ordered from most specific to least specific so that instanceof checks
// against subclasses are resolved before the base class.
//
// Only domain error classes live here. Generic Error and anything unknown
// falls through to the default of 500.
const STATUS_MAP = [
    // 422 — client sent semantically invalid data
    [ValidationError, 422],
    [InvalidCategoryError, 422],
    [InvalidPriorityError, 422],
    [InvalidTransitionError, 422],
    [ResolutionPhotoRequiredError, 422],
    [ResolutionNoteTooShortError, 422],
    [IncidentNotAssignableError, 422],
    // 409 — conflict with current state
    [DuplicateIncidentError, 409],
    [StaffUnavailableError, 409],
    [StaffNotEligibleError, 409],
    // 429 — rate / spam limits
    [SpamThrottleError, 429],
    // 503 — transient unavailability (no staff to assign)
    [NoStaffAvailableError, 503],
]
// ── Status code resolver ───────────────────────────────────────────────────────
/**
 * Resolves the HTTP status code for a given error.
 *
 * Priority:
 *   1. err.statusCode (set by auth.js, route-level guard errors, etc.)
 *   2. instanceof lookup against STATUS_MAP
 *   3. 500 (catch-all for unexpected errors)
 *
 * @param {Error} err
 * @returns {number}
 */
function resolveStatusCode(err) {
    if (err.statusCode) {
        return err.statusCode
    }
    for (const [ErrorClass, code] of STATUS_MAP) {
        if (err instanceof ErrorClass) {
            return code
        }
    }
    return 500
}
// ── Code resolver ─────────────────────────────────────────────────────────────
/**
 * Resolves the machine-readable error code string for the response body.
 *
 * Priority:
 *   1. err.code (set by DomainError base constructor or auth.js makeError)
 *   2. err.constructor.name (e.g. 'ValidationError') for typed errors that
 *      somehow reached here without a code
 *   3. 'INTERNAL_ERROR' for plain Error instances and anonymous classes
 *
 * @param {Error} err
 * @returns {string}
 */
function resolveCode(err) {
    if (err.code) {
        return err.code
    }
    const ctorName = err.constructor?.name
    if (ctorName && ctorName !== 'Error') {
        return ctorName
    }
    return 'INTERNAL_ERROR'
}
// ── Error handler ─────────────────────────────────────────────────────────────
/**
 * Express error-handling middleware.
 *
 * @param {Error}                      err
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next  — required by Express even if unused
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const statusCode = resolveStatusCode(err)
    const code = resolveCode(err)
    const is5xx = statusCode >= 500
    // ── Logging ───────────────────────────────────────────────────────────────
    if (is5xx) {
        // Unexpected error — log full stack so developers can diagnose it
        console.error(`[ErrorHandler] 5xx ${code} on ${req.method} ${req.path}:\n`, err)
    } else {
        // Expected, handled domain / auth error — single line is enough
        console.warn(`[ErrorHandler] ${statusCode} ${code}: ${err.message}`)
    }
    // ── Response body ─────────────────────────────────────────────────────────
    // For 5xx errors, never leak err.message — it may contain internal details
    // (SQL snippets, file paths, secret names). Use a generic message instead.
    const clientMessage = is5xx
        ? 'An unexpected error occurred. Please try again later.'
        : err.message
    const errorBody = {
        code,
        message: clientMessage,
    }
    // Include `field` only when it exists — ValidationError sets err.field.
    // Do NOT include `field: undefined` in the JSON (the client would see the key).
    if (err.field != null) {
        errorBody.field = err.field
    }
    return res.status(statusCode).json({ error: errorBody })
}
// ── export ────────────────────────────────────────────────────────────────────
module.exports = errorHandler
