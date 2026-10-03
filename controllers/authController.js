const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// ─── Config ───────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_COOKIE_TTL_MS = 15 * 60 * 1000;

const isProduction = process.env.NODE_ENV === 'production';

const accessCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: ACCESS_COOKIE_TTL_MS,
  path: '/',
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: REFRESH_TOKEN_TTL_MS,
  path: '/',
};

// ─── Helpers ──────────────────────────────────────────────────────

const generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

const generateRefreshTokenRaw = () => crypto.randomBytes(32).toString('hex');
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const buildUserPayload = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  site_id: user.site_id,
  permissions: user.permissions,
});

async function issueTokenPair(res, user, req, { family = null, parent = null } = {}) {
  const accessToken = generateAccessToken(user._id);
  const refreshRaw = generateRefreshTokenRaw();
  const refreshHash = hashToken(refreshRaw);
  const familyId = family || crypto.randomUUID();

  await RefreshToken.create({
    tokenHash: refreshHash,
    user: user._id,
    family: familyId,
    parent,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip || null,
  });

  res.cookie('auth_token', accessToken, accessCookieOptions);
  res.cookie('refresh_token', refreshRaw, refreshCookieOptions);

  return { accessToken, family: familyId };
}

function clearAuthCookies(res) {
  res.clearCookie('auth_token', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.clearCookie('refresh_token', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
}

// ─── Controllers ──────────────────────────────────────────────────

const registerUser = async (req, res) => {
  const { name, email, password, role, site_id, permissions } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });
    const user = await User.create({ name, email, password, role, site_id, permissions: permissions || {} });
    res.status(201).json(buildUserPayload(user));
  } catch (error) {
    console.error('registerUser error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

const loginUser = async (req, res) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const { accessToken } = await issueTokenPair(res, user, req);
    const userPayload = buildUserPayload(user);
    res.json({ token: accessToken, user: userPayload, ...userPayload });
  } catch (error) {
    console.error('loginUser error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

const refreshToken = async (req, res) => {
  try {
    const raw = req.cookies?.refresh_token;
    if (!raw) return res.status(401).json({ message: 'No refresh token' });

    const incomingHash = hashToken(raw);
    const record = await RefreshToken.findOne({ tokenHash: incomingHash });

    if (!record) return res.status(401).json({ message: 'Invalid refresh token' });

    if (record.revokedAt) {
      console.warn(`🚨 Refresh token reuse detected — killing family ${record.family}`);
      await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Session revoked due to token reuse' });
    }

    if (record.expiresAt < new Date()) {
      await RefreshToken.updateOne({ _id: record._id }, { $set: { revokedAt: new Date() } });
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    const user = await User.findById(record.user).select('-password');
    if (!user) {
      await RefreshToken.updateOne({ _id: record._id }, { $set: { revokedAt: new Date() } });
      clearAuthCookies(res);
      return res.status(401).json({ message: 'User not found' });
    }

    await RefreshToken.updateOne({ _id: record._id }, { $set: { revokedAt: new Date() } });
    await issueTokenPair(res, user, req, { family: record.family, parent: record._id });

    res.json({ ok: true, user: buildUserPayload(user) });
  } catch (error) {
    console.error('refreshToken error:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

const logoutUser = async (req, res) => {
  try {
    const raw = req.cookies?.refresh_token;
    if (raw) {
      const incomingHash = hashToken(raw);
      const record = await RefreshToken.findOne({ tokenHash: incomingHash });
      if (record) {
        await RefreshToken.updateMany({ family: record.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
      }
    }
  } catch (error) {
    console.error('logoutUser error:', error);
  }
  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully' });
};

const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json(user);
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const genericResponse = { message: 'If that email exists, a reset link has been sent.' };
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json(genericResponse);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = hashToken(resetToken);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const html = `<div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;"><h2 style="color: #0f172a;">Reset your MealTrack password</h2><p style="color: #475569;">You requested a password reset. Click the button below to set a new password:</p><p style="text-align: center; margin: 30px 0;"><a href="${resetUrl}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset Password</a></p><p style="color: #475569; font-size: 13px;">Or paste this link into your browser:</p><p style="color: #4f46e5; font-size: 12px; word-break: break-all;">${resetUrl}</p><p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore it.</p></div>`;

    try {
      await sendEmail({ to: user.email, subject: 'MealTrack - Password Reset', html });
    } catch (emailErr) {
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      await user.save({ validateBeforeSave: false });
      console.error('Email send failed:', emailErr);
      return res.status(500).json({ message: 'Email could not be sent' });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const hashedToken = hashToken(req.params.token);
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();

    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    clearAuthCookies(res);
    res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  getMe,
  forgotPassword,
  resetPassword,
};