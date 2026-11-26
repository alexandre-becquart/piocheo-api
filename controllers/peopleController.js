const Joi = require('joi')
const User = require('../models/User')
const { label, input } = require('../_helpers/validation')
const { equal, escapeRegex } = require('../_helpers/queries')

async function search(req, res) {
  const { q } = input(Joi.object({ q: label.required() }), req.query)
  const users = await User.find({ _id: { $ne: req.user._id }, name: { $regex: escapeRegex(q), $options: 'i' } })
    .select('name').sort('name').limit(12).lean()
  res.json(users.map(user => ({ id: user._id, name: user.name, inCircle: req.user.circle.some(member => equal(member, user._id)) })))
}

module.exports = { search }
