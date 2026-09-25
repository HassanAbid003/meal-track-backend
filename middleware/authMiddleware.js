const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Device = require('../models/Device');

// ============================================================
// protect — user auth only (cookie or Bearer)
// ============================================================
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

// ============================================================
// protectAnyAuth — cookie, Bearer, or X-Pairing-Token
// Attaches req.user (cookie/Bearer) OR req.device (pairing token)
// ============================================================
const protectAnyAuth = async (req, res, next) => {
  // 1. Try user auth (cookie or Bearer)
  let userToken = null;
  if (req.cookies && req.cookies.auth_token) {
    userToken = req.cookies.auth_token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    userToken = req.headers.authorization.split(' ')[1];
  }

  if (userToken) {
    try {
      const decoded = jwt.verify(userToken, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      if (req.user) {
        return next();
      }
    } catch {
    }
  }

  // 2. Try X-Pairing-Token (paired tablet)
  const pairingToken = req.headers['x-pairing-token'];

  console.log('🔍 protectAnyAuth: header present?', !!pairingToken);
  console.log('🔍 protectAnyAuth: all headers with x-', Object.keys(req.headers).filter(h => h.startsWith('x-')));

  if (pairingToken && typeof pairingToken === 'string') {
    const hash = crypto.createHash('sha256').update(pairingToken).digest('hex');


    const device = await Device.findOne({ pairingTokenHash: hash })
      .populate('site_id', 'name code');


    if (device) {
      req.device = device;
      return next();
    }
  }

  return res.status(401).json({ message: 'Not authorized' });
};

// ============================================================
// Role guards
// ============================================================
const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Super Admin only' });
  }
};

const siteAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'site_admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Site Admin only' });
  }
};

module.exports = { protect, protectAnyAuth, superAdmin, siteAdmin };