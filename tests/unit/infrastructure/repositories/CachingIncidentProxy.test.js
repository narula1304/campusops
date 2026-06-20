// tests/unit/infrastructure/repositories/CachingIncidentProxy.test.js
//
// Pure unit tests — Redis client and IncidentRepository are replaced with
// lightweight jest.fn() fakes. No network, no DB, no Prisma module loaded.
// This file tests cache-aside orchestration only, not domain or DB logic.

const CachingIncidentProxy = require('../../../../src/infrastructure/repositories/CachingIncidentProxy')

// ── Fake builders ─────────────────────────────────────────────────────────────

/**
 * Minimal Redis fake. Every method returns a resolved promise by default.
 * Pass `overrides` to swap individual methods for specific test scenarios.
 */
function makeRedis(overrides = {}) {
    return {
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        ...overrides,
    }
}

/**
 * Minimal IncidentRepository fake.
 * getDashboardStats returns a realistic stats shape by default.
 */
function makeRealRepo(overrides = {}) {
    return {
        getDashboardStats: jest.fn().mockResolvedValue(makeStats()),
        findById: jest.fn().mockResolvedValue({ id: 'incident-1' }),
        findMany: jest.fn().mockResolvedValue({ incidents: [], total: 0 }),
        save: jest.fn().mockResolvedValue('incident-1'),
        findDuplicates: jest.fn().mockResolvedValue(null),
        incrementDuplicateCount: jest.fn().mockResolvedValue(undefined),
        countRecentByUser: jest.fn().mockResolvedValue(0),
        ...overrides,
    }
}

/** Canonical dashboard stats shape returned by IncidentRepository.getDashboardStats */
function makeStats(overrides = {}) {
    return {
        totalOpen: 5,
        totalInProgress: 3,
        totalResolved: 12,
        totalEscalated: 1,
        slaBreachRate: 0.0833,
        avgResolutionHours: 6.25,
        ...overrides,
    }
}

// Convenience — the exact cache key the proxy must produce for a given deptId
const deptKey = (deptId) => `cache:dashboard:dept:${deptId}:stats`
const DEPT_ID = 'dept-electrical'
const DEPT_KEY = deptKey(DEPT_ID)

// ── getDashboardStats ─────────────────────────────────────────────────────────

describe('CachingIncidentProxy.getDashboardStats', () => {
    // ── Cache HIT ─────────────────────────────────────────────────────────────

    test('cache HIT: returns parsed JSON from redis.get() without calling real repo', async () => {
        const cachedStats = makeStats({ totalOpen: 99 })
        const redis = makeRedis({ get: jest.fn().mockResolvedValue(JSON.stringify(cachedStats)) })
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, redis)

        const result = await proxy.getDashboardStats(DEPT_ID)

        expect(result).toEqual(cachedStats)
        expect(real.getDashboardStats).not.toHaveBeenCalled()
    })

    test('cache HIT: redis.get() is called with the correct department key', async () => {
        const redis = makeRedis({ get: jest.fn().mockResolvedValue(JSON.stringify(makeStats())) })
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.getDashboardStats(DEPT_ID)

        expect(redis.get).toHaveBeenCalledWith(DEPT_KEY)
    })

    // ── Cache MISS ────────────────────────────────────────────────────────────

    test('cache MISS: calls real.getDashboardStats() with the correct deptId', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())

        await proxy.getDashboardStats(DEPT_ID)

        expect(real.getDashboardStats).toHaveBeenCalledWith(DEPT_ID)
    })

    test('cache MISS: returns the fresh result from real.getDashboardStats()', async () => {
        const freshStats = makeStats({ totalOpen: 7 })
        const real = makeRealRepo({ getDashboardStats: jest.fn().mockResolvedValue(freshStats) })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.getDashboardStats(DEPT_ID)

        expect(result).toEqual(freshStats)
    })

    test('cache MISS: calls redis.setex() with the correct key', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.getDashboardStats(DEPT_ID)

        expect(redis.setex).toHaveBeenCalledWith(
            DEPT_KEY,
            expect.any(Number),
            expect.any(String)
        )
        expect(redis.setex.mock.calls[0][0]).toBe(DEPT_KEY)
    })

    test('cache MISS: calls redis.setex() with TTL of exactly 300 seconds', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.getDashboardStats(DEPT_ID)

        const [, ttl] = redis.setex.mock.calls[0]
        expect(ttl).toBe(300)
    })

    test('cache MISS: stores JSON.stringify of the fresh stats in redis.setex()', async () => {
        const freshStats = makeStats({ totalOpen: 42 })
        const real = makeRealRepo({ getDashboardStats: jest.fn().mockResolvedValue(freshStats) })
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(real, redis)

        await proxy.getDashboardStats(DEPT_ID)

        const [, , stored] = redis.setex.mock.calls[0]
        expect(stored).toBe(JSON.stringify(freshStats))
    })

    // ── Cache key format ──────────────────────────────────────────────────────

    test('cache key is exactly `cache:dashboard:dept:${deptId}:stats`', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.getDashboardStats('dept-xyz')

        expect(redis.get).toHaveBeenCalledWith('cache:dashboard:dept:dept-xyz:stats')
    })

    // ── Graceful degradation: redis.get() throws ──────────────────────────────

    test('redis.get() throws: falls through to real.getDashboardStats() without crashing', async () => {
        const redis = makeRedis({ get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) })
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, redis)

        // Must resolve, not reject
        await expect(proxy.getDashboardStats(DEPT_ID)).resolves.toBeDefined()
        expect(real.getDashboardStats).toHaveBeenCalledWith(DEPT_ID)
    })

    test('redis.get() throws: returns fresh data from the real repo', async () => {
        const freshStats = makeStats({ totalOpen: 9 })
        const redis = makeRedis({ get: jest.fn().mockRejectedValue(new Error('Redis down')) })
        const real = makeRealRepo({ getDashboardStats: jest.fn().mockResolvedValue(freshStats) })
        const proxy = new CachingIncidentProxy(real, redis)

        const result = await proxy.getDashboardStats(DEPT_ID)

        expect(result).toEqual(freshStats)
    })

    // ── Cache write failure does not break the response ───────────────────────

    test('redis.setex() throws after cache MISS: still returns fresh data successfully', async () => {
        const freshStats = makeStats({ totalOpen: 3 })
        const redis = makeRedis({ setex: jest.fn().mockRejectedValue(new Error('OOM')) })
        const real = makeRealRepo({ getDashboardStats: jest.fn().mockResolvedValue(freshStats) })
        const proxy = new CachingIncidentProxy(real, redis)

        const result = await proxy.getDashboardStats(DEPT_ID)

        expect(result).toEqual(freshStats)
    })

    test('redis.setex() throws: the error does not propagate to the caller', async () => {
        const redis = makeRedis({ setex: jest.fn().mockRejectedValue(new Error('write failed')) })
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        // Must not reject
        await expect(proxy.getDashboardStats(DEPT_ID)).resolves.toBeDefined()
    })
})

// ── invalidate ────────────────────────────────────────────────────────────────

describe('CachingIncidentProxy.invalidate', () => {
    test('calls redis.del() with the department-specific stats key', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.invalidate(DEPT_ID)

        const delKeys = redis.del.mock.calls.map((c) => c[0])
        expect(delKeys).toContain(DEPT_KEY)
    })

    test('calls redis.del() with the global stats key', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.invalidate(DEPT_ID)

        const delKeys = redis.del.mock.calls.map((c) => c[0])
        expect(delKeys).toContain('cache:dashboard:global:stats')
    })

    test('both del() calls happen for a single invalidate() call', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.invalidate(DEPT_ID)

        expect(redis.del).toHaveBeenCalledTimes(2)
    })

    test('global key is always `cache:dashboard:global:stats` regardless of deptId', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.invalidate('dept-security')

        const delKeys = redis.del.mock.calls.map((c) => c[0])
        expect(delKeys).toContain('cache:dashboard:global:stats')
    })
})

// ── Transparent delegation (non-cached methods) ───────────────────────────────

describe('CachingIncidentProxy — transparent delegation', () => {
    test('findById(id) delegates to real.findById(id) with the same argument', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())

        await proxy.findById('incident-42')

        expect(real.findById).toHaveBeenCalledWith('incident-42')
    })

    test('findById(id) returns exactly what real.findById() returns, untouched', async () => {
        const fakeIncident = { id: 'incident-42', title: 'Lift broken' }
        const real = makeRealRepo({ findById: jest.fn().mockResolvedValue(fakeIncident) })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.findById('incident-42')

        expect(result).toBe(fakeIncident) // reference equality — not a copy
    })

    test('findMany(filters, pagination) delegates with both arguments', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())
        const filters = { status: 'OPEN', departmentId: DEPT_ID }
        const pagination = { page: 2, limit: 10 }

        await proxy.findMany(filters, pagination)

        expect(real.findMany).toHaveBeenCalledWith(filters, pagination)
    })

    test('findMany() returns exactly what real.findMany() returns', async () => {
        const page = { incidents: [{ id: 'incident-1' }], total: 1 }
        const real = makeRealRepo({ findMany: jest.fn().mockResolvedValue(page) })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.findMany({}, {})

        expect(result).toBe(page)
    })

    test('save(incident) delegates to real.save(incident) with the same argument', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())
        const incident = { id: 'incident-1', title: 'Broken pipe' }

        await proxy.save(incident)

        expect(real.save).toHaveBeenCalledWith(incident)
    })

    test('save(incident) returns exactly what real.save() returns', async () => {
        const real = makeRealRepo({ save: jest.fn().mockResolvedValue('incident-99') })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.save({ id: 'incident-99' })

        expect(result).toBe('incident-99')
    })

    test('findDuplicates(location, category, windowHours) delegates directly with all three args', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())
        const location = { block: 'C', room: 'C-304' }

        await proxy.findDuplicates(location, 'MAINTENANCE', 24)

        expect(real.findDuplicates).toHaveBeenCalledWith(location, 'MAINTENANCE', 24)
    })

    test('findDuplicates() returns exactly what real.findDuplicates() returns', async () => {
        const dup = { id: 'incident-1', incidentNumber: 'INC-2025-000001', status: 'OPEN' }
        const real = makeRealRepo({ findDuplicates: jest.fn().mockResolvedValue(dup) })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.findDuplicates({ block: 'C' }, 'MAINTENANCE', 24)

        expect(result).toBe(dup)
    })

    test('incrementDuplicateCount(incidentId) delegates to real with the same id', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())

        await proxy.incrementDuplicateCount('incident-5')

        expect(real.incrementDuplicateCount).toHaveBeenCalledWith('incident-5')
    })

    test('incrementDuplicateCount() returns exactly what real.incrementDuplicateCount() returns', async () => {
        const real = makeRealRepo({ incrementDuplicateCount: jest.fn().mockResolvedValue(undefined) })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.incrementDuplicateCount('incident-5')

        expect(result).toBeUndefined()
    })

    test('countRecentByUser(userId, windowMs) delegates with both args', async () => {
        const real = makeRealRepo()
        const proxy = new CachingIncidentProxy(real, makeRedis())

        await proxy.countRecentByUser('student-1', 3_600_000)

        expect(real.countRecentByUser).toHaveBeenCalledWith('student-1', 3_600_000)
    })

    test('countRecentByUser() returns exactly what real.countRecentByUser() returns', async () => {
        const real = makeRealRepo({ countRecentByUser: jest.fn().mockResolvedValue(4) })
        const proxy = new CachingIncidentProxy(real, makeRedis())

        const result = await proxy.countRecentByUser('student-1', 3_600_000)

        expect(result).toBe(4)
    })

    // ── Verify non-cached methods never touch Redis ────────────────────────────

    test('findById() never calls redis.get or redis.setex', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.findById('incident-1')

        expect(redis.get).not.toHaveBeenCalled()
        expect(redis.setex).not.toHaveBeenCalled()
    })

    test('save() never calls redis.get or redis.setex', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.save({ id: 'incident-1' })

        expect(redis.get).not.toHaveBeenCalled()
        expect(redis.setex).not.toHaveBeenCalled()
    })

    test('findDuplicates() never calls redis.get or redis.setex', async () => {
        const redis = makeRedis()
        const proxy = new CachingIncidentProxy(makeRealRepo(), redis)

        await proxy.findDuplicates({ block: 'A' }, 'SECURITY', 12)

        expect(redis.get).not.toHaveBeenCalled()
        expect(redis.setex).not.toHaveBeenCalled()
    })
})
