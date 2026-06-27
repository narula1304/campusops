module.exports = function registerIncidentHandlers(socket, io, prisma) {
  
  // When a client opens an incident detail page, they join the incident room
  // so they receive real-time updates for that specific incident
  socket.on('join_incident', (incidentId) => {
    socket.join(`incident:${incidentId}`)
  })
  
  socket.on('leave_incident', (incidentId) => {
    socket.leave(`incident:${incidentId}`)
  })

  // When a client opens a chat, join the chat room for real-time messages
  socket.on('join_chat', async (incidentId) => {
    try {
      const chatRoom = await prisma.chatRoom.findUnique({ where: { incidentId } })
      if (chatRoom) {
        socket.join(`chat:${chatRoom.id}`)
      }
    } catch (err) {
      console.error('[IncidentHandler] join_chat error:', err.message)
    }
  })

  socket.on('leave_chat', async (incidentId) => {
    try {
      const chatRoom = await prisma.chatRoom.findUnique({ where: { incidentId } })
      if (chatRoom) {
        socket.leave(`chat:${chatRoom.id}`)
      }
    } catch (err) {
      console.error('[IncidentHandler] leave_chat error:', err.message)
    }
  })

  // SLA warning — client can request current SLA status for an incident
  socket.on('check_sla', async (incidentId) => {
    try {
      const incident = await prisma.incident.findUnique({
        where: { id: incidentId },
        select: { id: true, slaDeadlineAt: true, status: true, slaIsEscalated: true }
      })
      if (!incident) return
      
      const now = new Date()
      const deadline = incident.slaDeadlineAt
      const isBreached = deadline && deadline < now
      const remainingMs = deadline ? Math.max(0, deadline.getTime() - now.getTime()) : null
      
      socket.emit('sla_status', {
        incidentId,
        isBreached,
        remainingMs,
        deadline: deadline?.toISOString() ?? null,
        isEscalated: incident.slaIsEscalated
      })
    } catch (err) {
      console.error('[IncidentHandler] check_sla error:', err.message)
    }
  })
}
