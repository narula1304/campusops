// src/api/routes/incidentRoutes.js
//
// Express Router — mounts IncidentController handlers with the correct
// authenticate / authorize middleware per route.
//
// Exported as a factory function that accepts the injected incidentService,
// constructs the controller, then returns the configured router.
// This lets src/index.js (the app entrypoint) wire up the real service once
// and pass it in — no singleton state lives here.
//
// Usage in app entrypoint:
//   const incidentRoutes = require('./api/routes/incidentRoutes')
//   app.use('/api/incidents', incidentRoutes(incidentService))
//
// Route table (all paths are relative to the mount point /api/incidents):
//   POST   /                -> authenticate, authorize(STUDENT|FACULTY|ADMIN), createIncident
//   POST   /:id/assign      -> authenticate, authorize(ADMIN),                 assignIncident
//   POST   /:id/resolve     -> authenticate, authorize(MAINTENANCE|SECURITY),  resolveIncident
//   POST   /:id/feedback    -> authenticate, authorize(STUDENT|FACULTY),       submitFeedback
//   GET    /:id             -> authenticate,                                   getIncident
//   GET    /                -> authenticate,                                   listIncidents
//
// References:
//   API_CONTRACT.md  — Endpoint definitions, required roles per route
//   auth.js          — authenticate / authorize middleware signatures
const { Router } = require('express')
const IncidentController = require('../controllers/incidentController')
const { authenticate, authorize } = require('../middleware/auth')
/**
 * @param {import('../../services/IncidentService')} incidentService
 * @returns {import('express').Router}
 */
module.exports = function incidentRoutes(incidentService) {
    const router = Router()
    const controller = new IncidentController(incidentService)
    // ── Create incident ────────────────────────────────────────────────────────
    // Students, Faculty, and Admins can all report incidents.
    router.post(
        '/',
        authenticate,
        authorize('STUDENT', 'FACULTY', 'ADMIN'),
        controller.createIncident
    )
    // ── Assign incident ────────────────────────────────────────────────────────
    // Only Admins can trigger auto-assignment.
    // NOTE: the /:id/assign route must be defined BEFORE /:id to prevent
    // Express matching "assign" as a value for the :id parameter.
    router.post(
        '/:id/assign',
        authenticate,
        authorize('ADMIN'),
        controller.assignIncident
    )
    // ── Resolve incident ───────────────────────────────────────────────────────
    // Only Maintenance and Security staff can mark incidents resolved.
    router.post(
        '/:id/resolve',
        authenticate,
        authorize('MAINTENANCE', 'SECURITY'),
        controller.resolveIncident
    )
    // ── Submit feedback ────────────────────────────────────────────────────────
    // Only the original reporter (Student / Faculty) submits satisfaction scores.
    router.post(
        '/:id/feedback',
        authenticate,
        authorize('STUDENT', 'FACULTY'),
        controller.submitFeedback
    )
    // ── Get single incident ────────────────────────────────────────────────────
    // Any authenticated role can view a specific incident.
    router.get(
        '/:id',
        authenticate,
        controller.getIncident
    )
    // ── List incidents ─────────────────────────────────────────────────────────
    // Any authenticated role can query the incident list.
    // Must come AFTER /:id routes; Express matches routes in declaration order,
    // and GET / will never shadow GET /:id since they are different methods/paths.
    router.get(
        '/',
        authenticate,
        controller.listIncidents
    )
    return router
}