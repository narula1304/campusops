function createEmailWorker({ mailer, redis }) {
  const { Worker } = require('bullmq')

  const worker = new Worker('email-delivery', async (job) => {
    const { to, subject, html, text } = job.data

    console.log(`[EmailWorker] Sending email to ${to}: ${subject}`)

    await mailer.sendMail({
      from: process.env.SMTP_USER || 'campusops@campus.edu',
      to,
      subject,
      html,
      text
    })

    console.log(`[EmailWorker] Email sent to ${to}`)
  }, {
    connection: redis,
    concurrency: 3,
  })

  worker.on('completed', (job) => {
    console.log(`[EmailWorker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[EmailWorker] Worker error:', err.message)
  })

  console.log('[EmailWorker] Started — listening on queue "email-delivery"')
  return worker
}

module.exports = { createEmailWorker }
