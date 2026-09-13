// const express = require('express');
// const { protect } = require('../middleware/authMiddleware');
// const {
//   getUsers,
//   getUserById,
//   updateUserPermissions,
//   updateUserRole,
//   promoteEmployee,
// } = require('../controllers/userController');

// const router = express.Router();

// router.use(protect);

// router.get('/', getUsers);
// router.post('/promote', promoteEmployee);  // ← NEW
// router.get('/:id', getUserById);
// router.put('/:id/permissions', updateUserPermissions);
// router.put('/:id/role', updateUserRole);

// module.exports = router;

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getUsers,
  getUserById,
  updateUserPermissions,
  updateUserRole,
  promoteEmployee,
  resetUserPassword,
} = require('../controllers/userController');

const router = express.Router();

router.use(protect);

router.get('/', getUsers);
router.post('/promote', promoteEmployee);
router.get('/:id', getUserById);
router.put('/:id/permissions', updateUserPermissions);
router.put('/:id/role', updateUserRole);
router.put('/:id/password', resetUserPassword);

module.exports = router;