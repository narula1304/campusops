// src/config/validateEnv.js
// Validates required environment variables on startup.
// Throws with a clear message rather than failing silently at runtime.

const REQUIRED = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REDIS_URL',
]

const OPTIONAL_WITH_WARNINGS = [
    'GROQ_API_KEY',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
]

module.exports = function validateEnv() {
    const missing = REQUIRED.filter((key) => !process.env[key])

    if (missing.length > 0) {
        console.error('\n❌ Missing required environment variables:')
        missing.forEach((key) => console.error(`   • ${key}`))
        console.error('\nAdd them to your .env file and restart.\n')
        process.exit(1)
    }

    const missingOptional = OPTIONAL_WITH_WARNINGS.filter((key) => !process.env[key])
    if (missingOptional.length > 0) {
        console.warn('\n⚠️  Optional environment variables not set (some features may not work):')
        missingOptional.forEach((key) => console.warn(`   • ${key}`))
        console.warn('')
    }
}