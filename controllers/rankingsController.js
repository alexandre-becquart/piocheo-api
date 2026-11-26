const Joi = require('joi')
const Game = require('../models/Game')
const Result = require('../models/Result')
const { missing } = require('../_helpers/http')
const { id, label, input } = require('../_helpers/validation')
const { cityCollation, equal } = require('../_helpers/queries')
const { VERSION, eligible, standings } = require('../services/ranking')

async function list(req, res) {
  const query = input(Joi.object({ game: id, city: label.required() }), req.query)
  const scope = { city: query.city, visibility: 'open', status: 'confirmed', mode: { $ne: 'cooperative' }, ruleVersion: VERSION }
  // Sans jeu choisi, on ouvre le classement le plus actif de la zone.
  const game = query.game || (await Result.aggregate([{ $match: scope }, { $group: { _id: '$game', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } }, { $limit: 1 }], { collation: cityCollation }))[0]?._id
  if (!game) return res.json({ game: null, items: [], confirmed: 0, personal: null, near: [], ruleVersion: VERSION })
  const selected = await Game.findById(game).lean()
  if (!selected) throw missing()
  const results = await Result.find({ ...scope, game: selected._id }).collation(cityCollation).lean()
  const items = standings(results, selected.direction)
  const index = req.user ? items.findIndex(item => equal(item.user, req.user._id)) : -1
  res.json({ game: selected._id, items, confirmed: results.filter(eligible).length, personal: items[index] || null, near: index < 0 ? [] : items.slice(Math.max(0, index - 2), index + 3), ruleVersion: VERSION })
}

module.exports = { list }
