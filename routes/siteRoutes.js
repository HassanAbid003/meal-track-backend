const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { checkPageAccess } = require('../middleware/pageAccessMiddleware');
const siteController = require('../controllers/siteController');

const router = express.Router();

router.use(protect);
router.use(checkPageAccess('messSites')); // ← Page access check

router.route('/').get(siteController.getSites).post(siteController.createSite);
router.route('/:id').put(siteController.updateSite).delete(siteController.deleteSite);

module.exports = router;