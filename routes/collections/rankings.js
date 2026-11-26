const express = require('express')
const controller = require('../../controllers/rankingsController')
const { wrap } = require('../../_helpers/http')

const router = express.Router()
router.get('/', wrap(controller.list))

module.exports = router
