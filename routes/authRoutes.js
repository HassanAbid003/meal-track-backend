const express = require('express');
const { registerUser, loginUser, getMe } = require('../controllers/authController');
const { protect, superAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Public
router.post('/login', loginUser);

// Private (Super Admin can create new users)
router.post('/register', protect, superAdmin, registerUser);

// Private (Anyone logged in can see their own profile)
router.get('/me', protect, getMe);

module.exports = router;