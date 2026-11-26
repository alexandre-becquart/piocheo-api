const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const { fail, missing } = require('./_helpers/http')
const errorHandler = require('./_middleware/error-handler')
const routes = require('./routes')
const { PROD_ORIGINS, WEB_URL, DEV_WEB_URL, normalizeOrigins, localOrigin } = require('./_helpers/corsOrigins')
const { createMailer } = require('./services/mailer')

function createApp({ secret, allowedOrigins = [], production = false, trustProxy = production ? 1 : 0, webUrl, google = { client: null }, mailer = createMailer({}) }) {
  if (!secret || secret.length < 32) throw new Error('PIOCHEO_JWT_SECRET doit contenir au moins 32 caractères.')
  const app = express()
  const extra = normalizeOrigins(allowedOrigins)
  allowedOrigins = [...new Set([...PROD_ORIGINS, ...extra])]
  const exact = new Set(allowedOrigins)
  // Adresse du site pour les retours Google et les liens des e-mails (CLIENT_URL sur Wayd).
  const site = normalizeOrigins([webUrl || (production ? WEB_URL : extra[0] || DEV_WEB_URL)])[0]
  const origins = { has: origin => exact.has(origin) || (!production && Boolean(origin) && localOrigin(origin)) }
  app.disable('x-powered-by')
  // Comme Wayd : en production, on fait confiance à Traefik (1 saut), sauf réglage PIOCHEO_TRUST_PROXY.
  app.set('trust proxy', trustProxy)
  app.use(helmet())
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store")
    next()
  })
  app.use(cors({ credentials: true, origin(origin, done) {
    if (!origin || origins.has(origin)) return done(null, true)
    console.warn(`Origine refusée : ${origin} (autorisées : ${allowedOrigins.join(', ')})`)
    done(fail(403, 'Origine non autorisée.'))
  } }))
  app.use(express.json({ limit: '32kb' }), cookieParser(), mongoSanitize())
  app.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Sec-Fetch-Site') === 'cross-site' && !origins.has(req.get('Origin'))) {
      return next(fail(403, 'Origine non autorisée.'))
    }
    next()
  })

  app.use(routes({ secret, production, webOrigin: site, mailer, google }))
  app.use((_req, _res, next) => next(missing()))
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
