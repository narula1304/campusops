// src/api/controllers/incidentController.js
//
// Thin HTTP adapter layer — no business logic lives here.
// Each handler extracts data from req, delegates to IncidentService,
// and formats the API_CONTRACT.md response envelope.
//
// Error handling contract:
//   • Domain / service errors are NOT caught here — they propagate to
//     errorHandler.js via next(err), which maps them to HTTP status codes.
//   • The only 4xx response built directly in this file is 404 NOT_FOUND,
//     because a null return from the service is a legitimate "not found"
//     outcome, not an exception.

// Arrow function class properties are used for all handlers so that `this`
// is correctly bound even when Express holds a bare reference to the function
// (i.e. router.get('/', controller.listIncidents) works without .bind()).
//
// Reference:
//   API_CONTRACT.md — Response envelopes, status codes, query parameter names
//   USER_FLOWS.md   — Flows 1, 2, 6 (create / resolve / feedback)
class IncidentController {
    /**
     * @param {import('../../services/IncidentService')} incidentService
     */
    constructor(incidentService) {
        this.incidentService = incidentService
    }
    // ── POST /api/incidents ────────────────────────────────────────────────────
    /**
     * Flow 1 — Report a new incident.
     * Body: { title, description, category, priority, location, evidencePhotos? }
     * Responds 201 with { data: incident }
     */
    createIncident = async (req, res, next) => {
        try {
            const reporter = req.user
            const incident = await this.incidentService.createIncident(req.body, reporter)
            return res.status(201).json({ data: incident })
        } catch (err) {
            return next(err)
        }
    }
    // ── POST /api/incidents/:id/assign ────────────────────────────────────────
    /**
     * Auto-assign an OPEN or ESCALATED incident to the best available staff.
     * Route is protected by authorize('ADMIN') — req.user is always an admin.
     * Responds 200 with { data: incident }
     */
    assignIncident = async (req, res, next) => {
        try {
            const admin = req.user
            const incident = await this.incidentService.assignIncident(req.params.id, admin)
            return res.status(200).json({ data: incident })
        } catch (err) {
            return next(err)
        }
    }
    // ── POST /api/incidents/:id/resolve ───────────────────────────────────────
    /**
     * Flow 2 — Staff resolves an IN_PROGRESS incident.
     * Body: { resolutionNote, resolutionPhoto }
     * Returns null from service when incident not found → 404.
     * Responds 200 with { data: incident }
     */
    resolveIncident = async (req, res, next) => {
        try {
            const staff = req.user
            const incident = await this.incidentService.resolveIncident(
                req.params.id,
                req.body.resolutionNote,
                req.body.resolutionPhoto,
                staff
            )
            if (incident === null) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Incident not found' },
                })
            }
            return res.status(200).json({ data: incident })
        } catch (err) {
            return next(err)
        }
    }
    // ── POST /api/incidents/:id/feedback ──────────────────────────────────────
    /**
     * Flow 6 — Reporter submits a satisfaction score on a resolved incident.
     * Body: { score, comment? }
     * Returns null from service when incident not found → 404.
     * Responds 200 with { data: incident }
     */
    submitFeedback = async (req, res, next) => {
        try {
            const reporter = req.user
            const incident = await this.incidentService.submitFeedback(
                req.params.id,
                { score: req.body.score, comment: req.body.comment },
                reporter
            )
            if (incident === null) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Incident not found' },
                })
            }
            return res.status(200).json({ data: incident })
        } catch (err) {
            return next(err)
        }
    }
    // ── GET /api/incidents/:id ────────────────────────────────────────────────
    /**
     * Fetch a single incident by UUID.
     * Returns null from service when incident not found → 404.
     * Responds 200 with { data: incident }
     */
    getIncident = async (req, res, next) => {
        try {
            const incident = await this.incidentService.getIncidentById(req.params.id)
            if (incident === null) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Incident not found' },
                })
            }
            return res.status(200).json({ data: incident })
        } catch (err) {
            return next(err)
        }
    }
    // ── GET /api/incidents ────────────────────────────────────────────────────
    /**
     * Paginated list of incidents with optional query filters.
     *
     * Query params:
     *   Filters  — status, priority, category, departmentId, assignedToId,
     *              block, search, createdAfter, createdBefore
     *   Paginate — page (default 1), limit (default 20), sortBy, sortOrder
     *
     * Responds 200 with { data: incidents[], meta: { total, page, limit } }
     */
    listIncidents = async (req, res, next) => {
        try {
            // Build filters — only include keys that are actually present in the
            // query string. Passing undefined values would cause the repo layer
            // to build incorrect Prisma where clauses.
            const FILTER_KEYS = [
                'status', 'priority', 'category', 'departmentId',
                'assignedToId', 'block', 'search', 'createdAfter', 'createdBefore',
            ]
            const filters = {}
            for (const key of FILTER_KEYS) {
                if (req.query[key] !== undefined) {
                    filters[key] = req.query[key]
                }
            }
            // Build pagination — page and limit are numeric, default if absent.
            const page = req.query.page ? Number(req.query.page) : 1
            const limit = req.query.limit ? Number(req.query.limit) : 20
            const pagination = { page, limit }
            if (req.query.sortBy) pagination.sortBy = req.query.sortBy
            if (req.query.sortOrder) pagination.sortOrder = req.query.sortOrder
            const result = await this.incidentService.listIncidents(filters, pagination)
            return res.status(200).json({
                data: result.incidents,
                meta: { total: result.total, page, limit },
            })
        } catch (err) {
            return next(err)
        }
    }
}
module.exports = IncidentController