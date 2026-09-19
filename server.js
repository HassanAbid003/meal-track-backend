const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const siteRoutes = require('./routes/siteRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const scanRoutes = require('./routes/scanRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://192.168.1.39:8081',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow explicit whitelist
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // In dev, allow any LAN address on any port
    if (
      process.env.NODE_ENV !== 'production' &&
      /^http:\/\/(localhost|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});