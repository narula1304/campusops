function createAIWorker({ openai, prisma, redis }) {
  const { Worker } = require('bullmq')

  const worker = new Worker('ai-tasks', async (job) => {
    const { type } = job.data

    if (type === 'sentiment-analysis') {
      const { incidentId, feedbackText, score } = job.data

      const completion = await openai.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'system',
          content: 'You are analyzing campus incident feedback. Classify the sentiment as POSITIVE, NEUTRAL, or NEGATIVE and extract key issues in 1-2 sentences. Respond with JSON: { sentiment: string, summary: string }'
        }, {
          role: 'user',
          content: `Feedback score: ${score}/5. Comment: "${feedbackText}"`
        }],
        response_format: { type: 'json_object' },
        max_tokens: 150
      })

      const result = JSON.parse(completion.choices[0].message.content)

      // Update the IncidentFeedback record with sentiment
      await prisma.incidentFeedback.update({
        where: { incidentId },
        data: {
          sentiment: result.sentiment,
          aiSummary: result.summary
        }
      })

      console.log(`[AIWorker] Sentiment analysis complete for incident ${incidentId}: ${result.sentiment}`)
    }

    if (type === 'classify-incident') {
      const { title, description } = job.data

      const completion = await openai.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'system',
          content: 'You classify campus incidents. Given title and description, return JSON: { category: string, priority: string, suggestedDepartment: string } where category is one of MAINTENANCE/SECURITY/INFRASTRUCTURE/CLEANLINESS/EMERGENCY/OTHER and priority is LOW/MEDIUM/HIGH/CRITICAL'
        }, {
          role: 'user',
          content: `Title: ${title}\nDescription: ${description}`
        }],
        response_format: { type: 'json_object' },
        max_tokens: 100
      })

      return JSON.parse(completion.choices[0].message.content)
    }

    if (type === 'daily-summary') {
      const { departmentId, date } = job.data

      // Fetch yesterday's incidents for this department
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const incidents = await prisma.incident.findMany({
        where: {
          departmentId,
          createdAt: { gte: startOfDay, lte: endOfDay }
        },
        select: { title: true, category: true, priority: true, status: true }
      })

      if (incidents.length === 0) {
        return { summary: 'No incidents reported today.' }
      }

      const incidentList = incidents
        .map(i => `- [${i.priority}] ${i.title} (${i.category}) — ${i.status}`)
        .join('\n')

      const completion = await openai.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'system',
          content: 'You generate brief daily campus operations summaries for department heads. Be concise and actionable.'
        }, {
          role: 'user',
          content: `Generate a 3-4 sentence summary of today's campus incidents:\n${incidentList}`
        }],
        max_tokens: 200
      })

      const summary = completion.choices[0].message.content

      // Store in a DailySummary model if it exists, otherwise just return
      try {
        await prisma.dailySummary.upsert({
          where: { date: startOfDay.toISOString().split('T')[0] },
          create: {
            date: startOfDay.toISOString().split('T')[0],
            summary,
            totalNew: incidents.length,
            totalResolved: 0,
            slaBreaches: 0,
            criticalOpen: 0,
            hotspots: {}
          },
          update: {
            summary,
            totalNew: incidents.length,
            generatedAt: new Date()
          }
        })
      } catch (err) {
        // DailySummary model may not exist yet — log and continue
        console.warn('[AIWorker] Could not save daily summary to DB:', err.message)
      }

      return { summary }
    }

  }, {
    connection: redis,
    concurrency: 2,
  })

  worker.on('failed', (job, err) => {
    console.error(`[AIWorker] Job ${job?.id} (${job?.data?.type}) failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[AIWorker] Worker error:', err.message)
  })

  console.log('[AIWorker] Started — listening on queue "ai-tasks"')
  return worker
}




module.exports = { createAIWorker }