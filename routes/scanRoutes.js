const express = require('express');
const {
  verifyScan,
  getRecentScans,
  getWeeklyStats,
} = require('../controllers/scanController');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');

const router = express.Router();

// Protected — Mess Keeper must be logged in (Bearer token)
router.post('/', protect, verifyScan);

// Recent scans — accessible to Super Admin, Site Admin, AND Mess Keeper
// (controller handles role-based filtering)
router.get('/recent', protect, getRecentScans);

// Weekly stats — still admin-only
router.get('/stats/weekly', protect, checkPageAccess('reports'), getWeeklyStats);

module.exports = router;