const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { authController, me } = require('../../controllers/authController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

function authRoutes(secret, production) {
  const router = express.Router()
  const controller = authController(secret, production)
  const authLimit = rateLimit({ limit: 30, windowMs: 15 * 60_000, message: { message: 'Réessaie dans quelques minutes.' } })

  router.post('/register', authLimit, wrap(controller.register))
  router.post('/login', authLimit, wrap(controller.login))
  router.get('/me', requireAuth, me)
  router.post('/logout', controller.logout)
  return router
}

module.exports = authRoutes
