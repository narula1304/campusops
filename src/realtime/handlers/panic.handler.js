module.exports = function registerPanicHandlers(socket, io, prisma) {

  // Security officers join a global security room on connection
  // (already done by room joining in index.js via role:SECURITY)
  // This handler adds panic-specific acknowledgement tracking

  socket.on('panic_acknowledge', async ({ incidentId }) => {
    try {
      if (socket.user.role !== 'SECURITY' && socket.user.role !== 'ADMIN') {
        socket.emit('error', { message: 'Unauthorized' })
        return
      }

      const incident = await prisma.incident.findUnique({ where: { id: incidentId } })
      if (!incident) return

      // Create acknowledgement record
      await prisma.panicAcknowledgement.create({
        data: {
          incidentId,
          officerId: socket.user.id,
          acknowledgedAt: new Date()
        }
      }).catch(() => {}) // Ignore duplicate ack errors silently

      // Notify the panic reporter
      io.to(`user:${incident.creatorId}`).emit('panic_acknowledged', {
        incidentId,
        officerName: socket.user.name,
        officerId: socket.user.id,
        acknowledgedAt: new Date().toISOString()
      })

      // Notify all security officers that someone is responding
      io.to('role:SECURITY').emit('panic_response_dispatched', {
        incidentId,
        respondingOfficer: socket.user.name,
        respondingOfficerId: socket.user.id
      })

    } catch (err) {
      console.error('[PanicHandler] panic_acknowledge error:', err.message)
    }
  })
}
