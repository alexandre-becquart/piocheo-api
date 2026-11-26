const Joi = require('joi')
const Notification = require('../models/Notification')
const { id, input } = require('../_helpers/validation')

async function list(req, res) {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).select('kind text link read createdAt').sort('-createdAt').limit(20).lean(),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ])
  res.json({ items, unread })
}

async function markRead(req, res) {
  const { ids } = input(Joi.object({ ids: Joi.array().items(id).max(50) }), req.body)
  const filter = { user: req.user._id, read: false }
  if (ids) filter._id = { $in: ids }
  await Notification.updateMany(filter, { $set: { read: true } })
  res.sendStatus(204)
}

module.exports = { list, markRead }
