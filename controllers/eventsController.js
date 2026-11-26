const Joi = require('joi')
const Event = require('../models/Event')
const { fail, missing } = require('../_helpers/http')
const { label, notes, date, input, lookupId } = require('../_helpers/validation')
const { cityCollation, equal } = require('../_helpers/queries')
const eventTypes = ['soirée jeux', 'rencontre', 'tournoi']

function eventView(event, user) {
  const { attendees, ...info } = event
  return { ...info, registered: Boolean(user && attendees.some(member => equal(member, user._id))), count: attendees.length }
}

async function list(req, res) {
  const { type, city, from } = input(Joi.object({
    type: Joi.string().valid(...eventTypes), city: label, from: date,
  }), req.query)
  const filter = { starts: { $gte: from || new Date() } }
  if (type) filter.type = type
  if (city) filter.city = city
  const events = await Event.find(filter).collation(cityCollation).sort('starts').limit(60).lean()
  res.json(events.map(event => eventView(event, req.user)))
}

async function detail(req, res) {
  const event = await Event.findById(lookupId(req.params.id)).lean()
  if (!event) throw missing()
  res.json(eventView(event, req.user))
}

async function create(req, res) {
  if (req.user.role !== 'organizer') throw fail(403, 'La création est réservée aux organisateurs.')
  const data = input(Joi.object({
    name: label.required(), description: notes.required(), type: Joi.string().valid(...eventTypes).required(),
    city: label.required(), venue: label.required(), starts: date.required(),
  }), req.body)
  if (data.starts <= new Date()) throw fail(400, 'Choisis une date future.')
  const event = await Event.create({ ...data, host: req.user._id, organizer: req.user.name })
  res.status(201).json({ id: event._id })
}

async function register(req, res) {
  const updated = await Event.updateOne({ _id: lookupId(req.params.id), starts: { $gt: new Date() } },
    { $addToSet: { attendees: req.user._id } })
  if (!updated.matchedCount) throw missing()
  res.sendStatus(204)
}

module.exports = { list, detail, create, register }
