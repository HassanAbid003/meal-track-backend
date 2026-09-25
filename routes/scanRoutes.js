const express = require('express');
const {
  verifyScan,
  getRecentScans,
  getWeeklyStats,
} = require('../controllers/scanController');
const { protect, protectAnyAuth } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');

const router = express.Router();

// Scan — accepts cookie, Bearer, or X-Pairing-Token
router.post('/', protectAnyAuth, verifyScan);

// Recent scans — user auth only (web panel)
router.get('/recent', protect, getRecentScans);

// Weekly stats — admin only
router.get('/stats/weekly', protect, checkPageAccess('reports'), getWeeklyStats);

module.exports = router;