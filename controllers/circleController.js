const User = require('../models/User')
const { missing } = require('../_helpers/http')
const { lookupId } = require('../_helpers/validation')
const { equal } = require('../_helpers/queries')

async function list(req, res) {
  const people = await User.find({ _id: { $in: req.user.circle } }).select('name').sort('name').lean()
  res.json(people.map(user => ({ id: user._id, name: user.name })))
}

async function add(req, res) {
  const person = await User.findById(lookupId(req.params.id))
  if (!person || equal(person._id, req.user._id)) throw missing()
  await User.updateOne({ _id: req.user._id }, { $addToSet: { circle: person._id } })
  res.sendStatus(204)
}

module.exports = { list, add }
