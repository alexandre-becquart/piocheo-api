const express = require('express')
const controller = require('../../controllers/circleController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', requireAuth, wrap(controller.list))
router.put('/:id', requireAuth, wrap(controller.add))

module.exports = router
