// src/index.js
//
// Application entrypoint. This is the ONLY file in the codebase that:
//   - instantiates infrastructure clients (Prisma, Redis, BullMQ Queue, Socket.IO, Nodemailer)
//   - wires repositories, the event publisher/observers, and services together
//   - mounts Express middleware and routes
//   - starts the HTTP server
//
// Every other file in src/ receives its dependencies via constructor injection.
// This file is where those dependencies are actually constructed.
//
// Split into buildApp() (pure wiring, no side effects, fully testable) and
// startServer() (actually opens a port, connects to Redis, etc.) so that
// integration tests can build the Express app without needing a real DB/Redis
// connection — see tests/integration/app.test.js.

require('dotenv').config()

const validateEnv = require('./config/validateEnv')
validateEnv()

const express = require('express')
const http = require('http')
const cors = require('cors')
const helmet = require('helmet')
const { Server: SocketIOServer } = require('socket.io')
const Redis = require('ioredis')
const { Queue } = require('bullmq')
const nodemailer = require('nodemailer')

// ── Infrastructure ──────────────────────────────────────────────────────────
const prisma = require('./infrastructure/db/prisma')
const IncidentRepository = require('./infrastructure/repositories/IncidentRepository')
const CachingIncidentProxy = require('./infrastructure/repositories/CachingIncidentProxy')
const DepartmentRepository = require('./infrastructure/repositories/DepartmentRepository')

// ── Domain ───────────────────────────────────────────────────────────────────
const { buildValidationChain } = require('./domain/validators/ValidationChain')
const { StrategyFactory } = require('./domain/strategies/AssignmentStrategy')
const wireObservers = require('./domain/observers/wireObservers')

// ── Services ─────────────────────────────────────────────────────────────────
const IncidentService = require('./services/IncidentService')
const { createSLAWorker } = require('./jobs/workers/slaWorker')
const { createEmailWorker } = require('./jobs/workers/email.worker')
const { createAIWorker } = require('./jobs/workers/ai.worker')
const { createAnalyticsWorker } = require('./jobs/workers/analytics.worker')
const scheduleDailySummary = require('./jobs/schedulers/dailySummary.scheduler')

// ── API layer ────────────────────────────────────────────────────────────────
const incidentRoutes = require('./api/routes/incidentRoutes')
const authRoutes = require('./api/routes/authRoutes')
const errorHandler = require('./api/middleware/errorHandler')

// ── Realtime handlers ────────────────────────────────────────────────────────
const registerIncidentHandlers = require('./realtime/handlers/incident.handler')
const registerPanicHandlers = require('./realtime/handlers/panic.handler')
const registerChatHandlers = require('./realtime/handlers/chat.handler')

/**
 * Builds infrastructure clients (Redis, BullMQ Queue, Nodemailer transporter).
 * Does NOT connect yet for clients that connect lazily; ioredis and BullMQ
 * connect on first command by default, so construction alone has no network
 * side effects worth isolating further here.
 *
 * Socket.IO requires an http.Server to attach to, so it is NOT built here —
 * it's built in startServer() once the http.Server exists, and threaded back
 * into the rest of the wiring via the optional `io` parameter on buildApp().
 *
 * @returns {{ redis: import('ioredis'), slaQueue: import('bullmq').Queue, mailer: object }}
 */
function buildInfrastructureClients() {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null, // required by BullMQ when sharing a connection
    })

    const slaQueue = new Queue('sla-escalation', {
        connection: redis,
    })

    const mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    })

    return { redis, slaQueue, mailer }
}

/**
 * Wires every layer together and returns a fully configured Express app.
 *
 * Pure wiring — no app.listen(), no process exit handlers. This is what
 * integration tests import directly (with `io` and infra clients faked)
 * to test the full HTTP stack without opening a real port or DB connection.
 *
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io      — Socket.IO server (real or faked)
 * @param {import('ioredis')}          deps.redis   — ioredis client (real or faked)
 * @param {import('bullmq').Queue}     deps.slaQueue — BullMQ queue (real or faked)
 * @param {object}                     deps.mailer  — Nodemailer transporter (real or faked)
 * @param {object}                     [deps.prismaClient] — defaults to the singleton;
 *        override in tests if you need a fully isolated Prisma mock
 * @returns {import('express').Express}
 */
function buildApp({ io, redis, slaQueue, mailer, prismaClient = prisma }) {
    // ── Repositories ────────────────────────────────────────────────────────
    const baseIncidentRepo = new IncidentRepository()
    const incidentRepo = new CachingIncidentProxy(baseIncidentRepo, redis)
    const departmentRepo = new DepartmentRepository()

    // ── Observers (Observer pattern fan-out) ───────────────────────────────
    const eventPublisher = wireObservers({
        slaQueue,
        redis,
        io,
        mailer,
        prisma: prismaClient,
    })

    // ── Validation chain (Chain of Responsibility) ─────────────────────────
    const validationChain = buildValidationChain()

    // ── Service layer ───────────────────────────────────────────────────────
    const incidentService = new IncidentService({
        incidentRepo,
        validationChain,
        eventPublisher,
        strategyFactory: StrategyFactory,
        departmentRepo,
    })

    const userRoutes = require('./api/routes/userRoutes')
    const alertRoutes = require('./api/routes/alertRoutes')
    const analyticsRoutes = require('./api/routes/analyticsRoutes')
    const panicRoutes = require('./api/routes/panicRoutes')
    const chatRoutes = require('./api/routes/chatRoutes')
    const departmentRoutes = require('./api/routes/departmentRoutes')

    // ── Express app ──────────────────────────────────────────────────────────
    const app = express()

    app.use(helmet())
    app.use(cors({
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',')
            : ['http://localhost:5173', 'http://localhost:3000'],
        credentials: true,
    }))
    app.use(express.json())

    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    app.use('/api/auth', authRoutes(prismaClient, process.env.JWT_SECRET))
    app.use('/api/users', userRoutes(prismaClient))
    app.use('/api/departments', departmentRoutes(prismaClient))
    app.use('/api/alerts', alertRoutes(prismaClient, io))
    app.use('/api/analytics', analyticsRoutes(prismaClient, redis))

    // ── Rate limiters ─────────────────────────────────────────────────────────
    const createRateLimiter = require('./api/middleware/rateLimiter')

    // 10 incident creations per minute per authenticated user
    const incidentCreateLimiter = createRateLimiter({
        redis,
        windowMs: 60 * 1000,
        max: 10,
        keyPrefix: 'rl:incident:create',
    })

    // 3 panic triggers per 5 minutes per user
    const panicLimiter = createRateLimiter({
        redis,
        windowMs: 5 * 60 * 1000,
        max: 3,
        keyPrefix: 'rl:panic',
    })

    // Apply limiters BEFORE the route handlers — inline guard ensures only the
    // targeted method+path is rate-limited; other verbs pass straight through.
    app.use('/api/incidents', (req, res, next) => {
        if (req.method === 'POST' && req.path === '/') return incidentCreateLimiter(req, res, next)
        next()
    })
    app.use('/api/panic', (req, res, next) => {
        if (req.method === 'POST' && req.path === '/') return panicLimiter(req, res, next)
        next()
    })

    app.use('/api/panic', panicRoutes(prismaClient, io))
    app.use('/api/incidents', incidentRoutes(incidentService))
    app.use('/api/incidents', chatRoutes(prismaClient, io))

    // Must be registered LAST — Express identifies error handlers by arity (4 args)
    app.use(errorHandler)

    return { app, incidentRepo, eventPublisher }
}

/**
 * Builds real infrastructure, an http.Server + Socket.IO server, attaches
 * the Express app, and starts listening. This is the function that actually
 * has side effects (opens a port, connects to Redis) — only called when this
 * file is run directly (`node src/index.js`), never when buildApp() is
 * imported for testing.
 */
function startServer() {
    const { redis, slaQueue, mailer } = buildInfrastructureClients()

    const httpServer = http.createServer()

    const io = new SocketIOServer(httpServer, {
        cors: { origin: process.env.CORS_ORIGIN || '*' },
    })

    // ── Socket.IO JWT authentication ────────────────────────────────────────────
    const jwt = require('jsonwebtoken')
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token
        if (!token) {
            return next(new Error('Authentication required'))
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            socket.user = decoded  // attach user to socket for room joining
            next()
        } catch (err) {
            next(new Error('Invalid token'))
        }
    })

    // ── Socket.IO connection handler ─────────────────────────────────────────────
    io.on('connection', (socket) => {
        const user = socket.user
        console.log(`[Socket.IO] ${user.name} (${user.role}) connected`)

        // Join user's personal room
        socket.join(`user:${user.id}`)

        // Join role room
        socket.join(`role:${user.role}`)

        // Join department room if applicable
        if (user.departmentId) {
            socket.join(`dept:${user.departmentId}`)
        }

        socket.on('disconnect', () => {
            console.log(`[Socket.IO] ${user.name} disconnected`)
        })

        // Register domain-specific handlers
        const prismaClient = prisma // Map to prismaClient as requested
        registerIncidentHandlers(socket, io, prismaClient)
        registerPanicHandlers(socket, io, prismaClient)
        registerChatHandlers(socket, io, prismaClient)
    })

    const { app, incidentRepo, eventPublisher } = buildApp({ io, redis, slaQueue, mailer })

    // ── SLA escalation worker ──────────────────────────────────────────────────
    const slaWorker = createSLAWorker({ incidentRepo, eventPublisher, redis })

    // Create additional queues needed by workers
    const emailQueue = new Queue('email-delivery', { connection: redis })
    const aiQueue = new Queue('ai-tasks', { connection: redis })
    const analyticsQueue = new Queue('analytics', { connection: redis })

    // Create OpenAI client
    const OpenAI = require('openai')
    const openai = new OpenAI({ 
        apiKey: process.env.GROQ_API_KEY || 'dummy_api_key_to_allow_startup',
        baseURL: 'https://api.groq.com/openai/v1'
    })

    // Start workers
    const emailWorker = createEmailWorker({ mailer, redis })
    const aiWorker = createAIWorker({ openai, prisma, redis })
    const analyticsWorker = createAnalyticsWorker({ prisma, redis })

    // Start daily summary scheduler
    scheduleDailySummary({ prisma, aiQueue })

    // Attach the Express app as the http.Server's request handler.
    // (Socket.IO needs the raw http.Server to set up its own upgrade handling
    // for WebSockets, so we create the server first and hand Express to it,
    // rather than calling app.listen() directly.)
    httpServer.on('request', app)

    const PORT = process.env.PORT || 5000

    httpServer.listen(PORT, () => {
        console.log(`CampusOps API listening on port ${PORT}`)
    })

    // ── Graceful shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
        console.log(`\n${signal} received — shutting down gracefully`)
        httpServer.close(() => console.log('HTTP server closed'))
        await slaWorker.close()
        await emailWorker.close()
        await aiWorker.close()
        await analyticsWorker.close()
        await emailQueue.close()
        await aiQueue.close()
        await analyticsQueue.close()
        await slaQueue.close()
        redis.disconnect()
        await prisma.$disconnect()
        process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    return { app, httpServer, io }
}

// Only start the server when this file is executed directly
// (`node src/index.js` or `npm start`) — never when required/imported,
// which is what makes buildApp() safely testable in isolation.
if (require.main === module) {
    startServer()
}

module.exports = { buildApp, buildInfrastructureClients, startServer }