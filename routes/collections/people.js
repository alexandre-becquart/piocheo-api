const express = require('express')
const controller = require('../../controllers/peopleController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', requireAuth, wrap(controller.search))

module.exports = router
