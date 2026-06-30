// src/api/routes/departmentRoutes.js
const { Router } = require('express')
const DepartmentController = require('../controllers/departmentController')
const { authenticate, authorize } = require('../middleware/auth')

module.exports = function departmentRoutes(prisma) {
    const router = Router()
    const controller = new DepartmentController(prisma)

    // All authenticated users can list departments (needed for incident creation dropdown)
    router.get('/', authenticate, controller.listDepartments)
    
    // ADMIN only routes
    router.post('/', authenticate, authorize('ADMIN'), controller.createDepartment)
    router.patch('/:id/strategy', authenticate, authorize('ADMIN'), controller.updateStrategy)

    return router
}
