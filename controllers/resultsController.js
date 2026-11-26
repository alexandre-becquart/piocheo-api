const Joi = require('joi')
const Result = require('../models/Result')
const Game = require('../models/Game')
const User = require('../models/User')
const Table = require('../models/Table')
const { fail, missing } = require('../_helpers/http')
const { id, label, input, lookupId } = require('../_helpers/validation')
const { equal } = require('../_helpers/queries')
const { VERSION } = require('../services/ranking')
const tableScope = require('../_helpers/tableScope')

function resultScope(user) {
  return { $or: [{ author: user._id }, { 'entries.user': user._id }] }
}

async function list(req, res) {
  res.json(await Result.find(resultScope(req.user)).populate('game').sort('-played').limit(60).lean())
}

async function detail(req, res) {
  const result = await Result.findOne({ _id: lookupId(req.params.id), ...resultScope(req.user) }).populate('game').lean()
  if (!result) throw missing()
  res.json(result)
}

async function create(req, res) {
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
}

async function decide(req, res) {
  const { confirm } = input(Joi.object({ confirm: Joi.boolean().required() }), req.body)
  const scope = { _id: lookupId(req.params.id), author: { $ne: req.user._id }, 'entries.user': req.user._id }
  if (!await Result.exists(scope)) throw missing()
  const updated = await Result.updateOne({ ...scope, status: 'pending' }, {
    $set: { status: confirm ? 'confirmed' : 'contested', decidedBy: req.user._id },
  })
  if (!updated.modifiedCount) throw fail(409, 'Ce résultat a déjà reçu une réponse.')
  res.sendStatus(204)
}

module.exports = { list, detail, create, decide }
