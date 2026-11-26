const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const { fail, missing } = require('./_helpers/http')
const errorHandler = require('./_middleware/error-handler')
const routes = require('./routes')
const { createMailer } = require('./services/mailer')

// En développement, le front peut être ouvert via localhost, 127.0.0.1 ou l’adresse réseau
// affichée par Vue CLI (test sur téléphone). En production, seules les origines exactes passent.
function localOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin)
    return ['http:', 'https:'].includes(protocol) && (['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/.test(hostname))
  } catch {
    return false
  }
}

// « https://piocheo.com/ » ou « https://piocheo.com/connexion » saisis dans Coolify valent « https://piocheo.com » :
// le navigateur envoie toujours l'origine seule, sans barre finale ni chemin.
function normalizeOrigins(values) {
  return values.map(value => String(value).trim()).filter(Boolean).map(value => {
    try { return new URL(value).origin } catch { return value }
  })
}

function createApp({ secret, allowedOrigins, production = false, trustProxy = 0, google = { client: null }, mailer = createMailer({}) }) {
  if (!secret || secret.length < 32) throw new Error('PIOCHEO_JWT_SECRET doit contenir au moins 32 caractères.')
  const app = express()
  allowedOrigins = normalizeOrigins(allowedOrigins)
  const exact = new Set(allowedOrigins)
  const origins = { has: origin => exact.has(origin) || (!production && Boolean(origin) && localOrigin(origin)) }
  app.disable('x-powered-by')
  // Derrière Coolify : Traefik puis le Nginx du front (2 sauts), comme Wayd fait confiance à Traefik.
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

  app.use(routes({ secret, production, webOrigin: allowedOrigins[0], mailer, google }))
  app.use((_req, _res, next) => next(missing()))
  app.use(errorHandler)
  return app
}

module.exports = { createApp, normalizeOrigins }
