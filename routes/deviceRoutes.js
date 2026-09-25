const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const deviceController = require('../controllers/deviceController');

const router = express.Router();

router.use(protect);

// Heartbeat — any authenticated user with a device
router.post('/heartbeat', deviceController.heartbeat);

// Assigned device for current Mess Keeper (mobile app uses this)
// MUST come before /:id routes so 'my-device' isn't parsed as an ObjectId
router.get('/my-device', deviceController.getMyDevice);

// Devices not assigned to any Mess Keeper (admin Promote modal uses this)
router.get('/unassigned', checkPageAccess('devices'), deviceController.getUnassignedDevices);

// Any logged-in user can list their site's devices
router.get('/', deviceController.getDevices);

// Write operations require devices page access
router.post('/', checkPageAccess('devices'), deviceController.createDevice);
router.put('/:id', checkPageAccess('devices'), deviceController.updateDevice);
router.delete('/:id', checkPageAccess('devices'), deviceController.deleteDevice);

module.exports = router;