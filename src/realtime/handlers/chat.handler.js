module.exports = function registerChatHandlers(socket, io, prisma) {

  // Typing indicators — lightweight, no DB
  socket.on('chat_typing', ({ chatRoomId }) => {
    socket.to(`chat:${chatRoomId}`).emit('chat_typing', {
      userId: socket.user.id,
      userName: socket.user.name,
      chatRoomId
    })
  })

  socket.on('chat_stop_typing', ({ chatRoomId }) => {
    socket.to(`chat:${chatRoomId}`).emit('chat_stop_typing', {
      userId: socket.user.id,
      chatRoomId
    })
  })
}
