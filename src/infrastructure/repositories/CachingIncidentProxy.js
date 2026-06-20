// src/infrastructure/repositories/CachingIncidentProxy.js
//
// Pattern 7 — Proxy (DESIGN_PATTERNS.md §7)
//
// Wraps IncidentRepository with a Redis cache-aside layer for the one method
// that is expensive enough to warrant caching: getDashboardStats().
//
// CONTRACT — this proxy is a drop-in replacement for IncidentRepository:
//   • Identical method signatures (same parameter names, same arity).
//   • Identical return shapes (same plain-object / domain-entity structures).
//   • The service layer (AnalyticsService, etc.) cannot tell whether it holds a
//     proxy or the real repository — it only ever calls repository methods.
//
// What lives here:
//   • Cache-aside read/write orchestration for getDashboardStats().
//   • Transparent delegation for every other method.
//
// What does NOT live here:
//   • Zero business logic, domain rules, or knowledge about incidents/states.
//   • No Prisma import — all DB access goes through this.real.
//   • No Redis client instantiation — the client is injected.
//
// References:
//   DESIGN_PATTERNS.md  — Pattern 7 (Proxy)
//   SYSTEM_DESIGN.md    — §3.5 (Cache Strategy)
//   src/domain/observers/observers.js — CacheInvalidator (direct Redis invalidation)

// ── Logger ────────────────────────────────────────────────────────────────────

// Use the project logger if one exists; fall back to console so this file has
// zero hard dependencies beyond what is injected.
let logger
try {
    logger = require('../../config/logger')
} catch {
    logger = {
        warn: (...args) => console.warn('[CachingIncidentProxy]', ...args),
        error: (...args) => console.error('[CachingIncidentProxy]', ...args),
    }
}

// ── Cache constants ───────────────────────────────────────────────────────────

/** TTL for per-department dashboard stats, in seconds. */
const DASHBOARD_STATS_TTL_SECONDS = 300

/**
 * Builds the per-department stats cache key.
 * Must stay in sync with the key pattern used by CacheInvalidator
 * (src/domain/observers/observers.js).
 *
 * @param {string} deptId
 * @returns {string}
 */
const deptStatsKey = (deptId) => `cache:dashboard:dept:${deptId}:stats`

/**
 * Global aggregate stats key. Invalidated alongside the per-dept key because
 * any change to a department's incidents makes the global rollup stale too.
 */
const GLOBAL_STATS_KEY = 'cache:dashboard:global:stats'

// ──────────────────────────────────────────────────────────────────────────────

class CachingIncidentProxy {
    /**
     * @param {IncidentRepository} realRepo - The real repository instance.
     * @param {import('ioredis').Redis} redis - An ioredis client instance.
     */
    constructor(realRepo, redis) {
        this.real = realRepo
        this.redis = redis
    }

    // ── Cached method ─────────────────────────────────────────────────────────

    /**
     * Returns aggregated dashboard statistics for a department.
     *
     * Cache-aside strategy:
     *   1. Attempt a Redis GET. On hit, JSON.parse and return immediately.
     *   2. On cache miss (or if Redis is unavailable), delegate to the real repo.
     *   3. Fire-and-forget the cache WRITE so a failing SETEX does not prevent
     *      the caller from receiving fresh data.
     *
     * Graceful degradation:
     *   The Redis READ is wrapped in try-catch. If Redis is down or throws,
     *   a warning is logged and execution falls through to the DB. The caller
     *   never sees a Redis error — only ever receives data (or a DB error if
     *   the DB itself is unavailable, which is the expected failure mode).
     *
     * @param {string} deptId
     * @returns {Promise<{
     *   totalOpen: number,
     *   totalInProgress: number,
     *   totalResolved: number,
     *   totalEscalated: number,
     *   slaBreachRate: number,
     *   avgResolutionHours: number | null
     * }>}
     */
    async getDashboardStats(deptId) {
        const key = deptStatsKey(deptId)

        // ── 1. Cache read (graceful — Redis failure must not crash the dashboard) ──
        try {
            const cached = await this.redis.get(key)
            if (cached !== null) {
                return JSON.parse(cached)
            }
        } catch (err) {
            // Redis is unavailable or returned an unexpected error.
            // Log a warning and fall through to the real repository.
            logger.warn('CachingIncidentProxy: Redis read failed, falling back to DB', {
                key,
                deptId,
                error: err?.message,
            })
        }

        // ── 2. Cache miss — fetch from the real repository ────────────────────
        const stats = await this.real.getDashboardStats(deptId)

        // ── 3. Cache write (fire-and-forget — failure must not surface to caller) ─
        // .catch(() => {}) swallows any SETEX error silently.
        this.redis
            .setex(key, DASHBOARD_STATS_TTL_SECONDS, JSON.stringify(stats))
            .catch((err) => {
                logger.warn('CachingIncidentProxy: Redis write failed, fresh data still returned', {
                    key,
                    deptId,
                    error: err?.message,
                })
            })

        return stats
    }

    // ── Cache invalidation ────────────────────────────────────────────────────

    /**
     * Invalidates the per-department stats cache and the global aggregate cache.
     *
     * Called by callers that hold a repository reference and want to invalidate
     * without reaching into Redis directly (e.g. a service-layer flush after a
     * batch operation).
     *
     * NOTE — relationship with CacheInvalidator:
     *   CacheInvalidator (src/domain/observers/observers.js) calls redis.del()
     *   directly rather than routing through this proxy. That is intentional:
     *   CacheInvalidator is an Observer that receives domain events and already
     *   has a Redis client injected — it has no reason to go through the
     *   repository abstraction. This proxy's invalidate() exists solely for
     *   callers that only have a repository reference and need to invalidate
     *   without depending on the Redis client directly.
     *
     * @param {string} deptId
     * @returns {Promise<void>}
     */
    async invalidate(deptId) {
        await Promise.allSettled([
            this.redis.del(deptStatsKey(deptId)),
            this.redis.del(GLOBAL_STATS_KEY),
        ])
    }

    // ── Transparent delegation — NOT cached ───────────────────────────────────
    //
    // These methods touch single rows or use indexed queries that are already
    // fast. Caching them would add complexity for negligible benefit and would
    // risk serving stale entity state to the domain layer.

    /**
     * @param {string} id
     * @returns {Promise<import('../../domain/entities/Incident').Incident | null>}
     */
    async findById(id) {
        return this.real.findById(id)
    }

    /**
     * @param {object} filters
     * @param {object} pagination
     * @returns {Promise<{ incidents: import('../../domain/entities/Incident').Incident[], total: number }>}
     */
    async findMany(filters = {}, pagination = {}) {
        return this.real.findMany(filters, pagination)
    }

    /**
     * @param {import('../../domain/entities/Incident').Incident} incident
     * @returns {Promise<string>} Saved row's id
     */
    async save(incident) {
        return this.real.save(incident)
    }

    /**
     * @param {{ block: string, room?: string }} location
     * @param {string} category
     * @param {number} windowHours
     * @returns {Promise<{ id: string, incidentNumber: string, status: string } | null>}
     */
    async findDuplicates(location, category, windowHours) {
        return this.real.findDuplicates(location, category, windowHours)
    }

    /**
     * @param {string} incidentId
     * @returns {Promise<void>}
     */
    async incrementDuplicateCount(incidentId) {
        return this.real.incrementDuplicateCount(incidentId)
    }

    /**
     * @param {string} userId
     * @param {number} windowMs
     * @returns {Promise<number>}
     */
    async countRecentByUser(userId, windowMs) {
        return this.real.countRecentByUser(userId, windowMs)
    }
}

module.exports = CachingIncidentProxy
