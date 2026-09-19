const express = require('express');
const {
  verifyScan,
  getRecentScans,
  getWeeklyStats,
} = require('../controllers/scanController');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');

const router = express.Router();

// Public (Mess Keeper / Scanner device)
router.post('/', verifyScan);

// Private (Super Admin / Site Admin)
router.get('/recent', protect, checkPageAccess('reports'), getRecentScans);
router.get('/stats/weekly', protect, checkPageAccess('reports'), getWeeklyStats);

module.exports = router;