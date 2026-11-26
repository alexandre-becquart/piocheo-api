const express = require('express')
const controller = require('../../controllers/notificationsController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', requireAuth, wrap(controller.list))
router.post('/read', requireAuth, wrap(controller.markRead))

module.exports = router
