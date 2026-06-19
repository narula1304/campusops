// src/domain/factories/IncidentFactory.js
//
// Factory pattern (DESIGN_PATTERNS.md Pattern 4).

const {
    MaintenanceIncident,
    SecurityIncident,
    InfrastructureIncident,
    EmergencyIncident,
    GeneralIncident,
    IncidentCategory
} = require('../entities/Incident')
const { SLAFactory } = require('../entities/SLAPolicy')
const OpenState = require('../states/OpenState')
const { InvalidCategoryError } = require('../errors')

const CATEGORY_CLASS_MAP = {
    [IncidentCategory.MAINTENANCE]: MaintenanceIncident,
    [IncidentCategory.SECURITY]: SecurityIncident,
    [IncidentCategory.INFRASTRUCTURE]: InfrastructureIncident,
    [IncidentCategory.EMERGENCY]: EmergencyIncident,
    [IncidentCategory.CLEANLINESS]: MaintenanceIncident,
    [IncidentCategory.OTHER]: GeneralIncident
}

class IncidentFactory {
    static create(dto, creator, createdAt = new Date()) {
        const IncidentClass = CATEGORY_CLASS_MAP[dto.category]
        if (!IncidentClass) {
            throw new InvalidCategoryError(dto.category)
        }

        const sla = SLAFactory.create(dto.priority, createdAt)

        const incident = new IncidentClass({
            title: dto.title,
            description: dto.description,
            priority: dto.priority,
            location: dto.location,
            evidencePhotos: dto.evidencePhotos ?? [],
            creatorId: creator.id,
            departmentId: dto.departmentId,
            estimatedDurationHours: dto.estimatedDurationHours ?? null,
            sla,
            state: new OpenState(),
            incidentNumber: this.generateNumber(createdAt)
        })

        return incident
    }

    static generateNumber(date = new Date()) {
        const year = date.getFullYear()
        const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0')
        return `INC-${year}-${seq}`
    }
}

module.exports = IncidentFactory