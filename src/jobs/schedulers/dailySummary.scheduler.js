module.exports = function scheduleDailySummary({ prisma, aiQueue }) {
  // Schedule daily summary generation at 7 AM every day for each department
  async function scheduleForAllDepartments() {
    try {
      const departments = await prisma.department.findMany({ select: { id: true } })

      for (const dept of departments) {
        await aiQueue.add(
          'daily-summary-job',
          {
            type: 'daily-summary',
            departmentId: dept.id,
            date: new Date().toISOString()
          },
          {
            repeat: { pattern: '0 7 * * *' },   // 7 AM every day
            jobId: `daily-summary:${dept.id}`,    // deduplication
          }
        )
      }
      console.log(`[DailySummary] Scheduled for ${departments.length} departments`)
    } catch (err) {
      console.error('[DailySummary] Scheduling error:', err.message)
    }
  }

  // Run immediately on startup to register the repeating jobs
  scheduleForAllDepartments()

  return { scheduleForAllDepartments }
}
