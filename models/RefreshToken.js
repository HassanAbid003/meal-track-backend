const mongoose = require('mongoose');

const RefreshTokenSchema = new mongoose.Schema({
  // SHA-256 hash of the raw refresh token — the raw token is never stored
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // The user this token belongs to
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Groups all rotations from one login session. If a token is reused,
  // we revoke the entire family (defense against token theft).
  family: {
    type: String,
    required: true,
    index: true,
  },

  // Points to the token this was rotated from (null for the original)
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },

  // When this token expires (7 days from issue)
  expiresAt: {
    type: Date,
    required: true,
  },

  // Set when rotated, logged out, or when reuse is detected
  revokedAt: {
    type: Date,
    default: null,
  },

  // Diagnostic info for session listing
  userAgent: { type: String, default: null },
  ip: { type: String, default: null },
}, { timestamps: true });

// Auto-delete documents after expiry
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);