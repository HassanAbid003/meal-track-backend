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

// Private (Super Admin / Site Admin)
router.get('/recent', protect, checkPageAccess('reports'), getRecentScans);
router.get('/stats/weekly', protect, checkPageAccess('reports'), getWeeklyStats);

module.exports = router;