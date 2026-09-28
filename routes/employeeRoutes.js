const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
  getEmployees, getEmployeeById, getNextEmpId,
  createEmployee, updateEmployee, deleteEmployee,
} = require('../controllers/employeeController');

const router = express.Router();

router.use(protect);
router.use(checkPageAccess('employees'));

// ─── Specific routes must come BEFORE /:id ─────────────────────
router.get('/next-id', getNextEmpId);

router.route('/')
  .get(getEmployees)
  .post(upload.single('image'), createEmployee);

router.route('/:id')
  .get(getEmployeeById)
  .put(upload.single('image'), updateEmployee)
  .delete(deleteEmployee);

module.exports = router;