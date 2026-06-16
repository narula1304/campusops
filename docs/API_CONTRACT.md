# API Contract
## CampusOps — Smart Campus Operations & Incident Management System

**Base URL:** `https://api.campusops.com/api/v1`
**Auth:** `Authorization: Bearer {accessToken}` on all protected routes
**Content-Type:** `application/json`
**All timestamps:** ISO 8601 UTC — `2025-06-07T10:30:00.000Z`
**All IDs:** UUID v4 strings

---

## Standard Response Envelope

### Success
```json
{
  "success": true,
  "data": { },
  "meta": { }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "field": "fieldName",
    "details": { }
  }
}
```

---

## Error Codes Reference

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `FORBIDDEN` | 403 | Valid token but insufficient role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 422 | Request body failed validation |
| `INVALID_STATE_TRANSITION` | 422 | State machine rejected the action |
| `RESOLUTION_PHOTO_REQUIRED` | 422 | Photo missing before resolve |
| `RESOLUTION_NOTE_TOO_SHORT` | 422 | Note must be at least 10 characters |
| `DUPLICATE_INCIDENT` | 409 | Similar incident already open |
| `SPAM_THROTTLE` | 429 | Max 5 incidents per hour |
| `RATE_LIMITED` | 429 | General rate limit exceeded |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `ACCOUNT_LOCKED` | 423 | Too many failed logins |
| `TOKEN_REUSE_DETECTED` | 401 | Refresh token already used — re-login required |
| `STAFF_UNAVAILABLE` | 422 | Target staff is not active or on shift |
| `NO_STAFF_AVAILABLE` | 503 | No eligible staff for auto-assignment |
| `INCIDENT_NOT_ASSIGNABLE` | 422 | Incident is not in OPEN status |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 1. Authentication

### POST /auth/register
Register a new user.

**Request:**
```json
{
  "name": "Arjun Sharma",
  "email": "arjun@college.edu",
  "password": "SecurePass123",
  "role": "STUDENT",
  "departmentId": "550e8400-e29b-41d4-a716-446655440001",
  "rollNo": "21CS045",
  "year": 3,
  "batch": "2021-2025"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Arjun Sharma",
      "email": "arjun@college.edu",
      "role": "STUDENT",
      "department": { "id": "...", "name": "Computer Science" }
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "550e8400-e29b-41d4-a716-446655440099"
  }
}
```

---

### POST /auth/login

**Request:** `{ "email": "arjun@college.edu", "password": "SecurePass123" }`

**Response 200:** Same shape as register.

**Response 401:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**Response 423:**
```json
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account locked due to too many failed attempts",
    "details": { "lockedUntil": "2025-06-07T10:45:00.000Z" }
  }
}
```

---

### POST /auth/refresh

**Request:** `{ "refreshToken": "550e8400-e29b-41d4-a716-446655440099" }`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...(new token)",
    "refreshToken": "660f9511-f30c-52e5-b827-557766551100"
  }
}
```

**Response 401 (token reuse detected):**
```json
{
  "success": false,
  "error": {
    "code": "TOKEN_REUSE_DETECTED",
    "message": "This refresh token has already been used. Please login again.",
    "details": { "reason": "Possible token theft — all sessions invalidated" }
  }
}
```

---

### POST /auth/logout
**Auth required.**
Clears `refreshTokenHash` from DB — invalidates all sessions.

**Response 200:** `{ "success": true }`

---

## 2. Incidents

### POST /incidents
**Roles:** STUDENT, FACULTY, ADMIN

**Request:**
```json
{
  "title": "AC not working in CS Lab 3",
  "description": "The air conditioner has been off for 2 days. Room is very hot and affecting exam preparation.",
  "category": "MAINTENANCE",
  "priority": "HIGH",
  "location": {
    "block": "C",
    "room": "C-304",
    "floor": 3,
    "lat": 23.2599,
    "lng": 77.4126,
    "description": "Near the projector wall"
  },
  "evidencePhotos": [
    "https://res.cloudinary.com/campusops/image/upload/v1234/evidence1.jpg"
  ],
  "departmentId": "550e8400-e29b-41d4-a716-446655440002"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "661f0622-g41d-63f6-c938-668877662211",
    "incidentNumber": "INC-2025-004521",
    "title": "AC not working in CS Lab 3",
    "status": "IN_PROGRESS",
    "category": "MAINTENANCE",
    "priority": "HIGH",
    "location": {
      "block": "C",
      "room": "C-304",
      "floor": 3,
      "lat": 23.2599,
      "lng": 77.4126
    },
    "evidencePhotos": ["https://res.cloudinary.com/..."],
    "creator": { "id": "...", "name": "Arjun Sharma", "role": "STUDENT" },
    "assignedTo": { "id": "...", "name": "Ravi Kumar", "role": "MAINTENANCE" },
    "department": { "id": "...", "name": "Electrical" },
    "sla": {
      "windowHours": 4,
      "deadlineAt": "2025-06-07T14:30:00.000Z",
      "isEscalated": false
    },
    "aiClassification": {
      "suggestedCategory": "MAINTENANCE",
      "suggestedPriority": "HIGH",
      "suggestedDept": "Electrical",
      "confidence": 0.91,
      "suggestionAccepted": true
    },
    "createdAt": "2025-06-07T10:30:00.000Z"
  }
}
```

**Response 409 — Duplicate:**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_INCIDENT",
    "message": "A similar incident is already being tracked",
    "details": {
      "existingIncidentId": "550e8400-...",
      "existingIncidentNumber": "INC-2025-004510",
      "existingStatus": "IN_PROGRESS",
      "message": "You have been noted as an additional reporter. You will receive updates."
    }
  }
}
```

**Response 429 — Spam throttle:**
```json
{
  "success": false,
  "error": {
    "code": "SPAM_THROTTLE",
    "message": "You can submit a maximum of 5 incidents per hour.",
    "details": { "retryAfterMinutes": 23 }
  }
}
```

---

### GET /incidents
List incidents — filtered and paginated.
**Roles:** All (results scoped by role automatically — students see own, staff see assigned, admin sees all)

**Query Parameters:**
```
status          OPEN | IN_PROGRESS | RESOLVED | ESCALATED | REOPENED
priority        LOW | MEDIUM | HIGH | CRITICAL
category        MAINTENANCE | SECURITY | INFRASTRUCTURE | EMERGENCY | OTHER
departmentId    UUID
assignedToId    UUID
block           string
createdAfter    ISO date
createdBefore   ISO date
search          string (full-text on title + description)
page            number (default: 1)
limit           number (default: 20, max: 100)
sortBy          createdAt | priority | slaDeadlineAt
sortOrder       asc | desc (default: desc)
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "id": "...",
        "incidentNumber": "INC-2025-004521",
        "title": "AC not working in CS Lab 3",
        "status": "IN_PROGRESS",
        "priority": "HIGH",
        "category": "MAINTENANCE",
        "location": { "block": "C", "room": "C-304" },
        "assignedTo": { "name": "Ravi Kumar" },
        "sla": { "deadlineAt": "2025-06-07T14:30:00.000Z", "isEscalated": false },
        "createdAt": "2025-06-07T10:30:00.000Z"
      }
    ]
  },
  "meta": {
    "total": 248,
    "page": 1,
    "limit": 20,
    "totalPages": 13,
    "hasNextPage": true
  }
}
```

---

### GET /incidents/:id
Full incident detail — includes status history, assignment history, chat room info.
**Roles:** All (students only see own; staff see assigned; admin sees all)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "661f0622-...",
    "incidentNumber": "INC-2025-004521",
    "title": "AC not working in CS Lab 3",
    "description": "The air conditioner has been off for 2 days...",
    "status": "IN_PROGRESS",
    "priority": "HIGH",
    "category": "MAINTENANCE",
    "location": {
      "block": "C", "room": "C-304", "floor": 3,
      "lat": 23.2599, "lng": 77.4126
    },
    "evidencePhotos": ["https://res.cloudinary.com/..."],
    "resolutionPhoto": null,
    "creator": { "id": "...", "name": "Arjun Sharma", "role": "STUDENT" },
    "assignedTo": { "id": "...", "name": "Ravi Kumar", "role": "MAINTENANCE" },
    "department": { "id": "...", "name": "Electrical" },
    "sla": {
      "windowHours": 4,
      "deadlineAt": "2025-06-07T14:30:00.000Z",
      "isEscalated": false,
      "escalatedAt": null
    },
    "statusHistory": [
      {
        "status": "OPEN",
        "changedBy": { "name": "System" },
        "note": "Incident created",
        "changedAt": "2025-06-07T10:30:00.000Z"
      },
      {
        "status": "IN_PROGRESS",
        "changedBy": { "name": "Ravi Kumar" },
        "note": "Assigned via LeastLoaded strategy",
        "changedAt": "2025-06-07T10:31:00.000Z"
      }
    ],
    "assignmentHistory": [
      {
        "assignedTo": { "name": "Ravi Kumar" },
        "assignedBy": { "name": "System (auto)" },
        "strategy": "LEAST_LOADED",
        "reason": null,
        "assignedAt": "2025-06-07T10:31:00.000Z"
      }
    ],
    "feedback": null,
    "chatRoom": { "id": "...", "isActive": true },
    "duplicateCount": 2,
    "isDuplicate": false,
    "createdAt": "2025-06-07T10:30:00.000Z",
    "updatedAt": "2025-06-07T10:31:00.000Z"
  }
}
```

---

### PATCH /incidents/:id/status
Update incident status — delegates to State pattern.
**Roles:** Assigned staff (resolve/progress), Admin (assign/escalate/reopen)

**Request — assign:**
```json
{ "action": "assign", "staffId": "550e8400-..." }
```

**Request — resolve:**
```json
{
  "action": "resolve",
  "note": "Replaced the capacitor in the AC unit. Tested and confirmed working.",
  "resolutionPhoto": "https://res.cloudinary.com/campusops/image/upload/v1234/after.jpg"
}
```

**Request — escalate:**
```json
{ "action": "escalate", "reason": "Staff did not respond in 2 hours" }
```

**Request — reopen:**
```json
{ "action": "reopen", "reason": "Issue recurred after 1 day" }
```

**Response 200:** Updated incident object (same shape as GET /incidents/:id)

**Response 422 — Invalid transition:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Cannot resolve an incident that is not IN_PROGRESS",
    "details": {
      "currentState": "OPEN",
      "requestedAction": "resolve",
      "allowedActions": ["assign", "escalate"]
    }
  }
}
```

**Response 422 — Missing resolution photo:**
```json
{
  "success": false,
  "error": {
    "code": "RESOLUTION_PHOTO_REQUIRED",
    "message": "You must upload a resolution photo before marking as resolved"
  }
}
```

---

### POST /incidents/:id/feedback
Submit resolution feedback. Only incident creator, only after RESOLVED status.

**Request:**
```json
{ "score": 2, "comment": "Fixed but ceiling panel was left open and floor not cleaned." }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "feedbackRecorded": true,
    "score": 2,
    "incidentReopened": true,
    "staffPenaltyApplied": true,
    "message": "Incident reopened due to low rating. Staff has been notified."
  }
}
```

---

### POST /incidents/ai-classify
AI classification from description. Called with 800ms debounce from frontend.
**Roles:** STUDENT, FACULTY, ADMIN

**Request:** `{ "description": "Water is leaking from the ceiling in Block A Room 102" }`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "suggestedCategory": "MAINTENANCE",
    "suggestedPriority": "HIGH",
    "suggestedDepartment": "Civil",
    "estimatedDurationHours": 2,
    "confidence": 0.88,
    "reasoning": "Ceiling leak indicates plumbing or structural issue requiring urgent maintenance"
  }
}
```

---

## 3. Panic Button

### POST /panic
Broadcast emergency GPS to all online security officers.
**Roles:** STUDENT, FACULTY

**Request:** `{ "lat": 23.2599, "lng": 77.4126 }`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "broadcastedAt": "2025-06-07T11:00:00.000Z",
    "onlineSecurityOfficers": 3,
    "incidentId": "772g1733-...",
    "incidentNumber": "INC-2025-004599",
    "message": "Security officers have been notified. Help is on the way."
  }
}
```

---

## 4. Chat

### GET /incidents/:id/chat
Get chat history. Only incident creator and assigned staff.

**Query:** `page=1&limit=50`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "room": {
      "id": "...",
      "isActive": true,
      "participants": [
        { "id": "...", "name": "Arjun Sharma", "role": "STUDENT" },
        { "id": "...", "name": "Ravi Kumar", "role": "MAINTENANCE" }
      ]
    },
    "messages": [
      {
        "id": "...",
        "sender": { "id": "...", "name": "Arjun Sharma" },
        "text": "Is anyone coming today?",
        "attachmentUrl": null,
        "createdAt": "2025-06-07T11:00:00.000Z"
      },
      {
        "id": "...",
        "sender": { "id": "...", "name": "Ravi Kumar" },
        "text": "Yes, I will be there by 3 PM.",
        "attachmentUrl": null,
        "createdAt": "2025-06-07T11:05:00.000Z"
      }
    ]
  },
  "meta": { "total": 12, "page": 1, "limit": 50 }
}
```

---

## 5. Alerts

### POST /alerts
**Roles:** ADMIN, SECURITY

**Request:**
```json
{
  "title": "Water Supply Disruption",
  "message": "Water supply in Block B will be disrupted from 2PM to 5PM today for maintenance.",
  "type": "MAINTENANCE_SHUTDOWN",
  "severity": "WARNING",
  "scope": {
    "target": "DEPARTMENT",
    "departmentId": "550e8400-..."
  },
  "deliveryChannels": ["realtime", "email"]
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "title": "Water Supply Disruption",
    "severity": "WARNING",
    "createdAt": "2025-06-07T12:00:00.000Z"
  }
}
```

---

## 6. Analytics

### GET /analytics/dashboard
**Roles:** ADMIN, HOD (scoped to their departments)
**Cache:** Redis — 5-minute TTL, invalidated on incident status change

**Response 200:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalOpen": 24,
      "totalInProgress": 18,
      "totalResolved": 156,
      "slaBreachRate": 0.08,
      "avgResolutionHours": 3.4,
      "criticalOpen": 3
    },
    "byDepartment": [
      {
        "departmentId": "...",
        "department": "Electrical",
        "open": 8,
        "inProgress": 5,
        "resolved": 42,
        "slaBreaches": 2,
        "avgResolutionHours": 2.8
      }
    ],
    "byPriority": {
      "CRITICAL": 3,
      "HIGH": 12,
      "MEDIUM": 18,
      "LOW": 9
    },
    "hotspots": [
      {
        "block": "C",
        "room": "C-304",
        "count": 5,
        "severity": "warning",
        "lastIncidentAt": "2025-06-07T10:30:00.000Z",
        "prediction": "High activity expected Monday mornings based on 4-week pattern"
      }
    ],
    "aiSummary": "Today: 12 new incidents, 8 resolved. Block C Room 304 is a hotspot with 5 incidents in 48 hours — likely recurring AC unit failure. Staff Ravi Kumar has 2 SLA breaches this week.",
    "aiSummaryDate": "2025-06-07",
    "cachedAt": "2025-06-07T11:00:00.000Z"
  }
}
```

---

### GET /analytics/staff/:staffId/performance
**Roles:** ADMIN, HOD (own department only)

**Query:** `month=2025-06`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "staff": { "id": "...", "name": "Ravi Kumar", "department": "Electrical" },
    "period": "June 2025",
    "metrics": {
      "totalAssigned": 18,
      "totalResolved": 15,
      "inProgress": 3,
      "avgResolutionHours": 2.8,
      "slaComplianceRate": 0.87,
      "avgFeedbackRating": 4.2,
      "penaltyCount": 1,
      "totalRatings": 14,
      "speedRankInDept": 2
    },
    "weeklyTrend": [
      { "week": "Week 1", "resolved": 4, "avgHours": 2.5, "avgRating": 4.5 },
      { "week": "Week 2", "resolved": 5, "avgHours": 3.1, "avgRating": 3.8 },
      { "week": "Week 3", "resolved": 4, "avgHours": 2.9, "avgRating": 4.3 },
      { "week": "Week 4", "resolved": 2, "avgHours": 2.7, "avgRating": 4.0 }
    ],
    "feedbackBreakdown": {
      "positive": 9,
      "neutral": 3,
      "negative": 2,
      "topIssueTags": ["good_communication", "fast_response", "incomplete_fix"]
    }
  }
}
```

---

### GET /analytics/heatmap
**Roles:** ADMIN, SECURITY

**Response 200:**
```json
{
  "success": true,
  "data": {
    "points": [
      { "block": "C", "room": "C-304", "lat": 23.2599, "lng": 77.4126, "weight": 5 },
      { "block": "A", "room": "A-101", "lat": 23.2601, "lng": 77.4128, "weight": 2 }
    ],
    "hotspots": [
      {
        "block": "C",
        "room": "C-304",
        "count": 5,
        "severity": "warning",
        "prediction": {
          "peakDay": "Monday",
          "confidence": 39,
          "nextPredictedDate": "2025-06-09T00:00:00.000Z",
          "recommendation": "Schedule preventive maintenance before Monday"
        }
      }
    ]
  }
}
```

---

## 7. Users

### GET /users/me
Get own profile. **Auth required.**

### PATCH /users/me
Update own profile.
**Request:** `{ "name": "Arjun R. Sharma", "prefEmail": false }`

### GET /users
**Roles:** ADMIN only
**Query:** `role=MAINTENANCE&departmentId=...&staffState=ACTIVE&page=1`

### PATCH /users/:id/status
**Roles:** ADMIN
**Request:** `{ "isActive": false }`

### PATCH /users/:id/staff-state
**Roles:** ADMIN, HOD
**Request:** `{ "state": "ACTIVE", "reason": "Review period completed satisfactorily" }`

---

## 8. Socket.IO Events

### Connection
```javascript
// Client connects with JWT
const socket = io('https://api.campusops.com', {
  auth: { token: accessToken }
})
```

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_rooms` | `{}` | Auto-joins personal + role + dept rooms from JWT |
| `panic_trigger` | `{ lat, lng }` | Triggers emergency broadcast |
| `chat_message` | `{ roomId, text, attachmentUrl? }` | Send chat message |
| `chat_read` | `{ roomId, lastMessageId }` | Mark messages as read |
| `panic_acknowledge` | `{ incidentId }` | Security officer acknowledges panic |

### Server → Client

| Event | Payload | Recipients |
|-------|---------|-----------|
| `incident_created` | `{ incidentNumber, title, priority, department }` | `dept:{deptId}` room |
| `incident_updated` | `{ incidentId, incidentNumber, status, note }` | `user:{reporterId}` + `user:{staffId}` |
| `incident_assigned` | `{ incidentId, incidentNumber, location, priority, slaDeadlineAt }` | `user:{staffId}` |
| `incident_escalated` | `{ incidentId, incidentNumber, reason }` | `role:ADMIN` + `user:{hodId}` |
| `incident_reopened` | `{ incidentId, incidentNumber, reason }` | `role:ADMIN` + `user:{staffId}` |
| `panic_alert` | `{ reporterId, reporterName, lat, lng, timestamp, block }` | `role:SECURITY` |
| `panic_confirmed` | `{ message, onlineOfficers }` | Panic reporter only |
| `panic_acknowledged` | `{ officerName, incidentId }` | Panic reporter |
| `hotspot_detected` | `{ block, room, count, severity }` | `role:ADMIN` |
| `campus_alert` | `{ title, message, severity, type }` | Scoped rooms |
| `sla_warning` | `{ incidentId, incidentNumber, remainingMs }` | `user:{staffId}` |
| `feedback_request` | `{ incidentId, incidentNumber }` | `user:{reporterId}` |
| `chat_message` | `{ messageId, sender, text, createdAt }` | Chat room participants |
| `daily_summary_ready` | `{ date, preview }` | `role:ADMIN` |
| `staff_under_review` | `{ staffId, staffName, penaltyCount }` | `role:ADMIN` + HOD |
