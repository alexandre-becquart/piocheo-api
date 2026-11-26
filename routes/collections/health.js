const express = require('express')
const mongoose = require('mongoose')

const router = express.Router()
router.get('/', (_req, res) => {
  const connected = mongoose.connection.readyState === 1
  res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'degraded', mongo: connected ? 'connected' : 'unavailable' })
})

module.exports = router
