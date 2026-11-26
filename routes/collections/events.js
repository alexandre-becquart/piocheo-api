const express = require('express')
const controller = require('../../controllers/eventsController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', wrap(controller.list))
router.get('/:id', wrap(controller.detail))
router.post('/', requireAuth, wrap(controller.create))
router.put('/:id/registration', requireAuth, wrap(controller.register))

module.exports = router
