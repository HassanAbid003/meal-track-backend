const express = require('express');
const { verifyScan, getRecentScans } = require('../controllers/scanController');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');


const router = express.Router();

// Public (Mess Keeper / Scanner device)
router.post('/', verifyScan);

// Private (Super Admin / Site Admin)
router.get('/recent', protect, checkPageAccess('reports'), getRecentScans);

module.exports = router;