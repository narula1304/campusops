// src/workers/slaWorker.js
//
// BullMQ worker that processes SLA escalation jobs scheduled by SLATimerManager.
//
// When an incident is created, SLATimerManager enqueues a delayed job:
//   queue.add('escalate-incident', { incidentId, escalationLevel: 1 }, { delay: msUntilDeadline })
//
// This worker picks up those jobs when they fire and:
//   1. Loads the incident from the repository
//   2. Checks it still needs escalation (not already resolved/escalated)
//   3. Calls incident.escalate(reason) — delegates to OpenState or InProgressState
//   4. Saves the updated incident
//   5. Publishes INCIDENT_ESCALATED — fires RealTimeNotifier, EmailNotifier, AuditLogger
//
// The worker is started once in src/index.js alongside the HTTP server.
// It runs in the same Node.js process as the server (single-process architecture,
// appropriate for a campus-scale system — separate worker processes can be added
// later if throughput requires it).
//
// Architecture rules:
//   ZERO direct Prisma imports — all persistence through the injected incidentRepo.
//   ZERO Express imports — this file never handles HTTP requests.
//   Domain errors (InvalidTransitionError if incident is already escalated/resolved)
//   are caught and logged rather than propagated — a failed job should NOT be
//   retried by BullMQ if the incident state simply doesn't allow escalation anymore.
//
// References:
//   SYSTEM_DESIGN.md    — Section 3.2 (BullMQ job processing)
//   USER_FLOWS.md       — Flow 3 (SLA Breach / Auto-Escalation)
//   DESIGN_PATTERNS.md  — Pattern 3 (Observer — INCIDENT_ESCALATED event)

const { Worker } = require('bullmq')
const { InvalidTransitionError } = require('../../domain/errors')

// Queue name must exactly match what SLATimerManager uses when adding jobs.
const QUEUE_NAME = 'sla-escalation'

/**
 * Creates and starts the SLA escalation worker.
 *
 * @param {object} deps
 * @param {import('../infrastructure/repositories/CachingIncidentProxy')} deps.incidentRepo
 *        — CachingIncidentProxy (or plain IncidentRepository) for loading/saving incidents
 * @param {import('../domain/observers/IncidentEventPublisher')} deps.eventPublisher
 *        — The wired IncidentEventPublisher from wireObservers() — already has all
 *          observers subscribed, so a single publish() call fans out to RealTimeNotifier,
 *          EmailNotifier, AuditLogger, CacheInvalidator automatically
 * @param {import('ioredis')} deps.redis
 *        — The same ioredis client used by the Queue in src/index.js.
 *          BullMQ requires the Worker and Queue to share the same Redis connection config.
 * @returns {import('bullmq').Worker}
 */
function createSLAWorker({ incidentRepo, eventPublisher, redis }) {
    const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { incidentId, escalationLevel } = job.data

            console.log(
                `[SLAWorker] Processing escalation job ${job.id} — ` +
                `incidentId: ${incidentId}, level: ${escalationLevel}`
            )

            // ── Step 1: Load the incident ──────────────────────────────────
            const incident = await incidentRepo.findById(incidentId)

            if (!incident) {
                // Incident was deleted between job scheduling and firing.
                // Log and return — BullMQ will mark the job as completed (not failed).
                console.warn(
                    `[SLAWorker] Incident ${incidentId} not found — ` +
                    `job ${job.id} discarded`
                )
                return
            }

            // ── Step 2: Check if escalation is still needed ────────────────
            // Incidents that were resolved, closed, or already escalated before
            // the timer fired should NOT be re-escalated. This is the "check
            // current state before acting" pattern for delayed jobs.
            const currentStatus = incident.getCurrentStatus()

            if (currentStatus === 'RESOLVED' || currentStatus === 'CLOSED') {
                console.log(
                    `[SLAWorker] Incident ${incidentId} already ${currentStatus} — ` +
                    `escalation skipped, job ${job.id} completed`
                )
                return
            }

            if (currentStatus === 'ESCALATED') {
                console.log(
                    `[SLAWorker] Incident ${incidentId} already ESCALATED — ` +
                    `job ${job.id} completed without re-escalating`
                )
                return
            }

            // ── Step 3: Escalate via the State pattern ─────────────────────
            // incident.escalate() delegates to OpenState.escalate() or
            // InProgressState.escalate(), both of which:
            //   - set incident.sla.isEscalated = true
            //   - append ESCALATED to statusLogEntries
            //   - transition state → EscalatedState
            //   - enqueue INCIDENT_ESCALATED on incident.publishedEvents
            const escalationReason =
                `SLA breach — incident was not resolved within the ` +
                `${incident.sla?.windowHours ?? '?'}-hour SLA window. ` +
                `Auto-escalated at level ${escalationLevel}.`

            try {
                incident.escalate(escalationReason)
            } catch (err) {
                if (err instanceof InvalidTransitionError) {
                    // The state machine rejected the escalation — the incident
                    // transitioned to a state that doesn't accept escalation
                    // (e.g., REOPENED) between when we loaded it and now.
                    // This is a race condition, not a bug. Log and skip retry.
                    console.warn(
                        `[SLAWorker] InvalidTransitionError for incident ${incidentId}: ` +
                        `${err.message} — job ${job.id} completed without escalating`
                    )
                    return
                }
                // Any other error (unexpected) — rethrow so BullMQ retries the job
                throw err
            }

            // ── Step 4: Persist ───────────────────────────────────────────
            await incidentRepo.save(incident)

            // ── Step 5: Publish INCIDENT_ESCALATED ────────────────────────
            // Fires the full observer chain:
            //   RealTimeNotifier  → emits 'incident_escalated' to role:ADMIN room
            //   EmailNotifier     → emails HOD/Dean (getEscalationTarget())
            //   AuditLogger       → writes AuditLog row
            //   CacheInvalidator  → purges department dashboard cache
            await eventPublisher.publish('INCIDENT_ESCALATED', {
                incident,
                reason: escalationReason,
            })

            console.log(
                `[SLAWorker] Incident ${incidentId} escalated successfully — ` +
                `job ${job.id} completed`
            )
        },
        {
            // BullMQ Worker options
            connection: redis,

            // Retry policy: attempt the job up to 3 times with exponential backoff.
            // Only unexpected errors (non-InvalidTransitionError) trigger retries,
            // since domain-logic failures are explicitly caught and returned above.
            // After 3 failures the job moves to the 'failed' queue for inspection.
            //
            // Note: attempts here override the Queue-level setting from SLATimerManager
            // if the job was already enqueued with attempts: 3 — BullMQ uses the
            // higher of the two.
            concurrency: 5, // process up to 5 escalation jobs in parallel
        }
    )

    // ── Worker event handlers ──────────────────────────────────────────────

    worker.on('completed', (job) => {
        console.log(`[SLAWorker] Job ${job.id} completed`)
    })

    worker.on('failed', (job, err) => {
        console.error(
            `[SLAWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
            err.message
        )
    })

    worker.on('error', (err) => {
        // Worker-level errors (e.g., Redis disconnection) — not job-specific
        console.error('[SLAWorker] Worker error:', err.message)
    })

    console.log(`[SLAWorker] Started — listening on queue "${QUEUE_NAME}"`)

    return worker
}

module.exports = { createSLAWorker }