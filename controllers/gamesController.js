const Joi = require('joi')
const Game = require('../models/Game')
const Review = require('../models/Review')
const { missing, fail } = require('../_helpers/http')
const { notes, label, input, lookupId } = require('../_helpers/validation')
const { personalRanks } = require('../services/personalRanks')
const { escapeRegex } = require('../_helpers/queries')

async function list(req, res) {
  const { q, players, minutes, type, page, ranked, city } = input(Joi.object({
    q: Joi.string().trim().max(100).allow(''), players: Joi.number().integer().min(1).max(30),
    minutes: Joi.number().integer().min(5).max(600), type: Joi.string().valid('Stratégie', 'Ambiance', 'Coopératif', 'Famille'),
    page: Joi.number().integer().min(1).max(1000).default(1),
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
  const [items, total] = await Promise.all([
    Game.find(filter).sort({ name: 1, _id: 1 }).skip((page - 1) * 9).limit(9).lean(),
    Game.countDocuments(filter),
  ])
  res.json({ items, total, page, pageSize: 9 })
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
