// src/api/controllers/departmentController.js
class DepartmentController {
    constructor(prisma) {
        this.prisma = prisma
    }

    /**
     * GET /api/departments
     */
    listDepartments = async (req, res, next) => {
        try {
            const departments = await this.prisma.department.findMany({
                select: { id: true, name: true, code: true, assignmentStrategy: true }
            })
            return res.status(200).json({ data: departments })
        } catch (err) {
            next(err)
        }
    }

    /**
     * POST /api/departments
     */
    createDepartment = async (req, res, next) => {
        try {
            const { name, code, assignmentStrategy } = req.body

            if (!name || !code) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: 'Name and Code are required' }
                })
            }

            const existing = await this.prisma.department.findFirst({
                where: { OR: [{ name }, { code }] }
            })
            if (existing) {
                return res.status(409).json({
                    error: { code: 'CONFLICT', message: 'A department with this name or code already exists' }
                })
            }

            const validStrategies = ['LEAST_LOADED', 'ROUND_ROBIN', 'SHIFT_AWARE', 'MANUAL']
            const strategyToUse = validStrategies.includes(assignmentStrategy) ? assignmentStrategy : 'LEAST_LOADED'

            const department = await this.prisma.department.create({
                data: {
                    name,
                    code,
                    assignmentStrategy: strategyToUse
                }
            })

            return res.status(201).json({ data: department })
        } catch (err) {
            next(err)
        }
    }

    /**
     * PATCH /api/departments/:id/strategy
     */
    updateStrategy = async (req, res, next) => {
        try {
            const { id } = req.params
            const { strategy } = req.body

            const validStrategies = ['LEAST_LOADED', 'ROUND_ROBIN', 'SHIFT_AWARE', 'MANUAL']
            if (!validStrategies.includes(strategy)) {
                return res.status(422).json({
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid strategy' }
                })
            }

            const updated = await this.prisma.department.update({
                where: { id },
                data: { assignmentStrategy: strategy }
            })

            return res.status(200).json({ data: updated })
        } catch (err) {
            next(err)
        }
    }
}
module.exports = DepartmentController
