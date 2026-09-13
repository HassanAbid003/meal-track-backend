const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
} = require('../controllers/departmentController');

const router = express.Router();

router.use(protect);
router.use(checkPageAccess('departments')); // ← Page access check

router.route('/').get(getDepartments).post(createDepartment);
router.route('/:id').put(updateDepartment).delete(deleteDepartment);

module.exports = router;