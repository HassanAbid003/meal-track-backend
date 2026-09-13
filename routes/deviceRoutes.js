const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const deviceController = require('../controllers/deviceController');

const router = express.Router();

router.use(protect);
router.use(checkPageAccess('devices')); // ← Page access check

router.route('/').get(deviceController.getDevices).post(deviceController.createDevice);
router.route('/:id').put(deviceController.updateDevice).delete(deviceController.deleteDevice);

module.exports = router;