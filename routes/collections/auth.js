const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { authController, me } = require('../../controllers/authController')
const { wrap } = require('../../_helpers/http')
const requireAuth = require('../../_middleware/requireAuth')

// Mêmes routes et mêmes limites que wayd-api/routes/collections/auth.js.
const limit = (windowMinutes, max, message, extra = {}) => rateLimit({
  windowMs: windowMinutes * 60_000, limit: max, message: { message }, standardHeaders: true, legacyHeaders: false, ...extra,
})

function authRoutes(options) {
  const router = express.Router()
  const controller = authController(options)
  const loginLimiter = limit(15, 10, 'Trop de tentatives de connexion, réessaie dans 15 minutes.')
  // Les essais refusés (400, 409…) ne comptent pas : seules les inscriptions réussies.
  const registerLimiter = limit(60, 5, 'Trop d’inscriptions depuis cette adresse IP, réessaie dans 1 heure.', { skipFailedRequests: true })
  const forgotLimiter = limit(60, 5, 'Trop de demandes de réinitialisation, réessaie dans 1 heure.')
  const resetLimiter = limit(60, 5, 'Trop de tentatives de réinitialisation, réessaie dans 1 heure.')
  const googleLimiter = limit(15, 20, 'Trop de tentatives de connexion Google, réessaie dans 15 minutes.')
  const usernameLimiter = limit(5, 30, 'Trop de vérifications, réessaie dans 5 minutes.')

  router.get('/check-username', usernameLimiter, wrap(controller.checkUsername))
  router.post('/register', registerLimiter, wrap(controller.register))
  router.post('/login', loginLimiter, wrap(controller.login))
  router.post('/logout', controller.logout)
  router.post('/forgot-password', forgotLimiter, wrap(controller.forgotPassword))
  router.post('/reset-password', resetLimiter, wrap(controller.resetPassword))
  router.get('/google', googleLimiter, controller.googleRedirect)
  router.get('/google/callback', googleLimiter, wrap(controller.googleCallback))
  router.get('/me', requireAuth, me)
  return router
}

module.exports = authRoutes
