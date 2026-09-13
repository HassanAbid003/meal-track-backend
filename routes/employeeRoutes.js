const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
  getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee,
} = require('../controllers/employeeController');

const router = express.Router();

router.use(protect);
router.use(checkPageAccess('employees'));

router.route('/')
  .get(getEmployees)
  .post(upload.single('image'), createEmployee);

router.route('/:id')
  .get(getEmployeeById)
  .put(upload.single('image'), updateEmployee)
  .delete(deleteEmployee);

module.exports = router;