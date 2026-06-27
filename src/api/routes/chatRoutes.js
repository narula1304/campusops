// src/api/routes/chatRoutes.js
//
// Express Router factory — mounts ChatController handlers.

const { Router } = require('express')
const ChatController = require('../controllers/chatController')
const { authenticate } = require('../middleware/auth')

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('socket.io').Server} io
 * @returns {import('express').Router}
 */
module.exports = function chatRoutes(prisma, io) {
    // Note: The 'mergeParams' option is useful if we mount this router on a path with params, 
    // but we can also just use the param in the route string here.
    const router     = Router({ mergeParams: true })
    const controller = new ChatController(prisma, io)

    // ── GET /:incidentId/chat ─────────────────────────────────────────────────
    // Authenticated users. Returns chat history for an incident.
    router.get('/:incidentId/chat', authenticate, controller.getChatHistory)

    // ── POST /:incidentId/chat ────────────────────────────────────────────────
    // Authenticated users. Sends a message to the incident's chat.
    router.post('/:incidentId/chat', authenticate, controller.sendMessage)

    // ── POST /:incidentId/chat/read ───────────────────────────────────────────
    // Authenticated users. Marks a message as read in the incident's chat.
    router.post('/:incidentId/chat/read', authenticate, controller.markRead)

    return router
}
