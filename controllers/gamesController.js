const Joi = require('joi')
const Game = require('../models/Game')
const Review = require('../models/Review')
const { missing, fail } = require('../_helpers/http')
const { notes, label, input, lookupId } = require('../_helpers/validation')
const { personalRanks } = require('../services/personalRanks')
const { escapeRegex } = require('../_helpers/queries')

// 12 jeux par page : quatre rangées de trois, et la plupart des lettres tiennent sur une page.
const PAGE_SIZE = 12

// « Éclipse » se range sous E, « 6 qui prend ! » sous #.
function initial(name) {
  const first = name.trim().normalize('NFD').replace(/\p{Mark}/gu, '').charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : '#'
}

async function list(req, res) {
  const { q, players, minutes, type, page, letter, ranked, city } = input(Joi.object({
    q: Joi.string().trim().max(100).allow(''), players: Joi.number().integer().min(1).max(30),
    minutes: Joi.number().integer().min(5).max(600), type: Joi.string().valid('Stratégie', 'Ambiance', 'Coopératif', 'Famille'),
    page: Joi.number().integer().min(1).max(1000).default(1),
    // Première lettre du nom (A à Z, ou # pour les chiffres et symboles), lettres accentuées comprises.
    letter: Joi.string().uppercase().pattern(/^([A-Z]|#)$/),
    // « Mes jeux classés » : seulement les jeux où le compte connecté a un rang dans cette ville.
    ranked: Joi.boolean().truthy('1').falsy('0').default(false), city: label.when('ranked', { is: true, then: Joi.required() }),
  }), req.query)
  const filter = {}
  if (ranked) {
    if (!req.user) throw fail(401, 'Connecte-toi pour continuer.')
    // Appliqué au catalogue complet avant le comptage et la pagination.
    filter._id = { $in: [...(await personalRanks(req.user._id, city)).keys()] }
  }
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' }
  if (players) Object.assign(filter, { minPlayers: { $lte: players }, maxPlayers: { $gte: players } })
  if (minutes) filter.minutes = { $lte: minutes }
  if (type) filter.type = type
  // Lettres qui ont au moins un jeu avec les autres filtres : la barre A–Z grise les autres.
  const names = await Game.distinct('name', filter)
  const letters = [...new Set(names.map(initial))].sort()
  if (letter) filter.name = { ...(filter.name || {}), $in: names.filter(name => initial(name) === letter) }
  const [items, total] = await Promise.all([
    Game.find(filter).sort({ name: 1, _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    Game.countDocuments(filter),
  ])
  res.json({ items, total, page, pageSize: PAGE_SIZE, letters })
}

async function detail(req, res) {
  const game = await Game.findById(lookupId(req.params.id)).lean()
  if (!game) throw missing()
  const reviews = await Review.find({ game: game._id }).select('name text rating createdAt').sort('-createdAt').limit(50).lean()
  res.json({ ...game, reviews })
}

async function review(req, res) {
  const game = await Game.findById(lookupId(req.params.id))
  if (!game) throw missing()
  const review = input(Joi.object({ text: notes.required(), rating: Joi.number().integer().min(1).max(5).allow(null).default(null) }), req.body)
  await Review.updateOne({ game: game._id, author: req.user._id }, { ...review, name: req.user.name }, { upsert: true })
  res.sendStatus(204)
}

module.exports = { list, detail, review }
