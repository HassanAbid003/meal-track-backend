const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const deviceController = require('../controllers/deviceController');

const router = express.Router();

router.use(protect);

// Any logged-in user can list their site's devices (mobile app needs this)
router.get('/', deviceController.getDevices);

// Write operations require devices page access
router.post('/', checkPageAccess('devices'), deviceController.createDevice);
router.put('/:id', checkPageAccess('devices'), deviceController.updateDevice);
router.delete('/:id', checkPageAccess('devices'), deviceController.deleteDevice);

module.exports = router;