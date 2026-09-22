const express = require('express');
const {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect, superAdmin } = require('../middleware/authMiddleware');
const {
  loginLimiter,
  passwordResetLimiter,
} = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Public — with rate limits
router.post('/login', loginLimiter, loginUser);
router.post('/logout', logoutUser);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Private (Super Admin can create new users)
router.post('/register', protect, superAdmin, registerUser);

// Private (Anyone logged in can see their own profile)
router.get('/me', protect, getMe);

module.exports = router;