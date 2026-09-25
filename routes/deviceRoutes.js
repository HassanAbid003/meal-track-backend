const express = require('express');
const { protect, protectAnyAuth } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const deviceController = require('../controllers/deviceController');

const router = express.Router();

// ============================================================
// PUBLIC — no auth required
// ============================================================
router.post('/pair', deviceController.pairDevice);

// ============================================================
// ANY AUTH — cookie, Bearer, OR pairing token
// MUST come BEFORE router.use(protect) so protect doesn't block it
// ============================================================
router.post('/heartbeat', protectAnyAuth, deviceController.heartbeat);

// ============================================================
// USER AUTH REQUIRED (cookie or Bearer)
// ============================================================
router.use(protect);

// Legacy endpoints (still supported during transition)
router.get('/my-device', deviceController.getMyDevice);
router.get('/unassigned', checkPageAccess('devices'), deviceController.getUnassignedDevices);
router.get('/', deviceController.getDevices);

// CRUD
router.post('/', checkPageAccess('devices'), deviceController.createDevice);
router.put('/:id', checkPageAccess('devices'), deviceController.updateDevice);
router.delete('/:id', checkPageAccess('devices'), deviceController.deleteDevice);

// Pairing management (admin only)
router.post('/:id/pairing-code', checkPageAccess('devices'), deviceController.generatePairingCode);
router.post('/:id/unpair', checkPageAccess('devices'), deviceController.unpairDevice);

module.exports = router;