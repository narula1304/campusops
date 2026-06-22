// src/infrastructure/db/prisma.js
//
// PrismaClient singleton — the ONLY place in the entire codebase where
// PrismaClient is instantiated. Import this singleton everywhere that
// needs Prisma access instead of calling `new PrismaClient()` directly.
//
// Singleton pattern prevents connection pool exhaustion in long-running
// Node processes (and during hot-reloads in development).
//
// Reference: SYSTEM_DESIGN.md Section 2 (Folder Structure)

const { PrismaClient } = require('@prisma/client')

const isDevelopment = process.env.NODE_ENV !== 'production'

const prisma = new PrismaClient({
    log: isDevelopment
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
        ]
        : [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
        ],
})

// In development, log every SQL query with duration so slow queries are
// immediately visible without a separate APM tool.
if (isDevelopment) {
    prisma.$on('query', (e) => {
        console.log(`[Prisma Query] ${e.duration}ms — ${e.query}`)
    })
}

module.exports = prisma
