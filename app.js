const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const { rateLimit } = require('express-rate-limit')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const Joi = require('joi')
const mongoose = require('mongoose')
const { User, Game, Review, Table, Event, Result } = require('./models')
const { VERSION, standings } = require('./ranking')

const id = Joi.string().hex().length(24)
const label = Joi.string().trim().min(2).max(100)
const notes = Joi.string().trim().min(3).max(2000)
const date = Joi.string().pattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/).custom((value, helpers) =>
  Number.isFinite(Date.parse(value)) ? new Date(value) : helpers.error('date.format'))
const eventTypes = ['soirée jeux', 'rencontre', 'tournoi']
const cityCollation = { locale: 'fr', strength: 2 }
const roomAvailable = { $lt: [
  { $size: { $filter: { input: '$members', as: 'member', cond: { $eq: ['$$member.status', 'accepted'] } } } },
  '$capacity',
] }
const equal = (a, b) => String(a) === String(b)
const fail = (status, message) => Object.assign(new Error(message), { status })
const missing = () => fail(404, 'Cet élément est introuvable.')
const wrap = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next)

function input(schema, value) {
  const result = schema.validate(value)
  if (result.error) throw fail(400, 'Vérifie les champs du formulaire.')
  return result.value
}

function lookupId(value) {
  return input(id.required(), value)
}

function profile(user) {
  return { id: String(user._id), name: user.name, role: user.role }
}

function tableScope(user) {
  return user ? { $or: [
    { visibility: 'open' }, { host: user._id },
    { members: { $elemMatch: { user: user._id, status: { $in: ['invited', 'accepted'] } } } },
  ] } : { visibility: 'open' }
}

function tableView(table, user) {
  const host = user && equal(user._id, table.host)
  const membership = user && table.members.find(member => equal(member.user, user._id))
  const accepted = table.members.filter(member => member.status === 'accepted')
  return {
    ...table,
    address: host || membership?.status === 'accepted' ? table.address : undefined,
    members: host ? table.members : accepted,
    membership: membership?.status || null,
    remaining: table.capacity - accepted.length,
  }
}

async function getTable(req) {
  const table = await Table.findOne({ _id: lookupId(req.params.id), ...tableScope(req.user) }).populate('game').lean()
  if (!table) throw missing()
  return table
}

function resultScope(user) {
  return { $or: [{ author: user._id }, { 'entries.user': user._id }] }
}

function createApp({ secret, allowedOrigins, production = false }) {
  if (!secret || secret.length < 32) throw new Error('PIOCHEO_JWT_SECRET doit contenir au moins 32 caractères.')
  const app = express()
  const origins = new Set(allowedOrigins)
  const cookie = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }
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

  app.get('/health', (_req, res) => {
    const connected = mongoose.connection.readyState === 1
    res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'degraded', mongo: connected ? 'connected' : 'unavailable' })
  })

  app.use((req, _res, next) => {
    void authenticate(req).then(() => next(), next)
  })

  async function authenticate(req) {
    const token = req.cookies.piocheo_session
    if (!token) return
    let session
    try { session = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'piocheo' }) } catch { return }
    req.user = await User.findById(session.sub).lean()
  }

  const requireUser = (req, _res, next) => req.user ? next() : next(fail(401, 'Connecte-toi pour continuer.'))
  const authLimit = rateLimit({ limit: 30, windowMs: 15 * 60_000, message: { message: 'Réessaie dans quelques minutes.' } })
  const credentials = Joi.object({
    email: Joi.string().trim().lowercase().email({ tlds: false }).max(254).required(),
    password: Joi.string().min(8).max(72).custom((value, helpers) =>
      Buffer.byteLength(value) <= 72 ? value : helpers.error('string.max')).required(),
  })
  const dummyHash = bcrypt.hashSync('piocheo-invalid-account', 12)

  function session(res, user, status = 200) {
    const token = jwt.sign({}, secret, { algorithm: 'HS256', issuer: 'piocheo', subject: String(user._id), expiresIn: '12h' })
    res.cookie('piocheo_session', token, { ...cookie, maxAge: 12 * 3600_000 }).status(status).json(profile(user))
  }

  app.post('/auth/register', authLimit, wrap(async (req, res) => {
    const { password, ...data } = input(credentials.keys({ name: label.required() }), req.body)
    session(res, await User.create({ ...data, password: await bcrypt.hash(password, 12) }), 201)
  }))
  app.post('/auth/login', authLimit, wrap(async (req, res) => {
    const { email, password } = input(credentials, req.body)
    const user = await User.findOne({ email }).select('+password')
    if (!await bcrypt.compare(password, user?.password || dummyHash) || !user) {
      throw fail(401, 'E-mail ou mot de passe incorrect.')
    }
    session(res, user)
  }))
  app.get('/auth/me', requireUser, (req, res) => res.json(profile(req.user)))
  app.post('/auth/logout', (_req, res) => res.clearCookie('piocheo_session', cookie).sendStatus(204))

  app.get('/people', requireUser, wrap(async (req, res) => {
    const { q } = input(Joi.object({ q: label.required() }), req.query)
    const users = await User.find({ _id: { $ne: req.user._id }, name: { $regex: escapeRegex(q), $options: 'i' } })
      .select('name').sort('name').limit(12).lean()
    res.json(users.map(user => ({ id: user._id, name: user.name, inCircle: req.user.circle.some(member => equal(member, user._id)) })))
  }))
  app.get('/circle', requireUser, wrap(async (req, res) => {
    const people = await User.find({ _id: { $in: req.user.circle } }).select('name').sort('name').lean()
    res.json(people.map(user => ({ id: user._id, name: user.name })))
  }))
  app.put('/circle/:id', requireUser, wrap(async (req, res) => {
    const person = await User.findById(lookupId(req.params.id))
    if (!person || equal(person._id, req.user._id)) throw missing()
    await User.updateOne({ _id: req.user._id }, { $addToSet: { circle: person._id } })
    res.sendStatus(204)
  }))

  app.get('/games', wrap(async (req, res) => {
    const { q, players, minutes, type, page } = input(Joi.object({
      q: Joi.string().trim().max(100).allow(''), players: Joi.number().integer().min(1).max(30),
      minutes: Joi.number().integer().min(5).max(600), type: Joi.string().valid('Stratégie', 'Ambiance', 'Coopératif', 'Famille'),
      page: Joi.number().integer().min(1).max(1000).default(1),
    }), req.query)
    const filter = {}
    if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }
    if (players) Object.assign(filter, { minPlayers: { $lte: players }, maxPlayers: { $gte: players } })
    if (minutes) filter.minutes = { $lte: minutes }
    if (type) filter.type = type
    const [items, total] = await Promise.all([
      Game.find(filter).sort({ name: 1, _id: 1 }).skip((page - 1) * 9).limit(9).lean(),
      Game.countDocuments(filter),
    ])
    res.json({ items, total, page, pageSize: 9 })
  }))
  app.get('/games/:id', wrap(async (req, res) => {
    const game = await Game.findById(lookupId(req.params.id)).lean()
    if (!game) throw missing()
    const reviews = await Review.find({ game: game._id }).select('name text rating createdAt').sort('-createdAt').limit(50).lean()
    res.json({ ...game, reviews })
  }))
  app.put('/games/:id/review', requireUser, wrap(async (req, res) => {
    const game = await Game.findById(lookupId(req.params.id))
    if (!game) throw missing()
    const review = input(Joi.object({ text: notes.required(), rating: Joi.number().integer().min(1).max(5).allow(null).default(null) }), req.body)
    await Review.updateOne({ game: game._id, author: req.user._id }, { ...review, name: req.user.name }, { upsert: true })
    res.sendStatus(204)
  }))

  app.get('/tables', wrap(async (req, res) => {
    const filters = input(Joi.object({
      game: id, event: id, view: Joi.string().valid('open', 'circle'), city: label,
    }), req.query)
    const query = { ...tableScope(req.user), starts: { $gte: new Date() } }
    if (filters.game) query.game = filters.game
    if (filters.event) query.event = filters.event
    if (filters.city) query.city = filters.city
    if (filters.view) query.visibility = filters.view === 'circle' ? 'private' : 'open'
    const tables = await Table.find(query).collation(cityCollation).populate('game').sort('starts').limit(60).lean()
    res.json(tables.map(table => tableView(table, req.user)))
  }))
  app.post('/tables', requireUser, wrap(async (req, res) => {
    const data = input(Joi.object({
      game: id.required(), starts: date.required(), capacity: Joi.number().integer().min(1).max(30).required(),
      city: label.required(), venue: label.required(), address: label.allow(''),
      visibility: Joi.string().valid('open', 'private').required(), event: id,
    }), req.body)
    const game = await Game.findById(data.game).lean()
    if (!game) throw missing()
    if (data.starts <= new Date() || data.capacity < game.minPlayers || data.capacity > game.maxPlayers) {
      throw fail(400, 'Choisis une date future et une capacité adaptée au jeu.')
    }
    if (data.event && !await Event.exists({ _id: data.event, host: req.user._id })) throw missing()
    const table = await Table.create({
      ...data, host: req.user._id, members: [{ user: req.user._id, name: req.user.name, status: 'accepted' }],
    })
    res.status(201).json({ id: table._id })
  }))
  app.get('/tables/:id', wrap(async (req, res) => res.json(tableView(await getTable(req), req.user))))
  app.post('/tables/:id/request', requireUser, wrap(async (req, res) => {
    const table = await getTable(req)
    const updated = await Table.updateOne({
      _id: table._id, visibility: 'open', starts: { $gt: new Date() }, 'members.user': { $ne: req.user._id }, $expr: roomAvailable,
    }, { $push: { members: { user: req.user._id, name: req.user.name, status: 'pending' } } })
    if (!updated.modifiedCount) throw fail(409, 'Cette demande est indisponible ou déjà enregistrée.')
    res.sendStatus(204)
  }))
  app.post('/tables/:id/invite', requireUser, wrap(async (req, res) => {
    const table = await getTable(req)
    if (!equal(table.host, req.user._id) || table.visibility !== 'private') throw missing()
    const { user: target } = input(Joi.object({ user: id.required() }), req.body)
    const invited = await User.findById(target).lean()
    if (!invited) throw missing()
    const updated = await Table.updateOne({
      _id: table._id, starts: { $gt: new Date() }, 'members.user': { $ne: invited._id },
    }, { $push: { members: { user: invited._id, name: invited.name, status: 'invited' } } })
    if (!updated.modifiedCount) throw fail(409, 'Cette invitation est indisponible ou déjà envoyée.')
    res.sendStatus(204)
  }))

  app.post('/tables/:id/reply', requireUser, wrap(async (req, res) => {
    const table = await getTable(req)
    const { user, accept } = input(Joi.object({ user: id, accept: Joi.boolean().required() }), req.body)
    const hostReply = Boolean(user) && table.visibility === 'open' && equal(table.host, req.user._id)
    const inviteReply = !user && table.visibility === 'private'
    if (!hostReply && !inviteReply) throw missing()
    const target = hostReply ? new mongoose.Types.ObjectId(user) : req.user._id
    const previous = hostReply ? 'pending' : 'invited'
    const filter = {
      _id: table._id, starts: { $gt: new Date() }, members: { $elemMatch: { user: target, status: previous } },
    }
    if (accept) filter.$expr = roomAvailable
    const updated = await Table.updateOne(filter, { $set: { 'members.$.status': accept ? 'accepted' : 'declined' } })
    if (!updated.modifiedCount) throw fail(409, 'La table est complète ou cette réponse a déjà été traitée.')
    res.sendStatus(204)
  }))

  app.get('/events', wrap(async (req, res) => {
    const { type, city, from } = input(Joi.object({
      type: Joi.string().valid(...eventTypes), city: label, from: date,
    }), req.query)
    const filter = { starts: { $gte: from || new Date() } }
    if (type) filter.type = type
    if (city) filter.city = city
    const events = await Event.find(filter).collation(cityCollation).sort('starts').limit(60).lean()
    res.json(events.map(event => eventView(event, req.user)))
  }))
  app.get('/events/:id', wrap(async (req, res) => {
    const event = await Event.findById(lookupId(req.params.id)).lean()
    if (!event) throw missing()
    res.json(eventView(event, req.user))
  }))
  app.post('/events', requireUser, wrap(async (req, res) => {
    if (req.user.role !== 'organizer') throw fail(403, 'La création est réservée aux organisateurs.')
    const data = input(Joi.object({
      name: label.required(), description: notes.required(), type: Joi.string().valid(...eventTypes).required(),
      city: label.required(), venue: label.required(), starts: date.required(),
    }), req.body)
    if (data.starts <= new Date()) throw fail(400, 'Choisis une date future.')
    const event = await Event.create({ ...data, host: req.user._id, organizer: req.user.name })
    res.status(201).json({ id: event._id })
  }))
  app.put('/events/:id/registration', requireUser, wrap(async (req, res) => {
    const updated = await Event.updateOne({ _id: lookupId(req.params.id), starts: { $gt: new Date() } },
      { $addToSet: { attendees: req.user._id } })
    if (!updated.matchedCount) throw missing()
    res.sendStatus(204)
  }))

  app.get('/results', requireUser, wrap(async (req, res) => {
    res.json(await Result.find(resultScope(req.user)).populate('game').sort('-played').limit(60).lean())
  }))
  app.get('/results/:id', requireUser, wrap(async (req, res) => {
    const result = await Result.findOne({ _id: lookupId(req.params.id), ...resultScope(req.user) }).populate('game').lean()
    if (!result) throw missing()
    res.json(result)
  }))
  app.post('/results', requireUser, wrap(async (req, res) => {
    const data = input(Joi.object({
      game: id.required(), table: id, city: label.required(), visibility: Joi.string().valid('open', 'private').required(),
      outcome: Joi.string().valid('victoire', 'défaite'),
      entries: Joi.array().min(1).max(30).items(Joi.object({
        user: id, name: label, score: Joi.number().integer().min(-100000).max(100000),
      }).xor('user', 'name')).required(),
    }), req.body)
    const game = await Game.findById(data.game).lean()
    if (!game) throw missing()
    const participants = data.entries.map(entry => entry.user).filter(Boolean)
    if (!participants.includes(String(req.user._id)) || new Set(participants).size !== participants.length) {
      throw fail(400, 'Ajoute ton compte et sélectionne chaque autre joueur une seule fois.')
    }
    if (data.entries.length < game.minPlayers || data.entries.length > game.maxPlayers) {
      throw fail(400, 'Le nombre de joueurs ne correspond pas à ce jeu.')
    }
    if (data.table) {
      const table = await Table.findOne({ _id: data.table, ...tableScope(req.user) }).lean()
      if (!table) throw missing()
      const accepted = table.members.filter(member => member.status === 'accepted').map(member => String(member.user))
      if (!equal(table.game, game._id) || !accepted.includes(String(req.user._id))) throw missing()
      if (accepted.length !== participants.length || participants.length !== data.entries.length ||
          accepted.some(user => !participants.includes(user)) || table.starts > new Date()) {
        throw fail(400, 'Encode le résultat après le début, avec les participants confirmés.')
      }
      data.city = table.city
      data.visibility = table.visibility
    }
    const mode = game.scoring
    if (mode === 'cooperative' ? !data.outcome || data.entries.some(entry => entry.score !== undefined) :
      data.outcome || data.entries.some(entry => entry.score === undefined || (mode === 'rank' && (entry.score < 1 || entry.score > data.entries.length)))) {
      throw fail(400, 'Renseigne un résultat adapté au mode du jeu.')
    }
    const users = await User.find({ _id: { $in: participants } }).select('name').lean()
    if (users.length !== participants.length) throw fail(400, 'Un participant est introuvable.')
    const names = new Map(users.map(user => [String(user._id), user.name]))
    const entries = data.entries.map(entry => ({ ...entry, name: entry.user ? names.get(entry.user) : entry.name }))
    const status = participants.length > 1 ? 'pending' : 'local'
    if (status === 'local') data.visibility = 'private'
    const result = await Result.create({ ...data, entries, author: req.user._id, played: new Date(), status, mode, ruleVersion: VERSION })
    res.status(201).json({ id: result._id })
  }))
  app.post('/results/:id/decision', requireUser, wrap(async (req, res) => {
    const { confirm } = input(Joi.object({ confirm: Joi.boolean().required() }), req.body)
    const scope = { _id: lookupId(req.params.id), author: { $ne: req.user._id }, 'entries.user': req.user._id }
    if (!await Result.exists(scope)) throw missing()
    const updated = await Result.updateOne({ ...scope, status: 'pending' }, {
      $set: { status: confirm ? 'confirmed' : 'contested', decidedBy: req.user._id },
    })
    if (!updated.modifiedCount) throw fail(409, 'Ce résultat a déjà reçu une réponse.')
    res.sendStatus(204)
  }))

  app.get('/rankings', wrap(async (req, res) => {
    const { game, city } = input(Joi.object({ game: id.required(), city: label.required() }), req.query)
    const selected = await Game.findById(game).lean()
    if (!selected) throw missing()
    const results = await Result.find({ game, city, visibility: 'open', status: 'confirmed', ruleVersion: VERSION }).collation(cityCollation).lean()
    const items = standings(results, selected.direction)
    const index = req.user ? items.findIndex(item => equal(item.user, req.user._id)) : -1
    res.json({ items, personal: items[index] || null, near: index < 0 ? [] : items.slice(Math.max(0, index - 2), index + 3), ruleVersion: VERSION })
  }))
  app.use((_req, _res, next) => next(missing()))
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    if (error.code === 11000) return res.status(409).json({ message: 'Cet élément existe déjà.' })
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Requête trop volumineuse.' })
    if (error.type === 'entity.parse.failed' || ['CastError', 'ValidationError'].includes(error.name)) {
      return res.status(400).json({ message: 'Données invalides.' })
    }
    if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message })
    console.error('Erreur API', error.name)
    return res.status(500).json({ message: 'Erreur serveur.' })
  })
  return app
}

function eventView(event, user) {
  const { attendees, ...info } = event
  return { ...info, registered: Boolean(user && attendees.some(member => equal(member, user._id))), count: attendees.length }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = { createApp }
