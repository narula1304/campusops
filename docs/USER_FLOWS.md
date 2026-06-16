# User Flows
## CampusOps — Smart Campus Operations & Incident Management System

---

## Flow 1 — Student Reports an Incident

```
Student opens CampusOps app
        │
        ▼
Clicks "Report Issue" button on dashboard
        │
        ▼
Incident form opens
Student starts typing description:
"Water is leaking from the ceiling in Block A Room 102"
        │
        ▼ (debounced 800ms — AI classifier fires)
POST /incidents/ai-classify { description: "Water is leaking..." }
        │
        ▼
OpenAI returns:
  category    → MAINTENANCE  (confidence: 0.88)
  priority    → HIGH
  department  → Civil
  estDuration → 2-4 hours
        │
        ▼
Form auto-fills:
  Category dropdown → MAINTENANCE ✓
  Priority dropdown → HIGH ✓
  Department        → Civil ✓
  (Student changes dept to "Electrical" manually — AI was wrong)
  aiSuggestionAccepted = false (stored on incident for model feedback)
        │
        ▼
Student fills remaining fields:
  Block: A, Room: A-102, Floor: 1
  Taps [Use my GPS] → browser geolocation → lat/lng auto-filled
  Uploads evidence photo → Cloudinary → URL returned
        │
        ▼
Student taps [Submit]
        │
        ▼
POST /incidents { ...formData }
        │
        ▼
ValidationChain runs (Chain of Responsibility):
  PriorityValidator        → HIGH is valid ✓
  LocationValidator        → Block A, Room A-102 exists in campus registry ✓
  DuplicateDetector        →
    SELECT * FROM "Incident"
    WHERE "locationBlock" = 'A'
      AND "locationRoom"  = 'A-102'
      AND category        = 'MAINTENANCE'
      AND status         IN ('OPEN','IN_PROGRESS')
      AND "createdAt"    >= NOW() - INTERVAL '24 hours'
    → No result — not a duplicate ✓
  SpamThrottleValidator    → Student has submitted 1 incident this hour ✓
  PhotoRequirementCheck    → Priority is HIGH (not CRITICAL), photo optional ✓
        │
        ▼
IncidentFactory.create():
  category = MAINTENANCE → new MaintenanceIncident()
  priority = HIGH        → new HighSLA()
    deadlineAt = now + 4 hours
  state = new OpenState()
  incidentNumber = INC-2025-004521
        │
        ▼
AssignmentService.autoAssign():
  Fetch Electrical dept → assignmentStrategy = LEAST_LOADED
  StrategyFactory.create('LEAST_LOADED') → LeastLoadedStrategy
  SELECT u.* FROM "User" u
  WHERE u.role = 'MAINTENANCE'
    AND u."departmentId" = '{electricalDeptId}'
    AND u."staffState"   = 'ACTIVE'
  ORDER BY u."activeTaskCount" ASC
  LIMIT 1
  → Ravi Kumar (activeTaskCount = 2, lowest in dept)
        │
        ▼
incident.assignStaff(Ravi):
  OpenState.assignStaff() runs:
    Ravi.activeTaskCount++ (now 3)
    incident.setState(new InProgressState())
    incident.addToStatusLog({ status: IN_PROGRESS, changedById: Ravi.id })
    incident.publish('INCIDENT_ASSIGNED', { incident, staff: Ravi })
        │
        ▼
Prisma $transaction persists atomically:
  INSERT INTO "Incident" (status='IN_PROGRESS', "assignedToId"=Ravi.id, ...)
  INSERT INTO "IncidentStatusLog" (incidentId, status='OPEN',        changedAt=T1)
  INSERT INTO "IncidentStatusLog" (incidentId, status='IN_PROGRESS', changedAt=T2)
  INSERT INTO "IncidentAssignment" (incidentId, assignedToId=Ravi, strategy='LEAST_LOADED')
  UPDATE "User" SET "activeTaskCount" = 3 WHERE id = Ravi.id
  If any step fails → ALL rolled back → incident never created
        │
        ▼
IncidentEventPublisher fires 'INCIDENT_CREATED' then 'INCIDENT_ASSIGNED':

  SLATimerManager:
    bullMQ.add('escalate-incident', { incidentId }, { delay: 4hrs, jobId: 'sla:{id}' })
    UPDATE "Incident" SET "slaJobId" = '{jobId}' WHERE id = '{incidentId}'

  HotspotDetector:
    INCR hotspot:A:A-102 → count = 1 (no hotspot yet)

  RealTimeNotifier (INCIDENT_ASSIGNED):
    io.to('user:{RaviId}').emit('incident_assigned', { incidentNumber, location, priority, slaDeadlineAt })

  AuditLogger:
    INSERT INTO "AuditLog" (commandType='IncidentCreated', actorId=studentId, incidentId, payload)
        │
        ▼
Response 201 returned to student:
  "Incident INC-2025-004521 created"
  "Assigned to Ravi Kumar — Maintenance Staff"
  "Expected resolution by 2:30 PM today"
  [Track Incident] button
```

---

## Flow 2 — Staff Resolves an Incident

```
Ravi Kumar (Maintenance) opens app
        │
        ▼
Staff Dashboard loads:
  GET /incidents?assignedToId={RaviId}&status=IN_PROGRESS&sortBy=slaDeadlineAt&sortOrder=asc
  ┌──────────────────────────────────────────────────────┐
  │ 🔴 INC-2025-004521  Ceiling Leak A-102              │
  │    HIGH · SLA: 1h 45m remaining  · Arjun Sharma     │
  └──────────────────────────────────────────────────────┘
        │
        ▼
Ravi taps incident → GET /incidents/{id}
  Returns full detail including statusHistory and chatRoom
        │
        ▼
Ravi taps [Open Chat] → Socket.IO chat_message event
  "I'm on my way. Will be there in 20 minutes."
  Server: INSERT INTO "Message" (roomId, senderId, text)
  Server: socket.to('user:{ArjunId}').emit('chat_message', { sender, text })
  Arjun receives real-time message notification
        │
        ▼
Ravi arrives, fixes the pipe joint, takes after photo
  Uploads to Cloudinary → gets URL
        │
        ▼
Ravi taps [Mark as Resolved]:
  Fills resolution note: "Replaced faulty pipe joint above ceiling panel.
  Leak stopped and tested. Area dried."
  Attaches resolution photo URL
        │
        ▼
PATCH /incidents/{id}/status
{ action: 'resolve', note: '...', resolutionPhoto: 'https://...' }
        │
        ▼
IncidentRepository.findById() → Prisma query → toEntity()
  Row loaded: status = 'IN_PROGRESS'
  incident.setState(new InProgressState())  ← reconstructed
        │
        ▼
incident.resolve(note, photo):
  InProgressState.resolve() runs:
    photo present? ✓
    note.length >= 10? ✓
    incident.resolutionNote = note
    incident.resolutionPhoto = photo
    incident.resolvedAt = now
    Ravi.activeTaskCount-- (now 2)
    incident.addToStatusLog({ status: RESOLVED, changedById: Ravi.id, note })
    incident.setState(new ResolvedState())
    incident.publish('INCIDENT_RESOLVED', { incident })
        │
        ▼
Prisma $transaction:
  UPDATE "Incident" SET status='RESOLVED', "resolutionNote"=..., "resolutionPhoto"=..., "resolvedAt"=now
  INSERT INTO "IncidentStatusLog" (status='RESOLVED', changedById=Ravi.id, note)
  UPDATE "User" SET "activeTaskCount" = 2 WHERE id = Ravi.id
  INSERT INTO "Notification" (recipientId=ArjunId, type='FEEDBACK_REQUEST', ...)
  All atomic — if any fails, everything rolls back
        │
        ▼
IncidentEventPublisher fires 'INCIDENT_RESOLVED':

  SLATimerManager:
    bullMQ.getJob('sla:{incidentId}') → job.remove()
    SLA escalation job cancelled — no longer needed

  RealTimeNotifier:
    io.to('user:{ArjunId}').emit('incident_updated', { status: 'RESOLVED' })
    io.to('user:{ArjunId}').emit('feedback_request', { incidentId, incidentNumber })

  EmailNotifier:
    Send resolution confirmation to Arjun with before/after photo URLs

  CacheInvalidator:
    redis.del('cache:dashboard:dept:{electricalDeptId}:stats')
    redis.del('cache:dashboard:global:stats')

  AuditLogger:
    INSERT INTO "AuditLog" (commandType='IncidentResolved', actorId=Ravi.id, incidentId)
        │
        ▼
Arjun sees:
  Toast: "INC-2025-004521 has been resolved ✓"
  [View Resolution] → before/after photo slider
  [Rate Resolution] → feedback form appears on dashboard
```

---

## Flow 3 — SLA Breach and Escalation

```
INC-2025-004530 — CRITICAL priority
  Created: 9:00 AM
  SLA deadline: 11:00 AM (2 hours)
  BullMQ job scheduled: delay = 7200000ms, jobId = 'sla:{id}'
        │
        ▼
11:00 AM — BullMQ job fires
        │
        ▼
sla.worker.js processes job:

  Prisma $transaction:
    SELECT id, status, "slaIsEscalated" FROM "Incident"
    WHERE id = '{incidentId}'
    FOR UPDATE
    ← row locked

    Check: slaIsEscalated = false ✓ (not yet processed)
    Check: status = 'IN_PROGRESS' (not resolved — escalate)

    UPDATE "Incident"
    SET "slaIsEscalated" = true,
        "slaEscalatedAt" = now,
        status = 'ESCALATED'
    WHERE id = '{incidentId}'

    INSERT INTO "IncidentStatusLog"
    (incidentId, status='ESCALATED', note='SLA breach — auto escalated by system')

    ← transaction commits
        │
        ▼
Find escalation target:
  CriticalSLA.getEscalationTarget() → AdminLevel.DEAN
  SELECT u.* FROM "User"
  WHERE u.role = 'ADMIN'
    AND u."accessLevel" = 'DEAN'
  (or HOD for high/medium/low priority)
        │
        ▼
IncidentEventPublisher fires 'INCIDENT_ESCALATED':
  RealTimeNotifier:
    io.to('role:ADMIN').emit('incident_escalated', { incidentNumber, priority, reason: 'SLA breach' })
  EmailNotifier:
    Send escalation email to Dean with full incident context
  AuditLogger:
    INSERT INTO "AuditLog" (commandType='SLAEscalation', incidentId, payload)
        │
        ▼
Dean receives real-time notification:
  "⚠️ ESCALATED: INC-2025-004530 breached 2hr SLA. Critical — Block B."
  Opens incident → sees full statusHistory timeline
  Manually assigns to Senior Maintenance Engineer
        │
        ▼
Crash-safety scenario:
  If server crashes AFTER transaction commit but BEFORE notification:
    BullMQ retries the job (attempts: 3, exponential backoff)
    Worker runs again:
      SELECT ... FOR UPDATE
      slaIsEscalated = true → exit immediately (idempotency check)
    Notification may be re-sent — acceptable (same message twice > missed escalation)
```

---

## Flow 4 — Student Triggers Panic Button

```
Priya (Student) is in an unsafe situation in Block D
        │
        ▼
Priya taps RED PANIC BUTTON (always visible in bottom navigation)
        │
        ▼
Browser requests geolocation permission → granted
GPS: { lat: 23.2603, lng: 77.4130 }
        │
        ▼
socket.emit('panic_trigger', { lat: 23.2603, lng: 77.4130 })
        │
        ▼ (< 5ms — NO database, NO async)
Server handler fires immediately:

  io.to('role:SECURITY').emit('panic_alert', {
    reporterId: Priya.id,
    reporterName: "Priya Verma",
    lat: 23.2603,
    lng: 77.4130,
    timestamp: "2025-06-07T14:22:00.000Z",
    block: "D"
  })

  socket.emit('panic_confirmed', {
    message: "Security officers notified. Help is on the way.",
    onlineOfficers: 3
  })
        │
        ▼ (< 200ms total to security officers)

All online Security Officers receive:
  🚨 PANIC ALERT
  Reporter: Priya Verma (Student, CSE 3rd Year)
  Location: Block D — GPS: 23.2603, 77.4130
  Time: 2:22 PM
  [View on Map]  [Acknowledge]
        │
        ▼
setImmediate — async non-blocking DB write:
  Prisma $transaction:
    INSERT INTO "Incident" (category='EMERGENCY', status='IN_PROGRESS',
      panicLat=23.2603, panicLng=77.4130, panicBroadcastedAt=now,
      incidentNumber='INC-2025-004599')
    INSERT INTO "IncidentStatusLog" (status='OPEN') + (status='IN_PROGRESS')
    INSERT INTO "IncidentAssignment" (assignedToId=nearestOfficerId)
    UPDATE "User" SET "activeTaskCount" = +1 WHERE id = nearestOfficerId
        │
        ▼
Officer Suresh taps [Acknowledge]:
  socket.emit('panic_acknowledge', { incidentId })
  Server:
    INSERT INTO "PanicAcknowledgement" (incidentId, officerId, acknowledgedAt)
  Server:
    socket.to('user:{PriyaId}').emit('panic_acknowledged', {
      officerName: "Suresh Kumar",
      message: "Officer Suresh Kumar is responding to your alert"
    })
  Other officers see: "Suresh Kumar acknowledged — responding"
        │
        ▼
Speed vs Consistency — intentional design decision:
  Broadcast happens BEFORE DB write
  If DB write fails after broadcast → broadcast already happened (acceptable)
  Security officers are notified regardless of DB state
  Manual reconciliation possible if incident record is missing
```

---

## Flow 5 — Admin Reviews Dashboard

```
Admin Prof. Mehta (HOD, CSE dept) logs in — 9:00 AM
        │
        ▼
GET /analytics/dashboard
        │
        ▼
CachingIncidentProxy checks Redis:
  GET cache:dashboard:dept:{cseDeptId}:stats
        │
        ├── Cache HIT → return JSON in < 5ms (cached 4 mins ago)
        │
        └── Cache MISS →
              Run PostgreSQL aggregation query:
                WITH dept_stats AS (
                  SELECT status, COUNT(*) as count
                  FROM "Incident"
                  WHERE "departmentId" = '{cseDeptId}'
                  GROUP BY status
                )
                SELECT ...
              Store result: SETEX cache:dashboard:dept:{cseDeptId}:stats 300 '{json}'
              Return stats
        │
        ▼
Dashboard renders:
  ┌───────────────────────────────────────────────────────────┐
  │  AI DAILY SUMMARY (generated at 7:00 AM by BullMQ cron)  │
  │  "Today: 12 new incidents, 8 resolved. 3 critical open   │
  │  in Electrical. Block C Room 304 is a hotspot — 5        │
  │  incidents in 48hrs, likely recurring AC failure. Staff   │
  │  Ravi Kumar: 2 SLA breaches — review recommended."       │
  └───────────────────────────────────────────────────────────┘

  Open: 24  │  In Progress: 18  │  SLA Breach Rate: 8%

  🔴 HOTSPOT: Block C — C-304 (5 incidents, 48hrs)
     Prediction: High activity expected Mondays
        │
        ▼
Admin clicks Block C hotspot:
  GET /incidents?block=C&locationRoom=C-304&status=OPEN,IN_PROGRESS
  Sees 5 related incidents — all MAINTENANCE + ELECTRICAL category
        │
        ▼
Admin decides to create a proactive InfrastructureIncident:
  "Block C Electrical Infrastructure Audit Required"
  Priority: HIGH, Category: INFRASTRUCTURE
  Note: "Repeated AC failures suggest systemic electrical issue"
        │
        ▼
Admin views Staff Performance section:
  GET /analytics/staff/{RaviId}/performance?month=2025-06

  PostgreSQL window function query runs:
    SELECT u.name,
      COUNT(i.id) as assigned,
      ROUND(AVG(EXTRACT(EPOCH FROM (i."resolvedAt" - i."createdAt"))/3600)::numeric, 2) as avg_hours,
      ROUND(AVG(f.score)::numeric, 2) as avg_rating,
      RANK() OVER (PARTITION BY i."departmentId" ORDER BY AVG(...) ASC) as speed_rank
    FROM "User" u
    LEFT JOIN "Incident" i ON i."assignedToId" = u.id
    LEFT JOIN "IncidentFeedback" f ON f."incidentId" = i.id
    WHERE u.id = '{RaviId}'
    GROUP BY u.id, u.name, i."departmentId"

  Result: Ravi — Avg 2.8hrs · Rating 4.2★ · SLA compliance 87% · Rank #2 in dept
        │
        ▼
Admin sees 2 SLA-breached incidents:
  Manually reassigns one to senior staff:

  AssignIncidentCommand executes:
    Prisma $transaction:
      SELECT * FROM "Incident" WHERE id = ? FOR UPDATE  ← row lock
      UPDATE "Incident" SET "assignedToId" = seniorStaffId
      UPDATE "User" SET "activeTaskCount" = +1 WHERE id = seniorStaffId
      UPDATE "User" SET "activeTaskCount" = -1 WHERE id = previousStaffId
      INSERT INTO "IncidentAssignment" (strategy='manual', reason='SLA breach reassignment')
      INSERT INTO "IncidentStatusLog" (note='Manual reassignment by admin')

    CommandInvoker auto-logs:
      INSERT INTO "AuditLog" (commandType='AssignIncident', actorId=adminId,
        payload={ fromStaff: Ravi.id, toStaff: seniorId })
```

---

## Flow 6 — Poor Feedback Reopens Incident

```
Arjun receives feedback request notification:
  "Rate the resolution of INC-2025-004521"
        │
        ▼
Arjun opens feedback form:
  Rating: ⭐⭐ (2 stars)
  Comment: "The leak stopped but ceiling panel left open.
  Floor not cleaned. Staff left without telling me it was done."
        │
        ▼
POST /incidents/{id}/feedback { score: 2, comment: "..." }
        │
        ▼
Fetch incident → hydrate domain → incident.state = new ResolvedState()
        │
        ▼
incident.receiveFeedback({ score: 2, comment: "..." }):
  ResolvedState.receiveFeedback() runs:
    score = 2 ≤ 2 → poor rating path
    incident.feedback = { score: 2, comment, submittedAt: now }
    Ravi.penaltyCount++ (now 1)
    penaltyCount < 3 → no StaffUnderReview triggered yet
    incident.addToStatusLog({ status: 'REOPENED', note: 'Reopened: 2/5 rating' })
    incident.setState(new ReopenedState())
    incident.publish('INCIDENT_REOPENED_BY_FEEDBACK', { incident, rating })
        │
        ▼
Prisma $transaction:
  UPDATE "Incident" SET status = 'REOPENED'
  INSERT INTO "IncidentStatusLog" (status='REOPENED', note='Rating: 2/5 — poor resolution')
  INSERT INTO "IncidentFeedback" (score=2, comment='...', reopenTriggered=true)
  UPDATE "User" SET "penaltyCount" = 1 WHERE id = Ravi.id
        │
        ▼
BullMQ ai-tasks queue:
  add('analyze-feedback-sentiment', { incidentId, comment: "The leak stopped but..." })
  Worker calls OpenAI → sentiment: 'negative', tags: ['incomplete_fix', 'poor_cleanup', 'no_communication']
  UPDATE "IncidentFeedback" SET sentiment='NEGATIVE', "issueTags"=['incomplete_fix','poor_cleanup','no_communication']
        │
        ▼
IncidentEventPublisher fires 'INCIDENT_REOPENED_BY_FEEDBACK':
  RealTimeNotifier:
    io.to('role:ADMIN').emit('incident_reopened', { incidentNumber, reason: 'poor_feedback' })
    io.to('user:{RaviId}').emit('incident_updated', { status: 'REOPENED', message: '2-star rating' })
  AuditLogger: INSERT INTO "AuditLog"
        │
        ▼
HOD reviews incident + sentiment tags
  Decides to reassign to different senior staff
  Ravi notified: "Your resolution was rated 2 stars. Review the feedback."

        IF Ravi gets 2 more penalties (total 3):
          ResolvedState.receiveFeedback() triggers:
            Ravi.staffState = 'UNDER_REVIEW'
            incident.publish('STAFF_UNDER_REVIEW', { staff: Ravi })

          Prisma $transaction:
            UPDATE "User" SET "staffState" = 'UNDER_REVIEW' WHERE id = Ravi.id

          RealTimeNotifier:
            io.to('role:ADMIN').emit('staff_under_review', {
              staffName: 'Ravi Kumar', penaltyCount: 3
            })

          Ravi can no longer receive new assignments:
            ShiftAwareStrategy / LeastLoadedStrategy filter:
              WHERE "staffState" = 'ACTIVE'  ← Ravi excluded
```

---

## Flow 7 — Hotspot Detection and Prediction

```
Monday 8:00 AM — Block C, Room C-304
        │
        ▼
8:00 AM — 1st incident: "AC not cooling" → MAINTENANCE
  HotspotDetector.handle('INCIDENT_CREATED'):
    INCR hotspot:C:C-304 → 1
    EXPIRE hotspot:C:C-304 86400
    count = 1 → no alert
        │
        ▼
9:30 AM — 2nd incident: "AC making loud noise" → MAINTENANCE
  INCR hotspot:C:C-304 → 2
  count = 2 → no alert
        │
        ▼
10:15 AM — 3rd incident: "AC stopped working completely" → MAINTENANCE
  INCR hotspot:C:C-304 → 3
  count = 3 → THRESHOLD CROSSED
  severity = 'warning' (3-5 range)
        │
        ▼
io.to('role:ADMIN').emit('hotspot_detected', {
  block: 'C', room: 'C-304', count: 3, severity: 'warning',
  message: '3 incidents in Block C Room C-304 in last 24 hours'
})
        │
        ▼
All online admins see real-time toast:
  "📍 Hotspot: Block C — C-304 (3 incidents in 24hrs)"
  Heatmap shows C-304 pulsing orange
        │
        ▼
After 4+ weeks of data — Prediction query runs:

  SELECT
    EXTRACT(DOW FROM "createdAt") AS day_of_week,
    COUNT(*) AS incident_count
  FROM "Incident"
  WHERE "locationBlock" = 'C'
    AND "locationRoom"  = 'C-304'
    AND "createdAt"    >= NOW() - INTERVAL '28 days'
  GROUP BY day_of_week
  ORDER BY incident_count DESC

  Result: day_of_week=1 (Monday) → count=12 out of 31 total = 39% concentration
  confidence = 39% (above 30% threshold → show prediction)
        │
        ▼
Dashboard shows:
  "⚠️ C-304 historically generates 4+ incidents on Mondays
   — consider preventive maintenance this weekend.
   Next predicted high-activity: Monday June 9."
```

---

## Flow 8 — Refresh Token Theft Detection

```
Normal token rotation:
  User logs in → { accessToken (15min), refreshToken (UUID v4) }
  Server: bcrypt.hash(refreshToken) → stored as User.refreshTokenHash
        │
        ▼
15 minutes later — accessToken expires:
  POST /auth/refresh { refreshToken: "original-uuid" }
  Server: bcrypt.compare("original-uuid", storedHash) → MATCH
  Server:
    Generate new accessToken
    Generate new refreshToken
    bcrypt.hash(newRefreshToken) → UPDATE User.refreshTokenHash
    Return { newAccessToken, newRefreshToken }
  Old refreshToken now INVALID (hash replaced)
        │
        ▼
Theft scenario:
  Attacker steals "original-uuid" BEFORE user refreshes
  Attacker calls: POST /auth/refresh { refreshToken: "original-uuid" }
  Server: MATCH → issues new token pair to attacker
        │
        ▼
Legitimate user tries to refresh:
  POST /auth/refresh { refreshToken: "original-uuid" }
  Server: bcrypt.compare("original-uuid", NEW_hash) → MISMATCH
        │
        ▼ TOKEN REUSE DETECTED
  Prisma:
    UPDATE "User" SET "refreshTokenHash" = null WHERE id = userId
    ← invalidates ALL sessions for this user

  Response 401:
    { code: 'TOKEN_REUSE_DETECTED', message: 'Please login again' }
        │
        ▼
Result:
  Both attacker and legitimate user are forced to re-login
  Attacker's new tokens are useless (user re-login issues fresh pair)
  Legitimate user knows something is wrong — they just had a valid session
  Window of unauthorized access = one refresh cycle only
  Security event logged:
    INSERT INTO "AuditLog" (commandType='TokenReuseDetected', actorId=userId,
      payload={ ip: req.ip, userAgent: req.headers['user-agent'] })
```

---

## Flow 9 — Daily AI Summary Generation

```
7:00 AM — BullMQ cron fires:
  Job: 'generate-daily-summary', date: '2025-06-07'
        │
        ▼
ai.worker.js runs:

  Step 1 — Aggregate yesterday's data from PostgreSQL:

    WITH daily_stats AS (
      SELECT
        COUNT(*) as total_new,
        COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved,
        COUNT(CASE WHEN "slaIsEscalated" = true THEN 1 END) as sla_breaches,
        COUNT(CASE WHEN priority = 'CRITICAL' AND status != 'RESOLVED' THEN 1 END) as critical_open
      FROM "Incident"
      WHERE "createdAt" BETWEEN '{dayStart}' AND '{dayEnd}'
    ),
    hotspot_locations AS (
      SELECT "locationBlock", "locationRoom", COUNT(*) as cnt
      FROM "Incident"
      WHERE "createdAt" >= NOW() - INTERVAL '48 hours'
      GROUP BY "locationBlock", "locationRoom"
      HAVING COUNT(*) >= 3
      ORDER BY cnt DESC LIMIT 5
    ),
    staff_issues AS (
      SELECT u.name, COUNT(*) as breach_count
      FROM "Incident" i
      JOIN "User" u ON u.id = i."assignedToId"
      WHERE i."slaIsEscalated" = true
        AND i."createdAt" BETWEEN '{dayStart}' AND '{dayEnd}'
      GROUP BY u.name
      HAVING COUNT(*) >= 2
    )
    SELECT * FROM daily_stats, hotspot_locations, staff_issues
        │
        ▼
  Step 2 — Call OpenAI:
    model: 'gpt-4o-mini'
    system: "Generate a 3-4 sentence campus operations summary.
             Prioritize urgent issues. Use professional English. No bullet points."
    user: "Data for 2025-06-07:
           New: 12, Resolved: 8, SLA breaches: 3, Critical open: 2
           Hotspots: C-304 (5), A-101 (3)
           Staff with multiple SLA breaches: Ravi Kumar (2)"
        │
        ▼
  Step 3 — Store:
    INSERT INTO "DailySummary" (date='2025-06-07', totalNew=12,
      totalResolved=8, slaBreaches=3, criticalOpen=2,
      hotspots=[{block:'C',room:'C-304',count:5}],
      summary='Today saw 12 new incidents with 8 resolved...',
      generatedAt=now)
    ON CONFLICT (date) DO UPDATE SET summary=EXCLUDED.summary
        │
        ▼
  Step 4 — Notify admins:
    io.to('role:ADMIN').emit('daily_summary_ready', {
      date: '2025-06-07',
      preview: 'Today saw 12 new incidents with 8 resolved...'
    })
        │
        ▼
Admin opens dashboard at 9:00 AM:
  GET /analytics/dashboard
  Response includes aiSummary from DailySummary table
  Full summary displayed at top of dashboard
```
