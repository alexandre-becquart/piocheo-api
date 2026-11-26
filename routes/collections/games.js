const express = require('express')
const controller = require('../../controllers/gamesController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

const router = express.Router()
router.get('/', wrap(controller.list))
router.get('/:id', wrap(controller.detail))
router.put('/:id/review', requireAuth, wrap(controller.review))

module.exports = router
