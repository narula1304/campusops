// src/domain/strategies/AssignmentStrategy.js
//
// Strategy pattern (DESIGN_PATTERNS.md Pattern 2).
//
// Problem it solves:
// Different departments need different assignment logic. Hardcoding
// if/else inside AssignmentService means every new rule requires
// modifying existing code (violates OCP). With Strategy, each rule
// is a separate class. Changing a department's strategy is a database
// update — zero code change.
//
// ZERO framework imports. All classes operate on plain domain objects.

const { NoStaffAvailableError, StaffNotEligibleError, StaffUnavailableError } = require('../errors')

// ── Abstract base ──

class AssignmentStrategy {
    /**
     * @param {import('../entities/Incident').Incident} incident
     * @param {import('../entities/User').MaintenanceStaff[]} eligibleStaff
     * @param {object} options  extra context (department for RoundRobin, targetStaffId for Manual)
     * @returns {import('../entities/User').MaintenanceStaff | import('../entities/User').SecurityOfficer}
     */
    assign(incident, eligibleStaff, options = {}) {
        throw new Error(`${this.constructor.name}.assign() must be implemented`)
    }
}

// ── LeastLoadedStrategy ──
// Picks the active, on-shift staff member with the fewest open tasks.
// Default strategy for most departments.

class LeastLoadedStrategy extends AssignmentStrategy {
    assign(incident, eligibleStaff, options = {}) {
        const available = eligibleStaff.filter(
            (s) => s.staffState === 'ACTIVE' && this._isOnShiftNow(s)
        )

        if (available.length === 0) {
            throw new NoStaffAvailableError(incident.departmentId)
        }

        // Stable sort: lowest activeTaskCount first.
        // If tied, preserve original order (i.e. first eligible wins).
        return available.slice().sort((a, b) => a.activeTaskCount - b.activeTaskCount)[0]
    }

    _isOnShiftNow(staff) {
        if (typeof staff.isOnShift === 'function') {
            return staff.isOnShift(new Date())
        }
        return true // fallback: if no shift info, treat as available
    }
}

// ── RoundRobinStrategy ──
// Rotates assignments evenly across all active staff, regardless of workload.
// Requires a `department` object with a mutable `roundRobinIndex` field
// (stored in the Department table in PostgreSQL, updated after each assignment).

class RoundRobinStrategy extends AssignmentStrategy {
    assign(incident, eligibleStaff, { department } = {}) {
        if (!department) {
            throw new Error('RoundRobinStrategy requires a department object in options')
        }

        const active = eligibleStaff.filter((s) => s.staffState === 'ACTIVE')

        if (active.length === 0) {
            throw new NoStaffAvailableError(incident.departmentId)
        }

        const idx = (department.roundRobinIndex ?? 0) % active.length
        department.roundRobinIndex = (idx + 1) % active.length  // advance for next call

        return active[idx]
    }
}

// ── ShiftAwareStrategy ──
// Checks that the staff member's shift covers the full estimated SLA window.
// Falls back to on-call staff if no shift-covering staff is available.

class ShiftAwareStrategy extends AssignmentStrategy {
    assign(incident, eligibleStaff, options = {}) {
        const estimatedHours = incident.sla?.windowHours ?? 4
        const now = new Date()

        // Primary: find active staff whose shift covers the full SLA window
        const shiftCovering = eligibleStaff
            .filter((s) => {
                if (s.staffState !== 'ACTIVE') return false
                if (typeof s.isAvailableFor === 'function') {
                    return s.isAvailableFor(estimatedHours, now)
                }
                return true
            })
            .slice()
            .sort((a, b) => a.activeTaskCount - b.activeTaskCount)

        if (shiftCovering.length > 0) return shiftCovering[0]

        // Fallback: on-call staff (shift outside standard business hours)
        const onCall = eligibleStaff.find((s) => {
            if (s.staffState !== 'ACTIVE') return false
            return typeof s.isOnCall === 'function' ? s.isOnCall(now) : false
        })

        if (onCall) return onCall

        throw new NoStaffAvailableError(incident.departmentId)
    }
}

// ── ManualStrategy ──
// Admin explicitly picks the target staff member.
// Validates eligibility and active state; refuses suspended/under-review staff.

class ManualStrategy extends AssignmentStrategy {
    assign(incident, eligibleStaff, { targetStaffId } = {}) {
        if (!targetStaffId) {
            throw new Error('ManualStrategy requires options.targetStaffId')
        }

        const staff = eligibleStaff.find((s) => s.id === targetStaffId)

        if (!staff) {
            throw new StaffNotEligibleError(targetStaffId)
        }

        if (staff.staffState !== 'ACTIVE') {
            throw new StaffUnavailableError(targetStaffId)
        }

        return staff
    }
}

// ── StrategyFactory ──
// Maps the AssignmentStrategy enum value (stored in the Department table)
// to the correct concrete Strategy class.
// AssignmentService calls StrategyFactory.create(dept.assignmentStrategy)
// and never does `new LeastLoadedStrategy()` directly — this keeps the
// service decoupled from concrete implementations.

const STRATEGY_MAP = {
    LEAST_LOADED: LeastLoadedStrategy,
    ROUND_ROBIN: RoundRobinStrategy,
    SHIFT_AWARE: ShiftAwareStrategy,
    MANUAL: ManualStrategy
}

class StrategyFactory {
    static create(strategyName) {
        const StrategyClass = STRATEGY_MAP[strategyName]
        if (!StrategyClass) {
            // Default to LeastLoaded rather than throwing — a misconfigured
            // department should still work, just with a sensible fallback.
            console.warn(
                `Unknown assignment strategy "${strategyName}" — falling back to LEAST_LOADED`
            )
            return new LeastLoadedStrategy()
        }
        return new StrategyClass()
    }

    static validStrategies() {
        return Object.keys(STRATEGY_MAP)
    }
}

module.exports = {
    AssignmentStrategy,
    LeastLoadedStrategy,
    RoundRobinStrategy,
    ShiftAwareStrategy,
    ManualStrategy,
    StrategyFactory
}