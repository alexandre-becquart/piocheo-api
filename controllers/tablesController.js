const Joi = require('joi')
const Table = require('../models/Table')
const Game = require('../models/Game')
const Event = require('../models/Event')
const User = require('../models/User')
const { fail, missing } = require('../_helpers/http')
const { id, label, date, input, lookupId } = require('../_helpers/validation')
const { cityCollation, equal } = require('../_helpers/queries')
const mongoose = require('mongoose')
const tableScope = require('../_helpers/tableScope')

const roomAvailable = { $lt: [
  { $size: { $filter: { input: '$members', as: 'member', cond: { $eq: ['$$member.status', 'accepted'] } } } },
  '$capacity',
] }

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

async function list(req, res) {
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
}

async function create(req, res) {
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
}

async function detail(req, res) {
  res.json(tableView(await getTable(req), req.user))
}

async function requestSeat(req, res) {
  const table = await getTable(req)
  const updated = await Table.updateOne({
    _id: table._id, visibility: 'open', starts: { $gt: new Date() }, 'members.user': { $ne: req.user._id }, $expr: roomAvailable,
  }, { $push: { members: { user: req.user._id, name: req.user.name, status: 'pending' } } })
  if (!updated.modifiedCount) throw fail(409, 'Cette demande est indisponible ou déjà enregistrée.')
  res.sendStatus(204)
}

async function invite(req, res) {
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
}

async function reply(req, res) {
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
}

module.exports = { list, create, detail, requestSeat, invite, reply }
