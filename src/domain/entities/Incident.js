// src/domain/entities/Incident.js
//
// Incident hierarchy — pure domain, zero framework imports.
// See DOMAIN_MODEL.md Section 3 and DESIGN_PATTERNS.md Pattern 1 (State).
//
// Incident is the aggregate root: it holds a reference to its current
// IncidentState object and delegates every lifecycle action to it.
// The Incident class itself NEVER contains if/else on status — that
// branching logic lives entirely in the state classes (OpenState,
// InProgressState, etc.) built in Prompt 4.

const OpenState = require('../states/OpenState')

const IncidentCategory = Object.freeze({
    MAINTENANCE: 'MAINTENANCE',
    SECURITY: 'SECURITY',
    INFRASTRUCTURE: 'INFRASTRUCTURE',
    CLEANLINESS: 'CLEANLINESS',
    EMERGENCY: 'EMERGENCY',
    OTHER: 'OTHER'
})

class Location {
    constructor({ block, room = null, floor = null, lat = null, lng = null, description = null } = {}) {
        this.block = block
        this.room = room
        this.floor = floor
        this.lat = lat
        this.lng = lng
        this.description = description
    }
}

class Incident {
    constructor({
        id = null,
        incidentNumber = null,
        title,
        description,
        category,
        priority,
        location,
        evidencePhotos = [],
        resolutionPhoto = null,
        creatorId,
        assignedToId = null,
        assignedTo = null,
        departmentId,
        sla = null,
        slaJobId = null,
        state = new OpenState(),
        resolutionNote = null,
        resolvedAt = null,
        isDuplicate = false,
        duplicateOfId = null,
        duplicateCount = 0,
        feedback = null,
        statusLogEntries = [],
        publishedEvents = [],
        publisher = null
    } = {}) {
        if (new.target === Incident) {
            throw new TypeError('Incident is abstract and cannot be instantiated directly')
        }

        this.id = id
        this.incidentNumber = incidentNumber
        this.title = title
        this.description = description
        this.category = category
        this.priority = priority
        this.location = location instanceof Location ? location : new Location(location)
        this.evidencePhotos = evidencePhotos
        this.resolutionPhoto = resolutionPhoto
        this.creatorId = creatorId
        this.assignedToId = assignedToId
        this.assignedTo = assignedTo
        this.departmentId = departmentId
        this.sla = sla
        this.slaJobId = slaJobId
        this.state = state
        this.resolutionNote = resolutionNote
        this.resolvedAt = resolvedAt
        this.isDuplicate = isDuplicate
        this.duplicateOfId = duplicateOfId
        this.duplicateCount = duplicateCount
        this.feedback = feedback
        this.statusLogEntries = statusLogEntries
        this.publishedEvents = publishedEvents
        this.publisher = publisher
    }

    assignStaff(staff) {
        this.assignedTo = staff
        this.state.assignStaff(this, staff)
    }

    startProgress() {
        this.state.startProgress?.(this)
    }

    resolve(note, photo) {
        this.state.resolve(this, note, photo)
    }

    escalate(reason) {
        this.state.escalate(this, reason)
    }

    reopen(reason) {
        this.state.reopen(this, reason)
    }

    receiveFeedback(rating) {
        this.state.receiveFeedback(this, rating)
    }

    setState(state) {
        this.state = state
    }

    addToStatusLog(entry) {
        this.statusLogEntries.push({ ...entry, changedAt: entry.changedAt ?? new Date() })
    }

    publish(eventType, payload) {
        this.publishedEvents.push({ eventType, payload })
        if (this.publisher) {
            this.publisher.publish(eventType, payload)
        }
    }

    getCurrentStatus() {
        return this.state.getName()
    }

    getEligibleAssignees(allUsers) {
        throw new Error('getEligibleAssignees() must be implemented by subclass')
    }
}

class MaintenanceIncident extends Incident {
    constructor({ estimatedDurationHours = null, ...base } = {}) {
        super({ ...base, category: IncidentCategory.MAINTENANCE })
        this.estimatedDurationHours = estimatedDurationHours
    }

    getEligibleAssignees(allUsers) {
        return allUsers.filter(
            (u) =>
                u.role === 'MAINTENANCE' &&
                u.departmentId === this.departmentId &&
                u.staffState === 'ACTIVE'
        )
    }
}

class SecurityIncident extends Incident {
    constructor({ reportNumber = null, alertsBroadcast = false, ...base } = {}) {
        super({ ...base, category: IncidentCategory.SECURITY })
        this.reportNumber = reportNumber
        this.alertsBroadcast = alertsBroadcast
    }

    getEligibleAssignees(allUsers) {
        return allUsers.filter((u) => u.role === 'SECURITY' && u.staffState !== 'SUSPENDED')
    }
}

class InfrastructureIncident extends Incident {
    constructor({ requiresDeptHeadApproval = false, estimatedCost = null, ...base } = {}) {
        super({ ...base, category: IncidentCategory.INFRASTRUCTURE })
        this.requiresDeptHeadApproval = requiresDeptHeadApproval
        this.estimatedCost = estimatedCost
    }

    getEligibleAssignees(allUsers) {
        return allUsers.filter(
            (u) =>
                u.role === 'MAINTENANCE' &&
                u.departmentId === this.departmentId &&
                u.staffState === 'ACTIVE'
        )
    }
}

class EmergencyIncident extends Incident {
    constructor({
        panicLat = null,
        panicLng = null,
        broadcastedAt = null,
        acknowledgedByIds = [],
        ...base
    } = {}) {
        super({ ...base, category: IncidentCategory.EMERGENCY })
        this.panicLat = panicLat
        this.panicLng = panicLng
        this.broadcastedAt = broadcastedAt
        this.acknowledgedByIds = acknowledgedByIds
    }

    getEligibleAssignees(allUsers) {
        return allUsers.filter((u) => u.role === 'SECURITY' && u.staffState !== 'SUSPENDED')
    }
}

class GeneralIncident extends Incident {
    getEligibleAssignees(allUsers) {
        return allUsers.filter(
            (u) => u.departmentId === this.departmentId && u.staffState === 'ACTIVE'
        )
    }
}

module.exports = {
    Incident,
    MaintenanceIncident,
    SecurityIncident,
    InfrastructureIncident,
    EmergencyIncident,
    GeneralIncident,
    Location,
    IncidentCategory
}