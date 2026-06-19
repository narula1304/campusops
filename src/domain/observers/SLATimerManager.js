// src/domain/observers/SLATimerManager.js
//
// Observer: manages BullMQ delayed jobs for SLA escalation.
//
// On INCIDENT_CREATED:  schedules a delayed job that fires at sla.deadlineAt
// On INCIDENT_RESOLVED: cancels the pending job so it doesn't fire after resolution
//
// The slaJobId is stored on the incident record in PostgreSQL so it can be
// retrieved for cancellation even after a server restart (SYSTEM_DESIGN.md §3.2).
//
// Constructor receives slaQueue (BullMQ Queue instance) — injected, not imported.
// ZERO direct BullMQ imports here. The queue is a dependency, not a collaborator.

class SLATimerManager {
    constructor(slaQueue) {
        this.slaQueue = slaQueue
    }

    async handle(eventType, { incident }) {
        if (eventType === 'INCIDENT_CREATED') {
            await this._scheduleEscalation(incident)
        }

        if (eventType === 'INCIDENT_RESOLVED') {
            await this._cancelEscalation(incident)
        }
    }

    async _scheduleEscalation(incident) {
        if (!incident.sla?.deadlineAt) return  // no SLA attached — skip

        const delay = incident.sla.deadlineAt.getTime() - Date.now()
        if (delay <= 0) {
            // Already past deadline at creation time — escalate immediately
            // (edge case: clock skew or retroactive incident entry)
            console.warn(
                `[SLATimerManager] Incident ${incident.id} already past SLA deadline — scheduling immediate escalation`
            )
        }

        const job = await this.slaQueue.add(
            'escalate-incident',
            { incidentId: incident.id, escalationLevel: 1 },
            {
                delay: Math.max(0, delay),
                jobId: `sla:${incident.id}:1`,   // deterministic ID: deduplication + cancellation
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 }
            }
        )

        // Store jobId back on the incident so the repo can persist it.
        // The repo's save() call after this observer chain runs will write it to PostgreSQL.
        incident.slaJobId = job.id
    }

    async _cancelEscalation(incident) {
        if (!incident.slaJobId) return

        try {
            const job = await this.slaQueue.getJob(incident.slaJobId)
            if (job) await job.remove()
        } catch (err) {
            // Non-fatal: job may have already fired or been removed
            console.warn(`[SLATimerManager] Could not cancel SLA job ${incident.slaJobId}:`, err.message)
        }
    }
}

module.exports = SLATimerManager