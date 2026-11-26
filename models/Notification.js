const { Schema, model } = require('mongoose')

const options = { timestamps: true, versionKey: false }

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true }, kind: String, text: String, link: String,
  read: { type: Boolean, default: false },
}, options)
notificationSchema.index({ user: 1, createdAt: -1 })
module.exports = model('Notification', notificationSchema)
