// src/services/IncidentService.js
//
// Orchestration layer — the FIRST file in the codebase allowed to import
// from both src/domain/ and src/infrastructure/ simultaneously.
//
// Architectural contract:
//   • ZERO direct Prisma imports — all persistence goes through the injected
//     incidentRepo (IncidentRepository or CachingIncidentProxy).
//   • ZERO Express imports — no req/res awareness; this file only deals with
//     domain objects and throws typed domain errors.
//   • Domain errors (ValidationError, DuplicateIncidentError, etc.) are NOT
//     caught here — they propagate to the controller, which maps them to HTTP
//     status codes per API_CONTRACT.md.
//
// Constructor dependencies (injected via DI — no `new` calls inside):
//   incidentRepo    — IncidentRepository or CachingIncidentProxy instance
//   validationChain — head handler returned by buildValidationChain()
//   eventPublisher  — IncidentEventPublisher instance
//   strategyFactory — StrategyFactory (static class — injected for testability)
//   departmentRepo  — Minimal repo stub interface:
//                       { async findById(id), async findEligibleStaff(deptId, category) }
//                     DepartmentRepository is out of scope; this service only
//                     depends on the two methods above.
//
// Methods implement:
//   createIncident  — USER_FLOWS.md Flow 1  (Report Incident end-to-end)
//   assignIncident  — Auto-assignment (separate from AssignIncidentCommand)
//   resolveIncident — USER_FLOWS.md Flow 2  (Staff Resolves)
//   submitFeedback  — USER_FLOWS.md Flow 6  (Feedback / Reopen loop)
//   getIncidentById — Simple read passthrough
//   listIncidents   — Paginated list passthrough
//
// References:
//   SYSTEM_DESIGN.md  — Section 2 (services layer), Section 3.1/3.2 (ACID)
//   USER_FLOWS.md     — Flows 1, 2, 6
//   API_CONTRACT.md   — Error codes table

const IncidentFactory = require('../domain/factories/IncidentFactory')
const { IncidentNotAssignableError } = require('../domain/errors')

// ─────────────────────────────────────────────────────────────────────────────
// DepartmentRepository interface (stub documentation only — not imported here)
//
// The service expects an object satisfying this interface:
//
//   interface DepartmentRepository {
//     /**
//      * Returns a department plain object with at least:
//      *   { id, name, assignmentStrategy, roundRobinIndex }
//      * Returns null if not found.
//      */
//     async findById(id: string): Promise<Department | null>
//
//     /**
//      * Returns active staff eligible to handle the given category
//      * within the given department, ordered by activeTaskCount ASC.
//      * Each staff object must expose at least:
//      *   { id, name, role, staffState, activeTaskCount, penaltyCount,
//      *     isOnShift?(Date): boolean, isAvailableFor?(hours, Date): boolean }
//      */
//     async findEligibleStaff(deptId: string, category: string): Promise<Staff[]>
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

class IncidentService {
    /**
     * @param {object} deps
     * @param {import('../infrastructure/repositories/IncidentRepository')} deps.incidentRepo
     * @param {import('../domain/validators/ValidationChain').ValidationHandler} deps.validationChain
     * @param {import('../domain/observers/IncidentEventPublisher')} deps.eventPublisher
     * @param {typeof import('../domain/strategies/AssignmentStrategy').StrategyFactory} deps.strategyFactory
     * @param {{ findById(id: string): Promise<object|null>, findEligibleStaff(deptId: string, category: string): Promise<object[]> }} deps.departmentRepo
     */
    constructor({ incidentRepo, validationChain, eventPublisher, strategyFactory, departmentRepo }) {
        this.incidentRepo = incidentRepo
        this.validationChain = validationChain
        this.eventPublisher = eventPublisher
        this.strategyFactory = strategyFactory
        this.departmentRepo = departmentRepo
    }

    // ── Flow 1: Report Incident ────────────────────────────────────────────────

    /**
     * Creates a new incident end-to-end:
     *   validate → factory → save → publish.
     *
     * Typed domain errors thrown by the validation chain:
     *   ValidationError       → 422 VALIDATION_ERROR        (controller maps)
     *   DuplicateIncidentError→ 409 DUPLICATE_INCIDENT       (controller maps)
     *   SpamThrottleError     → 429 SPAM_THROTTLE            (controller maps)
     *   InvalidCategoryError  → 422 INVALID_CATEGORY         (controller maps)
     *
     * None of these are caught here — propagation is intentional.
     *
     * @param {object} dto      — Raw incident creation DTO from the controller
     * @param {object} reporter — Authenticated user object ({ id, ... })
     * @returns {Promise<import('../domain/entities/Incident').Incident>}
     */
    async createIncident(dto, reporter) {
        // Step 1 — Run the full validation chain (Chain of Responsibility).
        // Each handler validates one concern and calls the next, or throws a
        // typed domain error. The chain receives incidentRepo so DuplicateDetector
        // and SpamThrottleValidator can query the DB without importing Prisma.
        const validatedDto = await this.validationChain.validate(dto, {
            userId: reporter.id,
            incidentRepo: this.incidentRepo,
        })

        // Step 2 — Build the correct Incident subclass (Factory pattern).
        // IncidentFactory.create selects the subclass by category, attaches the
        // correct SLAPolicy subclass, and sets state = new OpenState().
        const incident = IncidentFactory.create(validatedDto, reporter)

        // Step 3 — Persist. save() returns the generated UUID for new rows.
        // We write it back onto the in-memory domain object so downstream
        // observers (SLATimerManager, etc.) can reference the real DB id.
        const savedId = await this.incidentRepo.save(incident)
        incident.id = savedId

        // Step 4 — Publish INCIDENT_CREATED.
        // IncidentEventPublisher fans out to all subscribed observers via
        // Promise.allSettled — a failing observer (e.g. SMTP down) never
        // blocks the response. Observers: SLATimerManager, RealTimeNotifier,
        // HotspotDetector, AuditLogger (wired in src/domain/observers/wireObservers.js).
        await this.eventPublisher.publish('INCIDENT_CREATED', { incident })

        // Step 5 — Return the created domain object to the controller.
        return incident
    }

    // ── Auto-assignment ────────────────────────────────────────────────────────

    /**
     * Auto-assigns an OPEN or ESCALATED incident to the best available staff
     * member using the department's configured assignment strategy.
     *
     * This implements the auto-assignment path (Strategy pattern).
     * Manual reassignment by admin is handled separately by AssignIncidentCommand
     * (src/domain/commands/AssignIncidentCommand.js).
     *
     * Errors that propagate to the controller:
     *   IncidentNotAssignableError — 422  (incident not found or wrong state)
     *   NoStaffAvailableError      — 503  (strategy finds no eligible staff)
     *
     * @param {string} incidentId
     * @param {object} admin  — The admin triggering the assignment ({ id, ... })
     * @returns {Promise<import('../domain/entities/Incident').Incident>}
     */
    async assignIncident(incidentId, admin) {
        // Step 1 — Load the incident. State machine only accepts assignment
        // from OPEN or ESCALATED; all other states throw immediately.
        const incident = await this.incidentRepo.findById(incidentId)

        const currentStatus = incident?.getCurrentStatus()
        if (!incident || (currentStatus !== 'OPEN' && currentStatus !== 'ESCALATED')) {
            throw new IncidentNotAssignableError(
                incident
                    ? `Incident ${incidentId} is in state "${currentStatus}" and cannot be assigned. Only OPEN or ESCALATED incidents accept assignment.`
                    : `Incident ${incidentId} does not exist`
            )
        }

        // Step 2 — Load the department (needed for strategy name + RoundRobin index).
        const department = await this.departmentRepo.findById(incident.departmentId)

        // Step 3 — Load eligible staff for this department and incident category.
        // departmentRepo.findEligibleStaff already applies role + departmentId +
        // staffState = ACTIVE filters at the DB level (mirrors the query in USER_FLOWS.md).
        const eligibleStaff = await this.departmentRepo.findEligibleStaff(
            incident.departmentId,
            incident.category
        )

        // Step 4 — Instantiate the correct Strategy from the department config.
        // StrategyFactory.create() falls back to LEAST_LOADED for unknown values.
        const strategy = this.strategyFactory.create(department.assignmentStrategy)

        // Step 5 — Let the strategy pick the staff member.
        // Throws NoStaffAvailableError if all staff are busy or off-shift.
        // For RoundRobinStrategy, department.roundRobinIndex is mutated in-place;
        // the caller (or the repository) is responsible for persisting the new index.
        const selectedStaff = strategy.assign(incident, eligibleStaff, { department })

        // Step 6 — Delegate to the State pattern.
        // incident.assignStaff() → OpenState.assignStaff() or EscalatedState.assignStaff()
        //   • sets incident.assignedToId / incident.assignedTo
        //   • increments selectedStaff.activeTaskCount
        //   • appends to incident.statusLogEntries
        //   • transitions state → InProgressState
        //   • enqueues 'INCIDENT_ASSIGNED' on incident.publishedEvents (but does NOT
        //     call the external publisher — Incident.publish() only fires if
        //     incident.publisher is set, which it isn't here)
        incident.assignStaff(selectedStaff)

        // Step 7 — Persist the updated incident (status, assignedToId, statusLog).
        await this.incidentRepo.save(incident)

        // Step 8 — Publish INCIDENT_ASSIGNED to all external observers.
        // RealTimeNotifier emits 'incident_assigned' to the staff member's Socket.IO room.
        // AuditLogger records the assignment with the admin's id.
        await this.eventPublisher.publish('INCIDENT_ASSIGNED', {
            incident,
            staff: selectedStaff,
        })

        // Step 9 — Return the updated domain object.
        return incident
    }

    // ── Flow 2: Resolve Incident ───────────────────────────────────────────────

    /**
     * Resolves an IN_PROGRESS incident with a resolution note and photo.
     *
     * Errors that propagate to the controller:
     *   ResolutionPhotoRequiredError — 422 RESOLUTION_PHOTO_REQUIRED
     *   ResolutionNoteTooShortError  — 422 RESOLUTION_NOTE_TOO_SHORT
     *   InvalidTransitionError       — 422 INVALID_STATE_TRANSITION
     *
     * @param {string} incidentId
     * @param {string} resolutionNote
     * @param {string} resolutionPhoto  — Cloudinary URL (required by InProgressState.resolve)
     * @param {object} staff            — Authenticated staff member performing the resolution
     * @returns {Promise<import('../domain/entities/Incident').Incident>}
     */
    async resolveIncident(incidentId, resolutionNote, resolutionPhoto, staff) {
        // Step 1 — Load the incident (null = controller returns 404).
        const incident = await this.incidentRepo.findById(incidentId)
        if (!incident) {
            return null
        }

        // Step 2 — Delegate to the State pattern.
        // InProgressState.resolve():
        //   • throws ResolutionPhotoRequiredError if photo is missing
        //   • throws ResolutionNoteTooShortError  if note < 10 chars
        //   • sets incident.resolutionNote, resolutionPhoto, resolvedAt
        //   • decrements incident.assignedTo.activeTaskCount
        //   • appends RESOLVED entry to statusLogEntries
        //   • transitions state → ResolvedState
        //   (throws InvalidTransitionError if current state is not InProgressState)
        incident.resolve(resolutionNote, resolutionPhoto)

        // Step 3 — Persist all mutations atomically via the repository.
        await this.incidentRepo.save(incident)

        // Step 4 — Publish INCIDENT_RESOLVED.
        // SLATimerManager cancels the BullMQ escalation job.
        // RealTimeNotifier emits 'incident_updated' + 'feedback_request' to the reporter.
        // EmailNotifier sends resolution confirmation with photo URLs.
        // CacheInvalidator purges the dashboard Redis cache for this department.
        // AuditLogger records the resolution with staff.id.
        await this.eventPublisher.publish('INCIDENT_RESOLVED', { incident })

        // Step 5 — Return the updated domain object.
        return incident
    }

    // ── Flow 6: Submit Feedback ────────────────────────────────────────────────

    /**
     * Records a reporter's feedback score on a resolved incident.
     *
     * A score <= 2 triggers the feedback-reopen loop:
     *   ResolvedState.receiveFeedback() → penaltyCount++ → ReopenedState
     *   Three penalties → staffState = 'UNDER_REVIEW' (staff state machine)
     *
     * @param {string} incidentId
     * @param {{ score: number, comment?: string }} rating
     * @param {object} reporter   — Authenticated reporter submitting feedback
     * @returns {Promise<import('../domain/entities/Incident').Incident>}
     */
    async submitFeedback(incidentId, rating, reporter) {
        // Step 1 — Load the incident (null = controller returns 404).
        const incident = await this.incidentRepo.findById(incidentId)
        if (!incident) {
            return null
        }

        // Step 2 — Delegate to the State pattern.
        // ResolvedState.receiveFeedback():
        //   • records incident.feedback = { score, comment, submittedAt }
        //   • score <= 2 → penaltyCount++, possibly staffState = 'UNDER_REVIEW'
        //                  appends REOPENED to statusLogEntries
        //                  transitions state → ReopenedState
        //                  enqueues 'INCIDENT_REOPENED_BY_FEEDBACK' on publishedEvents
        //   • score > 2  → enqueues 'FEEDBACK_RECEIVED' on publishedEvents
        //   (throws InvalidTransitionError if current state is not ResolvedState)
        incident.receiveFeedback(rating)

        // Step 3 — Persist the outcome (new status, feedback field, staff penaltyCount).
        await this.incidentRepo.save(incident)

        // Step 4 — Publish the correct event based on the outcome of step 2.
        // We check the current status AFTER the state transition to determine which
        // event to fire, rather than inspecting rating.score, to stay decoupled from
        // the business rule embedded in ResolvedState.
        const eventType =
            incident.getCurrentStatus() === 'REOPENED'
                ? 'INCIDENT_REOPENED_BY_FEEDBACK'
                : 'FEEDBACK_RECEIVED'

        await this.eventPublisher.publish(eventType, { incident, rating })

        // Step 5 — Return the updated domain object.
        return incident
    }

    // ── Read operations ────────────────────────────────────────────────────────

    /**
     * Returns a fully hydrated incident domain object, or null if not found.
     * The controller is responsible for returning 404 when null is received.
     *
     * @param {string} incidentId
     * @returns {Promise<import('../domain/entities/Incident').Incident|null>}
     */
    async getIncidentById(incidentId) {
        return this.incidentRepo.findById(incidentId)
    }

    /**
     * Returns a paginated list of incidents matching the given filters.
     * Delegates entirely to incidentRepo.findMany — no additional logic.
     *
     * @param {object} filters    — { status, priority, category, departmentId, assignedToId, block, search, createdAfter, createdBefore }
     * @param {object} pagination — { page, limit, sortBy, sortOrder }
     * @returns {Promise<{ incidents: Incident[], total: number }>}
     */
    async listIncidents(filters, pagination) {
        return this.incidentRepo.findMany(filters, pagination)
    }
}

module.exports = IncidentService
