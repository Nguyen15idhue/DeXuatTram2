const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const controller = require('../controllers/supplierController');

router.use(requireAuth, requireAdmin);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id/poles', controller.poles);
router.post('/sync-pole', controller.syncPoles);
router.post('/:id/assign-pole', controller.assignPole);
router.get('/:id', controller.detail);
router.put('/:id', controller.update);

module.exports = router;
