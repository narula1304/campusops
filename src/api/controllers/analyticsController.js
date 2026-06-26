// src/api/controllers/analyticsController.js
//
// Handles analytics queries and dashboard aggregations.

const { Prisma } = require('@prisma/client')

class AnalyticsController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     * @param {import('ioredis')} redis
     */
    constructor(prisma, redis) {
        this.prisma = prisma
        this.redis = redis
    }

    /**
     * GET /api/analytics/dashboard
     * Admin only. Returns aggregated statistics for the campus or a specific department.
     * Uses Redis for caching expensive queries.
     *
     * @type {import('express').RequestHandler}
     */
    getDashboard = async (req, res, next) => {
        try {
            const { departmentId } = req.query

            const cacheKey = departmentId
                ? `analytics:dashboard:dept:${departmentId}`
                : `analytics:dashboard:campus`

            // 1. Try Redis cache first
            if (this.redis) {
                try {
                    const cached = await this.redis.get(cacheKey)
                    if (cached) {
                        return res.status(200).json(JSON.parse(cached))
                    }
                } catch (cacheErr) {
                    // Graceful degradation if Redis is down
                    console.warn('[AnalyticsController] Redis cache read error:', cacheErr.message)
                }
            }

            const where = departmentId ? { departmentId } : {}

            // 2. Parallel query execution
            const [
                statusAgg,
                categoryAgg,
                priorityAgg,
                totalSlaBreaches,
                recentActivity,
                avgResRaw
            ] = await Promise.all([
                this.prisma.incident.groupBy({
                    by: ['status'],
                    where,
                    _count: true
                }),
                this.prisma.incident.groupBy({
                    by: ['category'],
                    where,
                    _count: true
                }),
                this.prisma.incident.groupBy({
                    by: ['priority'],
                    where,
                    _count: true
                }),
                this.prisma.incident.count({
                    where: { ...where, slaIsEscalated: true }
                }),
                this.prisma.incident.findMany({
                    where,
                    orderBy: { updatedAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        incidentNumber: true,
                        title: true,
                        status: true,
                        priority: true,
                        createdAt: true
                    }
                }),
                departmentId
                    ? this.prisma.$queryRaw`
                        SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))/3600)::float as "avgResolutionHours"
                        FROM "Incident"
                        WHERE status = 'RESOLVED' AND "departmentId" = ${departmentId}
                      `
                    : this.prisma.$queryRaw`
                        SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))/3600)::float as "avgResolutionHours"
                        FROM "Incident"
                        WHERE status = 'RESOLVED'
                      `
            ])

            // Process status aggregation
            let totalOpen = 0
            let totalInProgress = 0
            let totalResolved = 0
            let totalEscalated = 0
            let totalIncidents = 0

            statusAgg.forEach(item => {
                const count = item._count
                totalIncidents += count
                if (item.status === 'OPEN') totalOpen += count
                else if (item.status === 'IN_PROGRESS') totalInProgress += count
                else if (item.status === 'RESOLVED') totalResolved += count
                else if (item.status === 'ESCALATED') totalEscalated += count
            })

            const slaBreachRate = totalIncidents > 0 ? (totalSlaBreaches / totalIncidents) : 0
            const avgResolutionHours = avgResRaw[0]?.avgResolutionHours || null

            const responseData = {
                totalOpen,
                totalInProgress,
                totalResolved,
                totalEscalated,
                slaBreachRate,
                avgResolutionHours,
                byCategory: categoryAgg.map(c => ({ category: c.category, count: c._count })),
                byPriority: priorityAgg.map(p => ({ priority: p.priority, count: p._count })),
                recentActivity
            }

            // 3. Set Redis cache
            if (this.redis) {
                try {
                    await this.redis.set(cacheKey, JSON.stringify(responseData), 'EX', 120) // 120 seconds TTL
                } catch (cacheErr) {
                    console.warn('[AnalyticsController] Redis cache write error:', cacheErr.message)
                }
            }

            return res.status(200).json(responseData)
        } catch (err) {
            next(err)
        }
    }

    /**
     * GET /api/analytics/heatmap
     * Any authenticated role. Returns location hotspots.
     *
     * @type {import('express').RequestHandler}
     */
    getHeatmap = async (req, res, next) => {
        try {
            const { days = 30, category } = req.query
            const daysNum = parseInt(days, 10) || 30
            
            const cutoffDate = new Date()
            cutoffDate.setDate(cutoffDate.getDate() - daysNum)

            // Using Prisma $queryRaw for multi-column groupBy which is limited in older Prisma
            const hotspots = await this.prisma.$queryRaw`
                SELECT "locationBlock" as block,
                       "locationRoom"  as room,
                       COUNT(*)::int   as count,
                       MAX("createdAt") as "lastIncident"
                FROM   "Incident"
                WHERE  "createdAt" >= ${cutoffDate}
                ${category ? Prisma.sql`AND "category" = CAST(${category} AS "IncidentCategory")` : Prisma.empty}
                GROUP  BY "locationBlock", "locationRoom"
                ORDER  BY count DESC
                LIMIT  50
            `

            return res.status(200).json({ data: hotspots })
        } catch (err) {
            next(err)
        }
    }

    /**
     * GET /api/analytics/staff/:id/performance
     * Admin only. Returns performance metrics for a specific staff member.
     *
     * @type {import('express').RequestHandler}
     */
    getStaffPerformance = async (req, res, next) => {
        try {
            const { id } = req.params

            const user = await this.prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    role: true,
                    activeTaskCount: true,
                    penaltyCount: true,
                    staffState: true
                }
            })

            if (!user) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Staff member not found' }
                })
            }

            const [
                totalAssigned,
                totalResolved,
                feedbackAgg,
                recentIncidents,
                avgResRaw
            ] = await Promise.all([
                this.prisma.incident.count({
                    where: { assignedToId: id }
                }),
                this.prisma.incident.count({
                    where: { assignedToId: id, status: 'RESOLVED' }
                }),
                this.prisma.incidentFeedback.aggregate({
                    _avg: { score: true },
                    where: { incident: { assignedToId: id } }
                }),
                this.prisma.incident.findMany({
                    where: { assignedToId: id },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        incidentNumber: true,
                        status: true,
                        priority: true,
                        createdAt: true
                    }
                }),
                this.prisma.$queryRaw`
                    SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))/3600)::float as "avgResolutionHours"
                    FROM "Incident"
                    WHERE status = 'RESOLVED' AND "assignedToId" = ${id}
                `
            ])

            const responseData = {
                staffId: user.id,
                name: user.name,
                role: user.role,
                activeTaskCount: user.activeTaskCount,
                penaltyCount: user.penaltyCount,
                staffState: user.staffState,
                totalAssigned,
                totalResolved,
                avgResolutionHours: avgResRaw[0]?.avgResolutionHours || null,
                avgFeedbackScore: feedbackAgg._avg.score || null,
                recentIncidents
            }

            return res.status(200).json({ data: responseData })
        } catch (err) {
            next(err)
        }
    }
}

module.exports = AnalyticsController
