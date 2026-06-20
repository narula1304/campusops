// src/infrastructure/repositories/IncidentRepository.js
//
// The ONLY file in the infrastructure layer that imports Prisma directly.
// Bridges PostgreSQL rows ↔ domain objects built in src/domain/.
//
// Architecture rules enforced here:
//   • ZERO business logic — only data mapping and Prisma calls.
//   • All decision-making (state transitions, validation) has already
//     happened in the domain layer before save() is called.
//   • Domain classes (states, entities, SLA) are imported from src/domain.
//   • Prisma is imported from the singleton in src/infrastructure/db/prisma.js.
//
// References:
//   SYSTEM_DESIGN.md  — Section 5 (Domain Object Hydration)
//   DOMAIN_MODEL.md   — Section 9 (Repository Interfaces)
//   prisma/schema.prisma — Incident model column names

const prisma = require('../db/prisma')

// ── Domain entities ────────────────────────────────────────────────────────────
const {
    Incident,
    MaintenanceIncident,
    SecurityIncident,
    InfrastructureIncident,
    EmergencyIncident,
    GeneralIncident,
    Location,
} = require('../../domain/entities/Incident')

// ── Domain states ──────────────────────────────────────────────────────────────
const OpenState = require('../../domain/states/OpenState')
const InProgressState = require('../../domain/states/InProgressState')
const ResolvedState = require('../../domain/states/ResolvedState')
const EscalatedState = require('../../domain/states/EscalatedState')
const ReopenedState = require('../../domain/states/ReopenedState')

// ── SLA factory ────────────────────────────────────────────────────────────────
const { SLAFactory } = require('../../domain/entities/SLAPolicy')

// ── Static lookup maps (built once at module load) ─────────────────────────────

/**
 * Maps the IncidentStatus DB enum string to the corresponding state constructor.
 * Called inside toEntity() for every row loaded from PostgreSQL.
 */
const STATE_MAP = {
    OPEN: () => new OpenState(),
    IN_PROGRESS: () => new InProgressState(),
    RESOLVED: () => new ResolvedState(),
    ESCALATED: () => new EscalatedState(),
    REOPENED: () => new ReopenedState(),
    // CLOSED has no dedicated state yet — treat as RESOLVED for hydration
    CLOSED: () => new ResolvedState(),
}

/**
 * Maps the IncidentCategory DB enum string to the corresponding domain
 * subclass constructor. CLEANLINESS shares MaintenanceIncident per the
 * Factory pattern specification (DESIGN_PATTERNS.md Pattern 4).
 */
const INCIDENT_MAP = {
    MAINTENANCE: (data) => new MaintenanceIncident(data),
    CLEANLINESS: (data) => new MaintenanceIncident(data),
    SECURITY: (data) => new SecurityIncident(data),
    INFRASTRUCTURE: (data) => new InfrastructureIncident(data),
    EMERGENCY: (data) => new EmergencyIncident(data),
    OTHER: (data) => new GeneralIncident(data),
}

// ── Standard relation includes (reused in findById + findMany) ─────────────────
const INCIDENT_INCLUDE = {
    creator: {
        select: { id: true, name: true, email: true, role: true },
    },
    assignedTo: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            activeTaskCount: true,
            staffState: true,
            penaltyCount: true,
        },
    },
    department: {
        select: { id: true, name: true, code: true },
    },
}

// ──────────────────────────────────────────────────────────────────────────────

class IncidentRepository {
    // ── Core CRUD ──────────────────────────────────────────────────────────────

    /**
     * Fetches a single Incident row with creator, assignedTo, and department
     * relations pre-joined. Returns a fully hydrated domain object, or null
     * if the row does not exist.
     *
     * @param {string} id - UUID
     * @returns {Promise<Incident|null>}
     */
    async findById(id) {
        const row = await prisma.incident.findUnique({
            where: { id },
            include: INCIDENT_INCLUDE,
        })

        return row ? this.toEntity(row) : null
    }

    /**
     * Paginated incident list with optional filters.
     *
     * Supported filters:
     *   status, priority, category, departmentId, assignedToId,
     *   block (locationBlock), search (title/description ILIKE),
     *   createdAfter, createdBefore
     *
     * Supported pagination:
     *   page (1-indexed, default 1), limit (default 20, max 100),
     *   sortBy ('createdAt'|'priority'|'status', default 'createdAt'),
     *   sortOrder ('asc'|'desc', default 'desc')
     *
     * @param {object} filters
     * @param {object} pagination
     * @returns {Promise<{ incidents: Incident[], total: number }>}
     */
    async findMany(filters = {}, pagination = {}) {
        const {
            status,
            priority,
            category,
            departmentId,
            assignedToId,
            block,
            search,
            createdAfter,
            createdBefore,
        } = filters

        const {
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = pagination

        const safeLimit = Math.min(Number(limit), 100)
        const safeSkip = (Math.max(Number(page), 1) - 1) * safeLimit

        // ── Build the where clause ────────────────────────────────────────────
        const where = {}

        if (status) where.status = status
        if (priority) where.priority = priority
        if (category) where.category = category
        if (departmentId) where.departmentId = departmentId
        if (assignedToId) where.assignedToId = assignedToId
        if (block) where.locationBlock = block

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ]
        }

        if (createdAfter || createdBefore) {
            where.createdAt = {}
            if (createdAfter) where.createdAt.gte = new Date(createdAfter)
            if (createdBefore) where.createdAt.lte = new Date(createdBefore)
        }

        // ── Execute count + page in parallel ─────────────────────────────────
        const [rows, total] = await prisma.$transaction([
            prisma.incident.findMany({
                where,
                include: INCIDENT_INCLUDE,
                orderBy: { [sortBy]: sortOrder },
                skip: safeSkip,
                take: safeLimit,
            }),
            prisma.incident.count({ where }),
        ])

        return {
            incidents: rows.map((row) => this.toEntity(row)),
            total,
        }
    }

    /**
     * Persists an incident domain object.
     * - If incident.id is set → UPDATE the existing row.
     * - If incident.id is null/undefined → CREATE a new row (Prisma generates UUID).
     *
     * Calls toDocument(incident) to produce the plain Prisma-compatible data object.
     * Returns the saved row's id.
     *
     * @param {Incident} incident
     * @returns {Promise<string>} - The saved row's id
     */
    async save(incident) {
        const data = this.toDocument(incident)

        if (incident.id) {
            // UPDATE — strip fields Prisma cannot accept on update
            const { id: _id, creatorId: _cid, ...updateData } = data
            await prisma.incident.update({
                where: { id: incident.id },
                data: updateData,
            })
            return incident.id
        } else {
            // CREATE — Prisma will generate the UUID id
            const created = await prisma.incident.create({ data })
            return created.id
        }
    }

    // ── Domain-contract methods (called by validators in src/domain) ──────────

    /**
     * Duplicate detection query.
     * Returns the first OPEN or IN_PROGRESS incident in the same location
     * and category created within the last `windowHours` hours, or null.
     *
     * This is the method DuplicateDetector (src/domain/validators/ValidationChain.js)
     * calls via `context.incidentRepo.findDuplicates(location, category, windowHours)`.
     *
     * @param {{ block: string, room?: string }} location
     * @param {string} category  - IncidentCategory enum value
     * @param {number} windowHours
     * @returns {Promise<{ id: string, incidentNumber: string, status: string }|null>}
     */
    async findDuplicates(location, category, windowHours) {
        const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000)

        const row = await prisma.incident.findFirst({
            where: {
                locationBlock: location.block,
                ...(location.room ? { locationRoom: location.room } : {}),
                category,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                createdAt: { gte: cutoff },
            },
            select: {
                id: true,
                incidentNumber: true,
                status: true,
            },
            orderBy: { createdAt: 'desc' },
        })

        return row ?? null
    }

    /**
     * Increments the duplicateCount field on the given incident by 1.
     * Called by DuplicateDetector after it finds a matching open incident.
     *
     * @param {string} incidentId
     * @returns {Promise<void>}
     */
    async incrementDuplicateCount(incidentId) {
        await prisma.incident.update({
            where: { id: incidentId },
            data: { duplicateCount: { increment: 1 } },
        })
    }

    /**
     * Counts incidents created by userId within the last `windowMs` milliseconds.
     * Called by SpamThrottleValidator via `context.incidentRepo.countRecentByUser`.
     *
     * @param {string} userId
     * @param {number} windowMs  - Time window in milliseconds (e.g. 3_600_000 = 1 hour)
     * @returns {Promise<number>}
     */
    async countRecentByUser(userId, windowMs) {
        const cutoff = new Date(Date.now() - windowMs)

        return prisma.incident.count({
            where: {
                creatorId: userId,
                createdAt: { gte: cutoff },
            },
        })
    }

    // ── Analytics ──────────────────────────────────────────────────────────────

    /**
     * Returns aggregated dashboard statistics for a department.
     *
     * Returned shape:
     *   {
     *     totalOpen:           number,
     *     totalInProgress:     number,
     *     totalResolved:       number,
     *     totalEscalated:      number,
     *     slaBreachRate:       number,   // 0–1 fraction of resolved incidents that breached SLA
     *     avgResolutionHours:  number | null
     *   }
     *
     * @param {string} deptId
     * @returns {Promise<object>}
     */
    async getDashboardStats(deptId) {
        const where = { departmentId: deptId }

        // Count by status in a single groupBy query
        const statusGroups = await prisma.incident.groupBy({
            by: ['status'],
            where,
            _count: { id: true },
        })

        const countByStatus = {}
        for (const g of statusGroups) {
            countByStatus[g.status] = g._count.id
        }

        // SLA breach rate — among all incidents with a deadline set
        const [totalWithDeadline, totalBreached] = await prisma.$transaction([
            prisma.incident.count({ where }),
            prisma.incident.count({
                where: {
                    ...where,
                    slaIsEscalated: true,
                },
            }),
        ])

        const slaBreachRate =
            totalWithDeadline > 0
                ? Number((totalBreached / totalWithDeadline).toFixed(4))
                : 0

        // Average resolution time — only for RESOLVED incidents with resolvedAt set
        const resolvedIncidents = await prisma.incident.findMany({
            where: {
                ...where,
                status: { in: ['RESOLVED', 'CLOSED'] },
                resolvedAt: { not: null },
            },
            select: {
                createdAt: true,
                resolvedAt: true,
            },
        })

        let avgResolutionHours = null
        if (resolvedIncidents.length > 0) {
            const totalMs = resolvedIncidents.reduce((sum, row) => {
                return sum + (row.resolvedAt.getTime() - row.createdAt.getTime())
            }, 0)
            avgResolutionHours = Number(
                (totalMs / resolvedIncidents.length / 3_600_000).toFixed(2)
            )
        }

        return {
            totalOpen: countByStatus['OPEN'] ?? 0,
            totalInProgress: countByStatus['IN_PROGRESS'] ?? 0,
            totalResolved: (countByStatus['RESOLVED'] ?? 0) + (countByStatus['CLOSED'] ?? 0),
            totalEscalated: countByStatus['ESCALATED'] ?? 0,
            slaBreachRate,
            avgResolutionHours,
        }
    }

    // ── Hydration helpers ──────────────────────────────────────────────────────

    /**
     * Converts a raw Prisma Incident row (with optional relations) into the
     * correct domain subclass instance, with state and SLA fully reconstructed.
     *
     * Mapping rules:
     *   • row.category  → correct Incident subclass (CLEANLINESS → MaintenanceIncident)
     *   • row.status    → correct IncidentState instance (via STATE_MAP)
     *   • row.*sla*     → SLAPolicy subclass via SLAFactory.fromRow(row)
     *   • row.locationBlock/Room/Floor/Lat/Lng/Desc → Location value object
     *   • row.assignedTo (relation) → plain object {id, activeTaskCount, staffState, penaltyCount}
     *     so state methods that call assignedTo.activeTaskCount-- / staff.penaltyCount++ work
     *
     * @param {object} row - Raw Prisma row (may include creator, assignedTo, department relations)
     * @returns {Incident}
     */
    toEntity(row) {
        const builder = INCIDENT_MAP[row.category] ?? INCIDENT_MAP['OTHER']

        const location = new Location({
            block: row.locationBlock,
            room: row.locationRoom ?? null,
            floor: row.locationFloor ?? null,
            lat: row.locationLat ?? null,
            lng: row.locationLng ?? null,
            description: row.locationDesc ?? null,
        })

        // Reconstruct the assignedTo staff object with just the fields that
        // state transition methods touch (activeTaskCount--, penaltyCount++, staffState).
        // Full User hydration is UserRepository's responsibility.
        const assignedTo = row.assignedTo
            ? {
                id: row.assignedTo.id,
                name: row.assignedTo.name ?? null,
                email: row.assignedTo.email ?? null,
                role: row.assignedTo.role ?? null,
                activeTaskCount: row.assignedTo.activeTaskCount ?? 0,
                staffState: row.assignedTo.staffState ?? 'ACTIVE',
                penaltyCount: row.assignedTo.penaltyCount ?? 0,
            }
            : null

        const incident = builder({
            id: row.id,
            incidentNumber: row.incidentNumber,
            title: row.title,
            description: row.description,
            category: row.category,
            priority: row.priority,
            location,
            evidencePhotos: row.evidencePhotos ?? [],
            resolutionPhoto: row.resolutionPhoto ?? null,
            creatorId: row.creatorId,
            assignedToId: row.assignedToId ?? null,
            assignedTo,
            departmentId: row.departmentId,
            slaJobId: row.slaJobId ?? null,
            resolutionNote: row.resolutionNote ?? null,
            resolvedAt: row.resolvedAt ?? null,
            isDuplicate: row.isDuplicate ?? false,
            duplicateOfId: row.duplicateOfId ?? null,
            duplicateCount: row.duplicateCount ?? 0,
            feedback: null, // hydrated separately via IncidentFeedback relation when needed
            statusLogEntries: [],
            publishedEvents: [],
            publisher: null,

            // Category-specific fields
            estimatedDurationHours: row.estimatedDurationHours ?? null, // MaintenanceIncident
            requiresDeptHeadApproval: row.requiresDeptHeadApproval ?? false, // InfrastructureIncident
            estimatedCost: row.estimatedCost ?? null,                   // InfrastructureIncident
            reportNumber: row.reportNumber ?? null,                     // SecurityIncident
            alertsBroadcast: row.alertsBroadcast ?? false,              // SecurityIncident
            panicLat: row.panicLat ?? null,                             // EmergencyIncident
            panicLng: row.panicLng ?? null,                             // EmergencyIncident
            broadcastedAt: row.panicBroadcastedAt ?? null,              // EmergencyIncident
            acknowledgedByIds: [],                                       // EmergencyIncident
        })

        // Attach state — must happen AFTER construction so the state object
        // holds a reference to the correct incident instance context.
        const stateFactory = STATE_MAP[row.status] ?? STATE_MAP['OPEN']
        incident.setState(stateFactory())

        // Reconstruct SLA from the flattened sla* columns on the Incident row.
        incident.sla = SLAFactory.fromRow(row)

        return incident
    }

    /**
     * Converts a domain Incident instance into a plain object suitable for
     * prisma.incident.create() or prisma.incident.update().
     *
     * Mapping rules:
     *   • incident.state.getName()  → status string ('OPEN', 'IN_PROGRESS', …)
     *   • incident.sla.*            → flattened sla* columns
     *   • incident.location.*       → flattened location* columns
     *
     * @param {Incident} incident
     * @returns {object} Plain Prisma data object
     */
    toDocument(incident) {
        return {
            // Identity
            ...(incident.id ? { id: incident.id } : {}),
            ...(incident.incidentNumber
                ? { incidentNumber: incident.incidentNumber }
                : {}),

            // Core fields
            title: incident.title,
            description: incident.description,
            category: incident.category,
            priority: incident.priority,
            status: incident.state.getName(),

            // Location (flattened)
            locationBlock: incident.location?.block ?? '',
            locationRoom: incident.location?.room ?? null,
            locationFloor: incident.location?.floor ?? null,
            locationLat: incident.location?.lat ?? null,
            locationLng: incident.location?.lng ?? null,
            locationDesc: incident.location?.description ?? null,

            // Photos
            evidencePhotos: incident.evidencePhotos ?? [],
            resolutionPhoto: incident.resolutionPhoto ?? null,

            // Relations (FK only — Prisma resolves the join)
            creatorId: incident.creatorId,
            assignedToId: incident.assignedToId ?? null,
            departmentId: incident.departmentId,

            // SLA (flattened per prisma/schema.prisma Incident model)
            slaWindowHours: incident.sla?.windowHours ?? null,
            slaDeadlineAt: incident.sla?.deadlineAt ?? null,
            slaIsEscalated: incident.sla?.isEscalated ?? false,
            slaEscalatedAt: incident.sla?.escalatedAt ?? null,
            slaJobId: incident.slaJobId ?? null,

            // Resolution
            resolutionNote: incident.resolutionNote ?? null,
            resolvedAt: incident.resolvedAt ?? null,

            // Duplicate tracking
            isDuplicate: incident.isDuplicate ?? false,
            duplicateOfId: incident.duplicateOfId ?? null,
            duplicateCount: incident.duplicateCount ?? 0,

            // Panic-specific (EmergencyIncident)
            panicLat: incident.panicLat ?? null,
            panicLng: incident.panicLng ?? null,
            panicBroadcastedAt: incident.broadcastedAt ?? null,
        }
    }
}

module.exports = IncidentRepository
