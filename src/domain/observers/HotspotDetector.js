// src/domain/observers/HotspotDetector.js
//
// Observer: detects when a location generates too many incidents in 24hrs.
//
// On INCIDENT_CREATED:
//   - INCRements a Redis counter for block+room
//   - Sets 24hr TTL (counter auto-expires, so each 24hr window is fresh)
//   - If count >= HOTSPOT_THRESHOLD, emits hotspot_detected to admin room
//
// The severity levels match USER_FLOWS.md Flow 7:
//   3-5  → warning
//   6-9  → high
//   10+  → critical
//
// Constructor receives redis (ioredis client) and io (Socket.IO server) — injected.

const HOTSPOT_THRESHOLD = 3
const HOTSPOT_TTL_SECONDS = 86400  // 24 hours

class HotspotDetector {
    constructor(redis, io) {
        this.redis = redis
        this.io = io
    }

    async handle(eventType, { incident }) {
        if (eventType !== 'INCIDENT_CREATED') return

        const block = incident.location?.block
        const room = incident.location?.room

        if (!block) return  // no location data — skip

        const key = room
            ? `hotspot:${block}:${room}`
            : `hotspot:${block}`

        const count = await this.redis.incr(key)
        await this.redis.expire(key, HOTSPOT_TTL_SECONDS)

        if (count >= HOTSPOT_THRESHOLD) {
            const severity = this._severity(count)
            this.io.to('role:ADMIN').emit('hotspot_detected', {
                block,
                room,
                count,
                severity,
                message: `${count} incidents in ${block}${room ? `-${room}` : ''} in the last 24 hours`
            })
        }
    }

    _severity(count) {
        if (count >= 10) return 'critical'
        if (count >= 6) return 'high'
        return 'warning'
    }
}

module.exports = HotspotDetector