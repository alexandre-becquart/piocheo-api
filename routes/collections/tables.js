const express = require('express')
const controller = require('../../controllers/tablesController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', wrap(controller.list))
router.post('/', requireAuth, wrap(controller.create))
router.get('/:id', wrap(controller.detail))
router.post('/:id/request', requireAuth, wrap(controller.requestSeat))
router.post('/:id/invite', requireAuth, wrap(controller.invite))
router.post('/:id/reply', requireAuth, wrap(controller.reply))

module.exports = router
