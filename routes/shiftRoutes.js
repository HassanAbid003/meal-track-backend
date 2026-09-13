const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const { getShifts, createShift, toggleShiftStatus, updateShift, deleteShift } = require('../controllers/shiftController');

const router = express.Router();

router.use(protect);
router.use(checkPageAccess('shifts')); // ← Page access check

router.route('/').get(getShifts).post(createShift);
router.route('/:id/toggle').put(toggleShiftStatus);
router.route('/:id').put(updateShift).delete(deleteShift);

module.exports = router;