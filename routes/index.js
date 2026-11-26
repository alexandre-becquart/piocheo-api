const express = require('express')
const authenticateWith = require('../_middleware/authenticate')
const health = require('./collections/health')
const auth = require('./collections/auth')
const people = require('./collections/people')
const circle = require('./collections/circle')
const games = require('./collections/games')
const tables = require('./collections/tables')
const events = require('./collections/events')
const results = require('./collections/results')
const rankings = require('./collections/rankings')
const notifications = require('./collections/notifications')

function routes(options) {
  const { secret } = options
  const router = express.Router()
  router.use('/health', health)
  router.use(authenticateWith(secret))
  router.use('/auth', auth(options))
  router.use('/people', people)
  router.use('/circle', circle)
  router.use('/games', games)
  router.use('/tables', tables)
  router.use('/events', events)
  router.use('/results', results)
  router.use('/rankings', rankings)
  router.use('/notifications', notifications)
  return router
}

module.exports = routes
