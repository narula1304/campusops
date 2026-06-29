// src/api/middleware/rateLimiter.js
//
// Sliding window rate limiter using Redis sorted sets.
// Does NOT depend on express-rate-limit — uses raw ioredis pipeline commands.
//
// Usage:
//   const createRateLimiter = require('./rateLimiter')
//   const limiter = createRateLimiter({ redis, windowMs: 60_000, max: 10, keyPrefix: 'rl:incident:create' })
//   app.use('/api/something', limiter)

/**
 * @param {{ redis: import('ioredis').Redis, windowMs: number, max: number, keyPrefix: string }} opts
 * @returns {import('express').RequestHandler}
 */
module.exports = function createRateLimiter({ redis, windowMs, max, keyPrefix }) {
    return async function rateLimiter(req, res, next) {
        try {
            const identifier = req.user?.id ?? req.ip
            const key        = `${keyPrefix}:${identifier}`
            const now        = Date.now()
            const windowStart = now - windowMs

            // Sliding window via Redis sorted set:
            //  Score  = timestamp ms (enables range queries)
            //  Member = unique per request (prevents deduplication)
            const pipeline = redis.pipeline()
            pipeline.zremrangebyscore(key, 0, windowStart)              // evict stale entries
            pipeline.zadd(key, now, `${now}-${Math.random()}`)          // record this request
            pipeline.zcard(key)                                          // count in window
            pipeline.expire(key, Math.ceil(windowMs / 1000))            // auto-expire key

            const results = await pipeline.exec()
            const count   = results[2][1]   // zcard result (index 2, value at [1])

            res.setHeader('X-RateLimit-Limit',     max)
            res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count))

            if (count > max) {
                return res.status(429).json({
                    error: {
                        code:    'RATE_LIMITED',
                        message: 'Too many requests. Please slow down.',
                    },
                })
            }

            next()
        } catch (err) {
            // Fail open — if Redis is unavailable, let the request through
            // rather than taking the service down with it.
            console.warn('[RateLimiter] Redis error, failing open:', err.message)
            next()
        }
    }
}
