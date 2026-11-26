const express = require('express')
const controller = require('../../controllers/rankingsController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', wrap(controller.list))
router.get('/mine', requireAuth, wrap(controller.mine))

module.exports = router
