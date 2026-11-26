const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const { fail, missing } = require('./_helpers/http')
const errorHandler = require('./_middleware/error-handler')
const routes = require('./routes')

function createApp({ secret, allowedOrigins, production = false }) {
  if (!secret || secret.length < 32) throw new Error('PIOCHEO_JWT_SECRET doit contenir au moins 32 caractères.')
  const app = express()
  const origins = new Set(allowedOrigins)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store")
    next()
  })
  app.use(cors({ credentials: true, origin(origin, done) {
    if (!origin || origins.has(origin)) return done(null, true)
    done(fail(403, 'Origine non autorisée.'))
  } }))
  app.use(express.json({ limit: '32kb' }), cookieParser(), mongoSanitize())
  app.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Sec-Fetch-Site') === 'cross-site' && !origins.has(req.get('Origin'))) {
      return next(fail(403, 'Origine non autorisée.'))
    }
    next()
  })

  app.use(routes({ secret, production }))
  app.use((_req, _res, next) => next(missing()))
  app.use(errorHandler)
  return app
}

module.exports = { createApp }
