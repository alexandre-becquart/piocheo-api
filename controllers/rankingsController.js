const Joi = require('joi')
const Game = require('../models/Game')
const Result = require('../models/Result')
const { missing } = require('../_helpers/http')
const { id, label, input } = require('../_helpers/validation')
const { cityCollation, equal } = require('../_helpers/queries')
const { VERSION, standings } = require('../services/ranking')

async function list(req, res) {
  const { game, city } = input(Joi.object({ game: id.required(), city: label.required() }), req.query)
  const selected = await Game.findById(game).lean()
  if (!selected) throw missing()
  const results = await Result.find({ game, city, visibility: 'open', status: 'confirmed', ruleVersion: VERSION }).collation(cityCollation).lean()
  const items = standings(results, selected.direction)
  const index = req.user ? items.findIndex(item => equal(item.user, req.user._id)) : -1
  res.json({ items, personal: items[index] || null, near: index < 0 ? [] : items.slice(Math.max(0, index - 2), index + 3), ruleVersion: VERSION })
}

module.exports = { list }
