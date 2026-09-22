const rateLimit = require('express-rate-limit');

// Strict limiter for login attempts
// 5 attempts per 15 minutes per IP
// Strict limiter for login attempts
// 5 attempts per 15 minutes per IP
// Once blocked, ALL requests from that IP are blocked for the full 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ⚠️ IMPORTANT: count ALL requests (success or fail) toward the limit.
  // This ensures once an IP is blocked, even a correct password won't bypass.
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

// Lenient limiter for general API (protects against DoS)
// 300 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    message: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Aggressive limiter for password reset (prevents email spam)
// 3 requests per 60 minutes per IP
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    message: 'Too many password reset attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  apiLimiter,
  passwordResetLimiter,
};