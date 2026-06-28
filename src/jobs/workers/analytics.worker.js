function createAnalyticsWorker({ prisma, redis }) {
  const { Worker } = require('bullmq')

  const worker = new Worker('analytics', async (job) => {
    const { type, departmentId } = job.data

    if (type === 'refresh-dashboard') {
      // Re-compute and cache the dashboard stats for a department
      // (or campus-wide if no departmentId)
      const where = departmentId ? { departmentId } : {}

      const [statusAgg, totalSlaBreaches] = await Promise.all([
        prisma.incident.groupBy({ by: ['status'], where, _count: true }),
        prisma.incident.count({ where: { ...where, slaIsEscalated: true } })
      ])

      const counts = {}
      let total = 0
      statusAgg.forEach(g => { counts[g.status] = g._count; total += g._count })

      const stats = {
        totalOpen: counts['OPEN'] ?? 0,
        totalInProgress: counts['IN_PROGRESS'] ?? 0,
        totalResolved: counts['RESOLVED'] ?? 0,
        totalEscalated: counts['ESCALATED'] ?? 0,
        slaBreachRate: total > 0 ? totalSlaBreaches / total : 0,
        cachedAt: new Date().toISOString()
      }

      const cacheKey = departmentId
        ? `analytics:dashboard:dept:${departmentId}`
        : `analytics:dashboard:campus`

      await redis.set(cacheKey, JSON.stringify(stats), 'EX', 300)
      console.log(`[AnalyticsWorker] Refreshed cache for key: ${cacheKey}`)
    }
  }, {
    connection: redis,
    concurrency: 1,
  })

  worker.on('failed', (job, err) => {
    console.error(`[AnalyticsWorker] Job ${job?.id} failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[AnalyticsWorker] Worker error:', err.message)
  })

  console.log('[AnalyticsWorker] Started')
  return worker
}

module.exports = { createAnalyticsWorker }

