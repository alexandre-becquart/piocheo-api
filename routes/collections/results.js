const express = require('express')
const controller = require('../../controllers/resultsController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', requireAuth, wrap(controller.list))
router.get('/:id', requireAuth, wrap(controller.detail))
router.post('/', requireAuth, wrap(controller.create))
router.post('/:id/decision', requireAuth, wrap(controller.decide))

module.exports = router
