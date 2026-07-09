// prisma/seed.js
// Run with: node prisma/seed.js
//
// Creates:
//   1 Department (Computer Science)
//   1 user per role — all with password: campusops123
//
// Email / role summary:
//   student@campus.edu     STUDENT
//   faculty@campus.edu     FACULTY
//   maintenance@campus.edu MAINTENANCE
//   security@campus.edu    SECURITY
//   admin@campus.edu       ADMIN

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
    const PASSWORD = 'campusops123'
    const hash = await bcrypt.hash(PASSWORD, 10)

    // ── Department ───────────────────────────────────────────────────────────
    const dept = await prisma.department.upsert({
        where: { code: 'CSE' },
        update: {},
        create: {
            name: 'Computer Science & Engineering',
            code: 'CSE',
            assignmentStrategy: 'LEAST_LOADED',
        },
    })
    console.log(`✓ Department: ${dept.name} (${dept.id})`)

    // ── Users ─────────────────────────────────────────────────────────────────
    const users = [
        {
            email: 'student@campus.edu',
            name: 'Ankit Sharma',
            role: 'STUDENT',
            rollNo: 'CS21001',
            year: 3,
        },
        {
            email: 'faculty@campus.edu',
            name: 'Dr. Priya Verma',
            role: 'FACULTY',
            employeeId: 'FAC-001',
            designation: 'Associate Professor',
        },
        {
            email: 'maintenance@campus.edu',
            name: 'Raju Mehta',
            role: 'MAINTENANCE',
            employeeId: 'MNT-001',
            designation: 'Maintenance Technician',
            specialization: ['PLUMBING', 'ELECTRICAL'],
            shiftDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
            shiftStart: '09:00',
            shiftEnd: '18:00',
        },
        {
            email: 'security@campus.edu',
            name: 'Dinesh Rawat',
            role: 'SECURITY',
            employeeId: 'SEC-001',
            designation: 'Security Officer',
            badgeNumber: 'B-2024',
            zone: 'Block A-C',
        },
        {
            email: 'admin@campus.edu',
            name: 'Neha Singh',
            role: 'ADMIN',
            employeeId: 'ADM-001',
            designation: 'Campus Administrator',
            accessLevel: 'SUPERADMIN',
        },
    ]

    for (const u of users) {
        const created = await prisma.user.upsert({
            where: { email: u.email },
            update: { passwordHash: hash },
            create: {
                ...u,
                passwordHash: hash,
                departmentId: dept.id,
                isActive: true,
            },
        })
        console.log(`✓ ${created.role.padEnd(12)} ${created.email}`)
    }

    console.log('\n─────────────────────────────────')
    console.log('Seed complete. Login credentials:')
    console.log('─────────────────────────────────')
    console.log('Role          Email                    Password')
    console.log('STUDENT       student@campus.edu       campusops123')
    console.log('FACULTY       faculty@campus.edu       campusops123')
    console.log('MAINTENANCE   maintenance@campus.edu   campusops123')
    console.log('SECURITY      security@campus.edu      campusops123')
    console.log('ADMIN         admin@campus.edu         campusops123')
    console.log(`\nDepartment ID (use in Create Incident form): ${dept.id}`)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
