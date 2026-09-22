const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Routes
const authRoutes = require('./routes/authRoutes');
const siteRoutes = require('./routes/siteRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const scanRoutes = require('./routes/scanRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const userRoutes = require('./routes/userRoutes');

// Middleware
const { apiLimiter } = require('./middleware/rateLimitMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Railway proxy so rate limiter reads real client IPs
app.set('trust proxy', true);

// ─── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.1.39:8081',
  'https://meal-track-system.netlify.app',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Explicit whitelist
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow localhost + LAN in dev
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow any *.railway.app origin
    if (/^https:\/\/[a-z0-9-]+\.railway\.app$/.test(origin)) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ─── Body & Cookie Parsers ────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ─── Static Uploads (legacy — images now on Cloudinary) ──────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Global API Rate Limit ────────────────────────────────────────
// Applied to ALL /api/* routes. Auth routes have stricter limits
// applied within authRoutes.js (loginLimiter, passwordResetLimiter).
app.use('/api', apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);

// ─── Health Check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// ─── Start Server ─────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});