// src/infrastructure/repositories/DepartmentRepository.js
//
// Implements the DepartmentRepository interface that IncidentService expects
// (documented at the top of src/services/IncidentService.js):
//
//   interface DepartmentRepository {
//     async findById(id: string): Promise<Department | null>
//     async findEligibleStaff(deptId: string, category: string): Promise<Staff[]>
//   }
//
// Architecture rules enforced here:
//   • ZERO business logic — no assignment decisions, no priority filtering,
//     no "who gets picked" reasoning. That is Strategy classes' job.
//   • Only two responsibilities: (1) fetch rows from PostgreSQL via Prisma,
//     (2) hydrate Prisma rows into the correct domain class instances so that
//     Strategy classes can call domain methods (isOnShift(), isAvailableFor(),
//     staff.staffState, staff.activeTaskCount, etc.).
//   • ZERO Express imports — no req/res.
//
// References:
//   DATABASE_DESIGN.md — Section 2 (User model, Department model)
//   SYSTEM_DESIGN.md   — Section 2 (infrastructure layer rules)
//   src/domain/entities/User.js — MaintenanceStaff, SecurityOfficer constructors
//   src/domain/strategies/AssignmentStrategy.js — what fields strategies access

const prisma = require('../db/prisma')

const { MaintenanceStaff, SecurityOfficer, Shift } = require('../../domain/entities/User')

// ── Category → DB role mapping ────────────────────────────────────────────────
//
// Maps each IncidentCategory value to the DB role(s) that handle it.
// Used in findEligibleStaff to build the Prisma `where` clause.
//
// Rationale per DOMAIN_MODEL.md:
//   MAINTENANCE / CLEANLINESS / INFRASTRUCTURE → role = MAINTENANCE
//   SECURITY / EMERGENCY                       → role = SECURITY
//   OTHER                                      → role IN [MAINTENANCE, SECURITY]
//     (broadest fallback — Strategy will narrow further if needed)

const CATEGORY_ROLE_MAP = {
    MAINTENANCE:    { roles: ['MAINTENANCE'], scopedToDept: true  },
    CLEANLINESS:    { roles: ['MAINTENANCE'], scopedToDept: true  },
    INFRASTRUCTURE: { roles: ['MAINTENANCE'], scopedToDept: true  },
    SECURITY:       { roles: ['SECURITY'],    scopedToDept: false },
    EMERGENCY:      { roles: ['SECURITY'],    scopedToDept: false },
    OTHER:          { roles: ['MAINTENANCE', 'SECURITY'], scopedToDept: false },
}

// Default when the category is unrecognised — treat like OTHER
const DEFAULT_ROLE_CONFIG = { roles: ['MAINTENANCE', 'SECURITY'], scopedToDept: false }

// ── Prisma select — all columns needed for domain construction ────────────────
//
// Selecting only what the domain constructors consume keeps result sets small.
// Both MaintenanceStaff and SecurityOfficer share the User table (single-table
// inheritance in PostgreSQL — nullable per-role columns per DATABASE_DESIGN.md).

const STAFF_SELECT = {
    id:             true,
    name:           true,
    email:          true,
    passwordHash:   true,
    role:           true,
    departmentId:   true,
    isActive:       true,
    employeeId:     true,
    // MaintenanceStaff fields
    specialization: true,
    activeTaskCount:true,
    staffState:     true,
    penaltyCount:   true,
    shiftDays:      true,
    shiftStart:     true,
    shiftEnd:       true,
    // SecurityOfficer fields
    badgeNumber:    true,
    zone:           true,
    // Notification preferences (passed to User base constructor)
    prefRealtime:   true,
    prefEmail:      true,
    prefSms:        true,
}

// ─────────────────────────────────────────────────────────────────────────────

class DepartmentRepository {

    // ── findById ──────────────────────────────────────────────────────────────

    /**
     * Fetches a Department row from PostgreSQL and returns it as a plain object.
     *
     * Department is configuration data (name, strategy, round-robin index),
     * NOT a rich domain aggregate like Incident or User. There is no domain
     * class to hydrate into — the plain row is all IncidentService and the
     * StrategyFactory need.
     *
     * Returned shape:
     *   {
     *     id:                 string,
     *     name:               string,
     *     code:               string,
     *     assignmentStrategy: 'LEAST_LOADED' | 'ROUND_ROBIN' | 'SHIFT_AWARE' | 'MANUAL',
     *     roundRobinIndex:    number,
     *     headFacultyId:      string | null,
     *     createdAt:          Date,
     *     updatedAt:          Date,
     *   }
     *
     * Returns null if the department does not exist.
     *
     * @param {string} id  — UUID of the department
     * @returns {Promise<object|null>}
     */
    async findById(id) {
        const row = await prisma.department.findUnique({
            where: { id },
            select: {
                id:                 true,
                name:               true,
                code:               true,
                assignmentStrategy: true,
                roundRobinIndex:    true,
                headFacultyId:      true,
                createdAt:          true,
                updatedAt:          true,
            },
        })

        return row ?? null
    }

    // ── findEligibleStaff ─────────────────────────────────────────────────────

    /**
     * Returns the candidate pool of staff eligible to handle an incident of
     * the given category in the given department.
     *
     * Each row is hydrated into the correct domain instance:
     *   role = 'MAINTENANCE' → new MaintenanceStaff(...)
     *   role = 'SECURITY'    → new SecurityOfficer(...)
     *
     * Strategy classes (LeastLoadedStrategy, ShiftAwareStrategy, etc.) then call
     * domain methods on these instances:
     *   staff.isOnShift(now)          — MaintenanceStaff
     *   staff.isAvailableFor(hrs, t)  — MaintenanceStaff
     *   staff.isOnCall(now)           — MaintenanceStaff
     *   staff.staffState              — both
     *   staff.activeTaskCount         — both (SecurityOfficer inherits from User;
     *                                   the column exists on the DB row but the
     *                                   SecurityOfficer constructor does not
     *                                   declare it — it is attached dynamically
     *                                   after construction via the plain row)
     *
     * Filtering rules:
     *   1. role is determined by the category→role mapping above.
     *   2. MAINTENANCE staff are filtered to deptId (department-scoped teams).
     *      SECURITY staff are campus-wide — no departmentId filter applied.
     *   3. staffState != 'SUSPENDED' at the DB level.
     *      UNDER_REVIEW staff remain in the pool — Strategies decide if they
     *      qualify; over-filtering here would hide valid edge-case staff from
     *      the fallback paths in ShiftAwareStrategy.
     *
     * @param {string} deptId    — UUID of the department
     * @param {string} category  — IncidentCategory enum value
     * @returns {Promise<(MaintenanceStaff | SecurityOfficer)[]>}
     */
    async findEligibleStaff(deptId, category) {
        const { roles, scopedToDept } = CATEGORY_ROLE_MAP[category] ?? DEFAULT_ROLE_CONFIG

        if (roles.length === 1) {
            // Single-role query — simpler and more index-friendly
            const rows = await prisma.user.findMany({
                where: this._buildWhere(roles[0], deptId, scopedToDept),
                select: STAFF_SELECT,
                orderBy: { activeTaskCount: 'asc' }, // pre-sort for LeastLoadedStrategy
            })
            return rows.map((row) => this._toEntity(row))
        }

        // Multi-role query (OTHER category) — fetch both cohorts in parallel
        // and merge. Pre-sorting by activeTaskCount on each cohort keeps the
        // merged array roughly sorted, which helps LeastLoadedStrategy avoid
        // an expensive sort across a large array.
        const [maintenanceRows, securityRows] = await Promise.all([
            prisma.user.findMany({
                where: this._buildWhere('MAINTENANCE', deptId, true), // MAINTENANCE is always dept-scoped
                select: STAFF_SELECT,
                orderBy: { activeTaskCount: 'asc' },
            }),
            prisma.user.findMany({
                where: this._buildWhere('SECURITY', deptId, false),   // SECURITY is always campus-wide
                select: STAFF_SELECT,
                orderBy: { activeTaskCount: 'asc' },
            }),
        ])

        return [...maintenanceRows, ...securityRows].map((row) => this._toEntity(row))
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Builds the Prisma `where` object for a user.findMany() call.
     *
     * @param {string}  role          — 'MAINTENANCE' | 'SECURITY'
     * @param {string}  deptId        — department UUID
     * @param {boolean} scopedToDept  — if true, add departmentId filter
     * @returns {object}
     */
    _buildWhere(role, deptId, scopedToDept) {
        const where = {
            role,
            staffState: { not: 'SUSPENDED' }, // ACTIVE + UNDER_REVIEW both pass through
            isActive: true,                    // hard-deleted / deprovisioned users excluded
        }

        if (scopedToDept) {
            where.departmentId = deptId
        }

        return where
    }

    /**
     * Converts a raw Prisma User row to the correct domain subclass instance.
     *
     * MaintenanceStaff:
     *   shiftDays, shiftStart, shiftEnd are passed flat — the constructor
     *   stores them directly and isOnShift() / isAvailableFor() use them.
     *
     * SecurityOfficer:
     *   The domain constructor accepts a `shift` Shift object
     *   { days, start, end }. The DB stores shiftDays, shiftStart, shiftEnd
     *   as flat columns (same User table). We reconstruct the Shift value object
     *   here so the constructor and any future isOnShift-style methods work.
     *
     *   SecurityOfficer does not expose activeTaskCount as a constructor param,
     *   but the Strategies and Service code may check staff.activeTaskCount
     *   (e.g., for informational purposes). We attach it directly after
     *   construction so the field is always present on the returned instance.
     *
     * @param {object} row — Raw Prisma row with STAFF_SELECT fields
     * @returns {MaintenanceStaff | SecurityOfficer}
     */
    _toEntity(row) {
        const notificationPrefs = {
            realtime: row.prefRealtime ?? true,
            email:    row.prefEmail    ?? true,
            sms:      row.prefSms      ?? false,
        }

        if (row.role === 'MAINTENANCE') {
            return new MaintenanceStaff({
                id:             row.id,
                name:           row.name,
                email:          row.email,
                passwordHash:   row.passwordHash,
                departmentId:   row.departmentId ?? null,
                isActive:       row.isActive,
                notificationPrefs,
                employeeId:     row.employeeId ?? null,
                specialization: row.specialization ?? [],
                activeTaskCount:row.activeTaskCount ?? 0,
                staffState:     row.staffState ?? 'ACTIVE',
                penaltyCount:   row.penaltyCount ?? 0,
                shiftDays:      row.shiftDays  ?? [],
                shiftStart:     row.shiftStart ?? null,
                shiftEnd:       row.shiftEnd   ?? null,
            })
        }

        // role === 'SECURITY'
        const officer = new SecurityOfficer({
            id:           row.id,
            name:         row.name,
            email:        row.email,
            passwordHash: row.passwordHash,
            departmentId: row.departmentId ?? null,
            isActive:     row.isActive,
            notificationPrefs,
            employeeId:   row.employeeId  ?? null,
            badgeNumber:  row.badgeNumber ?? null,
            zone:         row.zone        ?? null,
            // Reconstruct Shift value object from flat DB columns
            shift: new Shift({
                days:  row.shiftDays  ?? [],
                start: row.shiftStart ?? null,
                end:   row.shiftEnd   ?? null,
            }),
        })

        // Attach activeTaskCount and staffState directly — these fields live on
        // the User table and the Service / Strategy layer expects them on every
        // staff instance regardless of subclass.
        officer.activeTaskCount = row.activeTaskCount ?? 0
        officer.staffState      = row.staffState      ?? 'ACTIVE'
        officer.penaltyCount    = row.penaltyCount     ?? 0

        return officer
    }
}

module.exports = DepartmentRepository
