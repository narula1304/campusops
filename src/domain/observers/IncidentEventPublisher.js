// src/domain/observers/IncidentEventPublisher.js
//
// Observer pattern (DESIGN_PATTERNS.md Pattern 3).
//
// Problem it solves:
// When an incident is created, multiple independent things must happen:
// schedule SLA timer, notify reporter, log audit entry, check hotspot.
// Putting all this in IncidentService creates a 200-line method that
// violates SRP. With Observer, each concern is a separate class that
// reacts to events independently. Adding a new reaction = new observer
// class + one subscribe() call. Zero existing code changes (OCP).
//
// Promise.allSettled is deliberate: if EmailNotifier fails (SMTP down),
// the SLATimerManager and AuditLogger still fire. One failing observer
// never blocks the others.
//
// ZERO framework imports. io and redis are injected via constructor.

class IncidentEventPublisher {
    constructor() {
        // Map of eventType -> Set of observer instances
        this._subscribers = new Map()
    }

    /**
     * Register an observer for one or more event types.
     * @param {string | string[]} eventTypes  single event or array of events
     * @param {object} observer               must have a handle(eventType, payload) method
     */
    subscribe(eventTypes, observer) {
        const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes]
        for (const type of types) {
            if (!this._subscribers.has(type)) {
                this._subscribers.set(type, new Set())
            }
            this._subscribers.get(type).add(observer)
        }
        return this // allow chaining
    }

    unsubscribe(eventType, observer) {
        this._subscribers.get(eventType)?.delete(observer)
        return this
    }

    /**
     * Publish an event to all registered observers.
     * Uses Promise.allSettled so one failing observer never blocks others.
     * Logs (but does not rethrow) individual observer failures.
     */
    async publish(eventType, payload) {
        const handlers = this._subscribers.get(eventType) || new Set()

        const results = await Promise.allSettled(
            [...handlers].map((observer) =>
                Promise.resolve(observer.handle(eventType, payload))
            )
        )

        // Log failures — don't rethrow (caller should not be aware of observer failures)
        for (const result of results) {
            if (result.status === 'rejected') {
                console.error(
                    `[IncidentEventPublisher] Observer failed for event "${eventType}":`,
                    result.reason
                )
            }
        }
    }

    /** For testing: how many observers are registered for an event */
    subscriberCount(eventType) {
        return this._subscribers.get(eventType)?.size ?? 0
    }

    /** For testing: list all registered event types */
    registeredEvents() {
        return [...this._subscribers.keys()]
    }
}

module.exports = IncidentEventPublisher