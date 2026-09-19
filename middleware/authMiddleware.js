const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // 1. Try HttpOnly cookie (web admin panel)
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }
  // 2. Fall back to Authorization: Bearer <token> (mobile app)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Only allow Super Admin
const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Super Admin only' });
  }
};

// Only allow Site Admin
const siteAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'site_admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Site Admin only' });
  }
};

module.exports = { protect, superAdmin, siteAdmin };