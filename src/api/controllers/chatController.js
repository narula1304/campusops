// src/api/controllers/chatController.js
//
// Handles incident-specific real-time chat.

class ChatController {
    /**
     * @param {import('@prisma/client').PrismaClient} prisma
     * @param {import('socket.io').Server} io
     */
    constructor(prisma, io) {
        this.prisma = prisma
        this.io = io
    }

    /**
     * GET /api/incidents/:incidentId/chat
     * Any authenticated role. Returns the chat history and ensures the user
     * is added as a participant to the chat room.
     *
     * @type {import('express').RequestHandler}
     */
    getChatHistory = async (req, res, next) => {
        try {
            const { incidentId } = req.params

            // 1. Verify incident exists
            const incident = await this.prisma.incident.findUnique({
                where: { id: incidentId }
            })
            if (!incident) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Incident not found' }
                })
            }

            // 2. Upsert ChatRoom
            const chatRoom = await this.prisma.chatRoom.upsert({
                where: { incidentId },
                create: { incidentId },
                update: {}
            })

            // 3. Add current user as participant if not already
            await this.prisma.chatParticipant.upsert({
                where: { userId_roomId: { userId: req.user.id, roomId: chatRoom.id } },
                create: { userId: req.user.id, roomId: chatRoom.id },
                update: {}
            })

            // 4. Fetch messages
            const messages = await this.prisma.message.findMany({
                where: { roomId: chatRoom.id },
                orderBy: { createdAt: 'asc' },
                take: 100,
                include: {
                    sender: {
                        select: { id: true, name: true, role: true }
                    }
                }
            })

            return res.status(200).json({
                data: {
                    chatRoomId: chatRoom.id,
                    messages
                }
            })
        } catch (err) {
            next(err)
        }
    }

    /**
     * POST /api/incidents/:incidentId/chat
     * Any authenticated role. Sends a message to the incident's chat room.
     *
     * @type {import('express').RequestHandler}
     */
    sendMessage = async (req, res, next) => {
        try {
            const { incidentId } = req.params
            const { text, attachmentUrl } = req.body

            // 1. Validate
            if ((!text || text.trim() === '') && !attachmentUrl) {
                return res.status(422).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'text or attachmentUrl required'
                    }
                })
            }

            // 2. Verify incident
            const incident = await this.prisma.incident.findUnique({
                where: { id: incidentId }
            })
            if (!incident) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Incident not found' }
                })
            }

            // 3. Upsert ChatRoom
            const chatRoom = await this.prisma.chatRoom.upsert({
                where: { incidentId },
                create: { incidentId },
                update: {}
            })

            // 4. Add current user as participant if not already
            await this.prisma.chatParticipant.upsert({
                where: { userId_roomId: { userId: req.user.id, roomId: chatRoom.id } },
                create: { userId: req.user.id, roomId: chatRoom.id },
                update: {}
            })

            // 5. Create Message
            const msg = await this.prisma.message.create({
                data: {
                    roomId: chatRoom.id,
                    senderId: req.user.id,
                    text: text?.trim() || null,
                    attachmentUrl: attachmentUrl || null
                },
                include: {
                    sender: {
                        select: { id: true, name: true, role: true }
                    }
                }
            })

            // 6. Emit real-time message event
            if (this.io) {
                this.io.to(`chat:${chatRoom.id}`).emit('chat_message', {
                    messageId: msg.id,
                    chatRoomId: chatRoom.id,
                    incidentId,
                    senderId: req.user.id,
                    senderName: req.user.name,
                    senderRole: req.user.role,
                    text: msg.text,
                    attachmentUrl: msg.attachmentUrl,
                    createdAt: msg.createdAt
                })
            }

            return res.status(201).json({ data: msg })
        } catch (err) {
            next(err)
        }
    }

    /**
     * POST /api/incidents/:incidentId/chat/read
     * Any authenticated role. Marks the specified message as read by the user.
     *
     * @type {import('express').RequestHandler}
     */
    markRead = async (req, res, next) => {
        try {
            const { incidentId } = req.params
            const { lastReadMessageId } = req.body

            if (!lastReadMessageId) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: 'lastReadMessageId is required' }
                })
            }

            // Find the chat room via incidentId
            const chatRoom = await this.prisma.chatRoom.findUnique({
                where: { incidentId }
            })

            if (!chatRoom) {
                return res.status(404).json({
                    error: { code: 'NOT_FOUND', message: 'Chat room not found for this incident' }
                })
            }

            // Record the read receipt using the MessageReadReceipt model
            await this.prisma.messageReadReceipt.upsert({
                where: {
                    messageId_userId: {
                        messageId: lastReadMessageId,
                        userId: req.user.id
                    }
                },
                create: {
                    messageId: lastReadMessageId,
                    userId: req.user.id,
                    readAt: new Date()
                },
                update: {
                    readAt: new Date()
                }
            })

            // Emit read receipt event
            if (this.io) {
                this.io.to(`chat:${chatRoom.id}`).emit('chat_read', {
                    userId: req.user.id,
                    lastReadMessageId
                })
            }

            return res.status(200).json({
                data: { message: 'Marked as read' }
            })
        } catch (err) {
            next(err)
        }
    }
}

module.exports = ChatController
