const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Private (Super Admin only)
const registerUser = async (req, res) => {
  const { name, email, password, role, site_id, permissions } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      site_id,
      permissions: permissions || {},
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        site_id: user.site_id,
        permissions: user.permissions,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        site_id: user.site_id,
        permissions: user.permissions,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  res.json(user);
};

// @desc    Forgot password - send reset link
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  console.log('====================================');
  console.log('🟢 FORGOT PASSWORD CALLED');
  console.log('🟢 Email from request:', email);

  const genericResponse = {
    message: 'If that email exists, a reset link has been sent.',
  };

  try {
    const user = await User.findOne({ email });
    console.log('🟢 User found:', user ? user.email : 'NONE');

    if (!user) {
      console.log('🔴 No user — exiting early');
      console.log('====================================');
      return res.status(200).json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    console.log('🟢 Raw token (sent in email):', resetToken)
    console.log('🟢 Hashed token (saved to DB):', hashedToken)

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    console.log('🟢 Before save — token field:', user.resetPasswordToken)
    console.log('🟢 Before save — expire field:', user.resetPasswordExpire)

    await user.save({ validateBeforeSave: false });

    const check = await User.findOne({ email });
    console.log('🟢 After save — DB token:', check.resetPasswordToken)
    console.log('🟢 After save — DB expire:', check.resetPasswordExpire)
    console.log('====================================');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0f172a;">Reset your MealTrack password</h2>
        <p style="color: #475569;">You requested a password reset. Click the button below to set a new password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="color: #475569; font-size: 13px;">Or paste this link into your browser:</p>
        <p style="color: #4f46e5; font-size: 12px; word-break: break-all;">${resetUrl}</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">
          This link expires in 15 minutes. If you didn't request this, you can safely ignore it.
        </p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: 'MealTrack - Password Reset',
        html,
      });
      console.log('🟢 Email sent successfully');
    } catch (emailErr) {
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      await user.save({ validateBeforeSave: false });
      console.error('🔴 Email send failed:', emailErr);
      console.log('====================================');
      return res.status(500).json({ message: 'Email could not be sent' });
    }

    console.log('✅ forgotPassword completed successfully');
    console.log('====================================');
    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error('🔴 forgotPassword error:', error);
    console.log('====================================');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

// @desc    Reset password with token
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    console.log('====================================');
    console.log('RESET PASSWORD CALLED');
    console.log('Token from URL:', req.params.token);
    console.log('Token length:', req.params.token?.length);

    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    console.log('Hashed token:', hashedToken);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    console.log('User found:', user ? user.email : 'NONE');
    if (user) {
      console.log('Token expire:', user.resetPasswordExpire);
      console.log('Now:', new Date());
    }
    console.log('====================================');

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;

    await user.save();

    return res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
};