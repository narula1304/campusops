# AI Context
## CampusOps — Smart Campus Operations & Incident Management System

This file has two purposes:
1. Reference for developers implementing AI features
2. A paste-ready context block for Claude / ChatGPT when you need implementation help

---

## Master Context Block
Paste this at the start of any AI chat session to get accurate help:

```
I am building CampusOps — a Smart Campus Operations & Incident Management System.

TECH STACK:
- Backend: Node.js + Express
- Database: PostgreSQL with Prisma ORM
- Frontend: React + Redux Toolkit + Tailwind CSS
- Real-time: Socket.IO with Redis adapter
- Queue: BullMQ (backed by Redis)
- Cache: Redis (dashboard stats, rate limiting, Socket.IO rooms, hotspot counters)
- File storage: Cloudinary
- Email: Nodemailer
- AI: OpenAI API (gpt-4o-mini)
- Auth: JWT (15min access token) + refresh token rotation with theft detection

ARCHITECTURE:
- /src/domain      — Pure JavaScript classes. ZERO imports from Prisma, Express, Socket.IO, or Redis.
- /src/services    — Orchestration layer. Uses domain classes + repository interfaces.
- /src/api         — Thin Express controllers. No business logic.
- /src/realtime    — Socket.IO event handlers.
- /src/jobs        — BullMQ workers and schedulers.
- /src/infrastructure/repositories — Prisma implementations of repository interfaces.
- /src/infrastructure/cache        — Redis client.
- prisma/schema.prisma             — Complete PostgreSQL schema.

DESIGN PATTERNS (all in /src/domain, zero ORM imports):
1. State        — Incident lifecycle: OpenState, InProgressState, ResolvedState, EscalatedState, ReopenedState
2. Strategy     — Staff assignment: LeastLoadedStrategy, RoundRobinStrategy, ShiftAwareStrategy, ManualStrategy
3. Observer     — IncidentEventPublisher with: RealTimeNotifier, EmailNotifier, SLATimerManager, AuditLogger, HotspotDetector, FeedbackRequestSender, CacheInvalidator
4. Factory      — IncidentFactory (creates MaintenanceIncident, SecurityIncident, EmergencyIncident), SLAFactory (CriticalSLA, HighSLA, MediumSLA, LowSLA)
5. Chain of Responsibility — ValidationChain: PriorityValidator, LocationValidator, DuplicateDetector, SpamThrottleValidator, PhotoRequirementCheck
6. Decorator    — Notifications: BaseNotification, RealTimeDecorator, EmailDecorator, SMSDecorator
7. Proxy        — CachingIncidentProxy wraps IncidentRepository with Redis cache
8. Command      — Admin operations: AssignIncidentCommand, BroadcastAlertCommand — all auto-logged via CommandInvoker

SOLID PRINCIPLES ENFORCED:
- /domain folder has ZERO Prisma/Express/Redis imports (Dependency Inversion)
- Each observer/validator/state has exactly one responsibility (Single Responsibility)
- New features = new classes, never modifying existing ones (Open/Closed)
- Domain objects hydrated from Prisma rows via toEntity() in repositories
- Unit tests run without database (mock repositories injected)

KEY POSTGRESQL PATTERNS:
- Prisma $transaction for all multi-step operations (ACID)
- SELECT FOR UPDATE for concurrent assignment prevention
- Append-only IncidentStatusLog (never UPDATE, only INSERT)
- Composite indexes designed for common query patterns
- Window functions for staff performance analytics
- Redis sliding window rate limiting via Lua scripts
- BullMQ delayed jobs for SLA escalation (idempotent via slaIsEscalated flag)

[YOUR SPECIFIC QUESTION HERE]
```

---

## AI Feature 1 — Incident Classifier

### Purpose
Auto-suggest category, priority, department, and estimated duration as the user types.
Called from frontend with 800ms debounce. Reduces misrouted incidents.

### Backend Implementation

```javascript
// src/services/AIService.js
async classifyIncident(description) {
  if (!description || description.trim().length < 20) {
    return null  // too short to classify reliably
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an incident classification assistant for a college campus.
Classify the incident and return ONLY this JSON (no extra text):
{
  "category": one of ["MAINTENANCE","SECURITY","INFRASTRUCTURE","CLEANLINESS","EMERGENCY","OTHER"],
  "priority": one of ["LOW","MEDIUM","HIGH","CRITICAL"],
  "department": one of ["Electrical","Civil","IT","Housekeeping","Security","Facilities"],
  "estimatedDurationHours": number,
  "confidence": number between 0 and 1,
  "reasoning": "one sentence"
}

Priority rules:
- CRITICAL: immediate safety risk, flooding, fire, medical emergency, structural collapse
- HIGH: affects teaching/learning, no water, broken essential equipment  
- MEDIUM: inconvenience with workaround, minor repairs
- LOW: cosmetic issues, suggestions, non-urgent requests`
      },
      {
        role: 'user',
        content: `Classify: "${description.trim()}"`
      }
    ]
  })

  const text = response.choices[0].message.content
  return JSON.parse(text)
}
```

### Frontend — Debounced Call

```javascript
// src/components/IncidentForm.jsx
import { useState, useCallback } from 'react'
import { debounce } from 'lodash'

function IncidentForm() {
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [isClassifying, setIsClassifying] = useState(false)

  const debouncedClassify = useCallback(
    debounce(async (description) => {
      if (description.length < 20) { setAiSuggestion(null); return }
      setIsClassifying(true)
      try {
        const res = await api.post('/incidents/ai-classify', { description })
        setAiSuggestion(res.data.data)
      } catch (err) {
        // Classifier failure is non-blocking — user still submits manually
        console.warn('AI classifier unavailable', err)
      } finally {
        setIsClassifying(false)
      }
    }, 800),
    []
  )

  return (
    <form>
      <textarea
        placeholder="Describe the issue..."
        onChange={(e) => debouncedClassify(e.target.value)}
      />

      {isClassifying && (
        <div className="text-sm text-gray-400">🤖 Analyzing...</div>
      )}

      {aiSuggestion && (
        <div className="ai-suggestion-bar flex gap-2 mt-2 p-2 bg-blue-50 rounded">
          <span className="text-sm text-gray-500">🤖 AI suggests:</span>
          <button
            type="button"
            className="badge badge-blue"
            onClick={() => setValue('category', aiSuggestion.category)}
          >
            {aiSuggestion.category}
          </button>
          <button
            type="button"
            className="badge badge-orange"
            onClick={() => setValue('priority', aiSuggestion.priority)}
          >
            {aiSuggestion.priority}
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            {Math.round(aiSuggestion.confidence * 100)}% confident
          </span>
        </div>
      )}
    </form>
  )
}
```

### Tracking Suggestion Acceptance
```javascript
// When incident is submitted, record whether AI suggestion was used:
const aiSuggestionAccepted =
  aiSuggestion !== null &&
  formValues.category === aiSuggestion.category &&
  formValues.priority === aiSuggestion.priority

// Stored on Incident row: aiSuggestionAccepted = true/false
// After 3 months: query acceptance rate to evaluate model quality
// SELECT COUNT(CASE WHEN "aiSuggestionAccepted" = true THEN 1 END)::float /
//        COUNT(CASE WHEN "aiConfidence" IS NOT NULL THEN 1 END) AS acceptance_rate
// FROM "Incident"
```

---

## AI Feature 2 — Daily Admin Summary

### Purpose
Natural language summary of campus health generated every morning at 7AM.
Displayed at top of admin dashboard. Removes need to read 50+ rows of data.

### BullMQ Scheduler

```javascript
// src/jobs/schedulers/dailySummary.scheduler.js
const { Queue } = require('bullmq')

async function registerDailySummaryJob(redis) {
  const queue = new Queue('ai-tasks', { connection: redis })

  // Remove existing cron to avoid duplicates on restart
  const existing = await queue.getRepeatableJobs()
  for (const job of existing.filter(j => j.name === 'generate-daily-summary')) {
    await queue.removeRepeatableByKey(job.key)
  }

  await queue.add(
    'generate-daily-summary',
    { scheduledFor: new Date().toISOString() },
    { repeat: { cron: '0 7 * * *' }, jobId: 'daily-summary-cron' }
  )
  console.log('Daily summary cron registered — fires at 7:00 AM')
}
```

### Worker

```javascript
// src/jobs/workers/ai.worker.js
const { Worker } = require('bullmq')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function generateDailySummary(job) {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]

  const dayStart = new Date(today.setHours(0, 0, 0, 0))
  dayStart.setDate(dayStart.getDate() - 1)
  const dayEnd = new Date(dayStart)
  dayEnd.setHours(23, 59, 59, 999)

  // Step 1 — Aggregate from PostgreSQL
  const [stats] = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int                                                        AS total_new,
      COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END)::int                AS resolved,
      COUNT(CASE WHEN "slaIsEscalated" = true THEN 1 END)::int            AS sla_breaches,
      COUNT(CASE WHEN priority = 'CRITICAL'
                  AND status != 'RESOLVED' THEN 1 END)::int               AS critical_open
    FROM "Incident"
    WHERE "createdAt" BETWEEN ${dayStart} AND ${dayEnd}
  `

  const hotspots = await prisma.$queryRaw`
    SELECT "locationBlock" as block, "locationRoom" as room, COUNT(*)::int as cnt
    FROM "Incident"
    WHERE "createdAt" >= NOW() - INTERVAL '48 hours'
    GROUP BY "locationBlock", "locationRoom"
    HAVING COUNT(*) >= 3
    ORDER BY cnt DESC
    LIMIT 5
  `

  const staffIssues = await prisma.$queryRaw`
    SELECT u.name, COUNT(*)::int as breaches
    FROM "Incident" i
    JOIN "User" u ON u.id = i."assignedToId"
    WHERE i."slaIsEscalated" = true
      AND i."createdAt" BETWEEN ${dayStart} AND ${dayEnd}
    GROUP BY u.name
    HAVING COUNT(*) >= 2
  `

  // Step 2 — Generate AI summary
  const prompt = `Generate a 3-4 sentence campus operations summary for ${dateStr}.
Write in professional English. No bullet points. Prioritize urgent issues first.

Data:
- New incidents: ${stats.total_new}
- Resolved: ${stats.resolved}
- SLA breaches: ${stats.sla_breaches}
- Critical open: ${stats.critical_open}
- Hotspot locations: ${hotspots.map(h => `${h.block}-${h.room} (${h.cnt})`).join(', ') || 'none'}
- Staff with multiple SLA breaches: ${staffIssues.map(s => `${s.name} (${s.breaches})`).join(', ') || 'none'}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    messages: [
      { role: 'system', content: 'You generate concise operational summaries for campus administrators.' },
      { role: 'user', content: prompt }
    ]
  })

  const summary = response.choices[0].message.content.trim()

  // Step 3 — Store (upsert — safe to re-run)
  await prisma.dailySummary.upsert({
    where: { date: dateStr },
    update: { summary, generatedAt: new Date(), totalNew: stats.total_new, totalResolved: stats.resolved, slaBreaches: stats.sla_breaches, criticalOpen: stats.critical_open, hotspots },
    create: { date: dateStr, summary, totalNew: stats.total_new, totalResolved: stats.resolved, slaBreaches: stats.sla_breaches, criticalOpen: stats.critical_open, hotspots, generatedAt: new Date() }
  })

  // Step 4 — Notify admins
  io.to('role:ADMIN').emit('daily_summary_ready', {
    date: dateStr,
    preview: summary.substring(0, 120) + '...'
  })

  console.log(`Daily summary generated for ${dateStr}`)
}
```

---

## AI Feature 3 — Hotspot Prediction

### Purpose
After 4 weeks of data, predict when and where the next hotspot will occur.
Pure statistical model — no ML library. Moving average on day-of-week patterns.

```javascript
// src/services/HotspotService.js
async predictNextOccurrence(block, room) {

  // Need 4 weeks of data
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
  const oldestRecord = await prisma.incident.findFirst({
    where: { locationBlock: block, locationRoom: room, createdAt: { lte: fourWeeksAgo } }
  })
  if (!oldestRecord) return null  // insufficient data

  // Aggregate by PostgreSQL day-of-week (1=Sunday...7=Saturday)
  const history = await prisma.$queryRaw`
    SELECT
      EXTRACT(DOW FROM "createdAt")::int AS day_of_week,
      COUNT(*)::int                       AS count
    FROM "Incident"
    WHERE "locationBlock" = ${block}
      AND "locationRoom"  = ${room}
      AND "createdAt"    >= NOW() - INTERVAL '28 days'
    GROUP BY day_of_week
    ORDER BY count DESC
  `

  if (history.length === 0) return null

  const total = history.reduce((sum, d) => sum + d.count, 0)
  const peak = history[0]
  const probability = peak.count / total

  if (probability < 0.3) return null  // not concentrated enough

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const today = new Date().getDay()
  const daysUntil = (peak.day_of_week - today + 7) % 7 || 7
  const nextDate = new Date(Date.now() + daysUntil * 86400000)

  return {
    location: { block, room },
    peakDay: dayNames[peak.day_of_week],
    incidentsOnPeakDay: peak.count,
    totalAnalyzed: total,
    confidence: Math.round(probability * 100),
    nextPredictedDate: nextDate,
    recommendation: `Schedule preventive maintenance for ${block}-${room} before ${dayNames[peak.day_of_week]}`
  }
}
```

---

## AI Feature 4 — Feedback Sentiment Analysis

### Purpose
Extract structured insight from free-text feedback. Aggregated in staff performance dashboard.
Runs asynchronously via BullMQ — never blocks the feedback submission response.

```javascript
// src/jobs/workers/ai.worker.js
async function analyzeFeedbackSentiment({ incidentId, comment }) {
  if (!comment || comment.trim().length < 10) return

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 150,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Analyze campus maintenance feedback. Return ONLY:
{
  "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
  "issueTags": array using only: ["response_time","incomplete_fix","poor_cleanup",
    "no_communication","good_work","fast_response","rude_behavior","professional","thorough"],
  "summary": "one sentence"
}`
      },
      { role: 'user', content: `Feedback: "${comment.trim()}"` }
    ]
  })

  const result = JSON.parse(response.choices[0].message.content)

  await prisma.incidentFeedback.update({
    where: { incidentId },
    data: {
      sentiment: result.sentiment,
      issueTags: result.issueTags,
      aiSummary: result.summary
    }
  })
}

// Triggered by FeedbackRequestSender observer after feedback submission:
// bullMQ.add('analyze-feedback-sentiment', { incidentId, comment }, { attempts: 2 })
```

---

## AI Feature 5 — Escalation Suggestion for Stalled Incidents

### Purpose
When an incident is IN_PROGRESS for 150% of its SLA window with no update,
AI suggests whether to escalate, reassign, or wait. Human admin must approve.

```javascript
// BullMQ job scheduled at SLA * 1.5 on incident creation
// src/jobs/workers/sla.worker.js

async function checkStalledIncident({ incidentId }) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { assignedTo: true, department: true }
  })

  if (!incident || incident.status !== 'IN_PROGRESS') return
  if (incident.aiEscReviewedByAdmin) return  // already reviewed

  const hoursStalled = (Date.now() - incident.slaDeadlineAt.getTime()) / 3600000

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You advise campus admins on stalled incidents. Return ONLY:
{
  "recommendation": "escalate_priority" | "reassign" | "wait" | "close_as_invalid",
  "reason": "one sentence",
  "urgency": "HIGH" | "MEDIUM" | "LOW"
}`
      },
      {
        role: 'user',
        content: `
Incident: ${incident.title}
Category: ${incident.category}
Priority: ${incident.priority}
Hours since SLA breach: ${hoursStalled.toFixed(1)}
Assigned staff active task count: ${incident.assignedTo?.activeTaskCount}
Staff penalty count this month: ${incident.assignedTo?.penaltyCount}
Department: ${incident.department?.name}
Description: ${incident.description}
`
      }
    ]
  })

  const suggestion = JSON.parse(response.choices[0].message.content)

  // Store suggestion — DO NOT auto-act
  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      aiEscSuggestion: suggestion.recommendation,
      aiEscReason:     suggestion.reason,
      aiEscUrgency:    suggestion.urgency,
      aiEscSuggestedAt: new Date(),
      aiEscReviewedByAdmin: false
    }
  })

  // Notify admin — human must approve
  io.to('role:ADMIN').emit('escalation_suggestion', {
    incidentId,
    incidentNumber: incident.incidentNumber,
    suggestion: suggestion.recommendation,
    reason: suggestion.reason,
    urgency: suggestion.urgency
  })
}
```

---

## Prompt Engineering Principles

### 1. JSON output on every call
Use `response_format: { type: 'json_object' }` and define the exact schema in the system prompt.
Eliminates parsing errors. Never regex-parse free text from AI.

### 2. Constrained vocabulary
Where possible, restrict AI output to a predefined list:
```
"category": one of ["MAINTENANCE","SECURITY","INFRASTRUCTURE",...]
"issueTags": array using only: ["response_time","incomplete_fix",...]
```
Prevents hallucinated values that break downstream processing.

### 3. Human-in-the-loop for consequential actions
The escalation suggestion feature stores `aiEscReviewedByAdmin = false`.
Admin approves or dismisses — AI never takes action autonomously.
This is an intentional design decision for a system affecting real people.

### 4. Graceful degradation
Every AI call is wrapped in try-catch. If OpenAI is unavailable:
- Classifier returns null → form works without suggestion
- Daily summary uses previous day's summary → dashboard shows "Generated yesterday"
- Sentiment analysis retries 2 times → falls back to score-only feedback
- Escalation suggestion times out → no notification sent, incident stays as-is

### 5. Cost awareness
```
Feature             | Model        | Tokens/call | Calls/day | Daily cost
--------------------|--------------|-------------|-----------|------------
Incident classifier | gpt-4o-mini  | ~400        | ~50       | ~$0.02
Daily summary       | gpt-4o-mini  | ~800        | 1         | ~$0.001
Sentiment analysis  | gpt-4o-mini  | ~300        | ~20       | ~$0.006
Escalation suggest  | gpt-4o-mini  | ~600        | ~5        | ~$0.003
Total               |              |             |           | ~$0.03/day

Monthly cost for a 5,000-student campus: ~$1/month
```

---

## OpenAI Setup

```javascript
// src/infrastructure/ai/openai.js
const OpenAI = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

module.exports = openai
```

```bash
# Test classifier endpoint:
curl -X POST http://localhost:3000/api/v1/incidents/ai-classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"The ceiling fan in room B-205 has been making loud grinding noises for 3 days and sparks flew out this morning"}'

# Expected:
# { "category":"MAINTENANCE","priority":"CRITICAL","department":"Electrical",
#   "estimatedDurationHours":1,"confidence":0.95 }
```

---

## Feature-Specific Context Prompts

Use these when asking an AI assistant for help on a specific feature:

### For State Pattern help:
```
Context: I have OpenState, InProgressState, ResolvedState, EscalatedState, ReopenedState
in /src/domain/states/. Each extends IncidentState abstract base.
The incident holds a reference to its current state object.
All state classes have ZERO Prisma imports — they call incident.publish() for side effects
and incident.addToStatusLog() for history. Prisma persistence happens in IncidentService
after the domain logic runs.
Question: [your question]
```

### For Prisma transaction help:
```
Context: I use Prisma $transaction for all multi-step operations.
My domain logic runs BEFORE the transaction (State pattern, Strategy pattern).
The transaction only persists the final state.
I use SELECT FOR UPDATE for concurrent assignment prevention.
IncidentStatusLog is append-only — never UPDATE, only INSERT.
activeTaskCount on User is denormalized and updated inside transactions.
Question: [your question]
```

### For BullMQ SLA help:
```
Context: BullMQ delayed job scheduled with jobId = 'sla:{incidentId}'.
jobId stored on Incident.slaJobId in PostgreSQL for cancellation on resolution.
Worker checks incident.slaIsEscalated before processing (idempotency).
Uses SELECT FOR UPDATE inside $transaction to prevent race between retries.
Question: [your question]
```

### For Socket.IO help:
```
Context: Users join rooms on connect: user:{id}, dept:{deptId}, role:{ROLE}.
Room memberships stored in Redis Set key socket:rooms:{userId} TTL 86400.
Socket.IO uses Redis adapter for multi-server pub/sub.
Panic button emits to role:SECURITY room BEFORE any DB write (speed priority).
Question: [your question]
```
